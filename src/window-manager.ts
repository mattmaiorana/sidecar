import {
	MarkdownView,
	TFile,
	WorkspaceLeaf,
	WorkspaceWindow,
} from "obsidian";
import type SidecarBrowserPlugin from "./main";
import { VIEW_TYPE_SIDECAR_BROWSER } from "./project-browser-view";
import type { WindowBounds } from "./settings";

/** Class added to the popout window's <body> so all chrome-hiding CSS can be
 *  scoped to it — guaranteeing the main window is never affected. */
const POPOUT_BODY_CLASS = "sidecar-popout";
/** Marker on the back-arrow view action so we never add it twice. */
const BACK_ACTION_CLASS = "sidecar-back-action";

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

	constructor(plugin: SidecarBrowserPlugin) {
		this.plugin = plugin;
	}

	private get app() {
		return this.plugin.app;
	}

	/**
	 * Open the Sidecar popout (or focus it if already open) and show the
	 * project-browser list.
	 */
	async open(): Promise<void> {
		// Already open? Just focus it.
		if (this.leaf && this.getPopoutWindow(this.leaf)) {
			await this.app.workspace.revealLeaf(this.leaf);
			await this.showBrowser(this.leaf);
			return;
		}

		const bounds = this.plugin.settings.windowBounds;
		const leaf = this.app.workspace.openPopoutLeaf({
			size: { width: bounds.width, height: bounds.height },
			// x/y are only meaningful once captured; omit on first-ever open so
			// the OS centers the window.
			...(bounds.x !== null && bounds.y !== null
				? { x: bounds.x, y: bounds.y }
				: {}),
		});
		this.leaf = leaf;

		// Scope the chrome-hiding CSS to this window only.
		this.markPopoutWindow(leaf);
		// Persist bounds as the user resizes / moves / closes the window.
		this.attachBoundsPersistence(leaf);

		await this.showBrowser(leaf);
		await this.app.workspace.revealLeaf(leaf);
	}

	/** Swap the leaf to the folder-listing state. Used on open and on "back". */
	async showBrowser(leaf: WorkspaceLeaf): Promise<void> {
		await leaf.setViewState({
			type: VIEW_TYPE_SIDECAR_BROWSER,
			active: true,
		});
	}

	/**
	 * Swap the leaf to a real MarkdownView on `file`, then ensure a back-arrow
	 * action is present in its header. Called from the browser view on click.
	 */
	async openFileInSidecar(leaf: WorkspaceLeaf, file: TFile): Promise<void> {
		await leaf.openFile(file, { active: true });
		this.ensureBackAction(leaf);
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

	// --- back-arrow action -------------------------------------------------

	private ensureBackAction(leaf: WorkspaceLeaf): void {
		const view = leaf.view;
		if (!(view instanceof MarkdownView)) return;
		// Don't add a second one if this MarkdownView instance already has it.
		if (view.containerEl.querySelector("." + BACK_ACTION_CLASS)) return;

		const actionEl = view.addAction("arrow-left", "Back to projects", () => {
			void this.showBrowser(leaf);
		});
		actionEl.addClass(BACK_ACTION_CLASS);
	}

	// --- popout window plumbing -------------------------------------------

	/** The WorkspaceWindow hosting this leaf, or null if it lives in the main
	 *  window (or the popout is gone). */
	private getPopoutWindow(leaf: WorkspaceLeaf): WorkspaceWindow | null {
		const container = leaf.getContainer();
		return container instanceof WorkspaceWindow ? container : null;
	}

	private markPopoutWindow(leaf: WorkspaceLeaf): void {
		const popout = this.getPopoutWindow(leaf);
		popout?.doc.body.classList.add(POPOUT_BODY_CLASS);
	}

	private attachBoundsPersistence(leaf: WorkspaceLeaf): void {
		const popout = this.getPopoutWindow(leaf);
		if (!popout) return;
		const win = popout.win;

		// Size changes fire resize; debounce so we don't thrash settings.
		this.plugin.registerDomEvent(win, "resize", () => {
			if (this.saveBoundsTimer !== null) win.clearTimeout(this.saveBoundsTimer);
			this.saveBoundsTimer = win.setTimeout(() => {
				this.captureBounds(leaf);
				this.saveBoundsTimer = null;
			}, 400);
		});

		// There is no DOM "move" event; capture position when the window loses
		// focus (covers the user dragging it elsewhere) and before it unloads.
		this.plugin.registerDomEvent(win, "blur", () => this.captureBounds(leaf));
		this.plugin.registerDomEvent(win, "beforeunload", () =>
			this.captureBounds(leaf)
		);
	}

	/** Read the live window geometry and persist it to settings. */
	private captureBounds(leaf: WorkspaceLeaf): void {
		const popout = this.getPopoutWindow(leaf);
		if (!popout) return;
		const win = popout.win;

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
