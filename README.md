# Sidecar Window

An Obsidian plugin that opens a note in a **tall, narrow popout window** — a
portable mini-Obsidian you can park next to your web browser — while the main
Obsidian app stays open and untouched at its normal size.

It's the *same* Obsidian instance the whole time, just a second window. No
separate app, no syncing. Window creation uses Obsidian's own popout API (the
same mechanism behind "Open in new window"); the plugin's job is to give that
window a clean, narrow, minimal look and a sensible default size and position.

## How it works

- Open any note in a Sidecar via a command, the ribbon icon, a file-tree
  right-click, or the action button in any note's toolbar.
- Opening a note that's already open in the main window **closes the main-window
  copy first** (pop-out mode), so you're never looking at two copies of the same
  note at once.
- The note opens as a real Obsidian `MarkdownView`, so you get live preview, your
  theme, and your other plugins — full editing, not a stripped-down textarea.
- In the popout **only**, the native chrome (tab bar, view header, status bar,
  ribbon) is hidden and replaced with a minimal top bar. Your main window is
  never affected.
- A **pop-in button** in the Sidecar's top bar returns the note to a new tab in
  the main window and closes the Sidecar.
- A **pin button** in the top bar keeps the window above all other apps (handy
  next to a browser). Available when Obsidian's Electron remote API is reachable.
- Open **as many Sidecars as you like** — each is independent.
- The window opens at a configurable width and height (both set in settings),
  offset from your main window's top-right corner. Resizing a Sidecar by hand
  doesn't change the saved size — the next one still opens at the configured
  dimensions.

## Settings

| Setting | Default | Description |
|---|---|---|
| Sidecar width | 375 px | Width of new Sidecar windows. Valid range: 200–1200 px. |
| Sidecar height | 1000 px | Height of new Sidecar windows. Valid range: 300–3000 px. |
| Make text smaller | On | Scales note content to 14 px. Inline title: 18 px. Headings scale from h1 (18 px) down to h4–h6 (14 px). Code blocks and inline code: 13 px. Callout titles and properties panel: 14 px. |
| Make padding smaller | On | Tightens the note's content padding for a denser column feel. |
| Hide ribbon button | Off | Hides the open-in-Sidecar button from Obsidian's left ribbon. |
| Hide toolbar button | Off | Hides the open-in-Sidecar button from each note's editor toolbar. The command palette and file-tree right-click still work. |
| Hide pop-in button | Off | Hides the return-to-main-window button from the Sidecar bar. |
| Hide pin button | Off | Hides the always-on-top pin button from the Sidecar bar. |

Leaving a width or height field empty resets it to the default.

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
- The **ribbon icon** (`arrow-up-right`) in Obsidian's left ribbon.
- **Right-click a `.md` file** in the file tree → "Open in Sidecar".
- The **action button** (`arrow-up-right`) in any note's editor toolbar.

From the Sidecar:

- Click the **pop-in button** (`arrow-down-left`) to return the note to a new
  tab in the main window and close the Sidecar.
- Click the **pin icon** to toggle always-on-top.

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
