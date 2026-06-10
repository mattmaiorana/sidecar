# Future plans

Deliberately parked items — **out of scope for v1**, captured here so they're
not lost. Don't build these without a conscious decision to expand scope.

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

The user wants to be able to click an Obsidian internal link and have the target
note open in a new Sidecar window instead of the main editor. This would allow
a note to act as a project launcher: a list of `[[Project Note]]` links, each
of which opens in Sidecar with one click.

Avenues to explore:
- Override the `link` click handler in MarkdownView (intercept `app.workspace.on('active-leaf-change')` or hook into Obsidian's link-resolution layer).
- A custom URI scheme or command palette entry that accepts a note path.
- A special frontmatter tag (`sidecar: true`) that causes the link handler to redirect to Sidecar.
- Context-menu "Open link in Sidecar" on internal links (similar to the existing file-tree right-click entry).

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

The always-on-top pin state is currently in-memory only. On Obsidian reload,
pinned windows lose their pin. To persist: save a set of pinned leaf/file paths
in plugin settings and re-apply `setAlwaysOnTop` in `adoptRestoredSidecar`.

## Restored-popout adoption fingerprinting

`adoptRestoredSidecar` currently adopts *all* markdown leaves in popout windows,
which may accidentally style user-created popouts that aren't Sidecars. A more
targeted approach: inject a `data-sidecar-leaf` attribute on the popout's
`<body>` (or store leaf/file paths in plugin settings) so adoption is opt-in and
precise.

## Other deferred items

- **Search / filter in the list** (if the browser view is restored).
- **Nested subfolder navigation** — v1 lists only direct-child `.md` files.
- **Pinning / last-opened memory per project** — remember the last note opened.
- **OS window snapping** — snap to a screen edge or preset half-width position.
- **Mobile support** — popout windows are desktop-only (`isDesktopOnly: true`).
- **Multiple simultaneous Sidecar windows** — already implemented; this note is
  kept in case the model needs revisiting.
- **Folder picker in settings** — dropdown instead of text path.
- **Note metadata in list rows** — modified time, tags.
- **New note in folder** — affordance from the browser header.
- **Keyboard navigation of the list** — arrow keys + enter.
- **Configurable default window size** in settings.
