# Changelog

All notable changes to Sidecar Browser are documented here.
This project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
