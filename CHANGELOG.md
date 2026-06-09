# Changelog

All notable changes to Sidecar Browser are documented here.
This project adheres to [Semantic Versioning](https://semver.org/).

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
