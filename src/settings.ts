import { App, PluginSettingTab, Setting } from "obsidian";
import type SidecarBrowserPlugin from "./main";

export interface SidecarBrowserSettings {
	/** Last popout window height, restored on next open. Width always resets to
	 *  the default; position is computed fresh from the main window. */
	windowHeight: number;
	/** When true, the always-on-top pin button is hidden from the Sidecar top bar. */
	hidePinButton: boolean;
	/** When true, pop-out mode is disabled — notes stay open in the main window
	 *  when opened in Sidecar and the pop-in button is hidden. */
	hidePopOut: boolean;
}

export const DEFAULT_SETTINGS: SidecarBrowserSettings = {
	windowHeight: 1000,
	hidePinButton: false,
	hidePopOut: false,
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
			.setName("Hide pin button")
			.setDesc("Hide the always-on-top pin button from the Sidecar top bar.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.hidePinButton)
					.onChange(async (value) => {
						this.plugin.settings.hidePinButton = value;
						await this.plugin.saveSettings();
						this.plugin.windowManager.updatePinStyle();
					})
			);

		new Setting(containerEl)
			.setName("Hide pop-out icon")
			.setDesc(
				"Hide the open-in-Sidecar button from the ribbon and note toolbars. " +
				"The command palette and right-click menu still work."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.hidePopOut)
					.onChange(async (value) => {
						this.plugin.settings.hidePopOut = value;
						await this.plugin.saveSettings();
						this.plugin.updateOpenIconStyle();
						this.plugin.windowManager.updatePopOutStyle();
					})
			);
	}
}
