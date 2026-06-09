import { Plugin } from "obsidian";
import {
	DEFAULT_SETTINGS,
	SidecarBrowserSettings,
	SidecarBrowserSettingTab,
} from "./settings";
import {
	ProjectBrowserView,
	VIEW_TYPE_SIDECAR_BROWSER,
} from "./project-browser-view";
import { SidecarWindowManager, SIDECAR_BUILD } from "./window-manager";

export default class SidecarBrowserPlugin extends Plugin {
	settings!: SidecarBrowserSettings;
	windowManager!: SidecarWindowManager;

	async onload(): Promise<void> {
		await this.loadSettings();
		console.info(`[Sidecar Browser] loaded — build ${SIDECAR_BUILD}`);

		this.windowManager = new SidecarWindowManager(this);

		// The folder-listing state of the single Sidecar leaf.
		this.registerView(
			VIEW_TYPE_SIDECAR_BROWSER,
			(leaf) => new ProjectBrowserView(leaf, this)
		);

		// Primary entry point.
		this.addCommand({
			id: "open-sidecar-browser",
			name: "Open Sidecar Browser",
			callback: () => {
				void this.windowManager.open();
			},
		});

		// Optional ribbon shortcut for the same command.
		this.addRibbonIcon("panel-right", "Open Sidecar Browser", () => {
			void this.windowManager.open();
		});

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

		// Keep our custom note title bar in sync if the file in the Sidecar leaf
		// changes outside of our own click handler.
		this.registerEvent(
			this.app.workspace.on("file-open", () => {
				this.windowManager.refreshNoteHeader();
			})
		);

		this.addSettingTab(new SidecarBrowserSettingTab(this.app, this));
	}

	onunload(): void {
		// Best-effort: capture the window geometry before we go.
		this.windowManager?.saveBoundsNow();
	}

	async loadSettings(): Promise<void> {
		const data = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
		// windowBounds is a nested object — merge it explicitly so a partial
		// saved blob can't drop the default width/height.
		this.settings.windowBounds = Object.assign(
			{},
			DEFAULT_SETTINGS.windowBounds,
			data?.windowBounds
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
