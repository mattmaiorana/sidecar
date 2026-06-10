# Sidecar Window

An Obsidian plugin that opens a note in a **tall, narrow popout window** — a
portable mini-Obsidian you can park next to your web browser — while the main
Obsidian app stays open and untouched at its normal size.

It's the *same* Obsidian instance the whole time, just a second window. No
separate app, no syncing. Window creation uses Obsidian's own popout API (the
same mechanism behind "Open in new window"); the plugin's job is to give that
window a clean, narrow, minimal look and a sensible default size and position.

## How it works

- Open the current note in a Sidecar via a command, the ribbon icon, a file-tree
  right-click, or the action button in any note's toolbar.
- The note opens as a real Obsidian `MarkdownView`, so you get live preview, your
  theme, and your other plugins — full editing, not a stripped-down textarea.
- In the popout **only**, the native chrome (tab bar, view header, status bar,
  ribbon) is hidden and replaced with a minimal top bar. Your main window is
  never affected.
- A **pin button** in the top bar keeps the window above all other apps (handy
  next to a browser). Available when Obsidian's Electron remote API is reachable.
- Open **as many Sidecars as you like** — each is independent.
- The window opens at a fixed narrow width, offset from your main window's
  top-right corner, and **remembers its height** between sessions.

## Install (manual, for local development)

This plugin isn't in the community store. To run it from source:

1. Build it (see [Development](#development)) so `main.js` exists.
2. Copy `main.js` and `manifest.json` into your vault at:
   `<your vault>/.obsidian/plugins/obsidian-sidecar-window/`
   (there is no `styles.css` — all styling is injected at runtime).
3. In Obsidian: **Settings → Community plugins**, make sure *Restricted mode* is
   off, then enable **Sidecar Window**.

## Use

Open a note in a Sidecar any of these ways:

- The command **"Open current note in Sidecar"** (command palette).
- The **panel-right ribbon icon**.
- **Right-click a `.md` file** in the file tree → "Open in Sidecar".
- The **"Open in Sidecar" action button** in a note's editor toolbar.

Click the **pin** icon in the Sidecar's top bar to toggle always-on-top.

## Development

```bash
npm install        # install dev dependencies
npm run dev        # watch build → rebuilds main.js on change
npm run build      # typecheck + minified production build
npm run typecheck  # type-check only
```

The build output is `main.js` in the repo root (git-ignored). For live testing,
copy `main.js` and `manifest.json` into your vault's
`.obsidian/plugins/obsidian-sidecar-window/` folder and reload the plugin in
Obsidian (Cmd+P → "Reload app without saving") after each rebuild.

`isDesktopOnly: true` — popout windows are a desktop-only feature.

## License

MIT
