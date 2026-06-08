import { ItemView, TFile, TFolder, WorkspaceLeaf, setIcon } from "obsidian";
import type SidecarBrowserPlugin from "./main";

export const VIEW_TYPE_SIDECAR_BROWSER = "sidecar-browser-view";

/**
 * The folder-listing state of the single Sidecar leaf.
 *
 * We own this DOM entirely, so the minimal "filename + nav" chrome is rendered
 * here directly as a custom header rather than fought out of the native view
 * header. Clicking a file swaps this same leaf to a real MarkdownView via the
 * window manager (see {@link SidecarBrowserPlugin.openFileInSidecar}).
 */
export class ProjectBrowserView extends ItemView {
	private plugin: SidecarBrowserPlugin;

	constructor(leaf: WorkspaceLeaf, plugin: SidecarBrowserPlugin) {
		super(leaf);
		this.plugin = plugin;
		// We render our own header inside contentEl; flag the container so the
		// popout-scoped CSS can hide the native view header for this view only.
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
		this.render();
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
	}

	/** Rebuild the list — called on open and whenever the folder may have changed. */
	render(): void {
		const container = this.contentEl;
		container.empty();
		container.addClass("sidecar-browser-content");

		const folderPath = this.plugin.settings.projectsFolder;

		// --- Custom header: title only (this is the list root, nowhere to go "back" to). ---
		const header = container.createDiv({ cls: "sidecar-header" });
		const titleWrap = header.createDiv({ cls: "sidecar-header-title-wrap" });
		titleWrap.createSpan({ cls: "sidecar-header-title", text: "Projects" });
		titleWrap.createSpan({
			cls: "sidecar-header-subtitle",
			text: folderPath || "/",
		});

		const refreshBtn = header.createEl("button", {
			cls: "sidecar-header-btn",
			attr: { "aria-label": "Refresh list" },
		});
		setIcon(refreshBtn, "refresh-cw");
		refreshBtn.addEventListener("click", () => this.render());

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

		for (const file of files) {
			const item = listEl.createDiv({ cls: "sidecar-list-item" });
			const icon = item.createSpan({ cls: "sidecar-list-item-icon" });
			setIcon(icon, "file-text");
			item.createSpan({
				cls: "sidecar-list-item-name",
				text: file.basename,
			});
			item.addEventListener("click", () => {
				void this.plugin.windowManager.openFileInSidecar(
					this.leaf,
					file
				);
			});
		}
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
}
