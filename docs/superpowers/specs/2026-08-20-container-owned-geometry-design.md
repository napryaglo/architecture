# Container-Owned Geometry — Geometry-Free View Models

> Sub-project #1 of 2. This spec covers the **Mural framework** cut only.
> Sub-project #2 (Plexus consumers: `ArchNodeVM`, drop factories, layout
> adapter, arch serializer) is a separate spec/plan cycle, gated on this
> being published.

**Goal:** Move node geometry off view-models onto the Figure container, with
a document-owned `id → visual` store as the (virtualization-safe) source of
truth, persisted through a two-section serialization format that separates
content from presentation.

## Background — the smell and how it surfaced

Today a diagram node's geometry lives in two places at once. Geometric shapes
are `Figure`s and carry their own geometry. Content nodes are `NodeViewModel`s
(`text`, `callout`, `side-connectable` in Mural; `ArchNodeVM` in Plexus), and
the VM carries `Left/Top/Width/Height` (plus `SizeToContent`/`UserSized`). The
Diagram wraps each VM in a `Figure` container and `bindContainer` two-way binds
those geometry DPs VM↔container. Serialization then reads geometry straight off
the *item* (`nvm.Left`, …), so the VM must expose geometry or save produces
garbage.

That is a leak: a **content/domain view-model holds visual information**, in
violation of the project's MVVM rules. It surfaced as a real bug in the paged
Size/Position inspector (0.14.0): `SelectionGeometryMirror` gated on
`instanceof Figure`, but `SelectedItems` surfaces the *VM item*, not its Figure
container, so selecting a content node disabled the whole panel. The provisional
fix (target the item's container via `Generator.ContainerFromItem`) is really
the **first step of this redesign**, not a standalone fix — it is committed on
this branch and subsumed here.

## Ownership model

- **View-model = content + identity.** Domain data plus its `Id`. Geometry-blind.
- **Figure container = the visual.** Renders position/size/rotation. It is a
  *projection* of the store, not the durable owner (a container can be destroyed
  under virtualization).
- **Document-owned `id → visual` store = the durable source of truth.** Keyed by
  node id. Survives container recycling; it is what save flushes to disk.
- **`Id` stays on the item** (the VM for a content node; the Figure itself for a
  bare geometric shape). It is the join key between the two on-disk sections and
  the key a container uses to write its geometry back to the store — without it
  there is no way to map a visual record to the object on screen.

## Runtime architecture

### The node-visual store

A Diagram-level collaborator (sibling of `FormatMirror` /
`SelectionGeometryMirror`) owning a `Map<string /*id*/, NodeVisual>`:

```
NodeVisual = {
    left: number; top: number; w: number; h: number;
    rotation: number;
    sizeToContent: boolean; userSized: boolean;
    baseWidth?: number; baseHeight?: number;   // Figure scale reference (shapes only)
}
```

Interface (shape, not final names): `Get(id)`, `Set(id, visual)`, `Remove(id)`,
`Seed(map)` (load), `Snapshot(): Map` (save).

Lives on the **Diagram control** (not the Document): container lifecycle and
write-back are the Diagram's job, and a Diagram used standalone (demos, tests,
no Document) still needs it. The Document coordinates persistence through a
public import/export on the Diagram.

### Two-way container sync

- **On container realize** (`GetContainerForItemOverride` / prepare): resolve
  the item's `Id`, read `store.Get(id)`, apply it to the container's geometry
  DPs, then subscribe to the container's `Left/Top/Width/Height/Rotation`
  (+ size latches) → on change, write back to `store.Set(id, …)`.
- **On container recycle/destroy:** unsubscribe. The store already holds the
  latest geometry (writes are real-time), so nothing is lost; a later
  re-realize reads it back.
- **Interactive edits** (drag, resize, rotate, the Size/Position inspector,
  arrow-key nudge) all mutate the *container* and therefore flow to the store
  through the same write-back. `SelectionGeometryMirror` already targets the
  container, so it is consistent with no further change.
- **Non-interactive writers** (drop factories, layout) compute positions for
  nodes that may have no container yet, so they write `store.Set(id, …)`
  **directly by id**; the container picks the record up when it realizes.

## Serialization — two sections (format v3)

```jsonc
{
  "version": 3,
  "nodes": [ { "id": "n1", "type": "shape", "data": { /* content only */ } } ],
  "visuals": {
    "n1": { "left": 10, "top": 20, "w": 100, "h": 50, "rotation": 0,
            "sizeToContent": false, "userSized": false }
  },
  "connectors": [ /* unchanged */ ],
  "nextId": 7,
  "metadata": { /* unchanged */ }
}
```

- **Save** (always writes v3): `nodes` from each item's serializer
  (`serialize(node) → data`, geometry-free — already only produces the `data`
  bag today); `visuals` from `store.Snapshot()`.
- **Load:** parse; build content nodes from the `nodes` section, assign each its
  `Id`; `store.Seed(visuals)`. Containers apply geometry as they realize.

### `NodeSerializer` contract change

`deserialize(data, base)` currently sets `.Id = base.id` and *places* the node
at `base` geometry. In the new model geometry is not the serializer's concern:

- `deserialize(data): Figure | NodeViewModel` — builds the **content** node only.
  The document assigns `Id` from the record; geometry comes from the store.
- `serialize(node): data` — unchanged (already geometry-free).

This ripples to every in-repo serializer (`shape`, `text`, `callout`); the
Plexus `arch` serializer migrates in sub-project #2.

## Backward compatibility — versioned dual-reader

Save always emits v3. Load detects the shape:

- **v3:** `visuals` section present → read as above.
- **Legacy (V1/V2, no `visuals`):** nodes carry inline `left/top/w/h`. The reader
  **synthesizes** the visual map from that inline geometry (keyed by id) and
  hands the serializer only the content `data`. Also: 0.14.0 shape `data` carried
  `rotation`/`baseWidth`/`baseHeight` inline — the legacy reader **lifts** those
  into the visual record so rotated/scaled shapes survive the format bump.

No migration pass, no destructive rewrite: old files load; the next save
promotes them to v3.

## Component changes (Mural framework)

- **`NodeViewModel`:** remove `Left/Top/Width/Height/SizeToContent/UserSized`
  DPs + accessors. Keep `Id` + content. Subclasses `text-node-vm`,
  `callout-node-vm`, `side-connectable-node-vm` migrate off those DPs (callout
  leader geometry reads the container/store).
- **`Diagram.bindContainer`:** drop the two-way geometry binds; keep
  `Content`/`DataContext`/`Tag`. Add container realize → apply visual + wire
  write-back (via the store). Expose `SetNodeVisual(id, rect)` / `GetNodeVisual`
  (drop/layout write path) and store import/export for the Document.
- **`DiagramDocument._serialize`:** read `visuals` from the store snapshot
  instead of `node.Left…`; `nodes` = content only; emit `version: 3`.
- **`DiagramDocument._deserialize`:** split sections; seed the store; build
  content nodes; keep the V1/V2 legacy branch and add the v3 branch + the
  0.14.0-rotation-lift.
- **`_wireNodeDirty`:** observe container geometry (through the store write-back)
  rather than node geometry; Fill/Stroke dirty-tracking unchanged.
- **`SelectionGeometryMirror`:** already targets the container (this branch) —
  no further change; its VM-node regression tests stay green.

## Data flow

- **Load:** parse → build VMs (content) → `store.Seed` → containers realize →
  apply store record + wire write-back.
- **Edit:** container geometry changes → store write-back → dirty.
- **Drop / layout:** `store.Set(id, rect)` → container realizes/updates from store.
- **Save:** `store.Snapshot()` → `visuals`; serializers → `nodes`; write v3.

## Testing strategy

- **Store:** seed→snapshot round-trip; realize applies the record; a container
  geometry change writes back; a simulated recycle (unwire) preserves the record.
- **Serialization:** v3 round-trip (content and visuals land in the right
  sections); legacy V1/V2 read synthesizes the visual map; a 0.14.0 file with
  `rotation` in `data` lifts it into `visuals`; save always emits v3.
- **VM geometry-blind:** `NodeViewModel` (and subclasses) expose no geometry DPs
  (`Model.HasProperty` false for `Left`/`Top`/`Width`/`Height`).
- **Inspector regression:** the existing `SelectionGeometryMirror` tests
  (Figure path + VM-node path added on this branch) stay green.
- **Full suite:** existing `diagram-document` / serializer tests pass with the
  dual-reader.

## Scope boundaries

- **This spec = Mural framework only.** Ends with a published mural.
- **Sub-project #2 (separate):** Plexus `ArchNodeVM`, the three drop factories,
  the layout graph adapter, and the arch serializer onto the new store API; bump
  mural.
- **Visual section = the geometry base record** (+ rotation + size latches +
  optional shape scale reference). Each node's type-specific `data` (fill,
  stroke, caps, text, …) stays where it is; this redesign does not pull all of
  presentation into the visual section.
- **Virtualization is designed-for, not implemented.** The items panel stays an
  eager `Canvas`. The store makes virtualization *safe to add later* without a
  persistence rework — that is the whole reason the store, not the container, is
  the durable owner.

## Risks / notes

- The `NodeSerializer.deserialize` signature change touches all in-repo
  serializers; the Plexus arch serializer is updated in #2, so mural must be
  published before Plexus builds against the new contract.
- Connector endpoints reference node ids (unaffected). Connector waypoints are
  visual but out of scope — they stay in the connector record.
- Group nodes have no serializer (already skipped); no geometry-store entry.
