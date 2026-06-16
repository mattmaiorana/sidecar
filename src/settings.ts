import { AbstractInputSuggest, App, PluginSettingTab, Setting, TFile } from "obsidian";
import type SidecarBrowserPlugin from "./main";

class FileSuggest extends AbstractInputSuggest<TFile> {
	getSuggestions(query: string): TFile[] {
		const lower = query.toLowerCase();
		return this.app.vault.getMarkdownFiles()
			.filter(f => f.path.toLowerCase().includes(lower))
			.slice(0, 20);
	}

	renderSuggestion(file: TFile, el: HTMLElement): void {
		el.setText(file.path);
	}
}

export interface SidecarBrowserSettings {
	/** Default width for new Sidecar windows. Always resets to this on open. */
	defaultWidth: number;
	/** Height for new Sidecar windows. */
	windowHeight: number;
	/** When true, applies a smaller font size to Sidecar note content. */
	smallerText: boolean;
	/** When true, applies tighter padding to Sidecar note content. */
	smallerPadding: boolean;
	/** When true, the "open current note" ribbon button is shown. */
	showRibbonButton: boolean;
	/** When true, the "open default note" ribbon button is shown. */
	showHomeRibbonButton: boolean;
	/** When true, the per-note toolbar button is shown. */
	showToolbarButton: boolean;
	/** When true, the pop-in button in the Sidecar bar is shown. */
	showPopInButton: boolean;
	/** When true, the always-on-top pin button is shown in the Sidecar bar. */
	showPinButton: boolean;
	/** When true, back and forward navigation buttons are shown in the Sidecar bar. */
	showNavButtons: boolean;
	/** Path to the note opened by "Open default note in Sidecar" and the home button. */
	defaultNote: string;
	/** When true, a home button is shown in the Sidecar bar to return to the default note. */
	showHomeButton: boolean;
	/** Internal: set once the left-sidebar launcher view has been auto-added, so
	 *  it is not re-added every load (and stays gone if the user removes it). */
	launcherInitialized: boolean;
	/** Internal: note paths currently shown in open Sidecars, persisted so a
	 *  reload can re-skin the matching restored popouts (and only those). */
	sidecarPaths: string[];
}

export const DEFAULT_SETTINGS: SidecarBrowserSettings = {
	defaultWidth: 375,
	windowHeight: 1000,
	smallerText: true,
	smallerPadding: true,
	showRibbonButton: true,
	showHomeRibbonButton: true,
	showToolbarButton: true,
	showPopInButton: true,
	showPinButton: true,
	showNavButtons: false,
	defaultNote: "",
	showHomeButton: false,
	launcherInitialized: false,
	sidecarPaths: [],
};

export class SidecarBrowserSettingTab extends PluginSettingTab {
	plugin: SidecarBrowserPlugin;

	constructor(app: App, plugin: SidecarBrowserPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Sidecar")
			.setHeading()
			.setDesc(
				"Opens notes in a tall, narrow popout window alongside your main Obsidian window."
			);

		new Setting(containerEl)
			.setName("Sidecar width")
			.setDesc("Width of new Sidecar windows in pixels. Valid range: 200–1200.")
			.addText((text) => {
				text
					.setValue(
						this.plugin.settings.defaultWidth !== DEFAULT_SETTINGS.defaultWidth
							? String(this.plugin.settings.defaultWidth)
							: ""
					)
					.setPlaceholder("Default: 375");
				text.inputEl.addEventListener("blur", async () => {
					const raw = text.getValue().trim();
					if (raw === "") {
						this.plugin.settings.defaultWidth = DEFAULT_SETTINGS.defaultWidth;
					} else {
						const n = parseInt(raw, 10);
						if (!isNaN(n)) {
							const clamped = Math.min(1200, Math.max(200, n));
							this.plugin.settings.defaultWidth = clamped;
							if (clamped !== n) text.setValue(String(clamped));
						} else {
							text.setValue(
								this.plugin.settings.defaultWidth !== DEFAULT_SETTINGS.defaultWidth
									? String(this.plugin.settings.defaultWidth)
									: ""
							);
						}
					}
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Sidecar height")
			.setDesc("Height of new Sidecar windows in pixels. Valid range: 300–3000.")
			.addText((text) => {
				text
					.setValue(
						this.plugin.settings.windowHeight !== DEFAULT_SETTINGS.windowHeight
							? String(this.plugin.settings.windowHeight)
							: ""
					)
					.setPlaceholder("Default: 1000");
				text.inputEl.addEventListener("blur", async () => {
					const raw = text.getValue().trim();
					if (raw === "") {
						this.plugin.settings.windowHeight = DEFAULT_SETTINGS.windowHeight;
					} else {
						const n = parseInt(raw, 10);
						if (!isNaN(n)) {
							const clamped = Math.min(3000, Math.max(300, n));
							this.plugin.settings.windowHeight = clamped;
							if (clamped !== n) text.setValue(String(clamped));
						} else {
							text.setValue(
								this.plugin.settings.windowHeight !== DEFAULT_SETTINGS.windowHeight
									? String(this.plugin.settings.windowHeight)
									: ""
							);
						}
					}
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Default note")
			.setDesc("Note opened by 'Open default note in Sidecar' and the home button. Path is relative to your vault root.")
			.addText((text) => {
				const suggest = new FileSuggest(this.app, text.inputEl);
				suggest.onSelect(async (file) => {
					suggest.setValue(file.path);
					suggest.close();
					this.plugin.settings.defaultNote = file.path;
					await this.plugin.saveSettings();
					this.plugin.refreshLauncherView();
				});
				text
					.setValue(this.plugin.settings.defaultNote)
					.setPlaceholder("e.g. Projects/Index.md");
				text.inputEl.addEventListener("blur", async () => {
					this.plugin.settings.defaultNote = text.getValue().trim();
					await this.plugin.saveSettings();
					this.plugin.refreshLauncherView();
				});
			});

		new Setting(containerEl)
			.setName("Make text smaller")
			.setDesc("Apply a smaller font size to note content in the Sidecar.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.smallerText)
					.onChange(async (value) => {
						this.plugin.settings.smallerText = value;
						await this.plugin.saveSettings();
						this.plugin.windowManager.refreshPopoutStyles();
					})
			);

		new Setting(containerEl)
			.setName("Make padding smaller")
			.setDesc("Apply tighter padding to note content in the Sidecar.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.smallerPadding)
					.onChange(async (value) => {
						this.plugin.settings.smallerPadding = value;
						await this.plugin.saveSettings();
						this.plugin.windowManager.refreshPopoutStyles();
					})
			);

		new Setting(containerEl)
			.setName("Show 'open current note' ribbon button")
			.setDesc("Show the ribbon button that opens the active note in a new Sidecar.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showRibbonButton)
					.onChange(async (value) => {
						this.plugin.settings.showRibbonButton = value;
						await this.plugin.saveSettings();
						this.plugin.updateRibbonStyle();
					})
			);

		new Setting(containerEl)
			.setName("Show 'open default note' ribbon button")
			.setDesc("Show the ribbon button that opens the default note in a new Sidecar.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showHomeRibbonButton)
					.onChange(async (value) => {
						this.plugin.settings.showHomeRibbonButton = value;
						await this.plugin.saveSettings();
						this.plugin.updateHomeRibbonStyle();
					})
			);

		new Setting(containerEl)
			.setName("Show toolbar button")
			.setDesc("Show the open-in-Sidecar button on note toolbars.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showToolbarButton)
					.onChange(async (value) => {
						this.plugin.settings.showToolbarButton = value;
						await this.plugin.saveSettings();
						this.plugin.updateToolbarStyle();
					})
			);

		new Setting(containerEl)
			.setName("Show pop-in button")
			.setDesc("Show the return-to-main-window button in the Sidecar bar.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showPopInButton)
					.onChange(async (value) => {
						this.plugin.settings.showPopInButton = value;
						await this.plugin.saveSettings();
						this.plugin.windowManager.updatePopInStyle();
					})
			);

		new Setting(containerEl)
			.setName("Show pin button")
			.setDesc("Show the always-on-top pin button in the Sidecar bar.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showPinButton)
					.onChange(async (value) => {
						this.plugin.settings.showPinButton = value;
						await this.plugin.saveSettings();
						this.plugin.windowManager.updatePinStyle();
					})
			);

		new Setting(containerEl)
			.setName("Show back and forward buttons")
			.setDesc("Show navigation buttons in the Sidecar bar to move through the note history.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showNavButtons)
					.onChange(async (value) => {
						this.plugin.settings.showNavButtons = value;
						await this.plugin.saveSettings();
						this.plugin.windowManager.updateNavStyle();
					})
			);

		new Setting(containerEl)
			.setName("Show home button")
			.setDesc("Show a button in the Sidecar bar that returns to the default note.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showHomeButton)
					.onChange(async (value) => {
						this.plugin.settings.showHomeButton = value;
						await this.plugin.saveSettings();
						this.plugin.windowManager.updateHomeStyle();
					})
			);
	}
}
