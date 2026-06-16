# Future plans

Deliberately parked items — captured here so they're not lost. Don't build
these without a conscious decision to expand scope.

---

## Up next — ship to GitHub + Obsidian community list

Concrete, ordered plan for publishing v1.1.0. **Paused before Phase B** at the
user's request (2026-06-14) — no remote, push, release, or PR exists yet.

### Pre-flight state (done 2026-06-14)
- Added `LICENSE` (MIT, Matt Maiorana, 2026) — Obsidian review expects a license
  file; `package.json` already declared MIT but no file existed.
- Renamed `package.json` `"name"` → `obsidian-sidecar` (Obsidian ignores this
  field; it just matches the folder/repo now).

### Environment facts (verified 2026-06-14)
- `gh` authed as **mattmaiorana** with `repo` + `workflow` scopes — enough to
  create the repo, push, and cut a release.
- `main` is the branch; clean. No `origin` remote yet. No git tags yet.
- Submission assets present: `manifest.json` (id `sidecar`, version `1.1.0`,
  minAppVersion `1.5.0`, `isDesktopOnly`), `versions.json`, `README.md`,
  `CHANGELOG.md`, and now `LICENSE`. There is **no `styles.css`** (by design).
- Plugin **id `sidecar` is free** in the community list (checked the 4,770-entry
  `obsidianmd/obsidian-releases/community-plugins.json` — no exact `id` match).
  The *name* "Sidecar" is somewhat generic (≈5 other "sidecar-ish" plugins by
  name), so reviewers could nudge on it, but it's submittable as-is.

### Phase B — create the GitHub repo (outward-facing)
```
gh repo create mattmaiorana/obsidian-sidecar --public --source=. --remote=origin --push
```
Creates `origin`, pushes `main`. Must be **public** for community submission.

### Phase C — cut the 1.1.0 release (required before the community PR validates)
1. `npm run build` → produces `main.js` (git-ignored; built fresh each release).
2. ```
   gh release create 1.1.0 main.js manifest.json --title "1.1.0" --notes-file CHANGELOG.md
   ```
   - Tag **must equal the manifest version exactly** — `1.1.0`, **no `v` prefix**.
   - Attach `main.js` + `manifest.json` as **individual binary assets** (the
     community bot validates release assets, not the source tree). No
     `styles.css` to attach.

### Phase D — submit to the community plugins list
**Process likely changed (per user, 2026-06-14):** Obsidian now reportedly lets
you **link the GitHub repo** and an automated checker reads from it and handles
the release once it passes — no manual fork/PR. **Confirm the current flow**
(Obsidian developer docs / submission page) before doing anything below; the
fork-and-PR steps are kept only as a fallback if the new flow isn't available.

_Fallback (old flow):_ fork `obsidianmd/obsidian-releases`, append to
`community-plugins.json`, open a PR. Entry:
```json
{
  "id": "sidecar",
  "name": "Sidecar",
  "author": "Matt Maiorana",
  "description": "Opens a tall, narrow popout window that acts as a portable mini-Obsidian for navigating and editing project notes, while the main app stays untouched.",
  "repo": "mattmaiorana/obsidian-sidecar"
}
```
The PR triggers Obsidian's automated validation bot plus a manual review.

---

## Folder-listing browser view

`ProjectBrowserView` was implemented and then removed in the v1 simplification
(recoverable from git history — last present in the commit before "Simplify:
remove dead code, drop snap width, add pin button"). It was an `ItemView` that
listed direct-child `.md` files in the configured folder and let you click
through to edit them in the same leaf, with vault event listeners to keep the
list live. Options for later:

- Revisit as a full project browser with folder navigation.
- Delete the history and commit to note-only mode if the list adds more
  complexity than value.

## Internal-link → Sidecar opener

**Partly realized** by the **default note** feature (1.1.0): a hand-maintained
index note of `[[links]]`, opened as a Sidecar via hotkey/ribbon/home button, is
now the durable "project launcher." You navigate *within* that one Sidecar using
its back/forward and home buttons rather than spawning a new window per link.
What's still unbuilt is making an individual internal-link click open the target
in a *separate* Sidecar window.

The user wants to be able to click an Obsidian internal link and have the target
note open in a new Sidecar window instead of the main editor. This would allow
a note to act as a project launcher: a list of `[[Project Note]]` links, each
of which opens in Sidecar with one click.

Avenues to explore:
- Override the `link` click handler in MarkdownView (intercept `app.workspace.on('active-leaf-change')` or hook into Obsidian's link-resolution layer).
- A custom URI scheme or command palette entry that accepts a note path.
- A special frontmatter tag (`sidecar: true`) that causes the link handler to redirect to Sidecar.
- Context-menu "Open link in Sidecar" on internal links (similar to the existing file-tree right-click entry).

## macOS menu-bar item / system-wide trigger

Goal: open the **default note** in a Sidecar from *outside* Obsidian's window —
ideally even when Obsidian isn't focused. Obsidian's own API can't do this; the
only menu-bar-ish API it exposes is `addStatusBarItem()`, which is the bar
*inside* the Obsidian window, not the macOS menu bar. The only route is to reach
Electron directly — the **same `@electron/remote` door the pin button already
uses** (`getRemoteModule()` in `window-manager.ts`, gated on reachability).

Two viable mechanisms (treat as opt-in, remote-gated like the pin button):

- **Status-bar item (top-right of the macOS menu bar): Electron `Tray`.** Best
  fit for the "launch my index from anywhere" workflow — a persistent icon that
  pops the default note into a Sidecar.
  - `new remote.Tray(icon)` with a monochrome **template** `nativeImage`
    (`setTemplateImage(true)`); click handler or small context menu → the same
    `openDefaultNote()` path.
  - **Hold a reference and `destroy()` it in `onunload`** — otherwise reloads
    leave orphaned/duplicate icons.
  - The click handler is a renderer function invoked from the main process via
    `@electron/remote` — it works, but remote callbacks are a known rough edge.
  - Only *acts* while Obsidian is running; it won't relaunch Obsidian if quit.

- **System-wide hotkey: `remote.globalShortcut`.** Fires even when Obsidian is
  unfocused (today's `Mod+Shift+S` only works when Obsidian has focus). No icon
  to manage; lighter than a Tray. Pairs well *with* the Tray (icon for
  discoverability, hotkey for speed). Must `unregister` on unload.

- **Skip:** appending to Obsidian's own app menu (`Menu` / `setApplicationMenu`).
  Obsidian owns and rebuilds that menu, so additions get clobbered — too fragile.

**Caveats before building:** none of this is Obsidian's public API, so it's
fragile across Obsidian/Electron updates; and it's a **community-review risk** —
reviewers scrutinize `@electron/remote` / direct Electron use. The plugin already
uses remote for pin, but a Tray/globalShortcut widens that surface, so this
should ship as a **post-1.1.0** feature, *not* folded into the submission.

## Magnetic width snap

The custom resize handle (pointer-capture drag on the right edge) with a
snap-to-default detent was implemented and then removed (too complex, caused
occasional macOS beachballs). Approach was:

- A `div.sidecar-resize-handle` injected at `body` level, `position: fixed`,
  covering the right 16px of the window.
- `pointerdown` → `setPointerCapture` → `pointermove` → RAF-throttled
  `win.resizeTo(w, h)` where `w` snaps to `DEFAULT_WIDTH` when within
  `WIDTH_SNAP_PX` px.
- `pointerup` / `pointercancel` → release capture, save bounds.

If revisited: the key insight is to do snap math *before* calling `resizeTo`
(proactive, not reactive) so there is no OS-resize feedback loop.

## Pin state persistence

The always-on-top pin state is in-memory only. On Obsidian reload, pinned windows
lose their pin. To persist: save a set of pinned file paths in plugin settings and
re-apply `setAlwaysOnTop` when a Sidecar is restored — which requires the
restore-adoption feature below.

## Safe restore adoption (was removed)

The plugin used to run `adoptRestoredSidecar()` on `onLayoutReady` to re-skin
Sidecar popouts that Obsidian restored from the previous session. It was removed
because it adopted *all* markdown popouts — including the user's own native
"Open in new window" popouts — and forcibly shrank them to 375px and stripped
their chrome on every reload. Today a restored Sidecar simply comes back as a
plain popout (reopen to re-skin).

To re-add it safely it must only touch *our* windows. Approaches:
- Persist the set of Sidecar file paths in settings, and on restore only adopt
  popouts showing one of those files (imperfect — the same note could be in a
  user popout).
- Look for a marker that survives Obsidian's serialize/restore. The injected
  `<style>` and `body` class do **not** survive (the popout DOM is rebuilt), so
  this needs a leaf-level or settings-level identity, not a DOM marker.

## Other deferred items

- **Search / filter in the list** (if the browser view is restored).
- **Nested subfolder navigation** — v1 lists only direct-child `.md` files.
- **Pinning / last-opened memory per project** — remember the last note opened.
- **OS window snapping** — snap to a screen edge or preset half-width position.
- **Mobile support** — popout windows are desktop-only (`isDesktopOnly: true`).
- **Folder picker in settings** — dropdown instead of text path (only relevant
  if a folder setting is re-introduced).
- The following items are contingent on the folder-browser view being restored:
  search/filter, nested subfolder navigation, note metadata in list rows (modified
  time, tags), new-note affordance in the browser header, keyboard navigation of
  the list (arrow keys + enter), per-project last-opened memory.
