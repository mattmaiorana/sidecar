import {
	ItemView,
	TAbstractFile,
	TFile,
	TFolder,
	WorkspaceLeaf,
	setIcon,
} from "obsidian";
import type SidecarBrowserPlugin from "./main";

export const VIEW_TYPE_SIDECAR_BROWSER = "sidecar-browser-view";

/**
 * The folder-listing state of the single Sidecar leaf.
 *
 * We own this DOM entirely and render our own chrome with `sidecar-*` class
 * names — Obsidian's native view header is hidden in the popout, so neither it
 * nor other plugins' header styling applies here. Clicking a file swaps this
 * same leaf to a real MarkdownView via the window manager.
 */
export class ProjectBrowserView extends ItemView {
	private plugin: SidecarBrowserPlugin;

	constructor(leaf: WorkspaceLeaf, plugin: SidecarBrowserPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.containerEl.addClass("sidecar-browser-view");
	}

	getViewType(): string {
		return VIEW_TYPE_SIDECAR_BROWSER;
	}

	getDisplayText(): string {
		return "Sidecar";
	}

	getIcon(): string {
		return "panel-right";
	}

	async onOpen(): Promise<void> {
		// Keep the list live without a manual refresh: re-render when files in
		// the configured folder are added, removed, or renamed. (registerEvent
		// auto-unsubscribes when the view closes.)
		const onChange = (file: TAbstractFile) => {
			if (this.isInProjectsFolder(file)) this.render();
		};
		this.registerEvent(this.app.vault.on("create", onChange));
		this.registerEvent(this.app.vault.on("delete", onChange));
		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				if (this.isInProjectsFolder(file) || this.wasInProjectsFolder(oldPath)) {
					this.render();
				}
			})
		);

		this.render();
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
	}

	/** Rebuild the list. */
	render(): void {
		// Self-mark the popout so the scoped chrome CSS applies even when this
		// view was restored/revealed by Obsidian (bypassing the window manager's
		// open/showBrowser path).
		this.plugin.windowManager.markLeafPopout(this.leaf);

		const container = this.contentEl;
		container.empty();
		container.addClass("sidecar-browser-content");

		const folderPath = this.plugin.settings.projectsFolder;

		// --- Our custom top bar (root view: title only, no "back"). ---
		const bar = container.createDiv({ cls: "sidecar-bar sidecar-list-bar" });
		bar.createSpan({
			cls: "sidecar-bar-title",
			text: this.folderLabel(folderPath),
			attr: { title: folderPath || "/" },
		});

		// --- File list. ---
		const listEl = container.createDiv({ cls: "sidecar-list" });
		const files = this.getProjectFiles(folderPath);

		if (files === null) {
			listEl.createDiv({
				cls: "sidecar-empty",
				text: `Folder "${folderPath}" was not found in this vault. Set a valid Projects folder in Sidecar Browser settings.`,
			});
			return;
		}

		if (files.length === 0) {
			listEl.createDiv({
				cls: "sidecar-empty",
				text: `No markdown notes in "${folderPath || "/"}".`,
			});
			return;
		}

		const activePath = this.app.workspace.getActiveFile()?.path;
		for (const file of files) {
			const item = listEl.createDiv({ cls: "sidecar-list-item" });
			if (file.path === activePath) item.addClass("is-active");
			const icon = item.createSpan({ cls: "sidecar-list-item-icon" });
			setIcon(icon, "file-text");
			item.createSpan({ cls: "sidecar-list-item-name", text: file.basename });
			item.addEventListener("click", () => {
				void this.plugin.windowManager.openFileInSidecar(this.leaf, file);
			});
		}
	}

	/** A short label for the configured folder (its last segment, or the vault
	 *  name for the root). */
	private folderLabel(folderPath: string): string {
		if (folderPath === "") return this.app.vault.getName();
		const segs = folderPath.split("/");
		return segs[segs.length - 1] || folderPath;
	}

	/**
	 * Direct-child markdown files of the configured folder, sorted by name.
	 * Returns `null` if the folder does not exist. An empty path means the
	 * vault root. Nested subfolders are intentionally not descended into in v1.
	 */
	private getProjectFiles(folderPath: string): TFile[] | null {
		const root: TFolder | null =
			folderPath === ""
				? this.app.vault.getRoot()
				: this.folderAt(folderPath);

		if (!root) return null;

		const files = root.children.filter(
			(child): child is TFile =>
				child instanceof TFile && child.extension === "md"
		);
		files.sort((a, b) =>
			a.basename.localeCompare(b.basename, undefined, {
				numeric: true,
				sensitivity: "base",
			})
		);
		return files;
	}

	private folderAt(path: string): TFolder | null {
		const af = this.app.vault.getAbstractFileByPath(path);
		return af instanceof TFolder ? af : null;
	}

	/** True if `file` is a direct child of the configured projects folder. */
	private isInProjectsFolder(file: TAbstractFile): boolean {
		const parentPath = file.parent
			? file.parent.path === "/"
				? ""
				: file.parent.path
			: "";
		return parentPath === this.plugin.settings.projectsFolder;
	}

	/** Same test, for a pre-rename path string. */
	private wasInProjectsFolder(oldPath: string): boolean {
		const idx = oldPath.lastIndexOf("/");
		const parentPath = idx === -1 ? "" : oldPath.slice(0, idx);
		return parentPath === this.plugin.settings.projectsFolder;
	}
}
