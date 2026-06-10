import { App, PluginSettingTab, Setting } from "obsidian";
import type SidecarBrowserPlugin from "./main";

export interface SidecarBrowserSettings {
	/** Last popout window height, restored on next open. Width always resets to
	 *  the default; position is computed fresh from the main window. */
	windowHeight: number;
	/** Whether to show the always-on-top pin button in the Sidecar top bar. */
	showPinButton: boolean;
	/** When true, opening a note in Sidecar closes the main-window copy, and a
	 *  pop-in button appears in the Sidecar bar to reverse the action. */
	popOutMode: boolean;
}

export const DEFAULT_SETTINGS: SidecarBrowserSettings = {
	windowHeight: 1000,
	showPinButton: true,
	popOutMode: false,
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
			.setName("Show pin button")
			.setDesc("Show the always-on-top pin button in the Sidecar top bar.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showPinButton)
					.onChange(async (value) => {
						this.plugin.settings.showPinButton = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Pop-out mode")
			.setDesc(
				"When opening a note in Sidecar, close the main-window copy. " +
				"A pop-in button appears in the Sidecar bar to return the note to the main window."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.popOutMode)
					.onChange(async (value) => {
						this.plugin.settings.popOutMode = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
