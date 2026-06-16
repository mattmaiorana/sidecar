import { setIcon } from "obsidian";
import type SidecarBrowserPlugin from "./main";

/** id of the <style> we inject into the main document for the strip button. */
const STYLE_ID = "sidecar-launcher-strip-style";

/**
 * Injects a one-click "open the default note in a Sidecar" button into the left
 * sidebar's tab-header strip (next to Files/Search), for users who keep the
 * ribbon hidden. Triggers `openDefaultNote()`.
 *
 * The button is mounted *inside* `.workspace-tab-header-container-inner` (after
 * the tabs) so it shares the tabs' exact vertical box — otherwise its hover
 * highlight ends up a different height/position than the tabs beside it.
 *
 * This reaches into Obsidian's chrome DOM, which has no public API — so mounting
 * is defensive (bails if the strip is missing) and idempotent, and `mount()` is
 * re-run on layout changes since Obsidian rebuilds that container.
 */
export class SidecarLauncherButtons {
	private plugin: SidecarBrowserPlugin;
	private stripBtn: HTMLElement | null = null;

	constructor(plugin: SidecarBrowserPlugin) {
		this.plugin = plugin;
	}

	/** Mount the button if its target exists. Safe to call repeatedly. */
	mount(): void {
		const inner = document.querySelector(
			".workspace-split.mod-left-split .workspace-tab-header-container-inner"
		);
		if (!inner) return;
		this.injectStyle();
		if (!this.stripBtn) {
			this.stripBtn = createDiv({
				cls: "clickable-icon sidecar-launcher-strip-btn",
				attr: { "aria-label": "Open default note in Sidecar" },
			});
			setIcon(this.stripBtn, "square-arrow-out-up-right");
			this.plugin.registerDomEvent(this.stripBtn, "click", () => {
				void this.plugin.openDefaultNote();
			});
		}
		if (this.stripBtn.parentElement === inner) return; // already placed
		inner.appendChild(this.stripBtn);
	}

	/** Detach the button and its styles (called on unload). */
	remove(): void {
		this.stripBtn?.remove();
		this.stripBtn = null;
		document.getElementById(STYLE_ID)?.remove();
	}

	/**
	 * Style the button as a tab-strip icon: a faint icon at the header icon size
	 * that brightens on hover, with a full-height pill highlight (var(--tab-radius))
	 * matching the tab hover beside it.
	 */
	private injectStyle(): void {
		if (document.getElementById(STYLE_ID)) return;
		const el = document.createElement("style");
		el.id = STYLE_ID;
		el.textContent = `
.sidecar-launcher-strip-btn.clickable-icon {
	height: 100%;
	padding: 0 var(--size-2-3);
	border-radius: var(--tab-radius);
	color: var(--icon-color);
	opacity: var(--icon-opacity);
}
.sidecar-launcher-strip-btn.clickable-icon:hover {
	color: var(--icon-color-hover);
	opacity: var(--icon-opacity-hover);
	background-color: var(--background-modifier-hover);
}
.sidecar-launcher-strip-btn.clickable-icon .svg-icon {
	width: var(--icon-s);
	height: var(--icon-s);
}
`;
		document.head.appendChild(el);
	}
}
