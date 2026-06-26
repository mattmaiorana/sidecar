import { setIcon } from "obsidian";
import type SidecarBrowserPlugin from "./main";

/** id of the <style> we inject into the main document for the strip button. */
const STYLE_ID = "sidecar-launcher-strip-style";

/**
 * Injects a one-click "open the default note in a Sidecar" button into the left
 * sidebar's tab-header strip (next to Files/Search), for users who keep the
 * ribbon hidden. Triggers `openDefaultNote()`. Visibility is gated by the
 * `showLauncherButton` setting.
 *
 * The button is mounted just before `.workspace-tab-header-spacer` — a stable
 * sibling of the tab list. We deliberately do NOT mount it inside
 * `.workspace-tab-header-container-inner`: Obsidian rebuilds that container's
 * children when switching sidebar tabs, which would wipe (and flicker) the
 * button.
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

	/** Mount (or, when disabled, remove) the button. Safe to call repeatedly. */
	mount(): void {
		if (!this.plugin.settings.showLauncherButton) {
			this.remove();
			return;
		}
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

	/**
	 * Detach the button and its styles (called on unload or when disabled). The
	 * element reference is kept so a later re-enable reuses it — recreating it
	 * would register a second click handler (cleaned only on unload). On unload
	 * the whole instance is discarded, so the kept reference is fine.
	 */
	remove(): void {
		this.stripBtn?.remove();
		document.getElementById(STYLE_ID)?.remove();
	}

	/**
	 * Match the sidebar tabs so the button reads as a natural 4th item: a 25px-tall
	 * tab-radius pill, 8px sides and an 18px icon (→ 34×25, the measured tab-inner
	 * box), a 2px left margin for the inter-tab gap, centered so it doesn't stretch
	 * to the full strip height, faint by default and brightening on hover.
	 */
	private injectStyle(): void {
		if (document.getElementById(STYLE_ID)) return;
		const el = document.createElement("style");
		el.id = STYLE_ID;
		el.textContent = `
.sidecar-launcher-strip-btn.clickable-icon {
	align-self: center;
	height: 25px;
	margin-left: var(--size-2-1);
	padding: 0 8px;
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
	width: 18px;
	height: 18px;
}
`;
		document.head.appendChild(el);
	}
}
