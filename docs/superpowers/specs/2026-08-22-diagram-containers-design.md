# Diagram Containers (nested elements) — Design

**Status:** design, awaiting review. Sub-project **1 of 2** (Mural generic
primitive). Sub-project 2 (Plexus arch model-backing) is a separate spec.

**Goal:** A diagram node can be a **container** — a titled, styleable box that
visually holds other nodes as true children: drop an empty container and drag
nodes into it (or wrap a selection), the container clips and moves its children,
and dragging a child out un-nests it. Membership persists.

**Architecture (one paragraph):** The node collection (`Diagram.ItemsSource` /
`doc.Nodes`) stays **flat**; containment is expressed by a `parentId` on each
node's `NodeVisual` geometry record. The **visual tree** becomes hierarchical: a
`ContainerFigure` exposes an inner clipped `Canvas`, and a Diagram-level
*placement collaborator* re-parents each child `Figure`'s visual out of the root
figures-layer into its container's inner canvas after realization. Because
children are real visual descendants, move-together / z-order / hit-test /
hard-clip come from the visual tree for free. The single new complexity is
**coordinate space**: a nested child's `Left/Top` is container-local, so a
`diagramSpaceRect(figure)` helper walks the ancestor chain summing content
offsets, and the two consumers that assume absolutes — connector routing and the
selection-bounds adorner — read through it.

**Tech stack:** TypeScript, Mural framework (`src/framework/diagram`), the
control/DP/default-Style conventions in `Mural/CLAUDE.md` (every control has a
default Style; enums not string unions; tests under `tests/` subfolders).

**Grounding (explored 2026-08-22):**
- Figure template (`diagram.template.mu`): a `Canvas` root with
  `PART_Content` (ContentPresenter, `IsHitTestVisible=false`) + `PART_LabelHost`
  (Border hosting `ShapeText`). Named-part access via `GetTemplateChild`.
- ItemsPanel is `DiagramLayersPanel` — two Canvas layers: `_figuresLayer`,
  `_connectorsLayer`. A Figure positions via `Figure.Left/Top` → `Canvas.Left/Top`
  mirroring (`figure.ts` OnPropertyChanged). No virtualization/recycling; the
  Diagram never calls `ClearContainerForItemOverride`.
- Re-parenting API (`element.ts`): `Panel.RemoveChild` / `AddChild`
  (`Detach` then `Attach`) is clean and single-parent-enforced; inheritance /
  style / resource cascades run automatically.
- Clip: Figure defaults `ClipToBounds=true`; `buildChildClipGeometry` returns
  the silhouette / card geometry — children are already hard-clipped.
- Connectors read `node.Left/Top` **as absolute diagram-host coords**
  (`connector.ts` `nodeRect`), route on Left/Top DP ticks, live in the separate
  `_connectorsLayer`, and carry absolute points in their geometry.
- Drag: `Figure.OnPointerDown` collects drag-partners; `OnPointerMove` writes
  `Left/Top` and shifts partners; `PositionSnap` is injected by the Diagram.

---

## Section 1 — Data model: flat collection + `parentId`

- `NodeVisual` (`node-visual-store.ts`) gains **`parentId?: string`**. Absent →
  the node is a root node on the figures-layer. Present → the node is a child of
  the container node with that id.
- A child's stored `Left/Top` are **parent-relative** (content-space of the
  container's inner canvas). Root nodes' `Left/Top` are diagram-space (unchanged).
  Rationale: moving a container must not rewrite every child's coordinates, and
  parent-relative coords fall straight out of the child living in the container's
  inner canvas.
- `ItemsSource` / `doc.Nodes` remain a **flat** `ObservableCollection`. Binding,
  selection, serialization, and (in sub-project 2) the arch model projection keep
  iterating one list. Nesting is a property of records, not of the collection.
- Invariants: `parentId` must reference an existing container node; no cycles; a
  node is a child of at most one container. The placement collaborator enforces
  these (a dangling/cyclic `parentId` falls back to root with a `log`).

## Section 2 — `ContainerFigure`

A `ContainerFigure extends Figure` (a Figure subclass, so it inherits geometry,
styling, serialization, hit-testing, connector-endpoint hosting, and the
`ShapeText` title we can reuse for a header).

- **Template** (its own default Style in a `*.template.mu`, per CLAUDE.md — no
  string-key resolves): the Figure Canvas root plus a new
  **`PART_ChildContainer`** — a `Canvas` occupying the body region below an
  optional title band. `ClipToBounds=true` (inherited) hard-clips children to the
  box. `PART_Content` is unused for a container (no wrapped content VM);
  `PART_LabelHost` hosts the title `ShapeText` placed at the top
  (`TextPlacement.Top`), F2-editable via the mechanism already shipped.
- **Box + title:** the container paints a rounded-rect box via the existing
  `Fill`/`Stroke` card seams (the styling work already in `Figure`), so it is
  Format-Shape styleable out of the box. Title text is the Figure's `ShapeText`.
- **Inner host accessor:** ctor caches `GetTemplateChild('PART_ChildContainer')`
  as the child host; exposes `ChildHost: Panel` and a `ContentOrigin` (the inner
  canvas's offset from the container's own origin — the title band height +
  padding). `ContentOrigin` is the per-level offset the coordinate walk sums.
- **Kind:** registered as a catalog kind `'container'` so
  `Figure.fromKind('container', …)` and the toolbox produce a `ContainerFigure`.
  `GetContainerForItemOverride` returns an already-constructed `ContainerFigure`
  as-is (same as Figure/Group today).

## Section 3 — Placement collaborator (re-parenting)

A Diagram-owned collaborator (`ContainerPlacement`) turns `parentId` into visual
tree structure. It runs **after realization** (Figures are first realized into
`_figuresLayer` by the Selector, then relocated):

- **On bind / container-bound** (`_fireContainerBound`): read the node's
  `parentId`. If set and the parent container is already realized, `RemoveChild`
  from the current host and `AddChild` to the parent's `ChildHost`. If the parent
  is not yet realized, enqueue and retry when it binds (deferred attach — parents
  and children realize in arbitrary order from a flat list).
- **On `parentId` change** (reparent at runtime): `RemoveChild` from old host,
  convert the node's `Left/Top` from old space to new space (Section 4),
  `AddChild` to new host.
- **On node removal:** detach; re-home orphaned children of a removed container
  to the container's own parent (or root), converting coordinates.
- **Recycling:** the Diagram doesn't recycle containers, so re-parenting a Figure
  out of `_figuresLayer` is safe; the collaborator owns the inverse move so a
  node never leaks in a stale host.

## Section 4 — Coordinate spaces (the linchpin)

Because a nested child lives in its container's inner canvas, its `Left/Top` are
**container-local**. Consumers that need diagram-space coordinates go through:

- **`diagramSpaceRect(node): Rect`** — walk the node's container-ancestor chain
  (via live `Parent` link, mirrored from `parentId`), summing each container's
  diagram-space origin + its `ContentOrigin`, then add the node's local
  `Left/Top`. Returns the node's rect in absolute diagram-host space. Root nodes
  short-circuit to `(Left, Top, Width, Height)`.
- **Inverse `toParentSpace(point, container)`** for reparent/drop: given a
  diagram-space point and a target container, subtract the container's
  diagram-space origin + `ContentOrigin`.
- **Consumers updated to use it:**
  - `connector.ts` `nodeRect()` — return `diagramSpaceRect(node)` instead of raw
    `Left/Top`. Connectors then route correctly regardless of nesting, keep living
    in `_connectorsLayer`, and still re-route on `Left/Top` ticks (a container
    move ticks the container's Left/Top; connectors to descendants must also
    re-route — see Section 9).
  - Selection-bounds adorner / `SelectionBoundsTracker` — compute union bounds
    from `diagramSpaceRect` so an adorner over a nested figure lands on screen
    correctly.
  - Drag hit-testing and drop (Section 5) — convert cursor/figure rects through
    these helpers.

## Section 5 — Drag-in / drag-out (move-together is free)

- **Move-together:** moving a `ContainerFigure` moves its whole subtree
  automatically (children are visual descendants). The existing drag-partner
  *shift* must therefore **skip a container's own descendants** (or they double-
  move); partner collection is adjusted so container-children are never added as
  shift partners.
- **Drag-in:** during `OnPointerMove`/`OnPointerUp`, hit-test the dragged
  figure's diagram-space center against container boxes (topmost/innermost wins,
  excluding self and own descendants). On entering a container, set the node's
  `parentId` and reparent (Section 3), converting `Left/Top` to the new space so
  the figure doesn't visually jump.
- **Drag-out:** if the center leaves the current container's box (into the
  parent/root), clear or re-point `parentId` accordingly and reparent.
- **Hysteresis:** reparent on drag-*end* by default (commit on drop), with a live
  highlight of the candidate container during the drag; avoids thrashing across
  boundaries mid-drag. (Mid-drag reparent is a later refinement.)

## Section 6 — Creating a container (both gestures)

- **Drop empty:** a `'container'` catalog kind / toolbox tile; dropping creates a
  `ContainerFigure` at a default box. Then drag nodes in.
- **Wrap selection:** a `WrapInContainerCommand` — create a `ContainerFigure`
  sized to the selection's diagram-space union + padding, positioned to enclose
  it, then set each selected node's `parentId` to the new container and convert
  each to content-space (they don't move on screen). `UnwrapContainerCommand`
  clears children's `parentId` (converting back to the container's parent space)
  and deletes the container. Symmetric with the existing Group/Ungroup command
  shape; gated on a non-empty selection.

## Section 7 — Selection & adorners

- Children are real Figures, so click-to-select and marquee already descend the
  tree; no change to hit-testing.
- The selection-bounds adorner reads `diagramSpaceRect` (Section 4) so bounds and
  resize handles render at the correct screen position for nested figures.
- Selecting a container selects the container (its box), not its children;
  children are selected by clicking them. (No auto-elevation like Group — a
  container is a first-class node, not a selection aggregate.)

## Section 8 — Serialization

- `NodeVisual` serializes `parentId` (omitted when root) and parent-relative
  `Left/Top` (already how the `visuals` section stores geometry). No hierarchy in
  the node list — the flat list plus `parentId` reconstructs the tree on load.
- `ContainerFigure` serializes as a node of type `'container'` (a node serializer
  registered like the `'shape'`/`'text'` ones): its box (Width/Height), title
  (ShapeText content), and `Fill`/`Stroke` card style ride the existing record +
  visuals channels.
- **Load order:** deserialize all nodes flat, then the placement collaborator
  runs its deferred-attach pass so children land in their containers regardless of
  record order.

## Section 9 — Connectors

- `nodeRect()` via `diagramSpaceRect` makes routing correct for any nesting depth
  in one coordinate space; connectors stay in `_connectorsLayer` with absolute
  points (no per-container connector layers).
- **Re-route on container move:** a connector currently subscribes to its
  endpoint node's `Left/Top`. When a *container* moves, its descendants' local
  `Left/Top` don't change, so descendant-anchored connectors won't re-route.
  Stage-3 fix: a connector whose endpoint is nested also subscribes to each
  ancestor container's `Left/Top` (subscriptions refreshed on reparent), so an
  ancestor move re-routes it.
- Same-parent-sibling and root-to-root connectors work from Stage 1 (they share a
  space); cross-boundary correctness is complete once the ancestor-subscription
  fix lands.

## Staging

- **Stage 1 — Nesting core.** `ContainerFigure` + inner clipped host + `parentId`
  in `NodeVisual` + placement collaborator (deferred attach, reparent) +
  `diagramSpaceRect` and its two consumers (connector `nodeRect`, adorner bounds)
  + drag-in/out (commit-on-drop) + drop-empty creation + serialization. Recursive
  nesting works because the coordinate walk is chain-based. Connectors correct for
  static nesting.
- **Stage 2 — Gestures & polish.** Wrap/Unwrap commands; drag candidate-container
  highlight; orphan re-homing on container delete; optional auto-grow-to-fit on
  drop; edge cases (self/descendant drop rejection, empty container).
- **Stage 3 — Connector re-route across boundaries.** Ancestor-`Left/Top`
  subscription so descendant-anchored connectors re-route when a container moves.

Each stage is independently shippable and testable.

## Error handling & edge cases

- Dangling / cyclic `parentId` → fall back to root, `log` the drop (never throw
  during load).
- Dropping a container onto its own descendant is rejected (cycle guard in the
  hit-test).
- Deleting a container re-homes children to its parent/root rather than deleting
  them (data-loss guard); a separate "delete with contents" is out of scope for v1.
- A child whose parent never realizes stays queued and renders at root until the
  parent appears (no crash, visible fallback).

## Testing strategy

- **Unit (headless, `tests/` subfolders):** `NodeVisual` parentId round-trip;
  `diagramSpaceRect` across 1/2/3 levels; placement collaborator deferred attach
  (child-before-parent record order) and reparent coordinate conversion;
  Wrap/Unwrap command math; drop hit-test cycle rejection; container node
  serializer round-trip.
- **Framework integration (mural test-app):** realize a container + child, assert
  the child's Visual parent is the container's `ChildHost` and it clips; move the
  container, assert child screen position tracks; connector between a nested child
  and a root node routes to the child's diagram-space rect.
- **Live (Plexus e2e, later / sub-project 2):** drop container, drag node in/out,
  reload, verify persistence — against a corpus **copy** (never the real corpus).

## Out of scope (v1 / this sub-project)

- Model-backed containment (sub-project 2: `parentId` ↔ `contains` /
  `app_components`).
- Auto-layout inside containers; collapse/expand; delete-with-contents;
  mid-drag reparent thrash-free animation.
