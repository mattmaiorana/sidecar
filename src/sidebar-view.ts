import { ItemView, WorkspaceLeaf, setIcon } from "obsidian";
import type SidecarBrowserPlugin from "./main";

export const SIDECAR_LAUNCHER_VIEW_TYPE = "sidecar-launcher";

/**
 * A small left-sidebar panel whose only job (for now) is a one-click button
 * that opens the configured default note in a Sidecar — a non-ribbon launcher
 * for users who keep the ribbon hidden. Its icon lives in the sidebar tab strip
 * next to Files/Search; clicking the icon reveals this panel, and the button
 * inside opens the default note (the same path as `openDefaultNote()`).
 *
 * Styling stays inline / on Obsidian's own classes so the plugin keeps its
 * no-`styles.css` invariant (the popout CSS is injected separately and is
 * popout-scoped — it does not reach the main window where this view lives).
 */
export class SidecarLauncherView extends ItemView {
	private plugin: SidecarBrowserPlugin;

	constructor(leaf: WorkspaceLeaf, plugin: SidecarBrowserPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return SIDECAR_LAUNCHER_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Sidecar";
	}

	getIcon(): string {
		return "square-arrow-up-right";
	}

	async onOpen(): Promise<void> {
		this.render();
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
	}

	/** (Re)build the panel. Call when the default-note setting may have changed. */
	render(): void {
		const root = this.contentEl;
		root.empty();
		root.addClass("sidecar-launcher");

		const wrap = root.createDiv({ cls: "sidecar-launcher-wrap" });
		wrap.style.padding = "var(--size-4-3)";

		const button = wrap.createEl("button", {
			cls: "sidecar-launcher-btn mod-cta",
		});
		button.style.width = "100%";
		button.style.display = "flex";
		button.style.alignItems = "center";
		button.style.justifyContent = "center";
		button.style.gap = "var(--size-2-2)";
		const icon = button.createSpan({ cls: "sidecar-launcher-btn-icon" });
		setIcon(icon, "square-arrow-up-right");
		button.createSpan({ text: "Open default note" });
		button.addEventListener("click", () => {
			void this.plugin.openDefaultNote();
		});

		// Muted caption showing what the button will open.
		const caption = wrap.createDiv({ cls: "setting-item-description" });
		caption.style.marginTop = "var(--size-2-3)";
		const path = this.plugin.settings.defaultNote.trim();
		caption.setText(
			path
				? `Opens: ${path}`
				: "No default note set — opens the active note. Set one in Sidecar settings."
		);
	}
}
