import { MarkdownView, Notice, Plugin, TFile, WorkspaceWindow } from "obsidian";
import {
	DEFAULT_SETTINGS,
	SidecarBrowserSettings,
	SidecarBrowserSettingTab,
} from "./settings";
import { SidecarWindowManager, SIDECAR_BUILD } from "./window-manager";
import { SidecarLauncherButtons } from "./launcher-button";

export default class SidecarBrowserPlugin extends Plugin {
	settings!: SidecarBrowserSettings;
	windowManager!: SidecarWindowManager;
	launcherButtons!: SidecarLauncherButtons;

	async onload(): Promise<void> {
		await this.loadSettings();
		console.info(`[Sidecar] loaded — build ${SIDECAR_BUILD}`);

		this.windowManager = new SidecarWindowManager(this);
		this.launcherButtons = new SidecarLauncherButtons(this);

		// Primary entry point.
		this.addCommand({
			id: "open-current-note",
			name: "Open current note",
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
			id: "open-default-note",
			name: "Open default note",
			callback: () => {
				void this.openDefaultNote();
			},
		});

		// Optional ribbon shortcut for the same command.
		this.addRibbonIcon("arrow-up-right", "Open current note in Sidecar", () => {
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
						.setIcon("arrow-up-right")
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
				view.addAction("arrow-up-right", "Open in Sidecar", () => {
					const file = view.file;
					if (file) void this.windowManager.open(file);
				}).addClass("sidecar-toolbar-btn");
			})
		);

		this.updateRibbonStyle();
		this.updateHomeRibbonStyle();
		this.updateToolbarStyle();
		this.addSettingTab(new SidecarBrowserSettingTab(this.app, this));

		// Mount the launcher buttons, and re-mount them when Obsidian rebuilds
		// the sidebar/ribbon chrome they live in. Also untrack + de-skin any
		// Sidecar leaf that was dragged out of its popout into the main window.
		this.registerEvent(
			this.app.workspace.on("layout-change", () => {
				this.launcherButtons.mount();
				this.windowManager.reconcileMovedLeaves();
			})
		);

		this.app.workspace.onLayoutReady(() => {
			this.launcherButtons.mount();
			// Re-skin any Sidecars that Obsidian restored from the previous session.
			this.windowManager.adoptRestoredSidecars();
			// Close any dead leftover popouts from before a reload (opt-in).
			this.windowManager.closeZombiePopouts();
		});
	}

	onunload(): void {
		// Reverse every mark we made (styles, header bars, pins). Leaves the
		// popout windows open as plain popouts.
		this.windowManager?.teardown();
		this.launcherButtons?.remove();
		// The body classes and toolbar buttons live in the MAIN window; unload can
		// fire while a popout is focused, so target the main-window document
		// explicitly (rootSplit.doc) rather than activeDocument, which may be a
		// popout — otherwise the main window keeps stale hide-classes/buttons.
		this.app.workspace.rootSplit.doc.body.removeClass(
			"sidecar-hide-ribbon-btn",
			"sidecar-hide-home-ribbon-btn",
			"sidecar-hide-toolbar-btn"
		);
		// Ribbon buttons are auto-removed by Obsidian; the per-note toolbar
		// actions (view.addAction) are not, so drop them across every window
		// (a decorated view may have been moved into a popout).
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			leaf.view.containerEl
				.querySelectorAll(".sidecar-toolbar-btn")
				.forEach((el) => el.remove());
		}
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

	// Button visibility is driven by body classes (rules live in styles.css);
	// toggling a class shows/hides the matching button.
	updateHomeRibbonStyle(): void {
		activeDocument.body.toggleClass("sidecar-hide-home-ribbon-btn", !this.settings.showHomeRibbonButton);
	}

	updateRibbonStyle(): void {
		activeDocument.body.toggleClass("sidecar-hide-ribbon-btn", !this.settings.showRibbonButton);
	}

	updateToolbarStyle(): void {
		activeDocument.body.toggleClass("sidecar-hide-toolbar-btn", !this.settings.showToolbarButton);
	}

	async loadSettings(): Promise<void> {
		const data = (await this.loadData()) as Partial<SidecarBrowserSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
