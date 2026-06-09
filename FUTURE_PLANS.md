# Future plans

Deliberately parked items — **out of scope for v1**, captured here so they're not
lost. Don't build these without a conscious decision to expand scope.

## v1 parked: folder-listing browser view

`ProjectBrowserView` (`src/project-browser-view.ts`) implements a folder listing
that shows direct-child `.md` files and lets you click through to edit them in
the same leaf (with a "← All" back button). v1 was simplified to nail a
single-note popout experience first. Options for v2:

- Revisit as a full project browser with folder navigation.
- Delete the code if the note-only model proves sufficient and the list adds
  more complexity than value.

## Explicitly deferred from v1

- **Search / filter in the list.** A quick filter box to narrow the project list.
- **Nested subfolder navigation.** v1 lists only the direct-child `.md` files of
  the configured folder. Future: descend into subfolders with breadcrumb-style
  navigation, while keeping the "one leaf, swapped contents" model.
- **Pinning / last-opened memory per project.** Remember the last note opened (or
  let the user pin one) and jump straight to it when Sidecar opens.
- **OS window snapping.** Snap the popout to a screen edge / preset half-width
  column position, beyond just restoring saved bounds.
- **Mobile support.** Popout windows are desktop-only; `isDesktopOnly: true`.
  No mobile work planned.
- **Multiple simultaneous Sidecar windows.** v1 manages exactly one popout +
  one leaf. Supporting several at once would change the window-manager model.

## Possible later niceties (not committed)

- Folder picker (dropdown of vault folders) in settings instead of a text path.
- Show note metadata (modified time, tags) in the list rows.
- A "new note in this folder" affordance from the browser header.
- Keyboard navigation of the list (arrow keys + enter).
- Remember which view-state (list vs. last file) the window was in on close.
- Configurable default window size in settings.
