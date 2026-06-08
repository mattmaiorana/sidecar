# CLAUDE.md — Sidecar Browser

Context for future Claude Code sessions. Read this before changing anything so
you don't re-derive decisions that are already locked.

## What this is

An Obsidian plugin (`isDesktopOnly: true`) that opens a tall, narrow **popout
window** acting as a portable mini-Obsidian for project notes, while the main
window stays untouched. Same Obsidian instance, second window — no separate app,
no syncing.

## Locked architecture decisions — do not re-derive

1. **One popout window, one leaf, swapped contents.** We open a single popout
   leaf (`workspace.openPopoutLeaf(...)`, the `'window'` leaf type) and alternate
   that *same* leaf between two states:
   - the custom **`ProjectBrowserView`** (folder listing), and
   - a normal **`MarkdownView`** opened on a selected file.
   We never open a second Sidecar window or a second leaf.

2. **Never hand-roll an editor.** Editing uses the real `MarkdownView`
   (`leaf.openFile(file)`), so the user keeps live preview, their theme, and
   their other plugins. Do **not** embed a textarea or a standalone CodeMirror.

3. **Navigation / leaf swap:**
   - Open → `leaf.setViewState({ type: VIEW_TYPE_SIDECAR_BROWSER })` shows the list.
   - Click a file → `windowManager.openFileInSidecar(leaf, file)` →
     `leaf.openFile(file)` swaps the same leaf to a `MarkdownView`.
   - Back arrow → `setViewState(...)` swaps back to the list.

4. **Minimal chrome, popout-scoped.** The window should read as "filename + back
   arrow, nothing else":
   - In `ProjectBrowserView` we own the DOM, so we render a small custom header
     in `contentEl` and hide that view's native view-header via CSS.
   - In the `MarkdownView` state we keep the native title, add a back-arrow via
     the supported **`view.addAction(...)`** API, and hide the rest with CSS.
   - **All chrome-hiding CSS is scoped to `body.sidecar-popout`.** We add that
     class ourselves to the popout window's `<body>` (via the typed
     `WorkspaceWindow.doc`), rather than relying on Obsidian's internal popout
     class name. This *guarantees* the main window is never affected.
   - **Drag region caveat (macOS):** Obsidian's popout is a frameless window
     where the native tab strip (`.workspace-tab-header-container`) is the drag
     region and reserves space for the traffic-light buttons. Because we hide
     that strip, `styles.css` re-establishes dragging by setting
     `-webkit-app-region: drag` on our headers plus a left inset for the traffic
     lights (with interactive controls marked `no-drag`). This block is the most
     environment-dependent part of the plugin — tune it if window dragging or
     the traffic lights misbehave in a given OS/Obsidian build.

5. **Bounds persistence.** Default to a tall, narrow column
   (`DEFAULT_SETTINGS.windowBounds` = 420×1000). We open at the saved bounds via
   `openPopoutLeaf({ x, y, size })`, and capture live geometry
   (`win.screenX/screenY/outerWidth/outerHeight`) on `resize` (debounced),
   `blur`, `beforeunload`, and the workspace `window-close` event. There is no
   DOM "move" event, which is why `blur`/`close` are used to catch repositioning.

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
- `ItemView.addAction(icon, title, cb): HTMLElement` (MarkdownView is an ItemView).
- `Plugin.registerView`, `registerDomEvent` (has a `Window` overload),
  `registerEvent`; `workspace.on('window-close', (win, window) => ...)`.
- Vault: `getAbstractFileByPath`, `getRoot()`, `TFolder.children`, `TFile`.

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

## Out of scope (see FUTURE_PLANS.md)

Search/filter, nested subfolder navigation, per-project last-opened memory, OS
window snapping, mobile, multiple simultaneous Sidecar windows. Don't build these
without a deliberate decision to expand scope.
