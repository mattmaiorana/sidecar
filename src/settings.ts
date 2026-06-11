import { App, PluginSettingTab, Setting } from "obsidian";
import type SidecarBrowserPlugin from "./main";

export interface SidecarBrowserSettings {
	/** Last popout window height, restored on next open. Width always resets to
	 *  the default; position is computed fresh from the main window. */
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
