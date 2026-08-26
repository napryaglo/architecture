# Undo / Redo — Design

**Date:** 2026-08-26
**Status:** Approved (brainstorming) — pending implementation plan
**Scope:** mural (the history engine + diagram layer + keybinding) and Plexus
(the TODL model layer + e2e). One design; implementation spans both repos.

## Context

Neither mural nor Plexus has any undo/redo, transaction, or change-tracking
infrastructure today. Mural does have two reusable seams:

- `DiagramDocument._serialize()` / `_deserialize()` — a full-document v3
  round-trip (nodes, connectors, per-node geometry/style visuals, metadata).
- A dirty-tracking layer (`_trackEdits` / `_wireNodeDirty` /
  `_wireConnectorDirty` / `_wireContainerDirty` / `_wireEndpointDirty`) already
  subscribed to every DP and collection seam that constitutes "an edit".

Plexus architecture diagrams entangle two layers. Some edits are pure-visual
(move, resize, style, plain delete, connector routing) and live only in the
`.diagram` file. Others mutate the TODL model and save it: drag-reparent
(containment `in` ref), Shift+Delete (entity remove), connector draw/mint,
F2 rename (`label` field), and drop-create. Model mutations go through
`ArchModel`'s six methods (`create`, `setField`, `addRef`, `removeRef`,
`remove`, `createInViewpoint`), each firing `onChanged` → the binding's
`rescan()` re-projects the diagram.

A single user action can therefore touch *both* layers (a drag-reparent changes
a figure's position **and** a containment ref). Undo must reverse both as one
step.

## Goals

- Per-document undo/redo covering **both** visual edits and model-mutating edits
  (decision: pull model edits into phase 1).
- A **generic** history engine (decision: hybrid — a reversible-entry stack)
  with a single extension seam, so the diagram layer is native and the TODL
  model layer plugs in; future document types or layers can plug in the same
  way.
- **Per-document, in-memory, session-only** history (decision). Not persisted
  across restarts; cleared on document close.
- One entry per coherent user action (gesture-level coalescing), correct linear
  history, redo cleared on new edits.
- Pure mural diagrams (no model layer) get visual-only undo with zero Plexus
  involvement.

## Non-Goals

- Persisting history across app restarts or in the `.diagram` file.
- A global (cross-document) undo stack. History is per `DiagramDocument`.
- Collaborative / multi-user operational transforms.
- Undoable selection changes, viewport/zoom, or panel state — only document
  content edits are recorded.

## Architecture

A generic `DiagramHistory` engine owned per `DiagramDocument`, in mural. It
records **transactions**; each committed transaction that changed something
produces one `HistoryEntry`. The engine knows how to snapshot the **diagram
layer** natively (via `_serialize`/`_deserialize`). Everything else plugs in
through one seam, `IHistoryLayer`, which Plexus implements for the TODL model.

```
DiagramDocument (mural)
  └── DiagramHistory                  // the engine: stack + transactions
        ├── diagram layer (native)    // capture=_serialize, restore=_deserialize
        └── IHistoryLayer[]           // registered external layers
              └── ModelHistoryLayer   // Plexus: capture=toTodlByFile, restore=ArchModel.restore + rescan
```

One user action → `Begin(label)` … edits … `Commit()` → at most one
`HistoryEntry` spanning whichever layers actually changed.

### Interfaces (mural)

Real enums, not string unions, per repo convention (e.g. a `HistoryLayerId`
enum keys registered layers). Sketches:

```ts
// One reversible step. Holds, per changed layer, the before/after snapshot.
interface HistoryEntry {
    readonly label: string;                       // e.g. "Move", "Rename", "Reparent"
    undo(): void;                                 // restore "before" for each stored layer
    redo(): void;                                 // restore "after"  for each stored layer
}

// A pluggable snapshot layer. Snapshots are opaque to the engine.
interface IHistoryLayer {
    readonly id: HistoryLayerId;                  // Diagram | Model | …
    capture(): unknown;                           // cheap, synchronous snapshot
    equals(a: unknown, b: unknown): boolean;      // to detect "did this layer change?"
    restore(snapshot: unknown): void;             // apply a snapshot
}

class DiagramHistory {
    Begin(label: string): void;                   // ref-counted; nested Begins join
    Commit(): void;                               // at depth 0: build + push entry
    Abort(): void;                                // discard the open transaction
    Undo(): void;
    Redo(): void;
    get CanUndo(): boolean;                       // observable (DP) for the keybinding
    get CanRedo(): boolean;
    RegisterLayer(layer: IHistoryLayer): () => void;   // returns an unregister thunk
    // config: max stack depth (default 100)
}
```

The **diagram layer** is registered by the engine itself: `capture()` returns
`_serialize()`; `restore(s)` calls `_deserialize(s)`; `equals` compares the
serialized payloads (structural/string compare of the JSON).

### Transaction mechanics

- `Begin(label)` increments a depth counter. On the **outermost** Begin (0→1)
  it captures a "before" snapshot from every registered layer and remembers the
  label.
- Nested `Begin`s (a Plexus model handler firing inside a mural gesture) just
  increment depth and **join** the open transaction. The **outermost** Begin's
  label is the entry's label (the gesture that started the action names it).
- `Commit` decrements depth. At **depth 0** it captures an "after" from each
  layer, keeps only the layers where `!equals(before, after)`, and:
  - if no layer changed → discard (no entry);
  - else → build a `HistoryEntry` bundling the changed layers' before/after,
    push it, clear the redo stack, evict the oldest if over the cap.
- `Abort` discards without pushing (used on gesture cancel / Escape).
- Safety net: if a registered layer changes while **no** transaction is open
  (an un-bracketed edit), the engine auto-opens a transaction and commits it at
  microtask end, coalescing synchronous programmatic edits into one entry.

### Undo / redo

- `Undo`: pop the top entry, call `entry.undo()`, push it to the redo stack.
- `Redo`: pop the redo stack, call `entry.redo()`, push back to undo.
- `undo()`/`redo()` restore each stored layer. When an entry spans both layers,
  restore order is fixed (see Model layer): model draft swap (no rescan) →
  diagram `_deserialize` → a single `rescan()`.
- Undo/redo run **inside a suppression flag** so the restores they perform do
  not themselves open new transactions or clear redo.

## Coalescing — where transactions bracket

| Edit | Origin | Bracket |
|------|--------|---------|
| Drag-move, resize, rotate | mural interaction behaviors | `Begin` on pointer-down, `Commit` on pointer-up, `Abort` on cancel |
| Connector re-route (waypoint / endpoint drag) | mural connector-interactions behavior | same gesture bracket |
| Group / Ungroup / Wrap / Unwrap / Combine / DeleteNodes / DeleteConnectors / CreateNode / CreateConnector / Paste | `DiagramMutator` methods on `DiagramDocument` | each method wraps itself |
| Drop-create entity | Plexus drop factory | handler brackets |
| F2 rename commit | Plexus `ArchNodeVM` label-commit | handler brackets |
| Drag-reparent, connector-draw, Shift+Delete | mural gesture/key already open → Plexus handler **joins** | no new bracket; captured by the open transaction |
| Anything un-bracketed | — | microtask safety-net transaction |

Because the engine snapshots *all* layers at Begin/Commit and drops unchanged
ones, a joiner never has to explicitly "enlist" — whatever changed in either
layer during the open transaction is captured.

## Model layer (Plexus)

`ModelHistoryLayer implements IHistoryLayer` (id `HistoryLayerId.Model`),
registered on a document's `DiagramHistory` when `ArchDiagramBinding` attaches,
unregistered on detach.

- `capture()` → `model.toTodlByFile()` — a `Map<uri, text>` of the project's own
  `.todl` files (bases are stable and excluded). Cheap; strings.
- `equals(a, b)` → compare the two maps' texts.
- `restore(snapshot)` → `ArchModel.restore(fileTexts)` (new method): re-parse the
  given file texts, recompose the draft against the unchanged bases, **without**
  firing `onChanged` yet; the entry's restore sequencing then triggers exactly
  one `rescan()` and one `save()`.

**Restore order for a two-layer entry** (fixed, to avoid projection fighting the
restored visuals):

1. Model layer: swap the `ArchModel` draft from the snapshot text — no rescan.
2. Diagram layer: `_deserialize` the diagram snapshot (node positions, parentIds,
   free connectors, styles).
3. One `rescan()` reconciles model-derived labels / edges / containment against
   the just-restored visuals. `projectContainment` is reconcile-only (nesting
   already in the visual store), so positions are preserved.
4. `model.save()` writes the restored `.todl` text (authoritative, last).

`ArchModel.restore(fileTexts: Map<uri,string>): void` is the one new model
method: rebuild `this.draft` from `fromSources(bases, parsedTexts)` and leave
firing to the caller (the restore sequence fires a single rescan).

## Keybinding

Ctrl+Z (undo) / Ctrl+Shift+Z (redo) handled in `Diagram.OnKeyDown`, next to the
existing Ctrl+C/X/V/G, gated on `CanUndo`/`CanRedo`, routed to the active
document's `DiagramHistory`. Context-menu / toolbar entries are out of scope for
this pass but the `CanUndo`/`CanRedo` DPs make them trivial to add later.

## Edge cases

- **Redo invalidation:** any new committed edit clears the redo stack.
- **Stack cap:** default 100 entries; oldest evicted on overflow. Session-only,
  in-memory; freed on document close.
- **Multi-document:** one `DiagramHistory` per `DiagramDocument`; fully isolated.
  The keybinding routes to the focused document's history.
- **Save timing:** model `save()` stays fire-and-forget during normal edits;
  undo/redo write the authoritative restored text last, so an in-flight save is
  superseded safely.
- **Non-arch diagrams:** no model layer registered → visual-only undo, no Plexus
  code involved.
- **No-op transactions:** discarded (e.g. a click that selects but edits
  nothing, or a drag that returns to origin and leaves the payload unchanged).
- **Reentrancy:** undo/redo restores run under a suppression flag so they never
  record themselves.

## Testing

**Mural (unit, `node:test` in `tests/` subfolders):**
- Engine with a fake layer: ref-counted nesting joins into one entry;
  coalescing (many changes in one transaction → one entry); undo/redo/redo;
  redo cleared on new edit; cap eviction; no-op discard; changed-layer
  detection via `equals`; suppression during restore.
- Diagram layer round-trip against real `_serialize`/`_deserialize`: move →
  undo restores geometry; add/delete node → undo restores the collection;
  style edit → undo restores fill/stroke.

**Plexus (unit, vitest in `tests/` subfolders):**
- `ArchModel.restore` round-trip: mutate → capture → mutate again → restore →
  entities/fields/refs match the captured state.
- `ModelHistoryLayer` capture/equals/restore over a fake `ArchModel`.
- Binding registers the layer on attach and unregisters on detach.

**Plexus (live e2e, Playwright/Electron, corpus-gated):**
- Open an architecture diagram; perform move → F2 rename → drag-reparent; press
  Ctrl+Z three times; assert the diagram *and* the `.todl` model revert one step
  at a time; then Ctrl+Shift+Z replays them.

## File touch list

**Mural**
- `src/framework/diagram/history/diagram-history.ts` (new) — engine + transaction
  logic + `HistoryEntry` / `IHistoryLayer` + `HistoryLayerId` enum.
- `src/framework/diagram/diagram-document.ts` — own a `DiagramHistory`, register
  the native diagram layer, expose it; ensure `_deserialize` is safe to call
  under suppression.
- `src/framework/diagram/behaviors/attach-standard-mutations.ts` and the
  interaction behaviors (drag/resize/connector) — bracket transactions.
- `src/framework/diagram/diagram.ts` — Ctrl+Z / Ctrl+Shift+Z in `OnKeyDown`;
  route to the document's history.
- `src/framework/diagram/history/tests/*` — engine + round-trip tests.

**Plexus**
- `src/renderer/src/modules/architecture-projects/services/model-history-layer.ts`
  (new) — `ModelHistoryLayer`.
- `.../services/arch-model.ts` — `restore(fileTexts)`.
- `.../services/arch-diagram-binding.ts` / `arch-diagram-binding-service.ts` —
  register/unregister the layer; bracket the Plexus-initiated model actions
  (drop-create, rename) and let gesture-driven ones join.
- `e2e/undo-redo.spec.ts` (new) — the live sequence test.
- Corresponding `tests/` unit tests.
