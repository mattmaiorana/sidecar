# Changelog

All notable changes to Sidecar Window are documented here.
This project adheres to [Semantic Versioning](https://semver.org/).

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
