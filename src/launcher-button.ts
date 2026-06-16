import { setIcon } from "obsidian";
import type SidecarBrowserPlugin from "./main";

/** id of the <style> we inject into the main document for the strip button. */
const STYLE_ID = "sidecar-launcher-strip-style";

/**
 * Injects a one-click "open the default note in a Sidecar" button into the left
 * sidebar's tab-header strip (next to Files/Search), for users who keep the
 * ribbon hidden. Uses the `file-text` icon (the same as the default-note ribbon
 * button) and triggers `openDefaultNote()`.
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
		const container = document.querySelector(
			".workspace-split.mod-left-split .workspace-tab-header-container"
		);
		if (!container) return;
		this.injectStyle();
		if (!this.stripBtn) {
			this.stripBtn = createDiv({
				cls: "clickable-icon sidecar-launcher-strip-btn",
				attr: { "aria-label": "Open default note in Sidecar" },
			});
			setIcon(this.stripBtn, "file-text");
			this.plugin.registerDomEvent(this.stripBtn, "click", () => {
				void this.plugin.openDefaultNote();
			});
		}

		// Sit just before the flex spacer, so the button lands in-line with the
		// tab icons on the left rather than out by the collapse toggle on the
		// right (where a plain append puts it).
		const spacer = container.querySelector(
			":scope > .workspace-tab-header-spacer"
		);
		if (spacer) {
			if (this.stripBtn.nextElementSibling === spacer) return; // already placed
			spacer.before(this.stripBtn);
		} else {
			if (this.stripBtn.parentElement === container) return;
			container.appendChild(this.stripBtn);
		}
	}

	/** Detach the button and its styles (called on unload). */
	remove(): void {
		this.stripBtn?.remove();
		this.stripBtn = null;
		document.getElementById(STYLE_ID)?.remove();
	}

	/**
	 * Match the resting/hover look of the tab strip's own icon buttons (new tab,
	 * tab list, collapse) instead of the generic clickable-icon: a fainter icon
	 * at the header icon size that brightens (with a hover background) on hover.
	 */
	private injectStyle(): void {
		if (document.getElementById(STYLE_ID)) return;
		const el = document.createElement("style");
		el.id = STYLE_ID;
		el.textContent = `
.sidecar-launcher-strip-btn.clickable-icon {
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
