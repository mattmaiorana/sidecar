import { MarkdownView, Notice, Plugin, TFile, WorkspaceLeaf, WorkspaceWindow } from "obsidian";
import {
	DEFAULT_SETTINGS,
	SidecarBrowserSettings,
	SidecarBrowserSettingTab,
} from "./settings";
import { SidecarWindowManager, SIDECAR_BUILD } from "./window-manager";
import { SidecarLauncherView, SIDECAR_LAUNCHER_VIEW_TYPE } from "./sidebar-view";

export default class SidecarBrowserPlugin extends Plugin {
	settings!: SidecarBrowserSettings;
	windowManager!: SidecarWindowManager;

	async onload(): Promise<void> {
		await this.loadSettings();
		console.info(`[Sidecar] loaded — build ${SIDECAR_BUILD}`);

		this.windowManager = new SidecarWindowManager(this);

		// Left-sidebar launcher panel: a non-ribbon, one-button home for opening
		// the default note in a Sidecar. Registered before layout restore so
		// Obsidian rehydrates the panel automatically across reloads.
		this.registerView(
			SIDECAR_LAUNCHER_VIEW_TYPE,
			(leaf) => new SidecarLauncherView(leaf, this)
		);

		// Primary entry point.
		this.addCommand({
			id: "open-sidecar-browser",
			name: "Open current note in Sidecar",
			callback: () => {
				const file = this.app.workspace.getActiveFile();
				if (!file) {
					new Notice("Open a note first to view it in Sidecar.");
					return;
				}
				void this.windowManager.open(file);
			},
		});

		this.addCommand({
			id: "open-default-note-in-sidecar",
			name: "Open default note in Sidecar",
			hotkeys: [{ modifiers: ["Mod", "Shift"], key: "S" }],
			callback: () => {
				void this.openDefaultNote();
			},
		});

		// Re-open / reveal the sidebar launcher panel (e.g. after closing it).
		this.addCommand({
			id: "open-sidecar-launcher",
			name: "Open Sidecar launcher panel",
			callback: () => {
				void this.activateLauncherView();
			},
		});

		// Optional ribbon shortcut for the same command.
		this.addRibbonIcon("square-arrow-up-right", "Open current note in Sidecar", () => {
			const file = this.app.workspace.getActiveFile();
			if (!file) {
				new Notice("Open a note first to view it in Sidecar.");
				return;
			}
			void this.windowManager.open(file);
		}).addClass("sidecar-ribbon-btn");

		this.addRibbonIcon("file-text", "Open default note in Sidecar", () => {
			void this.openDefaultNote();
		}).addClass("sidecar-home-ribbon-btn");

		// When the user closes the popout, persist its final bounds and let the
		// manager forget the leaf so the next open spawns a fresh window.
		this.registerEvent(
			this.app.workspace.on("window-close", (win) => {
				this.windowManager.handleWindowClose(win);
			})
		);

		// Mark our popout window the moment it's created — the most reliable
		// point to add the body class the popout-scoped CSS depends on.
		this.registerEvent(
			this.app.workspace.on("window-open", (win) => {
				this.windowManager.handleWindowOpen(win);
			})
		);

		// Right-click a .md file in the file tree → "Open in Sidecar".
		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (!(file instanceof TFile) || file.extension !== "md") return;
				menu.addItem((item) =>
					item
						.setTitle("Open in Sidecar")
						.setIcon("square-arrow-up-right")
						.onClick(() => void this.windowManager.open(file))
				);
			})
		);

		// Add a toolbar button to every MarkdownView in the main window.
		const decoratedViews = new WeakSet<MarkdownView>();
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (leaf) => {
				if (!leaf) return;
				// Skip any leaf living inside a popout (the sidecar itself).
				if (leaf.getContainer() instanceof WorkspaceWindow) return;
				const view = leaf.view;
				if (!(view instanceof MarkdownView)) return;
				if (decoratedViews.has(view)) return;
				decoratedViews.add(view);
				view.addAction("square-arrow-up-right", "Open in Sidecar", () => {
					const file = view.file;
					if (file) void this.windowManager.open(file);
				}).addClass("sidecar-toolbar-btn");
			})
		);

		this.updateRibbonStyle();
		this.updateHomeRibbonStyle();
		this.updateToolbarStyle();
		this.addSettingTab(new SidecarBrowserSettingTab(this.app, this));

		// Auto-add the launcher panel once (first run). After that we leave it
		// alone: Obsidian restores it across reloads, and if the user removes it
		// the `launcherInitialized` flag keeps it from reappearing.
		this.app.workspace.onLayoutReady(() => {
			if (
				!this.settings.launcherInitialized &&
				this.app.workspace.getLeavesOfType(SIDECAR_LAUNCHER_VIEW_TYPE).length === 0
			) {
				void this.initLauncherView();
			}
			// Re-skin any Sidecars that Obsidian restored from the previous session.
			this.windowManager.adoptRestoredSidecars();
		});
	}

	onunload(): void {
		// Reverse every mark we made (styles, header bars, pins). Leaves the
		// popout windows open as plain popouts.
		this.windowManager?.teardown();
		document.getElementById("sidecar-ribbon-style")?.remove();
		document.getElementById("sidecar-home-ribbon-style")?.remove();
		document.getElementById("sidecar-toolbar-style")?.remove();
	}

	async openDefaultNote(): Promise<void> {
		const path = this.settings.defaultNote.trim();
		if (path) {
			const abstract = this.app.vault.getAbstractFileByPath(path);
			if (abstract instanceof TFile) {
				await this.windowManager.open(abstract);
				return;
			}
			new Notice(`Default note not found: ${path}`);
			return;
		}
		// No default configured — fall back to opening the active note.
		const file = this.app.workspace.getActiveFile();
		if (!file) {
			new Notice("Open a note first, or configure a default note in Sidecar settings.");
			return;
		}
		await this.windowManager.open(file);
	}

	/** First-run: add the launcher panel to the left sidebar without stealing focus. */
	async initLauncherView(): Promise<void> {
		const leaf = this.app.workspace.getLeftLeaf(false);
		if (!leaf) return;
		await leaf.setViewState({ type: SIDECAR_LAUNCHER_VIEW_TYPE });
		this.settings.launcherInitialized = true;
		await this.saveSettings();
	}

	/** Reveal the launcher panel, creating it in the left sidebar if it's gone. */
	async activateLauncherView(): Promise<void> {
		const { workspace } = this.app;
		const existing = workspace.getLeavesOfType(SIDECAR_LAUNCHER_VIEW_TYPE);
		let leaf: WorkspaceLeaf | null = existing.length > 0 ? existing[0] : null;
		if (!leaf) {
			leaf = workspace.getLeftLeaf(false);
			if (!leaf) return;
			await leaf.setViewState({ type: SIDECAR_LAUNCHER_VIEW_TYPE, active: true });
		}
		void workspace.revealLeaf(leaf);
	}

	/** Re-render any open launcher panels (e.g. after the default note changes). */
	refreshLauncherView(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(SIDECAR_LAUNCHER_VIEW_TYPE)) {
			const view = leaf.view;
			if (view instanceof SidecarLauncherView) view.render();
		}
	}

	updateHomeRibbonStyle(): void {
		const STYLE_ID = "sidecar-home-ribbon-style";
		document.getElementById(STYLE_ID)?.remove();
		if (!this.settings.showHomeRibbonButton) {
			const el = document.createElement("style");
			el.id = STYLE_ID;
			el.textContent = `.sidecar-home-ribbon-btn { display: none !important; }`;
			document.head.appendChild(el);
		}
	}

	updateRibbonStyle(): void {
		const STYLE_ID = "sidecar-ribbon-style";
		document.getElementById(STYLE_ID)?.remove();
		if (!this.settings.showRibbonButton) {
			const el = document.createElement("style");
			el.id = STYLE_ID;
			el.textContent = `.sidecar-ribbon-btn { display: none !important; }`;
			document.head.appendChild(el);
		}
	}

	updateToolbarStyle(): void {
		const STYLE_ID = "sidecar-toolbar-style";
		document.getElementById(STYLE_ID)?.remove();
		if (!this.settings.showToolbarButton) {
			const el = document.createElement("style");
			el.id = STYLE_ID;
			el.textContent = `.sidecar-toolbar-btn { display: none !important; }`;
			document.head.appendChild(el);
		}
	}

	async loadSettings(): Promise<void> {
		const data = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
