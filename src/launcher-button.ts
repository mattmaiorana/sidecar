import { setIcon } from "obsidian";
import type SidecarBrowserPlugin from "./main";

/**
 * Injects one-click "open the default note in a Sidecar" buttons into spots that
 * stay reachable when the ribbon is hidden. Two placements are mounted at once
 * (for the user to compare): the left-sidebar tab-header strip and the bottom of
 * the left ribbon next to the settings gear. Both use the `file-text` icon (the
 * same as the default-note ribbon button) and trigger `openDefaultNote()`.
 *
 * These reach into Obsidian's chrome DOM, which has no public API — so mounting
 * is defensive (bails if a target is missing) and idempotent, and `mount()` is
 * re-run on layout changes since Obsidian rebuilds these containers.
 */
export class SidecarLauncherButtons {
	private plugin: SidecarBrowserPlugin;
	private stripBtn: HTMLElement | null = null;
	private gearBtn: HTMLElement | null = null;

	constructor(plugin: SidecarBrowserPlugin) {
		this.plugin = plugin;
	}

	/** Mount both buttons where their targets exist. Safe to call repeatedly. */
	mount(): void {
		this.mountStripButton();
		this.mountGearButton();
	}

	/** Detach both buttons (called on unload). */
	remove(): void {
		this.stripBtn?.remove();
		this.gearBtn?.remove();
		this.stripBtn = null;
		this.gearBtn = null;
	}

	private makeButton(extraClass: string): HTMLElement {
		const btn = createDiv({
			cls: `clickable-icon ${extraClass}`,
			attr: { "aria-label": "Open default note in Sidecar" },
		});
		setIcon(btn, "file-text");
		this.plugin.registerDomEvent(btn, "click", () => {
			void this.plugin.openDefaultNote();
		});
		return btn;
	}

	/** Placement A: the left sidebar's tab-header strip (next to Files/Search). */
	private mountStripButton(): void {
		const target = document.querySelector(
			".workspace-split.mod-left-split .workspace-tab-header-container"
		);
		if (!target) return;
		if (!this.stripBtn) this.stripBtn = this.makeButton("sidecar-launcher-strip-btn");
		if (this.stripBtn.parentElement === target) return;
		target.appendChild(this.stripBtn);
	}

	/** Placement B: the bottom of the left ribbon, by the settings gear. */
	private mountGearButton(): void {
		const ribbon = document.querySelector(".workspace-ribbon.mod-left");
		if (!ribbon) return;
		// Prefer the settings (gear) group so it survives hiding the ribbon's
		// action icons; fall back to the ribbon root (renders at the bottom).
		const target = ribbon.querySelector(".side-dock-settings") ?? ribbon;
		if (!this.gearBtn) {
			this.gearBtn = this.makeButton(
				"side-dock-ribbon-action sidecar-launcher-gear-btn"
			);
		}
		if (this.gearBtn.parentElement === target) return;
		target.appendChild(this.gearBtn);
	}
}
