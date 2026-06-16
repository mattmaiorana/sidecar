import { setIcon } from "obsidian";
import type SidecarBrowserPlugin from "./main";

/** id of the <style> we inject into the main document for the strip button. */
const STYLE_ID = "sidecar-launcher-strip-style";

/**
 * Injects a one-click "open the default note in a Sidecar" button into the left
 * sidebar's tab-header strip (next to Files/Search), for users who keep the
 * ribbon hidden. Triggers `openDefaultNote()`.
 *
 * The button is mounted just before `.workspace-tab-header-spacer` — a stable
 * sibling of the tab list. We deliberately do NOT mount it inside
 * `.workspace-tab-header-container-inner`: Obsidian rebuilds that container's
 * children when switching sidebar tabs, which would wipe (and flicker) the
 * button. The trade-off is that the hover pill is matched to the tabs via CSS
 * rather than by inheriting their exact box.
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

		// Sit just before the flex spacer (a stable sibling of the tab list),
		// so the button lands in-line with the tab icons on the left.
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
	 * Style the button as a tab-strip icon: a faint icon at the header icon size
	 * that brightens on hover, with a tab-radius pill highlight roughly matching
	 * the tabs' (icon size + small vertical padding ≈ the tab pill height; 8px
	 * sides to match `.workspace-tab-header-inner`). align-self keeps it from
	 * stretching to the full strip height.
	 */
	private injectStyle(): void {
		if (document.getElementById(STYLE_ID)) return;
		const el = document.createElement("style");
		el.id = STYLE_ID;
		el.textContent = `
.sidecar-launcher-strip-btn.clickable-icon {
	align-self: center;
	padding: var(--size-2-2) 8px;
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
