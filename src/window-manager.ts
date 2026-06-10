import { TFile, WorkspaceLeaf, WorkspaceWindow } from "obsidian";
import type SidecarBrowserPlugin from "./main";
import { VIEW_TYPE_SIDECAR_BROWSER } from "./project-browser-view";
import { DEFAULT_SETTINGS, WindowBounds } from "./settings";

/** Class added to the popout window's <body> so all chrome-hiding CSS can be
 *  scoped to it — guaranteeing the main window is never affected. */
const POPOUT_BODY_CLASS = "sidecar-popout";
/** Bump on each iteration so we can confirm, in the popout's own inspector
 *  (body[data-sidecar-build] / the bar's data attr), which build is live. */
export const SIDECAR_BUILD = "v1-handle-1";
/** The width we always open at, and the detent the window snaps back to. */
const DEFAULT_WIDTH = DEFAULT_SETTINGS.windowBounds.width;
/** Resizing to within this many px of DEFAULT_WIDTH snaps back to it exactly,
 *  so it's easy to "click" the column back to its default width. */
const WIDTH_SNAP_PX = 30;

/**
 * Manages all open Sidecar popout windows.
 *
 * Each call to `open(file)` creates a new independent popout leaf showing that
 * note. Multiple Sidecars can be open simultaneously. Each window is fully
 * styled, bounds-tracked, and width-snapping independently.
 */
export class SidecarWindowManager {
	private plugin: SidecarBrowserPlugin;
	/** All leaves currently living inside open Sidecar popouts. */
	private leaves = new Set<WorkspaceLeaf>();
	/** Per-leaf debounce handles for bounds persistence. */
	private saveTimers = new Map<WorkspaceLeaf, number>();
	/** True between requesting a popout and its window-open event firing, so we
	 *  mark exactly the window we just opened (not the user's other popouts). */
	private pendingPopout = false;
	/** Leaves whose resize/bounds listeners are already attached. */
	private boundsAttached = new Set<WorkspaceLeaf>();
	/** Docs that already have a MutationObserver watching the body class. */
	private observedDocs = new WeakSet<Document>();

	constructor(plugin: SidecarBrowserPlugin) {
		this.plugin = plugin;
	}

	private get app() {
		return this.plugin.app;
	}

	/**
	 * Open a new Sidecar popout showing `file`. Each call creates an independent
	 * window — existing Sidecars are left untouched.
	 */
	async open(file: TFile): Promise<void> {
		const bounds = this.plugin.settings.windowBounds;
		this.pendingPopout = true;
		const leaf = this.app.workspace.openPopoutLeaf({
			size: { width: DEFAULT_WIDTH, height: bounds.height },
			...(bounds.x !== null && bounds.y !== null
				? { x: bounds.x, y: bounds.y }
				: {}),
		});
		this.leaves.add(leaf);

		await leaf.openFile(file, { active: true });
		this.decorateNoteHeader(leaf);
		await this.app.workspace.revealLeaf(leaf);
		this.pendingPopout = false;

		this.schedulePopoutSetup(leaf);
	}

	/**
	 * Idempotently mark the popout and attach bounds tracking, re-applied over a
	 * few ticks so the body class survives Obsidian's own late popout setup.
	 */
	private schedulePopoutSetup(leaf: WorkspaceLeaf): void {
		const setup = () => {
			if (!this.leaves.has(leaf)) return;
			this.markLeafPopout(leaf);
			this.ensureBoundsAttached(leaf);
		};
		setup();
		window.setTimeout(setup, 0);
		window.setTimeout(setup, 60);
		window.setTimeout(setup, 250);
	}

	/**
	 * Mark our popout window the instant Obsidian creates it. This event fires
	 * with the real WorkspaceWindow, so it's the most reliable place to add the
	 * body class — earlier and surer than deriving it from the rendered view.
	 */
	handleWindowOpen(win: WorkspaceWindow): void {
		if (!this.pendingPopout) return;
		this.pendingPopout = false;
		this.applyPopoutMarks(win.doc);
	}

	/**
	 * After an Obsidian reload, popouts and their views are restored directly by
	 * the workspace, bypassing open(). Adopt all restored Sidecar leaves so they
	 * are managed like ones we opened. (Called on layout-ready.)
	 */
	adoptRestoredSidecar(): void {
		const restored = this.app.workspace
			.getLeavesOfType(VIEW_TYPE_SIDECAR_BROWSER)
			.filter((leaf) => this.getPopoutWin(leaf) && !this.leaves.has(leaf));

		for (const leaf of restored) {
			this.leaves.add(leaf);
			this.schedulePopoutSetup(leaf);
			const win = this.getPopoutWin(leaf);
			if (win) win.resizeTo(DEFAULT_WIDTH, win.outerHeight);
		}
	}

	/** Swap a leaf to the folder-listing state (dormant v1; kept for restore path). */
	async showBrowser(leaf: WorkspaceLeaf): Promise<void> {
		await leaf.setViewState({
			type: VIEW_TYPE_SIDECAR_BROWSER,
			active: true,
		});
		this.markLeafPopout(leaf);
	}

	/**
	 * Swap a leaf to a real MarkdownView on `file` (used by the dormant
	 * ProjectBrowserView click handler).
	 */
	async openFileInSidecar(leaf: WorkspaceLeaf, file: TFile): Promise<void> {
		await leaf.openFile(file, { active: true });
		this.decorateNoteHeader(leaf);
	}

	/**
	 * Keep note title bars in sync when a file opens in any of our leaves
	 * (wired to the workspace `file-open` event). No-ops on list-view leaves.
	 */
	refreshNoteHeader(): void {
		for (const leaf of this.leaves) {
			if (!this.getPopoutWindow(leaf)) continue;
			if (leaf.view.getViewType() === VIEW_TYPE_SIDECAR_BROWSER) continue;
			this.decorateNoteHeader(leaf);
		}
	}

	/** Close all open Sidecar windows (used on plugin unload / a close-all command). */
	close(): void {
		for (const leaf of this.leaves) {
			this.captureBounds(leaf);
			leaf.detach();
		}
		this.leaves.clear();
		this.boundsAttached.clear();
		this.saveTimers.clear();
	}

	/**
	 * React to a specific popout being closed by the user (window-close event).
	 * Saves final bounds and removes that leaf from the managed set.
	 */
	handleWindowClose(win: WorkspaceWindow): void {
		for (const leaf of this.leaves) {
			if (this.getPopoutWindow(leaf) !== win) continue;
			this.captureBounds(leaf);
			this.leaves.delete(leaf);
			this.boundsAttached.delete(leaf);
			this.saveTimers.delete(leaf);
			break;
		}
	}

	/** Best-effort save on plugin unload. */
	saveBoundsNow(): void {
		for (const leaf of this.leaves) this.captureBounds(leaf);
	}

	// --- custom note title bar --------------------------------------------

	/**
	 * Create (or update) our title bar as the first child of the note view's
	 * container. Idempotent: repeated opens refresh the title in place. The bar
	 * is destroyed automatically when the leaf's MarkdownView is torn down.
	 */
	private decorateNoteHeader(leaf: WorkspaceLeaf): void {
		this.markLeafPopout(leaf);

		const view = leaf.view;
		const container = view.containerEl;
		const title = view.getDisplayText();

		const existing = container.querySelector<HTMLElement>(
			":scope > .sidecar-titlebar"
		);
		if (existing) {
			const titleEl = existing.querySelector<HTMLElement>(".sidecar-bar-title");
			if (titleEl) titleEl.setText(title);
			return;
		}

		const bar = createDiv({ cls: "sidecar-bar sidecar-titlebar" });
		bar.dataset.sidecarBuild = SIDECAR_BUILD;
		bar.createSpan({ cls: "sidecar-bar-title", text: title });
		container.prepend(bar);
	}

	// --- popout window plumbing -------------------------------------------

	/** The WorkspaceWindow hosting this leaf, or null if it lives in the main
	 *  window (or the popout is gone). Used for identity checks on events. */
	private getPopoutWindow(leaf: WorkspaceLeaf): WorkspaceWindow | null {
		const container = leaf.getContainer();
		return container instanceof WorkspaceWindow ? container : null;
	}

	/**
	 * The popout window's document for this leaf. Prefers the container API
	 * (reliable once the window exists); falls back to ownerDocument for the
	 * brief moment right after openPopoutLeaf() before the container is wired.
	 */
	private popoutDocFor(leaf: WorkspaceLeaf): Document | null {
		const container = leaf.getContainer();
		if (container instanceof WorkspaceWindow) return container.doc;
		const viaView = leaf.view?.containerEl?.ownerDocument ?? null;
		return viaView && viaView !== document ? viaView : null;
	}

	private getPopoutWin(leaf: WorkspaceLeaf): Window | null {
		return this.popoutDocFor(leaf)?.defaultView ?? null;
	}

	/**
	 * Add the scoping class + build stamp to this leaf's popout window. Public
	 * so the browser view can self-mark on render. Idempotent; safe to call on
	 * every render.
	 */
	markLeafPopout(leaf: WorkspaceLeaf): void {
		const doc = this.popoutDocFor(leaf);
		if (doc) this.applyPopoutMarks(doc);
	}

	/** Add the scoping class + a visible build stamp to a popout document.
	 *  Attaches a permanent MutationObserver (one per document) that re-adds the
	 *  class any time Obsidian wipes it — including on focus/blur transitions.
	 *  The observer lives for the window's lifetime; no explicit cleanup needed. */
	private applyPopoutMarks(doc: Document): void {
		doc.body.classList.add(POPOUT_BODY_CLASS);
		doc.body.dataset.sidecarBuild = SIDECAR_BUILD;

		if (!this.observedDocs.has(doc)) {
			this.observedDocs.add(doc);
			const observer = new MutationObserver(() => {
				if (!doc.body.classList.contains(POPOUT_BODY_CLASS)) {
					doc.body.classList.add(POPOUT_BODY_CLASS);
				}
			});
			observer.observe(doc.body, { attributes: true, attributeFilter: ["class"] });
		}
	}

	/**
	 * Attach the custom resize handle and bounds listeners once the popout win
	 * is available. Guarded per-leaf so schedulePopoutSetup retries are no-ops.
	 *
	 * The custom handle uses pointer capture (like a browser extension drag
	 * handle) so the snap math runs proactively — desired width is computed
	 * before any resizeTo call, eliminating the OS-resize feedback loop that
	 * caused the beachball with the previous reactive approach. resizeTo is
	 * throttled to one call per animation frame. Native OS resize still works
	 * for basic resizing; it just saves bounds without snapping.
	 */
	private ensureBoundsAttached(leaf: WorkspaceLeaf): void {
		if (this.boundsAttached.has(leaf)) return;
		const win = this.getPopoutWin(leaf);
		if (!win) return;
		this.boundsAttached.add(leaf);

		// --- Custom resize handle (right edge) --------------------------------
		const handle = win.document.createElement("div");
		handle.className = "sidecar-resize-handle";
		win.document.body.appendChild(handle);

		let dragStartX = 0;
		let dragStartWidth = 0;
		let dragging = false;
		let latestX = 0;
		let raf: number | null = null;

		handle.addEventListener("pointerdown", (e) => {
			e.preventDefault();
			dragStartX = e.screenX;
			dragStartWidth = win.outerWidth;
			latestX = e.screenX;
			dragging = true;
			handle.setPointerCapture(e.pointerId);
		});

		handle.addEventListener("pointermove", (e) => {
			if (!dragging) return;
			latestX = e.screenX;
			if (raf !== null) return; // already scheduled this frame
			raf = win.requestAnimationFrame(() => {
				raf = null;
				let w = dragStartWidth + (latestX - dragStartX);
				if (Math.abs(w - DEFAULT_WIDTH) <= WIDTH_SNAP_PX) w = DEFAULT_WIDTH;
				w = Math.max(200, Math.min(800, Math.round(w)));
				win.resizeTo(w, win.outerHeight);
			});
		});

		const endDrag = (e: PointerEvent) => {
			if (!dragging) return;
			dragging = false;
			if (raf !== null) { win.cancelAnimationFrame(raf); raf = null; }
			try { handle.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
			this.captureBounds(leaf);
		};
		handle.addEventListener("pointerup", endDrag);
		handle.addEventListener("pointercancel", endDrag);

		// --- Native OS resize: just persist bounds (no reactive snap) ---------
		this.plugin.registerDomEvent(win, "resize", () => {
			const existing = this.saveTimers.get(leaf);
			if (existing !== undefined) win.clearTimeout(existing);
			this.saveTimers.set(
				leaf,
				win.setTimeout(() => {
					this.captureBounds(leaf);
					this.saveTimers.delete(leaf);
				}, 300)
			);
		});

		this.plugin.registerDomEvent(win, "blur", () => this.captureBounds(leaf));
		this.plugin.registerDomEvent(win, "beforeunload", () =>
			this.captureBounds(leaf)
		);
	}

	/** Read the live window geometry and persist it to settings. */
	private captureBounds(leaf: WorkspaceLeaf): void {
		const win = this.getPopoutWin(leaf);
		if (!win) return;

		if (win.outerWidth < 50 || win.outerHeight < 50) return;

		const bounds: WindowBounds = {
			x: win.screenX,
			y: win.screenY,
			width: win.outerWidth,
			height: win.outerHeight,
		};
		this.plugin.settings.windowBounds = bounds;
		void this.plugin.saveSettings();
	}
}
