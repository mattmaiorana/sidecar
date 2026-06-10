# CLAUDE.md — Sidecar Browser

Context for future Claude Code sessions. Read this before changing anything so
you don't re-derive decisions that are already locked.

## What this is

An Obsidian plugin (`isDesktopOnly: true`) that opens a tall, narrow **popout
window** acting as a portable mini-Obsidian for project notes, while the main
window stays untouched. Same Obsidian instance, second window — no separate app,
no syncing.

## Locked architecture decisions — do not re-derive

1. **Multiple independent popout windows.** Each call to `windowManager.open(file)`
   creates a new popout leaf (`workspace.openPopoutLeaf(...)`) showing that note.
   Multiple Sidecars can be open simultaneously — `SidecarWindowManager` tracks
   all of them in a `Set<WorkspaceLeaf>`. The `ProjectBrowserView` (folder listing)
   is parked for v1 but its code is kept; the leaf no longer swaps between states.

2. **Never hand-roll an editor.** Editing uses the real `MarkdownView`
   (`leaf.openFile(file)`), so the user keeps live preview, their theme, and
   their other plugins. Do **not** embed a textarea or a standalone CodeMirror.

3. **Entry points (v1):**
   - Command "Open current note in Sidecar" / ribbon button → opens the active file.
   - Right-click `.md` file in file tree → "Open in Sidecar".
   - `panel-right` action button injected into every main-window `MarkdownView`
     toolbar (via `active-leaf-change`, guarded to skip popout leaves).
   All three call `windowManager.open(file)`, which always creates a fresh window.

4. **Fully custom chrome, popout-scoped.** The window reads as "← All + title,
   nothing else". Obsidian's native tab strip **and** per-view header are hidden
   in the popout; we render our own `.sidecar-bar` instead, using `sidecar-*`
   class names that other plugins (e.g. Simplified Layout) don't target — so the
   Sidecar looks consistent regardless of global UI tweaks:
   - In `ProjectBrowserView` we own the DOM and render the bar in `contentEl`
     (root view: folder title only, no back control).
   - In the `MarkdownView` state we inject the bar (`← All` + the note title) as
     the first child of `view.containerEl` (`window-manager.decorateNoteHeader`,
     kept in sync via the workspace `file-open` event). Returning to the list is
     our own `All` button → `showBrowser`; we do **not** use `view.addAction` or
     keep Obsidian's native back/forward.
   - **All popout CSS is scoped to `body.sidecar-popout`.** We add that class
     ourselves to the popout window's `<body>` (via the typed
     `WorkspaceWindow.doc`), rather than relying on Obsidian's internal popout
     class name. This *guarantees* the main window is never affected, and our
     styles never leak out.
   - **Drag region caveat (macOS):** Obsidian's popout is a frameless window
     where the native tab strip (`.workspace-tab-header-container`) is the drag
     region and reserves space for the traffic-light buttons. Because we hide
     that strip, `styles.css` re-establishes dragging by setting
     `-webkit-app-region: drag` on our headers plus a left inset for the traffic
     lights (with interactive controls marked `no-drag`). This block is the most
     environment-dependent part of the plugin — tune it if window dragging or
     the traffic lights misbehave in a given OS/Obsidian build.

5. **Bounds persistence + sticky width.** Default to a tall, narrow column
   (`DEFAULT_SETTINGS.windowBounds` = 375×1000). **Width always resets to the
   default on open**; height and position restore from the last session. A
   sticky detent (`snapWidthToDefault`) snaps the window back to exactly the
   default when resized within `WIDTH_SNAP_PX` of it (via `win.resizeTo`). We
   capture live geometry (`win.screenX/screenY/outerWidth/outerHeight`) on
   `resize` (debounced), `blur`, `beforeunload`, and the workspace
   `window-close` event. There is no DOM "move" event, which is why `blur`/
   `close` catch repositioning.

6. **Restored popouts are adopted.** On reload Obsidian restores the popout +
   its list view *directly*, bypassing `open()` — so the view self-marks the
   body class on render (`markPopout`), and `adoptRestoredSidecar()` (on
   `onLayoutReady`) re-attaches bounds tracking and resets the width. Without
   this, a restored window is unmanaged: native chrome shows and width/sticky
   don't work.

## API correctness

The installed `obsidian` package's TypeScript definitions
(`node_modules/obsidian/obsidian.d.ts`) are the **source of truth** for every
signature. The API evolves — verify against the types, don't trust remembered
names. Key APIs this plugin depends on:

- `Workspace.openPopoutLeaf(data?: WorkspaceWindowInitData): WorkspaceLeaf`
  (`WorkspaceWindowInitData = { x?, y?, size?: { width, height } }`)
- `WorkspaceLeaf.getContainer(): WorkspaceContainer` → `instanceof WorkspaceWindow`
  gives `.win: Window` and `.doc: Document`.
- `WorkspaceLeaf.setViewState(...)`, `WorkspaceLeaf.openFile(file, openState?)`,
  `WorkspaceLeaf.detach()`.
- `View.containerEl` (we inject our bar here) and `View.getDisplayText()` (title);
  `setIcon(parent, iconId)` for the chevron/list icons.
- `Plugin.registerView`, `registerDomEvent` (has a `Window` overload),
  `registerEvent`; `workspace.on('window-close', ...)`, `workspace.on('file-open', ...)`.
- Vault: `getAbstractFileByPath`, `getRoot()`, `TFolder.children`, `TFile`,
  and `vault.on('create' | 'delete' | 'rename', ...)` to keep the list live.

## File layout

```
manifest.json            plugin metadata (id, isDesktopOnly)
src/main.ts              Plugin entry: load settings, register view, command,
                         ribbon, settings tab, window-close handler.
src/window-manager.ts    Owns the popout + its one leaf: open, leaf swap, back
                         action, popout body class, bounds persistence.
src/project-browser-view.ts   The folder-listing ItemView + its custom header.
src/settings.ts          Settings interface, defaults, settings tab.
styles.css               Popout-scoped chrome hiding + browser-view styling.
```

## Dev / build workflow

```bash
npm run dev        # esbuild watch → main.js
npm run build      # tsc -noEmit + minified production bundle
npm run typecheck  # tsc -noEmit only — must pass clean
```

Build output `main.js` is git-ignored. **Work only inside this repo** — do not
write into any Obsidian vault from a session. The user copies the build outputs
(`main.js`, `manifest.json`, `styles.css`) into their vault's
`.obsidian/plugins/obsidian-sidecar-browser/` folder themselves and reloads the
plugin in Obsidian (Cmd+P → "Reload app without saving", or toggle it off/on).

## Conventions

- Keep concerns in separate files (view / window management / settings); don't
  let `main.ts` grow into a monolith.
- Tabs for indentation (matches the Obsidian sample-plugin house style).
- Typecheck must stay clean.
- Make small, logical commits.
- **Stay inside this repo.** Do all work within the project folder; the Obsidian
  type defs are already in-repo at `node_modules/obsidian/obsidian.d.ts`. Don't
  read or write user files outside it — no network volumes, iCloud, other
  vaults, or `~/Library`. Ask first if something outside seems necessary. Web
  searches are fine.

## Out of scope (see FUTURE_PLANS.md)

Search/filter, nested subfolder navigation, per-project last-opened memory, OS
window snapping, mobile, multiple simultaneous Sidecar windows. Don't build these
without a deliberate decision to expand scope.
