import { MarkdownView, TFile, WorkspaceLeaf, WorkspaceWindow, setIcon } from "obsidian";
import type SidecarBrowserPlugin from "./main";

/** Class added to the popout window's <body> — debug/inspection only; the
 *  injected styles below do not depend on it. */
const POPOUT_BODY_CLASS = "sidecar-popout";
/** id of the <style> element we inject into each popout's <head>. */
const STYLE_ID = "sidecar-injected-styles";
/** Bump to confirm the active build in the popout's own inspector. */
export const SIDECAR_BUILD = "1.2.0";

/** Minimal shapes of the Electron remote APIs the zombie sweep relies on. */
interface RemoteBrowserWindow {
	id: number;
	isDestroyed(): boolean;
	destroy(): void;
	webContents: { executeJavaScript(code: string): Promise<unknown> };
}
interface ZombieSweepRemote {
	getCurrentWindow(): RemoteBrowserWindow;
	BrowserWindow: { getAllWindows(): RemoteBrowserWindow[] };
}


/**
 * Manages all open Sidecar popout windows.
 *
 * Each call to open(file) creates a new independent popout leaf via the same
 * native API behind "Open in new window" (`workspace.openPopoutLeaf`). Multiple
 * Sidecars can be open simultaneously; each is styled, sized, and optionally
 * pinned (always-on-top) independently. Only windows this manager opens are
 * ever styled or resized — the user's own popouts are left untouched.
 */
export class SidecarWindowManager {
	private plugin: SidecarBrowserPlugin;
	/** All leaves currently living inside open Sidecar popouts. */
	private leaves = new Set<WorkspaceLeaf>();
	/** True between requesting a popout and its window-open event firing. */
	private pendingPopout = false;
	/** Leaves whose window is currently pinned always-on-top (in-memory only;
	 *  not persisted, so a reload clears pins). */
	private pinnedLeaves = new Set<WorkspaceLeaf>();
	/** Unique per plugin load. Stamped on every popout we skin so the zombie
	 *  sweep can tell this session's windows from orphans left by a prior one. */
	private readonly sessionToken =
		Date.now().toString(36) + Math.random().toString(36).slice(2);

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
		this.closeMainWindowCopies(file);
		const width = this.plugin.settings.defaultWidth;
		const height = this.plugin.settings.windowHeight;
		const pos = this.computeOpenPosition();
		this.pendingPopout = true;
		const leaf = this.app.workspace.openPopoutLeaf({
			size: { width, height },
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
	 * few ticks so the styling survives Obsidian's own late popout setup.
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
				const win = this.popoutWindowFor(leaf);
				if (win) {
					const pos = this.computeOpenPosition();
					win.moveTo(pos.x, pos.y);
				}
			}
		};
		setup();
		window.setTimeout(setup, 0);
		window.setTimeout(setup, 60);
		window.setTimeout(setup, 250);
	}

	/**
	 * Mark our popout window the instant Obsidian creates it. Fires synchronously
	 * inside openPopoutLeaf — the earliest reliable point to resize and position.
	 * Guarded by `pendingPopout` so we only ever touch a window we just opened.
	 */
	handleWindowOpen(win: WorkspaceWindow): void {
		if (!this.pendingPopout) return;
		this.pendingPopout = false;
		const pos = this.computeOpenPosition();
		win.win.resizeTo(this.plugin.settings.defaultWidth, this.plugin.settings.windowHeight);
		win.win.moveTo(pos.x, pos.y);
		this.applyPopoutMarks(win.doc);
	}

	/** React to a specific popout being closed — removes the leaf from tracking. */
	handleWindowClose(win: WorkspaceWindow): void {
		for (const leaf of this.leaves) {
			if (this.workspaceWindowFor(leaf) !== win) continue;
			this.leaves.delete(leaf);
			this.pinnedLeaves.delete(leaf);
			break;
		}
	}

	/**
	 * Re-skin popouts that Obsidian restored after a reload. Gated by the
	 * `reskinPopoutsOnReload` setting. Runs only at startup (a few retries to
	 * catch late-restored popouts) and re-applies the Sidecar styling + header
	 * bar to every restored popout, leaving geometry untouched (no resize or
	 * reposition).
	 *
	 * Adopting *every* popout — rather than only notes we previously recorded —
	 * is intentional: it drops all save/restore bookkeeping (and the failure
	 * modes that came with it), at the cost of also skinning a user's own
	 * non-Sidecar popouts. That trade is the user's to make via the setting,
	 * which is why this relaxes the original path-matched decision #5 behind an
	 * off-by-default flag. Startup-only, so mid-session popouts are never touched.
	 */
	adoptRestoredSidecars(): void {
		if (!this.plugin.settings.reskinPopoutsOnReload) return;
		const scan = () => this.scanAndAdopt();
		scan();
		window.setTimeout(scan, 300);
		window.setTimeout(scan, 800);
	}

	private scanAndAdopt(): void {
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			// Popout windows only, and never re-adopt one we're already tracking.
			if (!(leaf.getContainer() instanceof WorkspaceWindow)) continue;
			if (this.leaves.has(leaf)) continue;
			this.leaves.add(leaf);
			// reposition = false: preserve the window's restored size/position.
			this.schedulePopoutSetup(leaf, false);
		}
	}

	/**
	 * Reverse every mark we made, so disabling the plugin leaves no trace: unpin
	 * always-on-top, remove the injected styles, our header bar, and the body
	 * class. Windows themselves are left open (now plain popouts). No bounds are
	 * saved — sizing is settings-driven, not captured. Called from onunload.
	 */
	teardown(): void {
		for (const leaf of this.leaves) {
			if (this.pinnedLeaves.has(leaf)) {
				const win = this.popoutWindowFor(leaf);
				if (win) this.setAlwaysOnTop(win, false);
			}
			const doc = this.popoutDocFor(leaf);
			if (doc) {
				doc.getElementById(STYLE_ID)?.remove();
				doc.body.classList.remove(POPOUT_BODY_CLASS);
				delete doc.body.dataset.sidecarBuild;
				delete doc.body.dataset.sidecarSession;
			}
			leaf.view?.containerEl
				?.querySelector(":scope > .sidecar-titlebar")
				?.remove();
		}
		this.leaves.clear();
		this.pinnedLeaves.clear();
	}

	// --- custom header bar ---------------------------------------------------

	/**
	 * Inject our minimal header bar as the first child of the note view's
	 * container. Idempotent: a second call is a no-op if the bar already exists.
	 * The bar provides the macOS traffic-light drag region and — when the
	 * Electron remote API is available — a pin (always-on-top) button.
	 */
	private decorateHeader(leaf: WorkspaceLeaf): void {
		this.markLeafPopout(leaf);
		const container = leaf.view.containerEl;
		if (container.querySelector(":scope > .sidecar-titlebar")) return;

		const bar = createDiv({ cls: "sidecar-bar sidecar-titlebar" });
		bar.dataset.sidecarBuild = SIDECAR_BUILD;

		const backBtn = bar.createEl("button", {
			cls: "sidecar-nav-btn sidecar-nav-back-btn clickable-icon",
			attr: { "aria-label": "Navigate back" },
		});
		setIcon(backBtn, "arrow-left");
		this.plugin.registerDomEvent(backBtn, "click", () => {
			this.navigate(leaf, "back");
		});

		const fwdBtn = bar.createEl("button", {
			cls: "sidecar-nav-btn sidecar-nav-fwd-btn clickable-icon",
			attr: { "aria-label": "Navigate forward" },
		});
		setIcon(fwdBtn, "arrow-right");
		this.plugin.registerDomEvent(fwdBtn, "click", () => {
			this.navigate(leaf, "forward");
		});

		bar.createDiv({ cls: "sidecar-bar-spacer" });

		const homeBtn = bar.createEl("button", {
			cls: "sidecar-home-btn clickable-icon",
			attr: { "aria-label": "Go to default note" },
		});
		setIcon(homeBtn, "file-text");
		this.plugin.registerDomEvent(homeBtn, "click", () => {
			void this.goHome(leaf);
		});

		const popInBtn = bar.createEl("button", {
			cls: "sidecar-popin-btn clickable-icon",
			attr: { "aria-label": "Return to main window" },
		});
		setIcon(popInBtn, "arrow-down-left");
		this.plugin.registerDomEvent(popInBtn, "click", () => {
			void this.popIn(leaf);
		});

		// Only offer the pin if the Electron remote API is reachable — otherwise
		// the button would toggle "active" while doing nothing (a lying UI).
		if (this.alwaysOnTopSupported()) {
			const pinBtn = bar.createEl("button", {
				cls: "sidecar-pin-btn clickable-icon",
				attr: { "aria-label": "Keep window on top" },
			});
			setIcon(pinBtn, "pin");
			this.plugin.registerDomEvent(pinBtn, "click", () => {
				const win = this.popoutWindowFor(leaf);
				if (!win) return;
				const nowPinned = !this.pinnedLeaves.has(leaf);
				if (nowPinned) this.pinnedLeaves.add(leaf);
				else this.pinnedLeaves.delete(leaf);
				pinBtn.toggleClass("is-active", nowPinned);
				this.setAlwaysOnTop(win, nowPinned);
			});
		}

		container.prepend(bar);
	}

	/** Close all main-window leaves showing `file` (pop-out mode). */
	private closeMainWindowCopies(file: TFile): void {
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			if (leaf.getContainer() instanceof WorkspaceWindow) continue;
			if ((leaf.view as MarkdownView).file === file) leaf.detach();
		}
	}

	/** Return the Sidecar's note to the main window and close the Sidecar. */
	private async popIn(leaf: WorkspaceLeaf): Promise<void> {
		const view = leaf.view;
		if (!(view instanceof MarkdownView) || !view.file) return;
		const file = view.file;
		const win = this.popoutWindowFor(leaf);
		// Silently activate a main-window leaf so getLeaf("tab") opens there
		// rather than in the focused Sidecar popout.
		const anchor = this.app.workspace.getMostRecentLeaf(
			this.app.workspace.rootSplit
		);
		if (anchor) this.app.workspace.setActiveLeaf(anchor, { focus: false });
		const mainLeaf = this.app.workspace.getLeaf("tab");
		await mainLeaf.openFile(file);
		this.app.workspace.revealLeaf(mainLeaf);
		if (win) win.close();
	}

	/** Whether Electron's remote API (needed for always-on-top) is reachable. */
	private alwaysOnTopSupported(): boolean {
		return this.getRemoteModule() !== null;
	}

	/** Whether Electron's remote module is reachable (pin button + zombie sweep). */
	remoteAvailable(): boolean {
		return this.getRemoteModule() !== null;
	}

	/**
	 * Close "zombie" Sidecar popouts left over from a previous session. On
	 * "Reload app without saving" Obsidian reloads the main renderer without
	 * closing existing popout windows, then restores fresh ones — leaving the old
	 * popouts open but dead (their links / live preview no longer work). This is
	 * an Obsidian-level bug; it happens with the plugin disabled too.
	 *
	 * Every popout we skin stamps `body.dataset.sidecarSession` with this load's
	 * token (see `applyPopoutMarks`). Here we read that token off every Electron
	 * window: any window carrying a Sidecar token that ISN'T the current one is an
	 * orphan from before the reload, so we destroy it. Windows with the current
	 * token (this session's live popouts) and windows with no token (the user's
	 * own popouts) are never touched — so the result is timing-independent. Gated
	 * by the setting and by the remote module being reachable.
	 */
	closeZombiePopouts(): void {
		if (!this.plugin.settings.closeZombiePopoutsOnReload) return;
		const remote = this.getRemoteModule() as unknown as ZombieSweepRemote | null;
		if (!remote || typeof remote.BrowserWindow?.getAllWindows !== "function") return;
		let currentId: number;
		let windows: RemoteBrowserWindow[];
		try {
			currentId = remote.getCurrentWindow().id;
			windows = remote.BrowserWindow.getAllWindows();
		} catch {
			return;
		}
		for (const win of windows) {
			try {
				if (win.id === currentId || win.isDestroyed()) continue;
			} catch {
				continue;
			}
			win.webContents
				.executeJavaScript(
					"(document.body && document.body.dataset.sidecarSession) || ''"
				)
				.then((token) => {
					if (typeof token === "string" && token && token !== this.sessionToken) {
						try {
							win.destroy();
							console.info(
								"[Sidecar] closed a leftover popout from a previous session"
							);
						} catch {
							/* already gone */
						}
					}
				})
				.catch(() => {
					/* window not readable — leave it alone */
				});
		}
	}

	/** Resolve Electron's remote module from the plugin context, or null. Both
	 *  `@electron/remote` and `electron.remote` are tried; both are deprecated,
	 *  so this may legitimately return null on newer Electron builds. */
	private getRemoteModule(): { getCurrentWindow?: unknown } | null {
		try {
			const req = (window as unknown as { require?: (id: string) => unknown })
				.require;
			if (typeof req !== "function") return null;
			try {
				const m = req("@electron/remote") as { getCurrentWindow?: unknown };
				if (m && typeof m.getCurrentWindow === "function") return m;
			} catch {
				/* not available — fall through */
			}
			try {
				const e = req("electron") as { remote?: { getCurrentWindow?: unknown } };
				if (e?.remote && typeof e.remote.getCurrentWindow === "function") {
					return e.remote;
				}
			} catch {
				/* not available */
			}
		} catch {
			/* require not present */
		}
		return null;
	}

	/**
	 * Toggle always-on-top for a popout window. The call is injected as a script
	 * so getCurrentWindow() resolves to the popout's own BrowserWindow rather
	 * than the main window's. Gated by alwaysOnTopSupported() at the call site,
	 * so the remote module is expected to be present here.
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

	/** The Obsidian WorkspaceWindow hosting this leaf, or null (main window). */
	private workspaceWindowFor(leaf: WorkspaceLeaf): WorkspaceWindow | null {
		const container = leaf.getContainer();
		return container instanceof WorkspaceWindow ? container : null;
	}

	/** The popout's Document, preferring the container API and falling back to
	 *  the view's ownerDocument for the brief window before the container wires up. */
	private popoutDocFor(leaf: WorkspaceLeaf): Document | null {
		const container = leaf.getContainer();
		if (container instanceof WorkspaceWindow) return container.doc;
		const viaView = leaf.view?.containerEl?.ownerDocument ?? null;
		return viaView && viaView !== document ? viaView : null;
	}

	/** The popout's DOM Window (defaultView of its document), or null. */
	private popoutWindowFor(leaf: WorkspaceLeaf): Window | null {
		return this.popoutDocFor(leaf)?.defaultView ?? null;
	}

	/** Apply the body class + build stamp and inject our styles. Idempotent. */
	private markLeafPopout(leaf: WorkspaceLeaf): void {
		const doc = this.popoutDocFor(leaf);
		if (doc) this.applyPopoutMarks(doc);
	}

	private applyPopoutMarks(doc: Document): void {
		doc.body.classList.add(POPOUT_BODY_CLASS);
		doc.body.dataset.sidecarBuild = SIDECAR_BUILD;
		doc.body.dataset.sidecarSession = this.sessionToken;
		this.injectPopoutStyles(doc);
		this.applyPinStyle(doc);
		this.applyPopInStyle(doc);
		this.applyNavStyle(doc);
		this.applyHomeStyle(doc);
	}

	private applyPinStyle(doc: Document): void {
		const STYLE_ID = "sidecar-pin-style";
		doc.getElementById(STYLE_ID)?.remove();
		if (!this.plugin.settings.showPinButton) {
			const el = doc.createElement("style");
			el.id = STYLE_ID;
			el.textContent = `.sidecar-pin-btn { display: none !important; }`;
			doc.head.appendChild(el);
		}
	}

	updatePinStyle(): void {
		for (const leaf of this.leaves) {
			const doc = this.popoutDocFor(leaf);
			if (doc) this.applyPinStyle(doc);
		}
	}

	private applyPopInStyle(doc: Document): void {
		const STYLE_ID = "sidecar-popin-style";
		doc.getElementById(STYLE_ID)?.remove();
		if (!this.plugin.settings.showPopInButton) {
			const el = doc.createElement("style");
			el.id = STYLE_ID;
			el.textContent = `.sidecar-popin-btn { display: none !important; }`;
			doc.head.appendChild(el);
		}
	}

	updatePopInStyle(): void {
		for (const leaf of this.leaves) {
			const doc = this.popoutDocFor(leaf);
			if (doc) this.applyPopInStyle(doc);
		}
	}

	private applyNavStyle(doc: Document): void {
		const STYLE_ID = "sidecar-nav-style";
		doc.getElementById(STYLE_ID)?.remove();
		if (!this.plugin.settings.showNavButtons) {
			const el = doc.createElement("style");
			el.id = STYLE_ID;
			el.textContent = `.sidecar-nav-btn { display: none !important; }`;
			doc.head.appendChild(el);
		}
	}

	updateNavStyle(): void {
		for (const leaf of this.leaves) {
			const doc = this.popoutDocFor(leaf);
			if (doc) this.applyNavStyle(doc);
		}
	}

	private applyHomeStyle(doc: Document): void {
		const STYLE_ID = "sidecar-home-style";
		doc.getElementById(STYLE_ID)?.remove();
		if (!this.plugin.settings.showHomeButton) {
			const el = doc.createElement("style");
			el.id = STYLE_ID;
			el.textContent = `.sidecar-home-btn { display: none !important; }`;
			doc.head.appendChild(el);
		}
	}

	updateHomeStyle(): void {
		for (const leaf of this.leaves) {
			const doc = this.popoutDocFor(leaf);
			if (doc) this.applyHomeStyle(doc);
		}
	}

	private async goHome(leaf: WorkspaceLeaf): Promise<void> {
		const path = this.plugin.settings.defaultNote.trim();
		if (!path) return;
		const abstract = this.plugin.app.vault.getAbstractFileByPath(path);
		if (!(abstract instanceof TFile)) return;
		await leaf.openFile(abstract);
	}

	private navigate(leaf: WorkspaceLeaf, direction: "back" | "forward"): void {
		this.app.workspace.setActiveLeaf(leaf, { focus: false });
		const cmds = (this.app as unknown as { commands: { executeCommandById(id: string): void } }).commands;
		cmds.executeCommandById(direction === "back" ? "app:go-back" : "app:go-forward");
	}

	/** Re-inject the base popout styles on all open Sidecars (picks up text/padding setting changes). */
	refreshPopoutStyles(): void {
		for (const leaf of this.leaves) {
			const doc = this.popoutDocFor(leaf);
			if (!doc) continue;
			doc.getElementById(STYLE_ID)?.remove();
			this.injectPopoutStyles(doc);
		}
	}

	/**
	 * Inject the chrome-hiding + layout CSS directly into the popout's <head>.
	 * This is the single source of truth for Sidecar styling: the rules are not
	 * scoped to a body class, so nothing Obsidian does to body.class can drop
	 * them. Guarded by the style element's id, so repeated calls are no-ops.
	 */
	private injectPopoutStyles(doc: Document): void {
		if (doc.getElementById(STYLE_ID)) return;
		const { smallerText, smallerPadding } = this.plugin.settings;
		const el = doc.createElement("style");
		el.id = STYLE_ID;
		el.textContent = `
:root {
  --sidecar-traffic-inset: 76px;
  --sidecar-bar-height: 40px;
}
.workspace-tab-header-container { display: none !important; }
.view-header { display: none !important; }
.status-bar, .workspace-ribbon { display: none !important; }
.workspace-leaf-content { display: flex; flex-direction: column; }
.view-content { flex: 1 1 auto; min-height: 0; }
/* Make note content fill the narrow window instead of being centered at the
   readable line width. Surgical override of the two sizer elements only — we
   deliberately avoid touching Obsidian's shared --file-line-width variable,
   which other features (e.g. the link-suggestion popup) also read. */
.markdown-source-view.is-readable-line-width .cm-sizer,
.markdown-preview-view.is-readable-line-width .markdown-preview-sizer {
  max-width: none !important;
  margin-inline: 0 !important;
}
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
.sidecar-nav-btn {
  -webkit-app-region: no-drag;
  color: var(--icon-color);
  opacity: var(--icon-opacity);
}
.sidecar-nav-btn:hover { opacity: 1; }
.sidecar-home-btn {
  -webkit-app-region: no-drag;
  color: var(--icon-color);
  opacity: var(--icon-opacity);
}
.sidecar-home-btn:hover { opacity: 1; }
.sidecar-pin-btn {
  -webkit-app-region: no-drag;
  color: var(--icon-color);
  opacity: var(--icon-opacity);
}
.sidecar-pin-btn:hover { opacity: 1; }
.sidecar-pin-btn.is-active { color: var(--interactive-accent); opacity: 1; }
/* Keep the [[link]] / command suggestion popup inside the narrow window.
   Without a cap the popup grows to its content width, overflows the window,
   and Obsidian anchors its right edge in view — shoving the left edge (and the
   note titles) off-screen. Capping the width lets Obsidian's own positioning
   keep the whole popup visible. */
.suggestion-container {
  max-width: calc(100vw - 20px) !important;
}
.suggestion-container .suggestion-item {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
${smallerPadding ? `.markdown-source-view .cm-scroller,
.markdown-preview-view { padding: 16px 24px !important; }` : ""}
${smallerText ? `.markdown-source-view .cm-content,
.markdown-preview-view { font-size: 14px !important; }
.inline-title { font-size: 18px !important; }
.markdown-preview-view h1, .markdown-source-view .cm-header-1 { font-size: 18px !important; }
.markdown-preview-view h2, .markdown-source-view .cm-header-2 { font-size: 16px !important; }
.markdown-preview-view h3, .markdown-source-view .cm-header-3 { font-size: 15px !important; }
.markdown-preview-view h4, .markdown-source-view .cm-header-4,
.markdown-preview-view h5, .markdown-source-view .cm-header-5,
.markdown-preview-view h6, .markdown-source-view .cm-header-6 { font-size: 14px !important; }
.markdown-preview-view pre,
.markdown-preview-view code,
.markdown-source-view .cm-inline-code { font-size: 13px !important; }
.callout-title { font-size: 14px !important; }
.metadata-container { font-size: 14px !important; }` : ""}
		`;
		doc.head.appendChild(el);
	}

	/**
	 * Position the sidecar 40px above and 40px right of the main window's
	 * top-right corner, computed fresh from live geometry so it follows the main
	 * window. The y is clamped to the screen's available top so it never tucks
	 * under the macOS menu bar.
	 */
	private computeOpenPosition(): { x: number; y: number } {
		const top = (window.screen as { availTop?: number }).availTop ?? 0;
		return {
			x: window.screenX + window.outerWidth - this.plugin.settings.defaultWidth + 40,
			y: Math.max(window.screenY - 40, top),
		};
	}

}
