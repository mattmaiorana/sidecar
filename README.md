# Sidecar

A **simplified Obsidian popout window** for navigating and editing project notes
while the main window stays untouched. Perfect for parking next to your web
browser.

Window creation uses Obsidian's own popout API (the same mechanism behind "Open
in new window"); the plugin's job is to give that window a clean, narrow, minimal
look and a sensible default size and position.

A nice way to use it: keep a hand-maintained **index note** full of `[[links]]`
to your projects, set it as the **default note**, and open it in a Sidecar with
one keystroke. The Sidecar becomes a self-curated project browser you can use
alongside other apps more easily than the main Obsidian interface.

## How it works

- Open a note in a Sidecar via a command, a ribbon icon, a file-tree
  right-click, or the action button in any note's toolbar.
- There are **two targets**: the **current** note (whatever's active) and a
  configurable **default note**. The default note has its own command, ribbon
  button, and a button in the left sidebar's tab bar — open your index from
  anywhere with one click (or a hotkey you assign).
- Opening a note that's already open in the main window **closes the main-window
  copy first** (pop-out mode), so you're never looking at two copies of the same
  note at once.
- The note opens as a real Obsidian `MarkdownView`, so you get live preview, your
  theme, and your other plugins — full editing, not a stripped-down textarea.
- In the popout **only**, the native chrome (tab bar, view header, status bar,
  ribbon) is hidden and replaced with a minimal top bar. Your main window is
  never affected.
- The top bar can show, depending on your settings:
  - **Back / forward** buttons to move through the note's navigation history —
    handy when you click a `[[link]]` and want to get back.
  - A **home button** that returns the Sidecar to your default note.
  - A **pop-in button** that returns the note to a new tab in the main window and
    closes the Sidecar.
  - A **pin button** that keeps the window above all other apps (handy next to a
    browser). Available when Obsidian's Electron remote API is reachable.
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
| Default note | *(empty)* | Path (vault-relative) opened by the default-note command, ribbon button, and the home button. Type to autocomplete from your notes. Empty = those actions fall back to the current note. |
| Make text smaller | On | Scales note content to 14 px. Inline title: 18 px. Headings scale from h1 (18 px) down to h4–h6 (14 px). Code blocks and inline code: 13 px. Callout titles and properties panel: 14 px. |
| Make padding smaller | On | Tightens the note's content padding for a denser column feel. |
| Show 'open current note' ribbon button | On | The `arrow-up-right` ribbon button that opens the active note. |
| Show 'open default note' ribbon button | On | The `file-text` ribbon button that opens the default note. |
| Show sidebar launcher button | On | A `file-text` button in the left sidebar's tab bar that opens the default note (handy if you hide the ribbon). |
| Show toolbar button | On | The open-in-Sidecar button on each note's editor toolbar. The command palette and file-tree right-click still work. |
| Show pop-in button | On | The return-to-main-window button in the Sidecar bar. |
| Show pin button | On | The always-on-top pin button in the Sidecar bar. |
| Show back and forward buttons | On | Navigation buttons in the Sidecar bar for the note history. |
| Show home button | On | A button in the Sidecar bar that returns to the default note. |
| Re-style popouts on reload | Off | Re-apply Sidecar styling to popout windows Obsidian restores after a reload. |
| Close leftover popouts on reload | Off | After a reload, close the dead duplicate Sidecar popouts Obsidian leaves behind. Shown only when Obsidian's Electron remote API is reachable. |

Leaving a width or height field empty resets it to the default.

## Install (manual)

Not in the community store yet. To install:

1. Download `main.js`, `manifest.json`, and `styles.css` from the
   [latest release](https://github.com/mattmaiorana/sidecar/releases/latest)
   (or build `main.js` from source — see [Development](#development)).
2. Copy all three files into your vault at:
   `<your vault>/.obsidian/plugins/sidecar/`
3. In Obsidian: **Settings → Community plugins**, make sure *Restricted mode* is
   off, then enable **Sidecar**.

## Use

Open the **current** note in a Sidecar any of these ways:

- The command **"Open current note"** (command palette).
- The **ribbon icon** (`arrow-up-right`) in Obsidian's left ribbon.
- **Right-click a `.md` file** in the file tree → "Open in Sidecar".
- The **action button** (`arrow-up-right`) in any note's editor toolbar.

Open your **default** note in a Sidecar:

- The command **"Open default note"** — assign a hotkey to it in
  **Settings → Hotkeys** if you like (no default is set).
- The **ribbon icon** (`file-text`) in Obsidian's left ribbon.
- The **left-sidebar button** (`file-text`) in the sidebar's tab bar, next to
  Files/Search (handy if you keep the ribbon hidden).

If no default note is configured, these fall back to opening the current note.

From the Sidecar (buttons appear per your settings):

- **Back / forward** (`arrow-left` / `arrow-right`) to walk the note history.
- The **home button** (`file-text`) to jump back to your default note.
- The **pop-in button** (`arrow-down-left`) to return the note to a new tab in
  the main window and close the Sidecar.
- The **pin icon** to toggle always-on-top.

## Development

```bash
npm install        # install dev dependencies
npm run dev        # watch build → rebuilds main.js on change
npm run build      # typecheck + minified production build
npm run typecheck  # type-check only
```

The build output is `main.js` in the repo root (git-ignored); `manifest.json` and
`styles.css` are checked in. For live testing, copy `main.js`, `manifest.json`,
and `styles.css` into your vault's `.obsidian/plugins/sidecar/` folder and reload
the plugin in Obsidian (Cmd+P → "Reload app without saving") after each rebuild.
You can confirm the live build by opening the popout's developer console and
reading `document.body.dataset.sidecarBuild`.

Releases are published automatically by `.github/workflows/release.yml` when a
version tag (matching the manifest version, no `v` prefix) is pushed — it builds,
attaches build-provenance attestations, and uploads `main.js` + `manifest.json` +
`styles.css`.

`isDesktopOnly: true` — popout windows are a desktop-only feature.

## License

MIT
