# Changelog

All notable changes to Sidecar Window are documented here.
This project adheres to [Semantic Versioning](https://semver.org/).

## [1.0.0]

First stable release. The plugin was reduced to a focused, note-only model and
hardened for use in a live vault.

### Added
- **Open in Sidecar from anywhere** — command, ribbon icon, file-tree
  right-click, and an action button in every note's editor toolbar.
- **Multiple independent Sidecars** open at once.
- **Pin button** (always-on-top) in the top bar, shown only when Obsidian's
  Electron remote API is reachable so it never silently no-ops.
- **Clean teardown** — disabling the plugin removes all injected styling, header
  bars, and always-on-top state, leaving the windows as plain popouts.

### Changed
- **Note-only model.** The folder-listing project browser was removed; a Sidecar
  shows a single note as a real `MarkdownView`.
- **Minimal top bar** — just the macOS traffic-light drag region and the pin
  button; the note's own inline title (18px) shows in the content area.
- **Positioning** — opens offset from the main window's top-right corner,
  computed fresh each time (clamped below the menu bar); only **height** is
  remembered. Width always resets to the 375px default.
- **Styling is injected at runtime** into each popout's `<head>` — there is no
  longer a `styles.css` file.

### Fixed / removed (safety)
- **No longer hijacks your own popouts.** The previous restore-adoption logic
  resized and restyled *every* markdown popout on reload — including windows you
  opened with Obsidian's native "Open in new window." That logic was removed.
- Removed the custom resize handle and magnetic snap-width, the dead `close()`
  path, and write-only saved window x/y/width.

## [Unreleased]

### Design pass (post-v1)

- **Fully custom chrome.** Hide Obsidian's native tab strip *and* per-view header
  in the popout; render our own `.sidecar-bar` with `sidecar-*` class names so
  the Sidecar is insulated from global UI plugins (e.g. Simplified Layout) and
  our styles never leak out.
- **`← All` title bar** injected into the note view (replaces the old custom
  back-arrow action and Obsidian's native back/forward in the popout).
- **Width resets to the default (425px) on every open**, with a sticky detent
  that snaps back to 425px when resized near it. Height/position still persist.
- **Live list** — the project list auto-refreshes on file create/delete/rename,
  so the manual refresh button is gone.
- **Tighter margins** — content uses the full narrow column (readable-line-width
  disabled in the popout) for a denser, notes-panel feel.

### v1 (0.1.0) — first working version

The first version ships the full MVP:

- **"Open Sidecar Browser"** command (and a panel-right ribbon icon) that opens a
  single tall, narrow popout window.
- The popout opens narrow + tall by default and **remembers its size and
  position** across sessions.
- A **project-browser view** lists the markdown files in the configured projects
  folder as a clickable list, with a small custom header.
- Clicking a file opens it **into the same leaf** as a real `MarkdownView` for
  full Obsidian editing (live preview, theme, other plugins).
- A **back arrow** returns to the list.
- Native chrome (tab bar, status bar, extra header actions) is **hidden in the
  popout only**, scoped via a `sidecar-popout` body class, so the main window is
  untouched.
- A **settings tab** with one setting: the projects folder path (vault-relative,
  defaults to `Projects`).

Architecture: one popout window / one leaf whose contents are swapped between the
custom browser view and a real `MarkdownView`; chrome hidden via popout-scoped
CSS; window bounds persisted in plugin settings. See `CLAUDE.md`.

Out of scope for v1 (see `FUTURE_PLANS.md`): search/filter, nested subfolder
navigation, per-project memory, OS window snapping, mobile, multiple Sidecar
windows.
