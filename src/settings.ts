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
	/** When true, a button that opens the default note is injected into the left
	 *  sidebar's tab bar (handy if the ribbon is hidden). */
	showLauncherButton: boolean;
	/** When true, every popout window restored after an Obsidian reload is
	 *  re-skinned as a Sidecar. Safe to leave on if you only use popouts for
	 *  Sidecars; turn off if you use native popout windows you want left alone. */
	reskinPopoutsOnReload: boolean;
	/** When true, orphaned Sidecar popouts left over from before an Obsidian
	 *  reload (dead duplicates) are closed at startup. Needs the Electron remote
	 *  module; only ever closes windows this plugin skinned in a prior session. */
	closeZombiePopoutsOnReload: boolean;
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
	showNavButtons: true,
	defaultNote: "",
	showHomeButton: true,
	showLauncherButton: true,
	reskinPopoutsOnReload: false,
	closeZombiePopoutsOnReload: false,
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
				text.inputEl.addEventListener("blur", () => {
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
					void this.plugin.saveSettings();
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
				text.inputEl.addEventListener("blur", () => {
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
					void this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Default note")
			.setDesc("Note opened by the 'Open default note' command and the home button. Path is relative to your vault root.")
			.addText((text) => {
				const suggest = new FileSuggest(this.app, text.inputEl);
				suggest.onSelect((file) => {
					suggest.setValue(file.path);
					suggest.close();
					this.plugin.settings.defaultNote = file.path;
					void this.plugin.saveSettings();
				});
				text
					.setValue(this.plugin.settings.defaultNote)
					.setPlaceholder("e.g. Projects/Index.md");
				text.inputEl.addEventListener("blur", () => {
					this.plugin.settings.defaultNote = text.getValue().trim();
					void this.plugin.saveSettings();
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
			.setName("Re-style popouts on reload")
			.setDesc(
				"Re-apply Sidecar styling to popout windows after an Obsidian reload. Affects every restored popout — turn off if you use native popout windows you want left alone."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.reskinPopoutsOnReload)
					.onChange(async (value) => {
						this.plugin.settings.reskinPopoutsOnReload = value;
						await this.plugin.saveSettings();
					})
			);

		// Only offered when the Electron remote module is reachable — without it
		// the sweep can't enumerate or close windows, so the toggle would lie.
		if (this.plugin.windowManager.remoteAvailable()) {
			new Setting(containerEl)
				.setName("Close leftover popouts on reload")
				.setDesc(
					"After an Obsidian reload, close orphaned Sidecar popout windows left over from before the reload — the dead duplicates whose links and live preview no longer work."
				)
				.addToggle((toggle) =>
					toggle
						.setValue(this.plugin.settings.closeZombiePopoutsOnReload)
						.onChange(async (value) => {
							this.plugin.settings.closeZombiePopoutsOnReload = value;
							await this.plugin.saveSettings();
						})
				);
		}

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
			.setName("Show sidebar launcher button")
			.setDesc("Show a button in the left sidebar's tab bar that opens the default note in a Sidecar (handy if you hide the ribbon).")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showLauncherButton)
					.onChange(async (value) => {
						this.plugin.settings.showLauncherButton = value;
						await this.plugin.saveSettings();
						this.plugin.launcherButtons.mount();
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
						this.plugin.windowManager.updateBarButtonStyles();
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
						this.plugin.windowManager.updateBarButtonStyles();
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
						this.plugin.windowManager.updateBarButtonStyles();
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
						this.plugin.windowManager.updateBarButtonStyles();
					})
			);
	}
}
