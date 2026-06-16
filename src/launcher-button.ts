import { setIcon } from "obsidian";
import type SidecarBrowserPlugin from "./main";

/** id of the <style> we inject into the main document for the strip button. */
const STYLE_ID = "sidecar-launcher-strip-style";

/**
 * Injects one-click "open the default note in a Sidecar" button(s) into the left
 * sidebar's tab-header strip, for users who keep the ribbon hidden. Triggers
 * `openDefaultNote()`.
 *
 * Two placements are currently mounted for comparison:
 *   A) just before `.workspace-tab-header-spacer` — in-line with the tabs (left);
 *   B) just before `.workspace-tab-header-tab-list` — by the overflow/collapse
 *      buttons (right).
 * Both are stable siblings of `.workspace-tab-header-container-inner`; we
 * deliberately do NOT mount inside `-inner` (Obsidian rebuilds it on tab switch,
 * which wipes/flickers the button).
 *
 * This reaches into Obsidian's chrome DOM, which has no public API — so mounting
 * is defensive (bails if a target is missing) and idempotent, and `mount()` is
 * re-run on layout changes since Obsidian rebuilds that container.
 */
export class SidecarLauncherButtons {
	private plugin: SidecarBrowserPlugin;
	private stripBtn: HTMLElement | null = null; // A: before the spacer
	private tabListBtn: HTMLElement | null = null; // B: before the tab-list (test)

	constructor(plugin: SidecarBrowserPlugin) {
		this.plugin = plugin;
	}

	/** Mount the buttons where their targets exist. Safe to call repeatedly. */
	mount(): void {
		const container = document.querySelector(
			".workspace-split.mod-left-split .workspace-tab-header-container"
		);
		if (!container) return;
		this.injectStyle();

		// A) in-line with the tabs, just before the flex spacer.
		const spacer = container.querySelector(
			":scope > .workspace-tab-header-spacer"
		);
		if (spacer) {
			if (!this.stripBtn) this.stripBtn = this.makeButton();
			if (this.stripBtn.nextElementSibling !== spacer) spacer.before(this.stripBtn);
		}

		// B) over by the overflow/collapse buttons, just before the tab-list (test).
		const tabList = container.querySelector(
			":scope > .workspace-tab-header-tab-list"
		);
		if (tabList) {
			if (!this.tabListBtn) this.tabListBtn = this.makeButton();
			if (this.tabListBtn.nextElementSibling !== tabList) tabList.before(this.tabListBtn);
		}
	}

	/** Detach the buttons and their styles (called on unload). */
	remove(): void {
		this.stripBtn?.remove();
		this.tabListBtn?.remove();
		this.stripBtn = null;
		this.tabListBtn = null;
		document.getElementById(STYLE_ID)?.remove();
	}

	private makeButton(): HTMLElement {
		const btn = createDiv({
			cls: "clickable-icon sidecar-launcher-strip-btn",
			attr: { "aria-label": "Open default note in Sidecar" },
		});
		setIcon(btn, "file-text");
		this.plugin.registerDomEvent(btn, "click", () => {
			void this.plugin.openDefaultNote();
		});
		return btn;
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
