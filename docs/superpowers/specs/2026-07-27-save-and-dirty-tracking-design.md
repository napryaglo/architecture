# Global Dirty-Tracking + Save / Save All — Design

**Date:** 2026-07-27
**Status:** Approved (pending spec review)
**Spans:** `@pragmatic-lab/mural` (framework core) + Plexus (app wiring)

## Goal

A Visual-Studio-style save experience: track which open documents have unsaved
changes, and provide global **Save** (active document) and **Save All** (every
dirty document) commands on the toolbar, plus a dirty indicator on tabs and
`Ctrl+S` / `Ctrl+Shift+S` shortcuts. The existing project-explorer "Save active"
button is folded into this new, host-owned mechanism.

## Context (current state)

- The framework already defines `IDocument` (`Id` / `Title` / `IsDirty` /
  `Save()`) and `DocumentsContentHostService`, which owns `OpenDocuments`,
  `ActiveDocument`, and a `Save(document?)` that delegates to `IDocument.Save()`.
- Every concrete document is a `Model` with a reactive `IsDirty` DP
  (`CodeDocument.IsDirty = Content !== savedContent`; `DiagramDocument` similar).
- The editor `IDocumentFactory.saveFile(doc)` implementations are thin wrappers
  over `doc.Save()` (the diagram one additionally awaits its storage flush).
- Toolbar commands are context-filtered `CommandDefinition`s dispatched to the
  **active document** via `ICommandTarget` — a per-document model that does NOT
  fit a cross-document "Save All". So Save/Save All are modelled as **host-level**
  commands (like the existing `CloseAllCommand`), not `CommandDefinition`s.
- Plexus's `ProjectExplorerService` owns a `SaveActiveCommand` that routes the
  active doc through its project's factory `saveFile` (needing `docOwners` /
  `docPaths` maps), surfaced as a `PanelButton` in the explorer side pane.

## Decisions

1. **Visibility:** global — Save / Save All surface whenever ANY document is
   active (code, diagram, `.todl`). No new command context.
2. **Ownership:** dirty aggregation + Save/Save All commands live on the
   framework `DocumentsContentHostService`. Surfacing (command-bar cluster + tab
   indicator) lives in the framework shell/tab templates so any `EditorShell`
   app inherits it. Shortcuts + icon resources + removing the old explorer save
   live in Plexus.
3. **Persistence path:** through the existing `IDocument.Save()` contract. Save
   no longer routes through the project/editor factory, so the project→factory
   lookup for saving is removed.

## Components

### 1. Dirty tracking — `DocumentsContentHostService` (framework)

- New read-only DP `AnyDirty: boolean`.
- The host maintains a set of per-document `IsDirty` subscriptions. On every
  `OpenDocuments` change it reconciles subscriptions (subscribe new docs,
  unsubscribe removed), duck-typing the observable surface:

  ```ts
  interface DirtyObservable {
      AddPropertyChangedListener?: (key: unknown, cb: () => void) => void;
      RemovePropertyChangedListener?: (key: unknown, cb: () => void) => void;
  }
  ```

  It listens on the document's `'IsDirty'` property. A doc that isn't a `Model`
  (no listener API) simply contributes its static `IsDirty` with no live updates.
- Any dirty change (or open-set change, or `ActiveDocument` change) recomputes
  `AnyDirty` and calls `RaiseCanExecuteChanged` on the two commands.

### 2. Save / Save All commands — `DocumentsContentHostService` (framework)

- `SaveActiveCommandKey` — `RelayCommand`:
  - Execute: `void this.Save()` (saves `ActiveDocument`), swallowing the async
    result (fire-and-forget; errors are the document's concern).
  - CanExecute: `this.ActiveDocument?.IsDirty === true`.
- `SaveAllCommandKey` — `RelayCommand`:
  - Execute: `void this.SaveAll()` where `SaveAll()` awaits `doc.Save()` for
    each `OpenDocuments` entry whose `IsDirty` is true.
  - CanExecute: `this.AnyDirty`.
- `Save()` returns the `IDocument.Save()` promise so callers may await; `SaveAll()`
  awaits each in turn.

### 3. Save() completeness — concrete documents

- The host awaits the `IDocument.Save()` return value when it is a promise
  (`CodeDocument.Save()` is `async`), and treats a `void` return as immediately
  done (`DiagramDocument.Save()` clears its dirty flag synchronously and kicks an
  async storage write). No concrete-document change is required: the dirty flag
  is the user-visible signal and it clears correctly in both cases. (A full
  flush-await for the diagram would require exposing `WhenWritten()` on the
  `DiagramStorage` interface — deferred; the old "Saved N nodes" status that
  needed it is dropped anyway.)

### 4. Toolbar surfacing — shell command-bar template (framework)

- Add a fixed **leading** cluster to `@DefaultEditorShell`'s `PART_CommandHost`
  (mirroring the existing docked-right `ShellControls` region): two icon buttons
  bound to `$service(ContentHostService).SaveActiveCommand` /
  `SaveAllCommand`, each with `Command`-driven enablement.
- Icons: `@Save` / `@SaveAll` via `DynamicResource`, resolved from app
  resources (the established pattern — the framework ships no icons). The cluster
  collapses when `$service(ContentHostService).ActiveDocument` is undefined
  (`Visibility` bound through a null→collapsed converter), so a bare shell shows
  nothing.

### 5. Tab dirty indicator — `@DocumentTabHeaderTemplate` (framework)

- The header renders `title` + a close `IconButton` (glyph `@IconClose`). Add a
  filled dot `Shape` BEFORE the title whose `Visibility` binds
  `$IsDirty << ToVisibility` (visible only when the document is dirty). The close
  `✕` stays always present. (`$IsDirty` binds against the document `Model`,
  reactive; a clean doc shows just title + ✕, a dirty one shows `• title ✕`.)
  The dot geometry is a small framework-defined circle resource (`@IconDirtyDot`),
  alongside the existing `@IconClose`. The VS-Code hover-swap (dot ⇄ ✕) is
  deferred — it fights tab-hover trigger precedence for marginal value.

### 6. Keyboard shortcuts — Plexus composition root

- A small window-level handler (in `main.js`, or a tiny service it constructs)
  registers a **capture-phase** `keydown` listener on `window`:
  - `Ctrl+S` (no Shift) → `host.SaveActiveCommand.Execute()`, `preventDefault()`.
  - `Ctrl+Shift+S` → `host.SaveAllCommand.Execute()`, `preventDefault()`.
  - Only these two chords are intercepted; everything else passes through.
- Capture phase at `window` is required so the chord fires before Monaco's own
  handlers AND before the code-editor host's key-swallow boundary (added for the
  F2/focus fix) — otherwise `Ctrl+S` would never escape a focused editor.
- The handler no-ops (does not `preventDefault`) when the command's `CanExecute`
  is false / there is no active document, so nothing is swallowed spuriously.

### 7. Fold the explorer save — Plexus

- Delete `ProjectExplorerService.SaveActiveCommand` (DP + `RelayCommand` +
  `saveActive()`), and the `PanelButton [ Command = $SaveActiveCommand ]` in
  `project-explorer.resources.mu`. The toolbar Save (host command) replaces it.
- The `@Save` icon dictionary entry stays (reused by the toolbar); add `@SaveAll`.
- Saving no longer needs the project/factory route; the `docOwners` / `docPaths`
  maps remain only for their other uses (close-cleanup, rename re-point) — remove
  only the save-specific dependency.

## Data flow

```
user edits ─► document.IsDirty = true (DP)
                   │
                   ├─► tab header $IsDirty binding ─► shows •
                   └─► host IsDirty listener ─► recompute AnyDirty
                                                     │
                          Save/SaveAll CanExecute ◄──┘ (buttons enable)

Save   (toolbar / Ctrl+S)        ─► host.Save()    ─► activeDoc.Save()
Save All (toolbar / Ctrl+Shift+S)─► host.SaveAll() ─► every dirty doc.Save()
                   │
        each Save() persists + flushes ─► IsDirty = false ─► • clears, buttons disable
```

## Error handling

- `Save()` / `SaveAll()` surface a document's own persistence errors through the
  returned promise; the fire-and-forget command executors swallow rejections so a
  failed save doesn't crash the shell. (Per-document error reporting — status
  toasts — is out of scope here; the dirty indicator simply stays set on failure.)
- Unknown / non-Model documents contribute a static `IsDirty` with no live
  updates — degrades gracefully (no crash), matching the host's existing
  duck-typed tolerance.

## Testing

**Framework (mural) unit tests:**
- Dirty aggregation: `AnyDirty` is false with a clean set; flips true when an
  open doc goes dirty; flips back when all clean; re-reconciles when a dirty doc
  is removed (`AnyDirty` recomputed) and when a dirty doc is added.
- `SaveActiveCommand.CanExecute` tracks `ActiveDocument?.IsDirty` (and requeries
  on active-document change); executing it calls the active doc's `Save()`.
- `SaveAllCommand.CanExecute` tracks `AnyDirty`; executing it calls `Save()` on
  exactly the dirty docs (a spy set of docs records which got saved).
- Tab-header / command-bar visuals: covered by manual smoke (template chrome).

**Plexus tests:**
- Shortcut handler: a synthetic `Ctrl+S` keydown invokes Save; `Ctrl+Shift+S`
  invokes Save All; an unrelated chord does neither and isn't `preventDefault`ed.
- Existing `project-explorer-service` tests still pass after `SaveActiveCommand`
  removal (no test depended on it beyond the save-routing test, which moves/goes).

**Manual smoke (`npm run dev`):**
- Edit a code doc → tab shows `•`, Save + Save All enable. `Ctrl+S` saves, `•`
  clears, buttons disable. Edit two docs, `Ctrl+Shift+S` saves both. Toolbar
  buttons appear only while a document is active. Diagram edits save too.

## Out of scope (YAGNI)

- Save-status toasts / a status-bar "Saved" message (the dirty indicator is the
  feedback).
- Close-with-unsaved-changes prompts (a separate concern; not requested).
- Per-project "Save project" (manifest) — unaffected; this is document save.
