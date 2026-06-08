import { App, PluginSettingTab, Setting } from "obsidian";
import type SidecarBrowserPlugin from "./main";

/**
 * Saved bounds for the popout window, in screen coordinates.
 * `x`/`y` are the top-left position; `width`/`height` are the outer size.
 * `null` means "not yet captured" — fall back to the default size.
 */
export interface WindowBounds {
	x: number | null;
	y: number | null;
	width: number;
	height: number;
}

export interface SidecarBrowserSettings {
	/** Vault-relative path to the folder whose markdown files are listed. */
	projectsFolder: string;
	/** Last known popout window bounds, restored on next open. */
	windowBounds: WindowBounds;
}

/** A tall, narrow column by default — the whole point of the plugin. */
export const DEFAULT_SETTINGS: SidecarBrowserSettings = {
	projectsFolder: "Projects",
	windowBounds: {
		x: null,
		y: null,
		width: 420,
		height: 1000,
	},
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
			.setName("Projects folder")
			.setDesc(
				"Vault-relative path to the folder whose markdown files the Sidecar Browser lists. Example: Projects, or Areas/Work."
			)
			.addText((text) =>
				text
					.setPlaceholder("Projects")
					.setValue(this.plugin.settings.projectsFolder)
					.onChange(async (value) => {
						// Normalize: trim and strip leading/trailing slashes.
						this.plugin.settings.projectsFolder = value
							.trim()
							.replace(/^\/+|\/+$/g, "");
						await this.plugin.saveSettings();
					})
			);
	}
}
