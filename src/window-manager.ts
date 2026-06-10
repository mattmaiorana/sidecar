import { TFile, WorkspaceLeaf, WorkspaceWindow, setIcon } from "obsidian";
import type SidecarBrowserPlugin from "./main";
import { DEFAULT_SETTINGS, WindowBounds } from "./settings";

/** Class added to the popout window's <body> — kept for debug/inspection. */
const POPOUT_BODY_CLASS = "sidecar-popout";
/** Bump to confirm the active build in the popout's own inspector. */
export const SIDECAR_BUILD = "v1-r1";
/** Width we always open at. */
const DEFAULT_WIDTH = DEFAULT_SETTINGS.windowBounds.width;

/**
 * Manages all open Sidecar popout windows.
 *
 * Each call to open(file) creates a new independent popout leaf. Multiple
 * Sidecars can be open simultaneously; each is styled, bounds-tracked, and
 * optionally pinned (always-on-top) independently.
 */
export class SidecarWindowManager {
	private plugin: SidecarBrowserPlugin;
	/** All leaves currently living inside open Sidecar popouts. */
	private leaves = new Set<WorkspaceLeaf>();
	/** Per-leaf debounce handles for bounds persistence. */
	private saveTimers = new Map<WorkspaceLeaf, number>();
	/** True between requesting a popout and its window-open event firing. */
	private pendingPopout = false;
	/** Leaves whose resize/bounds listeners are already attached. */
	private boundsAttached = new Set<WorkspaceLeaf>();
	/** Leaves whose window is currently pinned always-on-top. */
	private pinnedLeaves = new Set<WorkspaceLeaf>();

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
		const pos = this.computeOpenPosition();
		this.pendingPopout = true;
		const leaf = this.app.workspace.openPopoutLeaf({
			size: { width: DEFAULT_WIDTH, height: bounds.height },
			x: pos.x,
			y: pos.y,
		});
		this.leaves.add(leaf);

		await leaf.openFile(file, { active: true });
		this.decorateHeader(leaf);
		await this.app.workspace.revealLeaf(leaf);

		this.pendingPopout = false;
		this.schedulePopoutSetup(leaf, true);
	}

	/**
	 * Idempotently mark the popout and attach bounds tracking, re-applied over a
	 * few ticks so the body class survives Obsidian's own late popout setup.
	 *
	 * When `reposition` is true (fresh opens via open()) each tick also re-applies
	 * moveTo so we win the race against Obsidian's own late internal positioning.
	 */
	private schedulePopoutSetup(leaf: WorkspaceLeaf, reposition = false): void {
		const setup = () => {
			if (!this.leaves.has(leaf)) return;
			this.markLeafPopout(leaf);
			this.decorateHeader(leaf);
			if (reposition) {
				const doc = this.popoutDocFor(leaf);
				const win = doc?.defaultView;
				if (win) {
					const pos = this.computeOpenPosition();
					win.moveTo(pos.x, pos.y);
				}
			}
			this.ensureBoundsAttached(leaf);
		};
		setup();
		window.setTimeout(setup, 0);
		window.setTimeout(setup, 60);
		window.setTimeout(setup, 250);
	}

	/**
	 * Mark our popout window the instant Obsidian creates it. Fires synchronously
	 * inside openPopoutLeaf — the earliest reliable point to resize and position.
	 */
	handleWindowOpen(win: WorkspaceWindow): void {
		if (!this.pendingPopout) return;
		this.pendingPopout = false;
		const bounds = this.plugin.settings.windowBounds;
		const pos = this.computeOpenPosition();
		const h = win.win.outerHeight > 50 ? win.win.outerHeight : bounds.height;
		win.win.resizeTo(DEFAULT_WIDTH, h);
		win.win.moveTo(pos.x, pos.y);
		this.applyPopoutMarks(win.doc);
	}

	/**
	 * On reload, Obsidian restores popout markdown views directly, bypassing
	 * open(). Adopt all markdown leaves in popout windows so they get our styles
	 * and header. (May also adopt user-created popouts, but that's acceptable.)
	 */
	adoptRestoredSidecar(): void {
		const restored = this.app.workspace
			.getLeavesOfType("markdown")
			.filter((leaf) => this.getPopoutWin(leaf) && !this.leaves.has(leaf));

		for (const leaf of restored) {
			this.leaves.add(leaf);
			this.schedulePopoutSetup(leaf);
			const win = this.getPopoutWin(leaf);
			if (win) win.resizeTo(DEFAULT_WIDTH, win.outerHeight);
		}
	}

	/** Close all open Sidecar windows. */
	close(): void {
		for (const leaf of this.leaves) {
			this.captureBounds(leaf);
			leaf.detach();
		}
		this.leaves.clear();
		this.boundsAttached.clear();
		this.saveTimers.clear();
		this.pinnedLeaves.clear();
	}

	/** React to a specific popout being closed — saves bounds and removes leaf. */
	handleWindowClose(win: WorkspaceWindow): void {
		for (const leaf of this.leaves) {
			if (this.getPopoutWindow(leaf) !== win) continue;
			this.captureBounds(leaf);
			this.leaves.delete(leaf);
			this.boundsAttached.delete(leaf);
			this.saveTimers.delete(leaf);
			this.pinnedLeaves.delete(leaf);
			break;
		}
	}

	/** Best-effort save on plugin unload. */
	saveBoundsNow(): void {
		for (const leaf of this.leaves) this.captureBounds(leaf);
	}

	// --- custom header bar ---------------------------------------------------

	/**
	 * Inject our minimal header bar as the first child of the note view's
	 * container. Idempotent: a second call is a no-op if the bar already exists.
	 * The bar provides the macOS traffic-light drag region and a pin button.
	 */
	private decorateHeader(leaf: WorkspaceLeaf): void {
		this.markLeafPopout(leaf);
		const container = leaf.view.containerEl;
		if (container.querySelector(":scope > .sidecar-titlebar")) return;

		const bar = createDiv({ cls: "sidecar-bar sidecar-titlebar" });
		bar.dataset.sidecarBuild = SIDECAR_BUILD;

		bar.createDiv({ cls: "sidecar-bar-spacer" });

		const pinBtn = bar.createEl("button", {
			cls: "sidecar-pin-btn clickable-icon",
			attr: { "aria-label": "Keep window on top" },
		});
		setIcon(pinBtn, "pin");
		pinBtn.addEventListener("click", () => {
			const win = this.getPopoutWin(leaf);
			if (!win) return;
			const nowPinned = !this.pinnedLeaves.has(leaf);
			if (nowPinned) this.pinnedLeaves.add(leaf);
			else this.pinnedLeaves.delete(leaf);
			pinBtn.toggleClass("is-active", nowPinned);
			this.setAlwaysOnTop(win, nowPinned);
		});

		container.prepend(bar);
	}

	/**
	 * Toggle always-on-top for a popout window via Electron's remote API.
	 * The call is injected as a script so getCurrentWindow() resolves to the
	 * popout's own BrowserWindow rather than the main window's. Falls back
	 * silently if the Electron remote API isn't accessible.
	 */
	private setAlwaysOnTop(popoutWin: Window, pinned: boolean): void {
		try {
			const script = popoutWin.document.createElement("script");
			script.textContent = `(function(){
				var r=typeof require!=="undefined"?require:null;if(!r)return;
				var m=null;
				try{m=r("@electron/remote")}catch(e){}
				if(!m)try{m=r("electron").remote}catch(e){}
				if(m)m.getCurrentWindow().setAlwaysOnTop(${pinned},"floating");
			})();`;
			popoutWin.document.head.appendChild(script);
			script.remove();
		} catch (e) {
			console.warn("[Sidecar] setAlwaysOnTop failed:", e);
		}
	}

	// --- popout window plumbing ----------------------------------------------

	private getPopoutWindow(leaf: WorkspaceLeaf): WorkspaceWindow | null {
		const container = leaf.getContainer();
		return container instanceof WorkspaceWindow ? container : null;
	}

	private popoutDocFor(leaf: WorkspaceLeaf): Document | null {
		const container = leaf.getContainer();
		if (container instanceof WorkspaceWindow) return container.doc;
		const viaView = leaf.view?.containerEl?.ownerDocument ?? null;
		return viaView && viaView !== document ? viaView : null;
	}

	private getPopoutWin(leaf: WorkspaceLeaf): Window | null {
		return this.popoutDocFor(leaf)?.defaultView ?? null;
	}

	/** Public so the browser view can self-mark on render. Idempotent. */
	markLeafPopout(leaf: WorkspaceLeaf): void {
		const doc = this.popoutDocFor(leaf);
		if (doc) this.applyPopoutMarks(doc);
	}

	private applyPopoutMarks(doc: Document): void {
		doc.body.classList.add(POPOUT_BODY_CLASS);
		doc.body.dataset.sidecarBuild = SIDECAR_BUILD;
		this.injectPopoutStyles(doc);
	}

	private injectPopoutStyles(doc: Document): void {
		const STYLE_ID = "sidecar-injected-styles";
		if (doc.getElementById(STYLE_ID)) return;
		const el = doc.createElement("style");
		el.id = STYLE_ID;
		el.textContent = `
:root {
  --sidecar-traffic-inset: 76px;
  --sidecar-bar-height: 40px;
  --file-line-width: 100%;
}
.workspace-tab-header-container { display: none !important; }
.view-header { display: none !important; }
.status-bar, .workspace-ribbon { display: none !important; }
.workspace-leaf-content { display: flex; flex-direction: column; }
.view-content { flex: 1 1 auto; min-height: 0; }
.sidecar-bar {
  -webkit-app-region: drag;
  flex: 0 0 auto;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  height: var(--sidecar-bar-height);
  padding: 0 8px 0 var(--sidecar-traffic-inset);
  border-bottom: 1px solid var(--background-modifier-border);
}
.sidecar-bar-spacer { flex: 1 1 auto; }
.sidecar-pin-btn {
  -webkit-app-region: no-drag;
  color: var(--icon-color);
  opacity: var(--icon-opacity);
}
.sidecar-pin-btn:hover { opacity: 1; }
.sidecar-pin-btn.is-active { color: var(--interactive-accent); opacity: 1; }
.markdown-source-view.is-readable-line-width .cm-sizer,
.markdown-preview-view.is-readable-line-width .markdown-preview-sizer {
  max-width: none !important;
  margin-inline: 0 !important;
}
.markdown-source-view .cm-scroller,
.markdown-preview-view { padding: 16px 24px !important; }
.markdown-source-view .cm-content,
.markdown-preview-view { font-size: 14px !important; }
.inline-title { font-size: 18px !important; }
		`;
		doc.head.appendChild(el);
	}

	/**
	 * Attach bounds listeners once the popout window is available. Guarded
	 * per-leaf so schedulePopoutSetup retries are no-ops after first success.
	 */
	private ensureBoundsAttached(leaf: WorkspaceLeaf): void {
		if (this.boundsAttached.has(leaf)) return;
		const win = this.getPopoutWin(leaf);
		if (!win) return;
		this.boundsAttached.add(leaf);

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

	/** Position the sidecar 40px above and 40px to the right of the main
	 *  window's top-right corner. Always computed fresh from live geometry. */
	private computeOpenPosition(): { x: number; y: number } {
		return {
			x: window.screenX + window.outerWidth - DEFAULT_WIDTH + 40,
			y: window.screenY - 40,
		};
	}

	/** Read live window geometry and persist to settings. */
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
