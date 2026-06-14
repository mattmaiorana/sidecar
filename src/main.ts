import { MarkdownView, Notice, Plugin, TFile, WorkspaceWindow } from "obsidian";
import {
	DEFAULT_SETTINGS,
	SidecarBrowserSettings,
	SidecarBrowserSettingTab,
} from "./settings";
import { SidecarWindowManager, SIDECAR_BUILD } from "./window-manager";

export default class SidecarBrowserPlugin extends Plugin {
	settings!: SidecarBrowserSettings;
	windowManager!: SidecarWindowManager;

	async onload(): Promise<void> {
		await this.loadSettings();
		console.info(`[Sidecar] loaded — build ${SIDECAR_BUILD}`);

		this.windowManager = new SidecarWindowManager(this);

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

		// Optional ribbon shortcut for the same command.
		this.addRibbonIcon("square-arrow-up-right", "Open current note in Sidecar", () => {
			const file = this.app.workspace.getActiveFile();
			if (!file) {
				new Notice("Open a note first to view it in Sidecar.");
				return;
			}
			void this.windowManager.open(file);
		}).addClass("sidecar-ribbon-btn");

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
		this.updateToolbarStyle();
		this.addSettingTab(new SidecarBrowserSettingTab(this.app, this));
	}

	onunload(): void {
		// Reverse every mark we made (styles, header bars, pins). Leaves the
		// popout windows open as plain popouts.
		this.windowManager?.teardown();
		document.getElementById("sidecar-ribbon-style")?.remove();
		document.getElementById("sidecar-toolbar-style")?.remove();
	}

	updateRibbonStyle(): void {
		const STYLE_ID = "sidecar-ribbon-style";
		document.getElementById(STYLE_ID)?.remove();
		if (this.settings.hideRibbonButton) {
			const el = document.createElement("style");
			el.id = STYLE_ID;
			el.textContent = `.sidecar-ribbon-btn { display: none !important; }`;
			document.head.appendChild(el);
		}
	}

	updateToolbarStyle(): void {
		const STYLE_ID = "sidecar-toolbar-style";
		document.getElementById(STYLE_ID)?.remove();
		if (this.settings.hideToolbarButton) {
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
