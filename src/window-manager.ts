import { TFile, WorkspaceLeaf, WorkspaceWindow, setIcon } from "obsidian";
import type SidecarBrowserPlugin from "./main";
import { VIEW_TYPE_SIDECAR_BROWSER } from "./project-browser-view";
import { DEFAULT_SETTINGS, WindowBounds } from "./settings";

/** Class added to the popout window's <body> so all chrome-hiding CSS can be
 *  scoped to it — guaranteeing the main window is never affected. */
const POPOUT_BODY_CLASS = "sidecar-popout";
/** Bump on each iteration so we can confirm, in the popout's own inspector
 *  (body[data-sidecar-build] / the bar's data attr), which build is live. */
export const SIDECAR_BUILD = "popout-fix-4";
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

	constructor(plugin: SidecarBrowserPlugin) {
		this.plugin = plugin;
	}

	private get app() {
		return this.plugin.app;
	}

	/**
	 * Open the Sidecar popout fresh (closing any existing one) and show the
	 * project-browser list at the default width.
	 */
	async open(): Promise<void> {
		// Always (re)create fresh. Reopening is the only reliable way to reset
		// the column to the default width — the popout's *creation* size is
		// honored, but resizing an existing popout at runtime is not. It also
		// guarantees the body class is (re)applied through every marking path.
		this.close();

		const bounds = this.plugin.settings.windowBounds;
		// Mark the next-opened popout window as ours (see handleWindowOpen).
		this.pendingPopout = true;
		const leaf = this.app.workspace.openPopoutLeaf({
			// Width always resets to the default on open; height and position are
			// restored from the last session.
			size: { width: DEFAULT_WIDTH, height: bounds.height },
			// x/y are only meaningful once captured; omit on first-ever open so
			// the OS centers the window.
			...(bounds.x !== null && bounds.y !== null
				? { x: bounds.x, y: bounds.y }
				: {}),
		});
		this.leaf = leaf;

		// Render the list first. After this await the popout window is fully
		// live, so the body class (applied inside showBrowser) and the bounds
		// listeners attach reliably — unlike right after openPopoutLeaf(), where
		// the leaf's container isn't yet a WorkspaceWindow.
		await this.showBrowser(leaf);
		this.attachBoundsPersistence(leaf);
		await this.app.workspace.revealLeaf(leaf);
		this.pendingPopout = false;
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
		this.markLeafPopout(restored);
		this.attachBoundsPersistence(restored);

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
		const back = bar.createDiv({
			cls: "sidecar-bar-back",
			attr: { role: "button", "aria-label": "Back to all notes" },
		});
		setIcon(back.createSpan({ cls: "sidecar-bar-back-icon" }), "chevron-left");
		back.createSpan({ cls: "sidecar-bar-back-label", text: "All" });
		back.addEventListener("click", () => void this.showBrowser(leaf));

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

	/** Add the scoping class + a visible build stamp to a popout document. */
	private applyPopoutMarks(doc: Document): void {
		doc.body.classList.add(POPOUT_BODY_CLASS);
		doc.body.dataset.sidecarBuild = SIDECAR_BUILD;
	}

	private attachBoundsPersistence(leaf: WorkspaceLeaf): void {
		const win = this.getPopoutWin(leaf);
		if (!win) return;

		// Size changes fire resize; debounce so we don't thrash settings, then
		// apply the sticky-width detent and persist.
		this.plugin.registerDomEvent(win, "resize", () => {
			if (this.saveBoundsTimer !== null) win.clearTimeout(this.saveBoundsTimer);
			this.saveBoundsTimer = win.setTimeout(() => {
				this.snapWidthToDefault(win);
				this.captureBounds(leaf);
				this.saveBoundsTimer = null;
			}, 150);
		});

		// There is no DOM "move" event; capture position when the window loses
		// focus (covers the user dragging it elsewhere) and before it unloads.
		this.plugin.registerDomEvent(win, "blur", () => this.captureBounds(leaf));
		this.plugin.registerDomEvent(win, "beforeunload", () =>
			this.captureBounds(leaf)
		);
	}

	/** Sticky detent: if the window was resized to near the default width,
	 *  snap it back to exactly the default so it's easy to reset. Resizing more
	 *  than WIDTH_SNAP_PX away leaves the chosen width alone (until next open).
	 *  Re-calling with width already at the default is a no-op, so the resize
	 *  this triggers settles immediately. */
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
