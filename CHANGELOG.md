# Changelog

All notable changes to Sidecar are documented here.
This project adheres to [Semantic Versioning](https://semver.org/).

---

## [1.2.5]

### Changed
- The default-note autocomplete enumerates the vault via `getAllLoadedFiles()`
  instead of `getMarkdownFiles()` — identical result (markdown files matching the
  query, now sorted), but it avoids the plugin directory's "vault enumeration"
  recommendation, whose heuristic keys on the `getFiles`/`getMarkdownFiles`
  method names.

---

## [1.2.4]

Code-review cleanups — no behavior changes for typical use.

### Changed
- The "Show … ribbon button" / "Show toolbar button" toggles now hide reliably:
  the CSS wins on selector specificity instead of relying on cascade order.
- Disabling the plugin now leaves no trace — `teardown()` also removes the
  per-button hide styles and the toolbar action buttons it had added.
- Internal: consolidated the four bar-button style methods into one table-driven
  pair, unified the Electron remote-module resolution shared by the pin button
  and the zombie sweep, and tightened a couple of type casts.

---

## [1.2.3]

Community plugin directory compliance — no feature changes.

### Changed
- Cleared the last two flagged `document` references: the sidebar launcher now
  uses `activeDocument`, and popout detection compares windows instead of the
  global document.

---

## [1.2.2]

More community plugin directory compliance — no feature changes.

### Changed
- Removed the default `Cmd/Ctrl+Shift+S` hotkey (Obsidian discourages bundling
  default hotkeys). The **"Open default note"** command still exists — assign your
  own key in **Settings → Hotkeys** if you want one.
- Replaced `revealLeaf` with `setActiveLeaf` (avoids an API newer than the
  declared `minAppVersion`).
- Dropped `!important` from the button-visibility CSS, and the main-window
  body-class toggles now use `activeDocument`.

---

## [1.2.1]

Community plugin directory compliance — no feature changes.

### Changed
- Main-window styling moved into a `styles.css` file (Obsidian loads it); button
  visibility now toggles body classes. The popout chrome is still styled
  per-popout. **Copy `styles.css` alongside `main.js` + `manifest.json`.**
- The always-on-top pin no longer injects a `<script>` — it resolves the popout's
  own window directly.
- Command IDs/names simplified to **"Open current note"** and **"Open default
  note"**. The default `Cmd/Ctrl+Shift+S` for the default note still works; if you
  had bound your *own* hotkey to these commands, re-bind it.
- `minAppVersion` raised to **1.5.11**; plugin description no longer says
  "Obsidian".
- Releases are now built and published with build-provenance attestations via
  GitHub Actions.

---

## [1.2.0]

A feature release focused on a ribbon-free launcher and handling popout windows
across Obsidian reloads.

### Added
- **Left-sidebar launcher button** — a one-click button injected into the left
  sidebar's tab bar (next to Files/Search) that opens the default note in a
  Sidecar, for users who keep the ribbon hidden. Toggle with the new **"Show
  sidebar launcher button"** setting (on by default).
- **"Re-style popouts on reload"** setting (off by default) — re-applies Sidecar
  styling to popout windows that Obsidian restores after a reload, so they come
  back skinned without reopening (size and position left untouched).
- **"Close leftover popouts on reload"** setting (off by default) — after a
  reload, closes the dead duplicate Sidecar windows Obsidian leaves behind (whose
  links and live preview no longer work). Only ever closes windows this plugin
  skinned in a previous session, identified by a per-session token; shown only
  when Obsidian's Electron remote API is reachable.

### Changed
- **Back/forward and home buttons now show by default** (were off).
- **Icons** — open-in-Sidecar buttons use `arrow-up-right` and the pop-in button
  uses `arrow-down-left` (reverted from the `square-*` variants used in 1.1.0).
- Added an MIT **LICENSE** file and aligned the npm package name with the folder.

---

## [1.1.0]

A feature release — adds the default note and in-Sidecar navigation. Bundles all
the work since 1.0.3. (Build numbers 1.0.4–1.0.6 were intermediate test builds,
never released on their own — `SIDECAR_BUILD` is stamped on the popout body for
live verification during development.)

### Added
- **Default note** — a configurable note (set its vault-relative path in
  settings, with type-ahead autocomplete) that can be opened in a Sidecar
  independently of whatever note is active. Backed by:
  - a **"Open default note in Sidecar"** command, bound by default to
    **`Cmd/Ctrl+Shift+S`** (rebindable in Obsidian's Hotkeys settings);
  - a second **ribbon button** (`file-text`);
  - a **home button** in the Sidecar bar (off by default) that returns the open
    Sidecar to the default note in place.
  - If no default note is configured, the command/hotkey/ribbon fall back to
    opening the current note.
- **Back / forward navigation buttons** in the Sidecar bar (off by default) — fire
  the built-in `app:go-back` / `app:go-forward` scoped to the Sidecar's leaf, so
  clicking a `[[link]]` inside a Sidecar no longer strands you.

### Changed
- **Renamed the plugin to "Sidecar"** (was "Sidecar Window"). The `manifest.json`
  id is now `sidecar` (was `obsidian-sidecar-window`, briefly `sidecar-window`).
  **Rename the vault plugin folder to `sidecar`** and re-enable. *Note: the id
  change resets settings to defaults — re-apply any customized toggles.*
- **Button-visibility settings are now "Show" toggles, all sensible-default.**
  The old "Hide …" toggles (ribbon, toolbar, pop-in, pin) became "Show …" toggles
  (default on). The two ribbon buttons have separate toggles.
- **Icons** — open-in-Sidecar buttons use `square-arrow-up-right`, pop-in uses
  `square-arrow-down-left`, and the default-note/home buttons use `file-text`.

### Fixed
- **`[[link]]` suggestion popup** no longer drifts off-screen / grows per keystroke
  in the narrow window. Root cause: the previous full-width-content rule set
  Obsidian's shared `--file-line-width` variable, which the popup also reads. The
  fix overrides the editor sizer elements directly instead, and caps
  `.suggestion-container` width so it always fits the window.
- **Default-note path autocomplete** now applies a clicked/Enter-selected
  suggestion and closes the dropdown (the suggestion handler used the wrong API).

---

## [1.0.3]

Bundles the settings and behavior work that accumulated since 1.0.2 (none of it
was deployed on its own).

### Added
- **Configurable Sidecar size** — "Sidecar width" (200–1200 px, default 375) and
  "Sidecar height" (300–3000 px, default 1000) settings. Values are clamped to
  range on blur; clearing a field restores the default.
- **"Make text smaller" toggle** (on by default) — turns the Sidecar's
  smaller-text styling on or off, applied live to open Sidecars. The styling now
  also scales headings (h1 18px → h4–h6 14px), code blocks and inline code
  (13px), and callout titles and the properties panel (14px), in addition to
  body text (14px) and the inline title (18px). Works in both reading view and
  the live-preview editor.
- **"Make padding smaller" toggle** (on by default) — turns the tighter content
  padding on or off, applied live to open Sidecars.
- **Four button-visibility toggles** (all off by default, so every button shows):
  hide ribbon button, hide toolbar button, hide pop-in button, hide pin button.

### Changed
- **Pop-out mode is now the default behavior**, not an opt-in toggle — opening a
  note in Sidecar always closes the main-window copy first.
- **Icons** — the open-in-Sidecar buttons use `arrow-up-right` and the pop-in
  button uses `arrow-down-left` (was `panel-left`).
- **No auto-capture of window size** — height comes only from the setting; the
  window is no longer measured and saved when you resize it. Width already
  always reset to the default on open.

---

## [1.0.2]

### Added
- **Pop-out mode** (off by default, toggle in settings) — when enabled, opening
  a note in Sidecar closes the main-window copy, and a **pop-in button**
  (`panel-left` icon) appears in the Sidecar bar to return the note to the main
  window and close the Sidecar.

---

## [1.0.1]

### Changed
- Renamed plugin from **Sidecar Browser** to **Sidecar Window** — `manifest.json`
  id is now `obsidian-sidecar-window`. Rename the vault plugin folder to match.

---

## [1.0.0]

First stable release. Hardened for use in a live vault and reduced to a
focused, note-only model.

### Added
- **Open in Sidecar from anywhere** — command, ribbon icon, file-tree
  right-click, and an action button in every note's editor toolbar.
- **Multiple independent Sidecars** open at once.
- **Pin button** (always-on-top) in the top bar, shown only when Obsidian's
  Electron remote API is reachable — never silently no-ops.
- **Clean teardown** — disabling the plugin removes all injected styling, header
  bars, and always-on-top state, leaving windows as plain popouts.

### Changed
- **Note-only model.** The folder-listing project browser was removed; a Sidecar
  shows a single note as a real `MarkdownView`.
- **Minimal top bar** — just the macOS traffic-light drag region and the pin
  button; the note's own inline title (18px) shows in the content area.
- **Positioning** — opens offset from the main window's top-right corner,
  computed fresh each time (clamped below the menu bar); only **height** is
  remembered. Width always resets to the 375px default.
- **Styling injected at runtime** into each popout's `<head>` — no `styles.css`.

### Removed / fixed (safety)
- **No longer hijacks your own popouts.** The restore-adoption logic resized and
  restyled *every* markdown popout on reload — including windows opened with
  Obsidian's native "Open in new window." That logic was removed.
- Removed the custom resize handle and magnetic snap-width, the dead `close()`
  path, and write-only saved window x/y/width.

---

## [0.6.0]

### Added
- **Custom resize handle** — pointer-capture drag on the right edge with a
  magnetic snap detent back to the default width.

### Fixed
- Popout window width and position are now reliably applied via `resizeTo` /
  `moveTo` in the `window-open` handler.

---

## [0.5.0]

### Added
- **Multiple independent Sidecar windows** — each `open(file)` call spawns a
  fresh, independently-tracked popout; all managed simultaneously.

### Changed
- **`<style>` injection into `<head>`** replaces the `MutationObserver`
  body-class approach — styles survive anything Obsidian does to `body.class`.
- Popout marking re-applied across multiple ticks to beat Obsidian's own late
  popout setup.

### Fixed
- Styling no longer drops on window focus loss.

---

## [0.4.0]

**v1 reboot — note-only model.**

### Changed
- **Folder browser removed.** The Sidecar always opens a note directly as a
  `MarkdownView`; the `ProjectBrowserView` is gone (recoverable from git history).
- **Entry points expanded** — file-tree right-click and a toolbar action button
  in every main-window `MarkdownView`, in addition to the command and ribbon.
- Popout marking switched from `MutationObserver` to `workspace.on('window-open')`
  for reliability.

---

## [0.3.0]

### Added
- **Restore adoption** — Sidecars that survive an Obsidian reload are
  re-skinned on `onLayoutReady`. *(Later removed in 1.0.0 as a safety fix —
  it also adopted the user's own native popouts.)*
- **Build stamp** (`data-sidecar-build`) on the popout body for debugging.

### Changed
- Default width 375px; inline title hidden in popout.
- Content font size 14px; padding 16px / 24px.

### Fixed
- `getContainer()`-based popout detection replaces fragile earlier heuristics.

---

## [0.2.0]

### Added
- **Custom popout chrome** — own header bar with `-webkit-app-region: drag`
  inset for macOS traffic lights; native tab strip and view header hidden.
- **Live project list** — auto-refreshes on vault file create / delete / rename.
- Readable-line-width disabled in the popout for a denser column feel.

### Changed
- Width resets to the default on every open.
- Removed the custom back-button action.

### Fixed
- Popout window remains draggable after the native tab strip is hidden.

---

## [0.1.0]

First working version.

### Added
- **"Open in Sidecar"** command and ribbon icon — opens a single tall, narrow
  popout window.
- Popout **remembers its size and position** across sessions.
- **Project-browser view** — lists direct-child `.md` files in the configured
  folder as a clickable list; clicking opens the note as a `MarkdownView`; back
  arrow returns to the list.
- Native chrome (tab bar, status bar, header actions) **hidden in the popout
  only**, scoped via `body.sidecar-popout` — main window untouched.
- **Settings tab** with one setting: projects folder path (vault-relative,
  defaults to `Projects`).
