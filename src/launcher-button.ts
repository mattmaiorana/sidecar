import { setIcon } from "obsidian";
import type SidecarBrowserPlugin from "./main";

/**
 * Injects a one-click "open the default note in a Sidecar" button into the left
 * sidebar's tab-header strip (next to Files/Search), for users who keep the
 * ribbon hidden. Triggers `openDefaultNote()`. Visibility is gated by the
 * `showLauncherButton` setting; the button's styling lives in styles.css.
 *
 * The button is mounted just before `.workspace-tab-header-spacer` — a stable
 * sibling of the tab list. We deliberately do NOT mount it inside
 * `.workspace-tab-header-container-inner`: Obsidian rebuilds that container's
 * children when switching sidebar tabs, which would wipe (and flicker) the
 * button.
 *
 * This reaches into Obsidian's chrome DOM, which has no public API — so mounting
 * is defensive (bails if the strip is missing) and idempotent, and `mount()` is
 * re-run on layout changes since Obsidian rebuilds that container. We target the
 * main-window `document` on purpose (the left sidebar lives there, not in a
 * popout), so `activeDocument` would be wrong here.
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
	 * Detach the button (called on unload or when disabled). The element
	 * reference is kept so a later re-enable reuses it — recreating it would
	 * register a second click handler (cleaned only on unload). On unload the
	 * whole instance is discarded, so the kept reference is fine.
	 */
	remove(): void {
		this.stripBtn?.remove();
	}
}
