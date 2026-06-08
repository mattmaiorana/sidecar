# Sidecar Browser

An Obsidian plugin that opens a **tall, narrow popout window** acting as a portable
mini-Obsidian for navigating and editing your project notes — while the main
Obsidian app stays open and untouched at its normal size.

It's the *same* Obsidian instance the whole time, just a second window you can
park next to your web browser. No separate app, no syncing.

## How it works

- One command, **"Open Sidecar Browser"**, opens a single narrow popout window.
- The window shows a **project browser**: a flat list of the markdown notes in a
  folder you choose.
- Click a note → it opens **in that same window** as a real Obsidian
  `MarkdownView`, so you get live preview, your theme, and your other plugins —
  full editing, not a stripped-down textarea.
- A **back arrow** in the header returns you to the list.
- The native chrome (tab bar, status bar) is hidden **in the popout only**, so it
  reads as a minimal "filename + back" panel. Your main window is never affected.
- The window remembers its **size and position** between sessions.

## Install (manual, for local development)

This plugin isn't in the community store yet. To run it from source:

1. Build it (see [Development](#development)) so `main.js` exists.
2. Copy or symlink `main.js`, `manifest.json`, and `styles.css` into your vault at:
   `<your vault>/.obsidian/plugins/obsidian-sidecar-browser/`
3. In Obsidian: **Settings → Community plugins**, make sure *Restricted mode* is
   off, then enable **Sidecar Browser**.

## Use

- Run the command **"Open Sidecar Browser"** (command palette, or the
  panel-right ribbon icon).
- A narrow, tall window opens listing your project notes.
- Click a note to edit it; click the back arrow to return to the list.

## Settings

- **Projects folder** — the vault-relative path whose markdown files are listed.
  Defaults to `Projects`. Change it any time (e.g. `Areas/Work`); leave it blank
  to list the vault root. Only direct-child `.md` files are shown in v1
  (subfolders are not descended into yet).

## Development

```bash
npm install        # install dev dependencies
npm run dev        # watch build → rebuilds main.js on change
npm run build      # typecheck + minified production build
npm run typecheck  # type-check only
```

The build output is `main.js` in the repo root (git-ignored). For live testing,
point your vault's plugin folder at the build output (a symlink works well) and
reload the plugin in Obsidian after each rebuild.

`isDesktopOnly: true` — popout windows are a desktop-only feature.

## v1 acceptance check

From the main Obsidian window:

1. Run **"Open Sidecar Browser"** → a narrow, tall popout opens.
2. It lists your project notes.
3. Click one → you can edit it with full Obsidian editing.
4. Hit **back** → you're at the list again.
5. The **main window is completely unchanged** throughout.
6. Close and reopen Sidecar → it **remembers its size and position**.

## License

MIT
