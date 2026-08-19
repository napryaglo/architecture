# Shape-node → self-painting Figure migration — design

**Status:** proposed · **Date:** 2026-08-19 · **Repo:** Mural (+ Plexus rollout)

## Problem

Clicking inside a diamond node's bounding box but *outside* the diamond
silhouette (e.g. a corner triangle, below an edge) selects the node. It should
not — the hit region should be the diamond outline.

### Root cause

A geometric shape node is **not** a self-painting `Figure`. It is a
`ShapeNodeVM` (data: `NodeViewModel extends Model`) rendered by a `Shape`
primitive **inside a shapeless `Figure` container**:

```
Figure            ← the SELECTABLE container; Content = the ShapeNodeVM; _shape undefined
  └ ContentPresenter (PART_Content)
      └ Shape      ← the actual diamond, WITH a silhouette HitTestGeometry
```

The inner `Shape` confines its own hits to the outline, but the *selectable*
element is the outer `Figure` container. That container is shapeless (it wraps a
VM; it was never built via `fromKind`), so:

- `Figure._shape` is `undefined` → its `ArrangeOverride` publishes **no**
  `HitTestGeometry`.
- Every visual gets a `mural-hit` pad sized to the full bounding box with
  `pointer-events: all` ([svg-renderer.ts](../../../src/visual-engine/drawing/svg-renderer.ts) `applyHitPad`); it is not shrunk to any geometry.
- `acceptsPoint` only rejects a hit when the visual carries a `HitTestGeometry`.
  The container has none, so its full-bbox pad accepts the corner and the hit
  resolves to the `Figure` → selection.

The recent uniform-realization work gave *self-painting* Figures (`fromKind`)
correct silhouette `HitTestGeometry` + children-only `ClipToBounds`. It never
reached the `ShapeNodeVM`-in-a-container pattern the diagram actually uses for
shape nodes. This migration closes that gap by making a geometric shape node
**be** a self-painting `Figure`.

## Scope

**In scope:** geometric shape nodes only — the `ShapeNodeVM` type. It is
deleted; shapes are created as `Figure.fromKind` / `Figure.fromSource`.

**Explicitly out of scope (stay as VMs-in-containers):** `TextNodeVM`,
`CalloutNodeVM`, and Plexus's `ArchNodeVM`. These are rectangular, content-driven
tiles (editable text, leader lines, icon+label). Their bounding box **is** their
shape, so their bbox hit region is already correct, and they genuinely need the
`DataTemplate` + `ContentPresenter` + `SizeToContent` machinery. Forcing them to
self-paint would break Plexus's arch diagram for no benefit.

Consequence: the diagram's node model becomes **mixed** — `doc.Nodes` holds
self-painting `Figure`s (shapes) alongside `NodeViewModel`s (text/callout/arch).
The diagram already supports this via the "Items-are-Figures" path
([diagram.ts:1450](../../../src/framework/diagram/diagram.ts#L1450)); a `Figure`
item is used directly, a VM item is wrapped in a container `Figure`.

## Why the hard part is free

The connector / port / selection / adorner layer is already node-type-agnostic —
it duck-types on `ISideEndpointHost`, `IPortHost`, and `Left·Top·Width·Height`. A
`ConnectorEndpoint.Node` is typed `Model`, not `Figure`. `Figure` already
implements everything these paths read (`.Ports`, `_sideHost`, `GetSideSlot`,
`ArrangedRect`, `Geometry`). So endpoint resolution, side-slot distribution, port
anchoring, selection, `SelectionBoundsTracker`, and every adorner work
identically whether the node is a `Figure` or a VM. **No rewiring is required in
those layers.** The migration also deletes real duplication: `ShapeNodeVM`'s
`_source`/`_rebuildGeometry` (a copy of `Figure`'s) and one of the two parallel
`SideEndpointRegistry` implementations.

## Design

### 1. Figure is the shape node

`Figure.fromKind(kind, x, y, opts)` and `Figure.fromSource(source, x, y, opts)`
already self-paint the silhouette and publish `HitTestGeometry` + drive
children-only `ClipToBounds`. Nothing new is needed on the render/hit side — the
fix falls out of using a `Figure` as the node.

**Kind as provenance.** The uniform-realization work dropped `Figure`'s stored
kind. To round-trip the on-disk record faithfully we re-add a **minimal,
non-DP** kind tag: a private `_kind: string | undefined` set by `fromKind`
(undefined for `fromSource` without a `kind` option), exposed via a read-only
`get Kind()`. It drives **no behavior** (ports are bbox-for-all — see §4); it is
pure serialization/identity provenance. This does not re-introduce the `Kind` DP
or any kind-dispatched logic.

### 2. Creation path

- `DiagramDocument.CreateNode(kind, x, y)`
  ([diagram-document.ts:587](../../../src/framework/diagram/diagram-document.ts#L587))
  returns `Figure | null` (was `ShapeNodeVM | null`): builds `Figure.fromKind`,
  assigns `Id`, adds to `Nodes`.
- `ShapeDropFactory.CreateDropped`
  ([shape-drop-factory.ts](../../../src/framework/diagram/toolbox/shape-drop-factory.ts))
  is unchanged in shape (still calls `Mutator.CreateNode`); only the returned
  type changes. Update any caller that names `ShapeNodeVM`.

### 3. Serialization (format-stable, back-compatible)

The on-disk record is **unchanged**: `type: 'shape'` with
`{ id, left, top, w, h, kind, d, fill, stroke, strokeWidth }`
([node-serializers-default.ts:121](../../../src/framework/diagram/node-serializers-default.ts#L121)).

- **`matches`** re-keys from `node instanceof ShapeNodeVM` to
  `node instanceof Figure` (a `Figure` in `doc.Nodes` is always a self-painting
  shape node — container Figures are transient and never enter `Nodes`). Guard on
  `node._getSource() !== undefined` for safety.
- **`serialize`** reads `kind` from `Figure.Kind`, `d` from
  `pathGeometryToSvgD(figure._getSource())` (the unit-1 source), `fill`/`stroke`/
  `strokeWidth` from `Figure.Fill` / `Figure.Stroke`.
- **`deserialize`** constructs a `Figure` instead of a `ShapeNodeVM`: `kind` in
  the catalog → `Figure.fromKind(kind, left, top, { width, height })`; else a
  `d`-string → `Figure.fromSource(pathGeometryFromSvgD(d), …, { kind })`; else
  the `rectangle` fallback. Restore `Fill` / `Stroke` from hex. **Existing
  `.diagram` files load unchanged** — same record, new target class.

`TextNodeVM` / `CalloutNodeVM` serializers are untouched. Plexus's `'arch'`
serializer is untouched.

### 4. Ports: bounding-box for all shapes

Migrated shape Figures use `resolveDefaultPortProvider()` (4 cardinal bbox
ports), matching the uniform-realization decision already in force for `fromKind`
Figures. The `ShapeNodeVM.Kind` → geometry-specific provider table
(ellipse-radial / triangle-vertex / outline) is **not** carried over.
`Figure.PortProvider` / `Figure.ExplicitPorts` remain available for a node that
needs a non-default topology.

### 5. Deletions

- `shape-node-vm.ts` (the `ShapeNodeVM` class) — removed.
- The `[DataType = ShapeNodeVM]` `DataTemplate`
  ([diagram.template.mu:46](../../../src/framework/diagram/diagram.template.mu#L46))
  — removed.
- Duplicated geometry logic in `ShapeNodeVM` (`_source`, `_rebuildGeometry`) —
  gone with the class; `Figure` is the single owner.
- Any `ShapeNodeVM` import / `instanceof` site in the framework — updated to
  `Figure` (or to the mixed-node discriminator where both must be handled).

### 6. Fill / Stroke

A shape `Figure` uses the inherited `Visual.Fill` / `Visual.Stroke` (already its
paint source). The serializer reads/writes these. `Figure`'s historic default
fill (`#bfdbfe`) and stroke already match `ShapeNodeVM`'s defaults, so appearance
is unchanged.

## Plexus impact + rollout

- `ArchNodeVM` (icon+label tiles) is **untouched** — it stays
  `extends SideConnectableNodeVM`, keeps its template, serializer, `SizeToContent`,
  and `ISideEndpointHost`.
- Only the **standalone-diagram fallback**
  ([arch-instance-drop-factory.ts](../../../../Plexus/src/renderer/src/modules/architecture-projects/services/arch-instance-drop-factory.ts) → `Mutator.CreateNode`)
  now yields a `Figure` instead of a `ShapeNodeVM`. Plexus's binding code already
  has `instanceof Figure` back-compat branches
  (arch-diagram-binding, viewpoint-scope-reconcile), so this is a type shift, not
  a rewrite.
- Rollout: publish a new `@pragmatic-lab/mural` to Verdaccio, bump Plexus, run
  the Plexus suite, live-smoke a standalone diagram with geometric shapes.

## Back-compat / file format

- On-disk `.diagram` record format is **unchanged**; the migration only changes
  the runtime class the `'shape'` record deserializes to. Old files load; new
  files are byte-compatible.
- No meta-model / TODL change.

## Testing strategy

- **Hit confinement (the bug):** a diamond/triangle shape node created via the
  diagram (`CreateNode`) rejects a bbox-corner point and accepts an interior
  point. Assert through the geometry seams + `HitTestGeometry` (headless
  `RenderSize` is 0 — test the seams, not paint emission, per the Figure
  gotcha).
- **Round-trip:** create shape nodes of several kinds, serialize, deserialize,
  assert geometry/kind/fill/stroke/position preserved and the result is a
  `Figure`.
- **Back-compat load:** a fixture `.diagram` payload with old `type:'shape'`
  records (kind + d) loads into `Figure`s.
- **Mixed model:** a document with a shape `Figure` and a `TextNodeVM` in
  `doc.Nodes` serializes/deserializes each via its own serializer; selection and
  a connector between them resolve.
- **Ports:** a migrated ellipse/triangle node exposes bbox ports.
- Full Mural suite green; then Plexus suite green after the bump.

## Accepted consequences

- **Geometry-specific ports are gone** for shapes (bbox-for-all) — chosen,
  consistent with uniform realization.
- **Mixed node model** (Figures + VMs in `doc.Nodes`) is now permanent. The core
  machinery is agnostic; the ongoing cost is that node-iterating code must handle
  both representations (most already does).
- `Kind` returns to `Figure` as an inert provenance tag (no behavior), a partial
  walk-back of the uniform-realization "no Kind" stance — justified by
  round-trip fidelity.

## Risks

- **Serializer discrimination:** relies on "a `Figure` in `doc.Nodes` is a shape
  node." Verified: container Figures are transient (created by
  `GetContainerForItem`) and never added to `Nodes`; only `CreateNode`/load add
  nodes. Guard on `_getSource()` as belt-and-suspenders.
- **Stray `ShapeNodeVM` references** in framework or Plexus not caught by the
  sweep. Mitigation: delete the class first and let the type-checker enumerate
  every site.
- **Plexus fallback consumers** assuming `ShapeNodeVM`. Mitigation: covered by
  the Plexus suite + live smoke before the bump is finalized.
