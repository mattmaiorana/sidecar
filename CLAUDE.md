# CLAUDE.md — Sidecar

Context for future Claude Code sessions. Read this before changing anything so
you don't re-derive decisions that are already locked.

The plugin is named **Sidecar** (`manifest.json` id `sidecar`, vault folder
`.obsidian/plugins/sidecar/`). It was previously "Sidecar Window"
(id `sidecar-window`) and before that "Sidecar Browser"; class names and many
internal identifiers still carry the `SidecarBrowser*` / `sidecar-*` prefixes —
that's intentional, not a rename to chase.

## What this is

An Obsidian plugin (`isDesktopOnly: true`) that opens a tall, narrow **popout
window** acting as a portable mini-Obsidian for project notes, while the main
window stays untouched. Same Obsidian instance, second window — no separate app,
no syncing. The intended workflow is a hand-maintained "index" note full of
`[[links]]` that you open as a Sidecar (via the **default note**) and navigate
from — a durable replacement for the deleted folder-browser view.

## Locked architecture decisions — do not re-derive

1. **Multiple independent popout windows.** Each call to `windowManager.open(file)`
   creates a new popout leaf (`workspace.openPopoutLeaf(...)`) showing that note.
   Multiple Sidecars can be open simultaneously — `SidecarWindowManager` tracks
   all of them in a `Set<WorkspaceLeaf>`. The `ProjectBrowserView` (folder listing)
   is deleted; its code is in git history. The leaf shows a `MarkdownView` only.

2. **Never hand-roll an editor.** Editing uses the real `MarkdownView`
   (`leaf.openFile(file)`), so the user keeps live preview, their theme, and
   their other plugins. Do **not** embed a textarea or a standalone CodeMirror.

3. **Entry points.** Two notes can be targeted: the **active** note and the
   configured **default** note (`settings.defaultNote`).
   - *Active note:* command "Open current note in Sidecar"; ribbon button
     (`arrow-up-right`); right-click `.md` in file tree → "Open in
     Sidecar"; `arrow-up-right` action button injected into every
     main-window `MarkdownView` toolbar (via `active-leaf-change`, guarded to
     skip popout leaves).
   - *Default note:* command "Open default note in Sidecar" (bound by default to
     **`Mod+Shift+S`**); ribbon button (`file-text`); and a one-click
     `file-text` button injected into the **left sidebar tab-header strip**
     (`SidecarLauncherButtons` in `launcher-button.ts`, for users who hide the
     ribbon — see #11). `openDefaultNote()` opens
     `settings.defaultNote` if set and resolvable, else **falls back to the
     active note** (so the hotkey is never a dead end); a missing configured path
     shows a Notice.
   All paths call `windowManager.open(file)`, which closes any main-window copy of
   the file first (pop-out mode) and then creates a fresh popout window.

4. **Minimal custom chrome, popout-scoped.** The Sidecar header is a narrow bar.
   Left side: the macOS traffic-light drag inset, then back/forward buttons
   (`arrow-left` / `arrow-right`). Right side (after a flex spacer): home
   (`file-text`, → default note), pop-in (`arrow-down-left`, → main window), pin
   (`pin`, always-on-top). Obsidian's native tab strip and per-view header are
   hidden; the note's own inline title and content fill the rest. `sidecar-*`
   class names are used so other plugins don't interfere.
   - The bar (`decorateHeader`) is injected as the first child of `view.containerEl`.
   - **Per-button visibility** is controlled by per-document `<style>` tags
     (`applyPinStyle`, `applyPopInStyle`, `applyNavStyle`, `applyHomeStyle`),
     each toggled live from settings via an `update*Style()` method that loops
     open leaves. Back/forward, home, pop-in, and pin all default **on**.
   - **Back/forward** (`navigate()`) set the leaf active (`setActiveLeaf`, no
     focus) then fire the built-in `app:go-back` / `app:go-forward` commands so
     they target the Sidecar's leaf. There is no public `WorkspaceLeaf.goBack()`.
   - **Home** (`goHome()`) calls `leaf.openFile()` on the default note *in place*
     (navigates the existing Sidecar, unlike the ribbon/command which spawn a new
     window).
   - **All popout CSS is injected directly into the popout's `<head>`** (see
     `injectPopoutStyles` in `window-manager.ts`) — this is the *single source of
     truth* for Sidecar styling. The rules are **not** scoped to a body class, so
     nothing Obsidian does to `body.class` can drop them. `body.sidecar-popout`
     is still added for debug/inspection. There is **no `styles.css`** — a shared
     stylesheet would either be scoped to the wiped body class (non-functional)
     or to a generic popout class (would skin the user's own popouts too).
   - **Drag region (macOS):** `-webkit-app-region: drag` on `.sidecar-bar` with
     left inset for traffic lights. Interactive controls are marked `no-drag`.

5. **Fresh opens only touch our windows; restore re-skin is opt-in and
   geometry-preserving.** Fresh styling/resizing happens exclusively on windows
   opened via `open()`, gated by the `pendingPopout` flag in `handleWindowOpen`.
   On reload, Obsidian restores Sidecar popouts as plain (unstyled) windows, and
   `adoptRestoredSidecars()` (run at `onLayoutReady`, with a couple of retries to
   catch late-restored popouts) **re-skins them** — but only when the
   `reskinPopoutsOnReload` setting is on (**default off**). The two invariants:
   - **All-popouts, behind a flag.** When enabled it re-skins *every* restored
     popout (`scanAndAdopt` filters to popout containers only). This deliberately
     replaced an earlier path-matched scheme (persisting `sidecarPaths` and
     matching by note) — that had a real-time-persistence dependency and timing
     races that left popouts unskinned. The user accepted skinning all popouts
     because they only ever use popouts for Sidecars; the setting (off by default)
     keeps it safe for users who use native popouts. This is a deliberate
     relaxation of the original "never adopt anything but our own" rule. The old
     `adoptRestoredSidecar()` was worse still: it ran unconditionally *and*
     shrank popouts to 375px and stripped their chrome.
   - **Geometry preserved.** Adoption calls `schedulePopoutSetup(leaf, false)` —
     re-applies styles + header bar only, with **no** resize or reposition (that
     forced shrink was the worst of the old behavior).
   Adoption runs **only at startup**, so popouts the user opens mid-session are
   never adopted. Pins are *not* restored (still in-memory only — see #7).

6. **Bounds.** Width and height come from `settings.defaultWidth` (default 375)
   and `settings.windowHeight` (default 1000) — both user-configurable in the
   settings tab, clamped to sane ranges. **Width always resets to
   `settings.defaultWidth` on open** (because `openPopoutLeaf`'s `size.width`
   parameter is silently ignored by Obsidian — width is forced via `win.resizeTo`
   in `handleWindowOpen`). There is **no auto-capture of bounds**: height is not
   updated when the user resizes the window — it only controls the initial size on
   the next open. Position is always computed fresh from the main window's live
   geometry (right edge +40px, top −40px, y clamped to the screen's available top).

7. **Always-on-top (pin button).** The pin button calls `setAlwaysOnTop(popoutWin,
   pinned)`, which injects a `<script>` into the popout document to call
   `require('@electron/remote').getCurrentWindow().setAlwaysOnTop()` (fallback
   `require('electron').remote`). Script injection is necessary so
   `getCurrentWindow()` resolves to the popout's BrowserWindow, not the main
   window's. The button is only rendered when `alwaysOnTopSupported()` confirms
   the remote module is reachable — otherwise it would toggle "active" while doing
   nothing. Pin state is in-memory only (not persisted across reloads).

8. **Clean teardown.** `onunload` calls `windowManager.teardown()`, which reverses
   every mark (unpins, removes the injected `<style>`, our header bar, and the
   body class) so disabling the plugin leaves the popouts as plain windows with
   no leftover styling or stuck always-on-top state. It does **not** save any
   bounds — there is nothing to save (see #6).

9. **Full-width content — surgical override, NOT the shared variable.** To make
   note content fill the narrow window instead of centering at the readable line
   width, we override the two sizer elements directly:
   `.markdown-source-view.is-readable-line-width .cm-sizer` and the preview
   `.markdown-preview-sizer` get `max-width: none !important; margin-inline: 0`.
   **Do not** set Obsidian's `--file-line-width` variable to do this. It is a
   *shared* variable: the `[[link]]` suggestion popup reads it for positioning.
   Setting it to `100%` made the popup grow off-screen by a step per keystroke;
   setting it to `9999px` only worked by luck. The surgical override touches
   nothing else. (History: both bugs happened in this exact spot.)

10. **Suggestion popup is capped.** Independently, `.suggestion-container` is
    capped at `max-width: calc(100vw - 20px)` with ellipsis on `.suggestion-item`.
    Without it, long note titles make the popup wider than the 375px window;
    Obsidian then anchors the popup's right edge in view and shoves the left edge
    (the titles) off-screen. The cap is defense-in-depth even with decision #9 in
    place — keep it.

11. **Left-sidebar launcher button — DOM hack, mounted as a tab sibling.**
    `SidecarLauncherButtons` (`launcher-button.ts`) injects a one-click
    `file-text` button (→ `openDefaultNote()`) into the left sidebar's
    `.workspace-tab-header-container`, **immediately before
    `.workspace-tab-header-spacer`**, for users who keep the ribbon hidden.
    Visibility is gated by `settings.showLauncherButton` (default on); toggling it
    calls `launcherButtons.mount()`, which mounts or removes accordingly. There
    is **no public API** for this, so:
    - **Do not mount it inside `.workspace-tab-header-container-inner`.** Obsidian
      rebuilds that inner container's children when switching sidebar tabs, which
      wipes the button (flicker, then gone). The spacer slot is a stable sibling.
    - Mounting is defensive + idempotent and is **re-run on `layout-change`**
      (Obsidian rebuilds the strip); the button is removed in `onunload`.
    - Its look is matched to the tabs via an injected `<style>` (`document.head`,
      id `sidecar-launcher-strip-style`): 25px tall, `0 8px` padding, 18px icon
      (→ the measured 34×25 tab-inner box), `var(--tab-radius)`, a
      `var(--size-2-1)` left margin for the inter-tab gap, faint→bright on hover.
    This is a deliberate, ribbon-hidden-only convenience; it reaches into another
    view's DOM, which the plugin otherwise avoids (#4).

12. **Zombie popout cleanup — opt-in, remote-gated, session-token based.**
    "Reload app without saving" reloads the main renderer **without closing
    existing popout windows** (plugin `onunload` never fires), then restores fresh
    ones — leaving the old popouts open but dead (links / live preview broken).
    This is an *Obsidian-level* bug (happens with the plugin disabled too).
    `closeZombiePopouts()` (run at `onLayoutReady`, behind the
    `closeZombiePopoutsOnReload` setting, **default off**) cleans them up:
    - Every popout we skin stamps `body.dataset.sidecarSession` with a
      **per-load token** (`sessionToken`, set in `applyPopoutMarks`).
    - The sweep enumerates Electron windows via `@electron/remote`
      `BrowserWindow.getAllWindows()` and `webContents.executeJavaScript`-reads
      each body's token, calling `win.destroy()` on any window whose token is
      **non-empty and ≠ the current session's** — i.e. a Sidecar we skinned in a
      *previous* session. Live popouts (current token) and the user's own popouts
      (no token) are never touched, so it's **timing-independent** (no ordering
      dependency vs `adoptRestoredSidecars`). A bare `sidecar-popout`-class check
      would race re-skin and could kill a live window — the token avoids that.
    - Needs the remote module (like the pin button, #7), so the setting is only
      shown when `remoteAvailable()`.

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
- `Plugin.addCommand({ hotkeys })` for the default `Mod+Shift+S` binding.
- `AbstractInputSuggest<T>` for the default-note path autocomplete in settings.
  **Gotcha:** the right API is `getSuggestions` + `renderSuggestion` + the
  instance method `onSelect(cb)`. There is **no** `onChooseSuggestion` override
  here (that's `SuggestModal`); an override by that name is silently dead code.
  Call `suggest.close()` inside the `onSelect` callback or the dropdown lingers
  after a pick.

## File layout

```
manifest.json       plugin metadata (id, isDesktopOnly)
src/main.ts         Plugin entry: load settings, commands (incl. default-note +
                    hotkey), both ribbon buttons, event wiring, openDefaultNote().
src/window-manager.ts  Manages all popout windows: open, mark, header (nav/home/
                    pop-in/pin buttons), navigate/goHome, sizing, teardown. Owns
                    the injected popout CSS. Holds the SIDECAR_BUILD stamp.
src/settings.ts     Settings interface, defaults, settings tab, FileSuggest
                    (default-note path autocomplete).
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
`.obsidian/plugins/sidecar/` folder themselves and reloads the plugin in Obsidian
(Cmd+P → "Reload app without saving", or toggle it off/on).

`SIDECAR_BUILD` in `window-manager.ts` is stamped onto `body.dataset.sidecarBuild`
in each popout — bump it when shipping a change so the user can confirm the live
build in the popout inspector (`document.body.dataset.sidecarBuild`). Keep it in
sync with `manifest.json` / `package.json` `version`.

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
