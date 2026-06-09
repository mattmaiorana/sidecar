import { TFile, WorkspaceLeaf, WorkspaceWindow } from "obsidian";
import type SidecarBrowserPlugin from "./main";
import { VIEW_TYPE_SIDECAR_BROWSER } from "./project-browser-view";
import { DEFAULT_SETTINGS, WindowBounds } from "./settings";

/** Class added to the popout window's <body> so all chrome-hiding CSS can be
 *  scoped to it — guaranteeing the main window is never affected. */
const POPOUT_BODY_CLASS = "sidecar-popout";
/** Bump on each iteration so we can confirm, in the popout's own inspector
 *  (body[data-sidecar-build] / the bar's data attr), which build is live. */
export const SIDECAR_BUILD = "v1-note-1";
/** The width we always open at, and the detent the window snaps back to. */
const DEFAULT_WIDTH = DEFAULT_SETTINGS.windowBounds.width;
/** Resizing to within this many px of DEFAULT_WIDTH snaps back to it exactly,
 *  so it's easy to "click" the column back to its default width. */
const WIDTH_SNAP_PX = 30;

/**
 * Owns the single Sidecar popout window and its one leaf.
 *
 * The leaf alternates between two states in place:
 *   - the {@link ProjectBrowserView} folder listing, and
 *   - a real {@link MarkdownView} opened on a selected file.
 *
 * It also opens the window at, and persists, the saved bounds, and applies the
 * popout-scoped body class used by the chrome-hiding CSS.
 */
export class SidecarWindowManager {
	private plugin: SidecarBrowserPlugin;
	/** The single leaf living inside the popout, while the window is open. */
	private leaf: WorkspaceLeaf | null = null;
	/** Debounce handle for size persistence. */
	private saveBoundsTimer: number | null = null;
	/** True between requesting a popout and its window-open event firing, so we
	 *  mark exactly the window we just opened (not the user's other popouts). */
	private pendingPopout = false;
	/** Whether resize/bounds listeners are attached to the current window. */
	private boundsAttached = false;

	constructor(plugin: SidecarBrowserPlugin) {
		this.plugin = plugin;
	}

	private get app() {
		return this.plugin.app;
	}

	/**
	 * Open the Sidecar popout fresh (closing any existing one) and show
	 * `file` at the default width.
	 */
	async open(file: TFile): Promise<void> {
		this.close();

		const bounds = this.plugin.settings.windowBounds;
		this.pendingPopout = true;
		const leaf = this.app.workspace.openPopoutLeaf({
			size: { width: DEFAULT_WIDTH, height: bounds.height },
			...(bounds.x !== null && bounds.y !== null
				? { x: bounds.x, y: bounds.y }
				: {}),
		});
		this.leaf = leaf;

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
			if (this.leaf !== leaf) return;
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
	 * After an Obsidian reload, the popout and its list view are restored
	 * directly by the workspace, bypassing open(). Adopt that restored Sidecar
	 * leaf so it's managed like one we opened: marked for the scoped CSS,
	 * bounds-tracked, and reset to the default width. (Called on layout-ready.)
	 */
	adoptRestoredSidecar(): void {
		if (this.leaf && this.getPopoutWin(this.leaf)) return;

		const restored = this.app.workspace
			.getLeavesOfType(VIEW_TYPE_SIDECAR_BROWSER)
			.find((leaf) => this.getPopoutWin(leaf));
		if (!restored) return;

		this.leaf = restored;
		this.schedulePopoutSetup(restored);

		// Best-effort width reset on a restored window (runtime resize may be a
		// no-op in the popout; reopening via the command always resets it).
		const win = this.getPopoutWin(restored);
		if (win) win.resizeTo(DEFAULT_WIDTH, win.outerHeight);
	}

	/** Swap the leaf to the folder-listing state. Used on open and on "back". */
	async showBrowser(leaf: WorkspaceLeaf): Promise<void> {
		await leaf.setViewState({
			type: VIEW_TYPE_SIDECAR_BROWSER,
			active: true,
		});
		this.markLeafPopout(leaf);
	}

	/**
	 * Swap the leaf to a real MarkdownView on `file`, then inject our own
	 * "← All" title bar (Obsidian's native header is hidden in the popout).
	 */
	async openFileInSidecar(leaf: WorkspaceLeaf, file: TFile): Promise<void> {
		await leaf.openFile(file, { active: true });
		this.decorateNoteHeader(leaf);
	}

	/**
	 * Keep the note title bar in sync when the file in our leaf changes through
	 * some path other than openFileInSidecar (wired to the workspace
	 * `file-open` event). No-op while the list is showing.
	 */
	refreshNoteHeader(): void {
		if (!this.leaf || !this.getPopoutWindow(this.leaf)) return;
		if (this.leaf.view.getViewType() === VIEW_TYPE_SIDECAR_BROWSER) return;
		this.decorateNoteHeader(this.leaf);
	}

	/** Close the popout window if it is open (used by a command / on demand). */
	close(): void {
		if (this.leaf) {
			this.captureBounds(this.leaf);
			this.leaf.detach();
			this.leaf = null;
		}
		this.boundsAttached = false;
	}

	/**
	 * React to the popout being closed by the user (window-close event). Saves
	 * final bounds and drops our reference so the next open() makes a fresh one.
	 */
	handleWindowClose(win: WorkspaceWindow): void {
		if (!this.leaf) return;
		if (this.getPopoutWindow(this.leaf) !== win) return;
		this.captureBounds(this.leaf);
		this.leaf = null;
		this.boundsAttached = false;
	}

	/** Best-effort save on plugin unload. */
	saveBoundsNow(): void {
		if (this.leaf) this.captureBounds(this.leaf);
	}

	// --- custom note title bar --------------------------------------------

	/**
	 * Create (or update) our "← All  |  <title>" bar as the first child of the
	 * note view's container. Idempotent: a repeated open of the same view just
	 * refreshes the title. The bar is destroyed automatically when the leaf is
	 * swapped back to the list (the MarkdownView's container is torn down).
	 */
	private decorateNoteHeader(leaf: WorkspaceLeaf): void {
		// Self-heal the body class on note renders too, so the bar's CSS applies
		// even if the list state was never shown first.
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
	 * The popout window's document for this leaf. Prefer the container API
	 * (`getContainer()` → WorkspaceWindow), which is reliable whenever the
	 * window already exists — i.e. on reveal, restore, and any render. Fall back
	 * to the view element's ownerDocument only for the brief moment right after
	 * openPopoutLeaf() before the container is wired up. `document` is the main
	 * window's, so the inequality identifies a separate popout document.
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
	 * so the browser view can self-mark on render — that path covers a view
	 * Obsidian restored on startup, which never goes through showBrowser.
	 * Idempotent; safe to call on every render.
	 */
	markLeafPopout(leaf: WorkspaceLeaf): void {
		const doc = this.popoutDocFor(leaf);
		if (doc) this.applyPopoutMarks(doc);
	}

	/** Add the scoping class + a visible build stamp to a popout document.
	 *  A MutationObserver watches for Obsidian wiping the class during its own
	 *  window initialization and immediately re-adds it. */
	private applyPopoutMarks(doc: Document): void {
		doc.body.classList.add(POPOUT_BODY_CLASS);
		doc.body.dataset.sidecarBuild = SIDECAR_BUILD;

		const observer = new MutationObserver(() => {
			if (!doc.body.classList.contains(POPOUT_BODY_CLASS)) {
				doc.body.classList.add(POPOUT_BODY_CLASS);
			}
		});
		observer.observe(doc.body, { attributes: true, attributeFilter: ['class'] });
		doc.defaultView?.setTimeout(() => observer.disconnect(), 3000);
	}

	/** Attach resize/bounds listeners to the popout once it's available. Guarded
	 *  so the retried setup (schedulePopoutSetup) only wires them up a single
	 *  time. */
	private ensureBoundsAttached(leaf: WorkspaceLeaf): void {
		if (this.boundsAttached) return;
		const win = this.getPopoutWin(leaf);
		if (!win) return;
		this.boundsAttached = true;

		this.plugin.registerDomEvent(win, "resize", () => {
			// Live magnetic snap: jump to the default the instant the width
			// enters the detent zone while dragging, so it "clicks" into place.
			this.snapWidthToDefault(win);
			// Persist the (possibly snapped) geometry, debounced.
			if (this.saveBoundsTimer !== null) win.clearTimeout(this.saveBoundsTimer);
			this.saveBoundsTimer = win.setTimeout(() => {
				this.captureBounds(leaf);
				this.saveBoundsTimer = null;
			}, 300);
		});

		// There is no DOM "move" event; capture position when the window loses
		// focus (covers the user dragging it elsewhere) and before it unloads.
		this.plugin.registerDomEvent(win, "blur", () => this.captureBounds(leaf));
		this.plugin.registerDomEvent(win, "beforeunload", () =>
			this.captureBounds(leaf)
		);
	}

	/** Magnetic detent: if the live width is within WIDTH_SNAP_PX of the
	 *  default, jump to exactly the default. Resizing further than that away
	 *  leaves the chosen width alone. Re-calling at the default is a no-op, so
	 *  the resize this triggers settles immediately (no loop). */
	private snapWidthToDefault(win: Window): void {
		const width = win.outerWidth;
		if (width === DEFAULT_WIDTH) return;
		if (Math.abs(width - DEFAULT_WIDTH) <= WIDTH_SNAP_PX) {
			win.resizeTo(DEFAULT_WIDTH, win.outerHeight);
		}
	}

	/** Read the live window geometry and persist it to settings. */
	private captureBounds(leaf: WorkspaceLeaf): void {
		const win = this.getPopoutWin(leaf);
		if (!win) return;

		// Guard against transient 0/garbage values while the window settles.
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
