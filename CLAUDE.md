# CLAUDE.md — Sidecar Window

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
   is deleted; its code is in git history. The leaf shows a `MarkdownView` only.

2. **Never hand-roll an editor.** Editing uses the real `MarkdownView`
   (`leaf.openFile(file)`), so the user keeps live preview, their theme, and
   their other plugins. Do **not** embed a textarea or a standalone CodeMirror.

3. **Entry points:**
   - Command "Open current note in Sidecar" / ribbon button → opens the active file.
   - Right-click `.md` file in file tree → "Open in Sidecar".
   - `panel-right` action button injected into every main-window `MarkdownView`
     toolbar (via `active-leaf-change`, guarded to skip popout leaves).
   All three call `windowManager.open(file)`, which always creates a fresh window.

4. **Minimal custom chrome, popout-scoped.** The Sidecar header is a narrow bar
   containing only the macOS traffic-light drag inset and a pin button (always-on-top
   toggle) at the right edge. Obsidian's native tab strip and per-view header are
   hidden; the note's own inline title and content fill the rest. `sidecar-*` class
   names are used so other plugins don't interfere.
   - The bar (`decorateHeader`) is injected as the first child of `view.containerEl`.
   - **All popout CSS is injected directly into the popout's `<head>`** (see
     `injectPopoutStyles` in `window-manager.ts`) — this is the *single source of
     truth* for Sidecar styling. The rules are **not** scoped to a body class, so
     nothing Obsidian does to `body.class` can drop them. `body.sidecar-popout`
     is still added for debug/inspection. There is **no `styles.css`** — a shared
     stylesheet would either be scoped to the wiped body class (non-functional)
     or to a generic popout class (would skin the user's own popouts too).
   - **Drag region (macOS):** `-webkit-app-region: drag` on `.sidecar-bar` with
     left inset for traffic lights. Interactive controls are marked `no-drag`.

5. **Only our windows are ever touched.** Styling and resizing happen exclusively
   on windows opened via `open()`, gated by the `pendingPopout` flag in
   `handleWindowOpen`. We do **not** adopt restored or user-created popouts — an
   earlier `adoptRestoredSidecar()` did, and it hijacked the user's own native
   "Open in new window" popouts (shrank them to 375px, stripped their chrome) on
   every reload. It was removed. A Sidecar that survives a reload simply comes
   back as a plain popout; reopen it to re-skin.

6. **Bounds persistence.** Default height 1000 (`DEFAULT_SETTINGS.windowHeight`);
   width is the `DEFAULT_WIDTH` const (375). **Width always resets to
   `DEFAULT_WIDTH` on open** (because `openPopoutLeaf`'s `size.width` parameter is
   silently ignored by Obsidian — width is forced via `win.resizeTo` in
   `handleWindowOpen`). Only **height** is saved/restored. Position is always
   computed fresh from the main window's live geometry (right edge +40px, top
   −40px, y clamped to the screen's available top). Height is captured on `resize`
   (debounced 300ms), `blur`, `beforeunload`, and `window-close`.

7. **Always-on-top (pin button).** The pin button calls `setAlwaysOnTop(popoutWin,
   pinned)`, which injects a `<script>` into the popout document to call
   `require('@electron/remote').getCurrentWindow().setAlwaysOnTop()` (fallback
   `require('electron').remote`). Script injection is necessary so
   `getCurrentWindow()` resolves to the popout's BrowserWindow, not the main
   window's. The button is only rendered when `alwaysOnTopSupported()` confirms
   the remote module is reachable — otherwise it would toggle "active" while doing
   nothing. Pin state is in-memory only (not persisted across reloads).

8. **Clean teardown.** `onunload` calls `windowManager.teardown()`, which reverses
   every mark (saves height, unpins, removes the injected `<style>`, our header
   bar, and the body class) so disabling the plugin leaves the popouts as plain
   windows with no leftover styling or stuck always-on-top state.

## API correctness

The installed `obsidian` package's TypeScript definitions
(`node_modules/obsidian/obsidian.d.ts`) are the **source of truth** for every
signature. The API evolves — verify against the types, don't trust remembered
names. Key APIs this plugin depends on:

- `Workspace.openPopoutLeaf(data?: WorkspaceWindowInitData): WorkspaceLeaf`
  (`WorkspaceWindowInitData = { x?, y?, size?: { width, height } }`)
  **Note:** `size.width` is silently ignored by Obsidian's implementation.
- `WorkspaceLeaf.getContainer(): WorkspaceContainer` → `instanceof WorkspaceWindow`
  gives `.win: Window` and `.doc: Document`.
- `WorkspaceLeaf.openFile(file, openState?)`, `WorkspaceLeaf.detach()`.
- `View.containerEl` (we inject our bar here); `setIcon(parent, iconId)`.
- `Plugin.registerDomEvent` (has a `Window` overload), `registerEvent`;
  `workspace.on('window-close', ...)`, `workspace.on('window-open', ...)`.

## File layout

```
manifest.json       plugin metadata (id, isDesktopOnly)
src/main.ts         Plugin entry: load settings, commands, ribbon, event wiring.
src/window-manager.ts  Manages all popout windows: open, mark, header, pin,
                    height persistence, teardown. Owns the injected popout CSS.
src/settings.ts     Settings interface, defaults, settings tab.
```

There is no `styles.css` — all popout CSS lives in `injectPopoutStyles`
(`window-manager.ts`).

## Dev / build workflow

```bash
npm run dev        # esbuild watch → main.js
npm run build      # tsc -noEmit + minified production bundle
npm run typecheck  # tsc -noEmit only — must pass clean
```

Build output `main.js` is git-ignored. **Work only inside this repo** — do not
write into any Obsidian vault from a session. The user copies the build outputs
(`main.js` + `manifest.json` — there is no `styles.css`) into their vault's
`.obsidian/plugins/obsidian-sidecar-window/` folder themselves and reloads the
plugin in Obsidian (Cmd+P → "Reload app without saving", or toggle it off/on).

## Conventions

- Keep concerns in separate files (window management / settings); don't let
  `main.ts` grow into a monolith.
- Tabs for indentation (matches the Obsidian sample-plugin house style).
- Typecheck must stay clean.
- Make small, logical commits.
- **Stay inside this repo.** Do all work within the project folder; the Obsidian
  type defs are already in-repo at `node_modules/obsidian/obsidian.d.ts`. Don't
  read or write user files outside it — no network volumes, iCloud, other
  vaults, or `~/Library`. Ask first if something outside seems necessary. Web
  searches are fine.

## Out of scope (see FUTURE_PLANS.md)

Folder browser view, internal-link→Sidecar opener, snap width, pin persistence,
search/filter, nested folders, OS window snapping, mobile. Don't build these
without a deliberate decision to expand scope.
