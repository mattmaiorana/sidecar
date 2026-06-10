import { App, PluginSettingTab, Setting } from "obsidian";
import type SidecarBrowserPlugin from "./main";

export interface SidecarBrowserSettings {
	/** Last popout window height, restored on next open. Width always resets to
	 *  the default; position is computed fresh from the main window. */
	windowHeight: number;
}

/** A tall column by default — the whole point of the plugin. */
export const DEFAULT_SETTINGS: SidecarBrowserSettings = {
	windowHeight: 1000,
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
	}
}
