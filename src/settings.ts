import { App, PluginSettingTab, Setting } from "obsidian";
import type SidecarBrowserPlugin from "./main";

export interface SidecarBrowserSettings {
	/** Default width for new Sidecar windows. Always resets to this on open. */
	defaultWidth: number;
	/** Last popout window height, restored on next open. */
	windowHeight: number;
	/** When true, the ribbon icon is hidden. */
	hideRibbonButton: boolean;
	/** When true, the per-note toolbar button is hidden. */
	hideToolbarButton: boolean;
	/** When true, the pop-in button in the Sidecar bar is hidden. */
	hidePopInButton: boolean;
	/** When true, the always-on-top pin button is hidden from the Sidecar bar. */
	hidePinButton: boolean;
}

export const DEFAULT_SETTINGS: SidecarBrowserSettings = {
	defaultWidth: 375,
	windowHeight: 1000,
	hideRibbonButton: false,
	hideToolbarButton: false,
	hidePopInButton: false,
	hidePinButton: false,
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
			.setName("Sidecar Window")
			.setHeading()
			.setDesc(
				"Opens notes in a tall, narrow popout window alongside your main Obsidian window."
			);

		new Setting(containerEl)
			.setName("Sidecar width")
			.setDesc("Width of new Sidecar windows in pixels.")
			.addText((text) =>
				text
					.setValue(
						this.plugin.settings.defaultWidth !== DEFAULT_SETTINGS.defaultWidth
							? String(this.plugin.settings.defaultWidth)
							: ""
					)
					.setPlaceholder("Default: 375")
					.onChange(async (value) => {
						if (value === "") {
							this.plugin.settings.defaultWidth = DEFAULT_SETTINGS.defaultWidth;
						} else {
							const n = parseInt(value, 10);
							if (!isNaN(n) && n >= 100 && n <= 2000) {
								this.plugin.settings.defaultWidth = n;
							}
						}
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Sidecar height")
			.setDesc("Height of new Sidecar windows in pixels. Updated automatically when you resize a Sidecar.")
			.addText((text) =>
				text
					.setValue(
						this.plugin.settings.windowHeight !== DEFAULT_SETTINGS.windowHeight
							? String(this.plugin.settings.windowHeight)
							: ""
					)
					.setPlaceholder("Default: 1000")
					.onChange(async (value) => {
						if (value === "") {
							this.plugin.settings.windowHeight = DEFAULT_SETTINGS.windowHeight;
						} else {
							const n = parseInt(value, 10);
							if (!isNaN(n) && n >= 100 && n <= 4000) {
								this.plugin.settings.windowHeight = n;
							}
						}
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Hide ribbon button")
			.setDesc("Hide the open-in-Sidecar button from the ribbon.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.hideRibbonButton)
					.onChange(async (value) => {
						this.plugin.settings.hideRibbonButton = value;
						await this.plugin.saveSettings();
						this.plugin.updateRibbonStyle();
					})
			);

		new Setting(containerEl)
			.setName("Hide toolbar button")
			.setDesc("Hide the open-in-Sidecar button from note toolbars. The command palette and right-click menu still work.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.hideToolbarButton)
					.onChange(async (value) => {
						this.plugin.settings.hideToolbarButton = value;
						await this.plugin.saveSettings();
						this.plugin.updateToolbarStyle();
					})
			);

		new Setting(containerEl)
			.setName("Hide pop-in button")
			.setDesc("Hide the return-to-main-window button from the Sidecar bar.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.hidePopInButton)
					.onChange(async (value) => {
						this.plugin.settings.hidePopInButton = value;
						await this.plugin.saveSettings();
						this.plugin.windowManager.updatePopInStyle();
					})
			);

		new Setting(containerEl)
			.setName("Hide pin button")
			.setDesc("Hide the always-on-top pin button from the Sidecar bar.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.hidePinButton)
					.onChange(async (value) => {
						this.plugin.settings.hidePinButton = value;
						await this.plugin.saveSettings();
						this.plugin.windowManager.updatePinStyle();
					})
			);
	}
}
