# Figure as the Universal Node Host — Container-Owned Geometry & Geometry-Free View Models

**Goal:** Make `Figure` the single visual host for every diagram node —
owning all geometry-derived behaviour — and reduce view-models to pure content.
Geometry becomes a document-owned, virtualization-safe `id → visual` store,
persisted through a serialization format that separates content from
presentation.

This is a multi-slice redesign. The end-state is described first; the
**Decomposition** section splits it into independently shippable slices, each
with its own plan/implementation cycle. Only slice #1 is planned immediately.

## Background — the smell and how it surfaced

A diagram node's geometry lives in two places at once. Geometric shapes are
self-painting `Figure`s and carry their own geometry. Content nodes are
`NodeViewModel`s (`TextNodeVM`, `CalloutNodeVM`, Plexus `ArchNodeVM`), and the
VM carries `Left/Top/Width/Height` (+ `SizeToContent`/`UserSized`). The Diagram
wraps each VM in a `Figure` container and two-way binds those DPs VM↔container;
serialization then reads geometry straight off the *item*.

That is a leak — a content/domain view-model holding visual information, against
the project's MVVM rules. It surfaced as a real bug in the paged Size/Position
inspector (0.14.0): `SelectionGeometryMirror` gated on `instanceof Figure`, but
`SelectedItems` surfaces the *VM item*, not its container, so selecting a content
node disabled the panel. The provisional fix (resolve the item to its container
via `Generator.ContainerFromItem`) is the **first step of this redesign** and is
committed on this branch.

Pulling that thread revealed a deeper duplication: `Figure` *already* owns
geometry, silhouette paint, hit-testing, the side-endpoint host, and port
resolution. `NodeViewModel`/`SideConnectableNodeVM` re-implement the geometric
half of that for VM-backed nodes. The redesign removes the duplication by making
the Figure container the one host for every node.

## End-state architecture

### The node model

- **Figure-based nodes** — self-drawing, own geometry. Geometric shapes,
  **Text** (a shapeless/boxed Figure carrying a `ShapeText`), and **Callout**
  (a Figure with a leader line + text). The item *is* the Figure.
- **Content view-models** — geometry-blind, data-driven. Genuinely templated
  content, e.g. Plexus `ArchNodeVM` (icon + label bound to a model entity). The
  item is a VM; the Diagram wraps it in a Figure container.

### Ownership

- **`Figure` is the single visual host for every node** — geometry, silhouette
  paint, hit-testing, the side-endpoint host (`_sideHost`), and ports
  (`PortProvider`/`Kind`). For a geometric/Text/Callout node the item is the
  Figure; for a content node the *container* Figure plays the host.
- **View-model = content + identity.** Domain data + `Id`, plus a
  `PortProvider`/`Kind` hint it hands its container. No geometry, no host role.
  `Id` is the join key between the two on-disk sections and the key a container
  uses to write geometry back — without it there is no way to map a visual
  record to the object on screen.
- **Document-owned `id → visual` store = the durable source of truth.** Keyed by
  node id; survives container recycling; it is what save flushes to disk.
- **Container = two-way-synced projection of the store.** On realize it reads
  its record by id and applies it; on any geometry change it writes back. A
  destroyed container loses nothing — the store already holds the latest.
- **Connectors reference the container Figure** (`ConnectorEndpoint.Node`,
  already typed `Model`), resolved from the persisted `nodeId`. The Figure is
  the side-endpoint host, so the endpoint reads geometry and ports from it.
  Connector serialization (top-level collection, endpoints carry `nodeId` +
  pinned `portSide`/`portIndex`) is unchanged.

### Serialization — two sections (format v3), clean break

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

- **Save** (v3): `nodes` from each item's serializer (`serialize(node) → data`,
  geometry-free); `visuals` from the store snapshot.
- **Load** (v3 only): build content nodes; assign ids; seed the store; containers
  apply geometry as they realize.
- **No legacy dual-reader.** The `NodeSerializer.deserialize` contract loses its
  geometry (`deserialize(data)` builds the content node; the document seeds the
  store separately). The few existing `.diagram` files are migrated by hand once
  (mostly Plexus's, in the relevant slice); Mural's own persistence is transient.

## Decomposition

Each slice compiles and tests green on its own and ends at a natural checkpoint.
The ordering is forced by dependencies: Text/Callout must leave the VM world
before the store simplifies the node set, and the side-endpoint host can only be
container-owned once the container reliably owns geometry.

### Slice #1 — Text & Callout → Figure (Mural) — *planned now*

`TextNodeVM` and `CalloutNodeVM` become Figure subclasses and the VM classes are
retired. `TextNodeVM` was ported *from* Figure (it re-implements `ShapeText`,
`_applyAutoFit` GrowShape, Fill/Stroke, `{field}` resolution — all native to
Figure), so this mostly deletes code. `Callout extends Figure` gets its text from
`Figure.Text` and computes its leader from its own (native) geometry + the
target's geometry, resolving a VM target's rect via its container. The `'text'`
and `'callout'` serializers build Figures; geometry stays inline in the current
format (no store/format change yet — that is slice #2). Self-contained; unblocks
the rest by shrinking the VM world.

### Slice #2 — Store + two-section serialization (Mural)

Introduce the document-owned `id → visual` store as the durable geometry truth,
wire container realize→apply + write-back + recycle, and switch serialization to
the v3 two-section format (clean break). After slice #1 the node set is mostly
Figures, so this lands on a simpler surface.

### Slice #3 — Dissolve `SideConnectableNodeVM`; content VMs geometry-free (Mural + thin Plexus)

Delete `SideConnectableNodeVM`'s duplicate host machinery; the container Figure
is the side-endpoint host for content nodes. Wire the container's
`PortProvider`/`Kind` from the content VM. Point connector endpoints at
containers. Strip geometry DPs from `NodeViewModel`; Plexus `ArchNodeVM` sheds
geometry and its drop/serialize paths write the store. This is deletion +
wiring, not a connector-routing rework.

## Slice #1 detail (the part being planned)

- **`Text extends Figure`** — a shapeless/boxed Figure whose `Text` `ShapeText`
  uses `AutoFit=GrowShape`, with the text-box Fill/Stroke defaults. Field
  resolution and auto-fit are Figure-native; drop the VM re-implementations.
- **`Callout extends Figure`** — carries `LeaderTargetId` (content) + a computed
  `LeaderGeometry`. Leader math (`boxEdgeToward` + local-coord conversion) ports
  onto the Figure, reading its own rect natively; the target rect resolves
  through the target's container (generator), with live tracking subscribed to
  the container's geometry. `Detach()` releases the subscription.
- **Serializers:** `'text'` builds a `Text` Figure; `'callout'` builds a
  `Callout` Figure and stores `leaderTargetId` in `data` for the second-pass
  wiring (unchanged). `matches` narrows to the new Figure subclasses.
- **Templates:** the `[DataType=TextNodeVM]` / `[DataType=CalloutNodeVM]`
  DataTemplates become Figure rendering — Text via the Figure text path, Callout
  adding the leader Shape bound to `LeaderGeometry`.
- **Retire the VM classes** and update every reference (`_deserialize` node union
  types, `ILeaderTarget` usage, index exports). `NodeViewModel` and
  `SideConnectableNodeVM` are untouched in this slice (slice #3 owns them).

## Testing strategy

- **Slice #1:** a `Text` Figure round-trips through the `'text'` serializer and
  auto-fits to its label; a `Callout` Figure computes leader geometry toward a
  Figure target and re-computes when the target moves; leader survives
  serialize/reload (target rewired by id); the retired VM types are gone
  (no remaining imports); full suite green.
- **Slice #2:** store seed→snapshot round-trip; realize applies; change writes
  back; simulated recycle preserves; v3 round-trip; save always v3.
- **Slice #3:** container is the side-endpoint host for a content node;
  connectors attach to a content node via its container; `NodeViewModel` exposes
  no geometry DPs; Plexus arch suite green.

## Risks / notes

- Slice #1 changes the runtime type of text/callout nodes (VM → Figure). Any
  code that `instanceof TextNodeVM`/`CalloutNodeVM` must move to the new Figure
  types; the `'callout'` second-pass leader wiring keys on id, so it is stable.
- The `NodeSerializer.deserialize` contract change (geometry-free) lands in
  slice #2, and mural must publish before Plexus builds against it (slice #3).
- `ConnectorEndpoint.Node` typed `Model` already permits pointing endpoints at
  containers — no type change needed in slice #3.
- Virtualization is designed-for, not implemented (the items panel stays an eager
  `Canvas`); the store is what makes it safe to add later.
