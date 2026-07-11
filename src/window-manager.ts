import { MarkdownView, Notice, TFile, WorkspaceLeaf, WorkspaceWindow, setIcon } from "obsidian";
import type SidecarBrowserPlugin from "./main";
import type { SidecarBrowserSettings } from "./settings";

/** Class added to the popout window's <body> — debug/inspection only; the
 *  injected styles below do not depend on it. */
const POPOUT_BODY_CLASS = "sidecar-popout";
/** id of the <style> element we inject into each popout's <head>. */
const STYLE_ID = "sidecar-injected-styles";
/** Bump to confirm the active build in the popout's own inspector. */
export const SIDECAR_BUILD = "1.2.8";

/** Minimal shapes of the Electron remote APIs we rely on (pin + zombie sweep). */
interface RemoteBrowserWindow {
	id: number;
	isDestroyed(): boolean;
	destroy(): void;
	setAlwaysOnTop(flag: boolean, level?: string): void;
	webContents: { executeJavaScript(code: string): Promise<unknown> };
}
interface RemoteModule {
	getCurrentWindow(): RemoteBrowserWindow;
	BrowserWindow: { getAllWindows(): RemoteBrowserWindow[] };
}

/** The boolean-valued keys of the settings — the ones a visibility toggle uses. */
type BoolSettingKey = {
	[K in keyof SidecarBrowserSettings]: SidecarBrowserSettings[K] extends boolean
		? K
		: never;
}[keyof SidecarBrowserSettings];

/**
 * The popout-bar buttons whose visibility a setting controls. Each is hidden by
 * injecting a `<style id>` into the popout head when its setting is off (the bar
 * buttons live in the popout, so this can't move to the main-window styles.css).
 */
const BAR_BUTTON_STYLES: ReadonlyArray<{
	id: string;
	selector: string;
	setting: BoolSettingKey;
}> = [
	{ id: "sidecar-pin-style", selector: ".sidecar-pin-btn", setting: "showPinButton" },
	{ id: "sidecar-popin-style", selector: ".sidecar-popin-btn", setting: "showPopInButton" },
	{ id: "sidecar-nav-style", selector: ".sidecar-nav-btn", setting: "showNavButtons" },
	{ id: "sidecar-home-style", selector: ".sidecar-home-btn", setting: "showHomeButton" },
];


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
	/** Random, unique per plugin load — the "which session" half of the popout
	 *  stamp. Lets the zombie sweep tell this load's windows from a prior one's. */
	private readonly sessionNonce =
		Date.now().toString(36) + Math.random().toString(36).slice(2);

	constructor(plugin: SidecarBrowserPlugin) {
		this.plugin = plugin;
	}

	private get app() {
		return this.plugin.app;
	}

	/** Stable per-vault id. Electron runs multiple open vaults in ONE process, so
	 *  the zombie sweep's getAllWindows() also sees other vaults' windows; scoping
	 *  the token by vault ensures we only ever destroy THIS vault's orphans, never
	 *  another vault's live Sidecars. */
	private get vaultId(): string {
		return this.app.vault.getName();
	}

	/** The token stamped on every popout we skin: `<vaultId>:<sessionNonce>`. Two
	 *  popouts share it iff they are the same vault AND the same plugin load. */
	private get sessionToken(): string {
		return `${this.vaultId}:${this.sessionNonce}`;
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
		let leaf: WorkspaceLeaf;
		try {
			// handleWindowOpen fires synchronously inside this call and clears the
			// flag; the finally is a backstop so a throw here can't leave it stuck
			// true (which would make us skin the next popout the *user* opens).
			leaf = this.app.workspace.openPopoutLeaf({
				size: { width, height },
				x: pos.x,
				y: pos.y,
			});
		} finally {
			this.pendingPopout = false;
		}
		this.leaves.add(leaf);

		await leaf.openFile(file, { active: true });
		this.decorateHeader(leaf);
		this.app.workspace.setActiveLeaf(leaf, { focus: true });

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

	/** React to a specific popout being closed — removes every tracked leaf that
	 *  lived in it. A restored popout adopted via scanAndAdopt can hold more than
	 *  one markdown leaf, so we must drop them all (no early break). */
	handleWindowClose(win: WorkspaceWindow): void {
		for (const leaf of this.leaves) {
			if (this.workspaceWindowFor(leaf) !== win) continue;
			this.leaves.delete(leaf);
			this.pinnedLeaves.delete(leaf);
		}
	}

	/**
	 * Drop tracked leaves that are no longer inside a popout window. If the user
	 * drags a Sidecar tab into the main window (or uses "Move to main window"),
	 * the view's containerEl — with our prepended `.sidecar-titlebar` — travels
	 * with it, but the popout CSS stays behind, so the main window would show an
	 * unstyled header row. The leaf also leaks: its popout is gone, so
	 * `handleWindowClose` never matches it. Here we strip the bar and stop
	 * tracking. Wired to `layout-change`. Safe against transient states: an open()
	 * leaf is already in its WorkspaceWindow synchronously before layout-change.
	 */
	reconcileMovedLeaves(): void {
		for (const leaf of this.leaves) {
			if (leaf.getContainer() instanceof WorkspaceWindow) continue;
			leaf.view?.containerEl
				?.querySelector(":scope > .sidecar-titlebar")
				?.remove();
			this.leaves.delete(leaf);
			this.pinnedLeaves.delete(leaf);
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
				for (const { id } of BAR_BUTTON_STYLES) doc.getElementById(id)?.remove();
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
		if (this.remoteAvailable()) {
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
			const view = leaf.view;
			if (view instanceof MarkdownView && view.file === file) leaf.detach();
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
		this.app.workspace.setActiveLeaf(mainLeaf, { focus: true });
		if (win) win.close();
	}

	/** Whether Electron's remote module is reachable (pin button + zombie sweep). */
	remoteAvailable(): boolean {
		return this.mainRemote() !== null;
	}

	/**
	 * Close "zombie" Sidecar popouts left over from a previous session. On
	 * "Reload app without saving" Obsidian reloads the main renderer without
	 * closing existing popout windows, then restores fresh ones — leaving the old
	 * popouts open but dead (their links / live preview no longer work). This is
	 * an Obsidian-level bug; it happens with the plugin disabled too.
	 *
	 * Every popout we skin stamps `body.dataset.sidecarSession` with this load's
	 * `<vaultId>:<nonce>` token (see `applyPopoutMarks`). Here we read that token
	 * off every Electron window and destroy only windows whose token is for THIS
	 * vault but a PRIOR session (same `vaultId:` prefix, different full token) —
	 * i.e. an orphan from before the reload. Windows with the current token (this
	 * session's live popouts), windows from another vault (Electron shares one
	 * process across vaults), and windows with no token (the user's own popouts)
	 * are all left untouched — so the result is timing- and vault-independent.
	 * Gated by the setting and by the remote module being reachable.
	 */
	closeZombiePopouts(): void {
		if (!this.plugin.settings.closeZombiePopoutsOnReload) return;
		const remote = this.mainRemote();
		if (!remote || typeof remote.BrowserWindow?.getAllWindows !== "function") return;
		const currentToken = this.sessionToken;
		const vaultPrefix = this.vaultId + ":";
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
					// Only OUR vault's popouts from a PRIOR session: same vault
					// prefix, different full token. Skips this session's live
					// windows, other vaults' windows, and untagged user popouts.
					if (
						typeof token === "string" &&
						token.startsWith(vaultPrefix) &&
						token !== currentToken
					) {
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

	/** Resolve an Electron remote module from a window's `require`, or null. Both
	 *  `@electron/remote` and `electron.remote` are tried; both are deprecated, so
	 *  this may legitimately return null on newer Electron builds. */
	private resolveRemote(req: unknown): RemoteModule | null {
		if (typeof req !== "function") return null;
		const r = req as (id: string) => unknown;
		try {
			const m = r("@electron/remote") as Partial<RemoteModule>;
			if (typeof m?.getCurrentWindow === "function") return m as RemoteModule;
		} catch {
			/* not available — fall through */
		}
		try {
			const e = r("electron") as { remote?: Partial<RemoteModule> };
			if (typeof e?.remote?.getCurrentWindow === "function") {
				return e.remote as RemoteModule;
			}
		} catch {
			/* not available */
		}
		return null;
	}

	/** This (main) renderer's remote module, or null. */
	private mainRemote(): RemoteModule | null {
		return this.resolveRemote((window as unknown as { require?: unknown }).require);
	}

	/**
	 * Toggle always-on-top for a popout window. We resolve the popout's *own*
	 * BrowserWindow through its renderer's `require` — each window's
	 * `@electron/remote` is bound to its own webContents, so `getCurrentWindow()`
	 * returns this popout rather than the main window. Using the popout's require
	 * (instead of injecting a `<script>`) keeps this free of dynamic code
	 * execution. Gated by `remoteAvailable()` at the call site.
	 */
	private setAlwaysOnTop(popoutWin: Window, pinned: boolean): void {
		try {
			// Resolve through the *popout's* own require so getCurrentWindow()
			// returns this popout, not the main window.
			const remote = this.resolveRemote(
				(popoutWin as unknown as { require?: unknown }).require
			);
			remote?.getCurrentWindow().setAlwaysOnTop(pinned, "floating");
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
	 *  the view's ownerDocument for the brief window before the container wires
	 *  up. The fallback returns the doc only if it belongs to a *different* window
	 *  than this (main) renderer — i.e. a popout — comparing windows rather than
	 *  the global `document` (which `activeDocument` would wrongly shadow here). */
	private popoutDocFor(leaf: WorkspaceLeaf): Document | null {
		const container = leaf.getContainer();
		if (container instanceof WorkspaceWindow) return container.doc;
		const viaView = leaf.view?.containerEl?.ownerDocument ?? null;
		return viaView && viaView.defaultView !== window ? viaView : null;
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
		this.applyBarButtonStyles(doc);
	}

	/** (Re)inject the per-button hide `<style>` tags for this popout, per the
	 *  current settings — one `<style id>` per bar button, from BAR_BUTTON_STYLES. */
	private applyBarButtonStyles(doc: Document): void {
		for (const { id, selector, setting } of BAR_BUTTON_STYLES) {
			doc.getElementById(id)?.remove();
			if (!this.plugin.settings[setting]) {
				const el = doc.createElement("style");
				el.id = id;
				el.textContent = `${selector} { display: none !important; }`;
				doc.head.appendChild(el);
			}
		}
	}

	/** Re-sync bar-button visibility across all open Sidecars (from settings). */
	updateBarButtonStyles(): void {
		for (const leaf of this.leaves) {
			const doc = this.popoutDocFor(leaf);
			if (doc) this.applyBarButtonStyles(doc);
		}
	}

	private async goHome(leaf: WorkspaceLeaf): Promise<void> {
		const path = this.plugin.settings.defaultNote.trim();
		if (!path) {
			new Notice("No default note configured — set one in Sidecar settings.");
			return;
		}
		const abstract = this.plugin.app.vault.getAbstractFileByPath(path);
		if (!(abstract instanceof TFile)) {
			new Notice(`Default note not found: ${path}`);
			return;
		}
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
