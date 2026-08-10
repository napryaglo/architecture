# M4 — Groups + Ports + Text/Callout VMs — Design

**Parent:** `2026-08-10-unified-node-viewmodel-engine-design.md` (§3, stage M4).
**Depends on:** M1 (container renders Content), M2 (`ShapeNodeVM`), M3 (connector
endpoints reference VMs + generic per-VM serialize registry).

**Goal:** Finish the node-model unification. After M4 every diagram node is a
view-model held in `Nodes`: groups hold VM members and translate/bound them
correctly; VM shapes get named/side **port fidelity** (not just geometric clip);
and `TextShape`/`Callout` become `TextNodeVM`/`CalloutNodeVM` + DataTemplates. The
two M4-deferred group regression tests are re-enabled, and the suite runs with
**zero** skips beyond the pre-existing baseline.

## Background — what the M4 map established

- **Group** (`group.ts`) is a `ContentControl` in `Nodes`, rendered by the
  `DefaultGroup` Border chrome template (`diagram.template.mu`, `IsHitTestVisible
  = false` so clicks fall to members). It holds `Members: ObservableCollection<
  Figure | Group>`, a `Parent: Group | undefined` back-ref, settable `Left`/`Top`
  (rigid translate of all members) and read-only `Width`/`Height` (union bbox).
  `_listenMember`/`_shiftBy`/`_recomputeBounds` discriminate `instanceof Group`
  else assume **Figure** DP keys. Groups are **not serialized** (runtime chrome).
- **Drag-elevation is already VM-aware.** `figure.ts` reads the group entity by
  duck-typing on `Parent`: it uses `this.Parent` when set, else
  `this.DataContext.Parent` (figure.ts ~761-763), and walks that chain to the
  top-level entity (~772-773). A container Figure wrapping a VM therefore elevates
  a drag to the VM's group **with no figure.ts change** — the VM only needs a
  `Parent` field. `group-ops.ts` is likewise already duck-typed
  (`'Members' in item`, `topLevelOf` walks `.Parent`).
- **Ports** resolve through five paths in `connector.ts` `resolveEndpoint`
  (~1135-1193). Named/positional/side-slot ports are gated by two
  `instanceof Figure` checks — `endpointSideSlot` (~1280) and `bakeSideIfBare`
  (~1305) — so VM shapes currently fall to path 5 (geometric clip). The port
  **host** reads are already duck-typed: `nodePorts(node)` reads `node.Ports`,
  `nodeAsPortHost(node)` reads `ArrangedRect`/`Geometry` (~1529-1540). `Figure`
  exposes ports via `ExplicitPorts ?? PortProvider.GetPorts(this)`
  (figure.ts ~400-405), plus a `GetSideSlot(ep, side)` used by the side-slot path.
- **Text/Callout** (`text-shape.ts`) are Figure subclasses today.
  `TextShape` applies catalog kind `rectangle` + a text block (`Text: ShapeText`,
  `AutoFit = GrowShape`, default 120×44). `Callout extends TextShape` and adds a
  `LeaderTargetNode: Figure` DP, a leader `Shape` injected into the template Canvas
  (~68-76), target tracking via the target's Left/Top/Width/Height DP keys
  (~100-113), and leader-geometry redraw via `boxEdgeToward` (~136-147). Both are
  already routed through the M3 serialize registry as `text`/`callout`
  (`node-serializers-default.ts`), reusing `serializeShapeText`/`applySerializedText`.
- **`ShapeNodeVM`** (the M2 reference pattern): `extends NodeViewModel`; DPs
  `Kind`/`Geometry`/`Fill`/`Stroke`; a private unit-1 `_source`; `fromKind`/
  `fromSource` factories; `_rebuildGeometry()` = `scaleGeometry(_source, Width,
  Height)`; `OnPropertyChanged` rescales on Width/Height; `[DataType=ShapeNodeVM]`
  DataTemplate draws a `Shape` bound to `$Geometry/$Fill/$Stroke/$Width/$Height`.

## Design

Three independently-green stages, built in order. **Groups** first (retires the
skipped tests and the real "can't move/align a group" bug); **Ports** second
(small, isolated); **Text/Callout VMs** last (the bulk of the surface and risk).

### Stage A — Groups on the VM engine (widen the existing `Group` control)

**Decision (user):** keep `Group` a `ContentControl` in `Nodes` rendered by its
`DefaultGroup` template — do **not** introduce a `GroupViewModel`. Groups are
chrome, not domain data; the diagram already treats `Group` as its own container
(`GetContainerForItemOverride` returns it as-is). Widening is localized and
low-risk.

- **`node-view-model.ts`:** add `public Parent: Group | undefined = undefined;`
  (a plain field, mirroring `Figure.Parent`). Use `import type { Group }` to avoid
  a runtime import cycle (`group.ts` imports `Figure`; the VM only needs the type).
  This field is what the existing duck-typed drag-elevation reads via
  `container.DataContext.Parent`.
- **`group.ts`:**
  - Widen `Members` to `ObservableCollection<Figure | Group | NodeViewModel>` and
    the constructor's member parameter accordingly.
  - Add a private helper `positionKeysOf(m)` returning the member's
    `{ leftKey, topKey, widthKey, heightKey }`: `Group.*Key` when `m instanceof
    Group`, `NodeViewModel.*Key` when `m instanceof NodeViewModel`, else
    `Figure.*Key`. Route `_listenMember`, `_shiftBy`, and `_recomputeBounds`
    through it so a member's position/size is read and written by the correct DP
    keys regardless of type.
  - Widen `EnumerateLeaves()` to yield `Figure | NodeViewModel` (recurse into
    nested `Group`s; a VM leaf yields itself).
- **`diagram-document.ts`:**
  - `Group(items)`: after constructing the `Group`, set each **member's**
    `.Parent = group` (Figure and NodeViewModel both carry the field). Keep the
    existing insert-at-lowest-member-index + add-to-`Nodes` behavior.
  - `Ungroup(items)`: when lifting members out, set each member's `.Parent` to the
    group's own `Parent` (one level up, `undefined` at root) — same as today, now
    also clearing/relinking VM members.
  - `_topLevel(entity)`: it currently walks the `Parent` chain discriminating
    `instanceof Figure || instanceof Group`; add `NodeViewModel` to the accepted
    leaf set (or duck-type on the presence of `.Parent`) so a VM entry resolves to
    its top-level group.
- **Tests (re-enable + adapt):** `diagram-distribute-newarch.test.ts`'s two
  `test.skip`s move to `test`:
  - *"Dragging a … inside a Group moves the entire group"*: members are now
    `ShapeNodeVM`s, whose pointer handlers live on the **container** Figure. Drive
    the gesture through `diagram.Generator.ContainerFromItem(a)` (call its
    `OnPointerDown`/`OnPointerMove`); assert `a.Left`, `b.Left`, `c.Left` all shift
    by the drag delta and `grp.Left` tracks the member-min.
  - *"AlignCenter with a Group … preserves intra-group spacing"*: select via
    `diagram.HandleContainerClick(diagram.Generator.ContainerFromItem(m1), …)` for
    each leaf; assert `m2.Left - m1.Left` is unchanged after `AlignCenterCommand`.
- **New coverage:** grouping VM shapes yields a group whose bbox = union of member
  VMs; moving the group translates every member VM (and each container follows via
  the M1 two-way `Left/Top` binding); ungroup restores members to the root with
  `Parent = undefined`; a nested Group (group-of-groups with VM leaves) computes
  bbox and translates correctly.

### Stage B — Port fidelity for VM shapes

VM shapes should honor named ports and side-slot distribution like Figures, not
only geometric clip.

- **`connector.ts`:** replace the `instanceof Figure` gate in `endpointSideSlot`
  (~1280) and `bakeSideIfBare` (~1305) with a duck-typed capability check: the
  endpoint's `Node` qualifies for the side-slot path when it exposes a
  `GetSideSlot` method (declare a small `interface SideSlotHost { GetSideSlot(ep,
  side): { index: number; count: number } | undefined }` and test/cast through it,
  per the mural cross-class-internals rule). `Figure` already satisfies it; VM
  shapes satisfy it after the next bullet. No change to `nodePorts`/`nodeAsPortHost`
  (already duck-typed) or paths 1/2/4/5.
- **`shape-node-vm.ts`:** expose the port-host surface Figure exposes —
  - a `Ports: readonly Port[]` getter resolving **per-kind** default ports through
    the same `PortProvider` path Figure uses keyed by `Kind` (so a diamond and a
    rectangle get their own port sets), with an `ExplicitPorts` override DP for
    parity;
  - a `GetSideSlot(ep, side)` returning the `{ index, count }` slot distribution,
    sharing Figure's implementation (extract the Figure logic into a reusable
    helper both call, rather than duplicating).
  `NodeViewModel` already provides `ArrangedRect`-equivalent bounds
  (`Left/Top/Width/Height`) and `ShapeNodeVM.Geometry` for outline-mode ports.
- **Tests:** a connector between two VM shapes with an explicit `PortSide`/
  `PortName` anchors at the named/side port (not the clipped bbox edge); two
  connectors sharing a side distribute across slots (`{index,count}` fan-out);
  the existing connector regression (`diagram-document-connectors`,
  `connector`, `port-outline`, `m3-connector-vm`) stays green.

### Stage C — Text/Callout become VMs

Convert the two Figure-based text shapes to VMs + DataTemplates so every node kind
is uniform and a consumer can restyle text nodes by template.

- **`text-node-vm.ts` (new) — `TextNodeVM extends NodeViewModel`:** owns a `Text:
  ShapeText` (with `AutoFit = GrowShape`), `Fill`, `Stroke` DPs; default size
  120×44 via the constructor. A `[DataType=TextNodeVM]` DataTemplate in
  `diagram.template.mu` renders a background (rectangle geometry or a `Border`) +
  an **editable** label host bound to the VM's `Text`. Register `TextNodeVM` in the
  compiler `symbol-table.ts` and the framework barrel, as `ShapeNodeVM` was.
- **`CalloutNodeVM extends TextNodeVM`:** adds `LeaderTargetId: string | undefined`
  (a node **id**, not a Figure reference — serialization-safe and consistent with
  connectors resolving by id) and a `LeaderGeometry: PathGeometry | undefined` DP.
  The template adds a leader `Shape` bound to `$LeaderGeometry` (`IsHitTestVisible
  = false`). The VM resolves its target VM from `LeaderTargetId` (via the document's
  by-id map on load / on set), subscribes to the target's `Left/Top/Width/Height`,
  and recomputes `LeaderGeometry` from `boxEdgeToward` (reused math) whenever its
  own bounds or the target's bounds change. No Shape injection into a Canvas —
  the leader is declared in the template and driven by the DP.
- **In-place edit re-plumb:** today double-click calls `container.Text?.BeginEdit()`
  (diagram.ts ~1329) on the Figure. For a text VM the container's own `Text` is
  empty; the editable block lives in the template bound to the VM's `Text`. Route
  the edit entry point so a double-click on a text-VM container begins editing the
  VM's `Text` (surface `Text`/`BeginEdit` on the container by reading its content
  VM, or wire a template-level edit trigger to the VM). The exact seam is resolved
  in the plan against the current edit wiring; the contract: double-click a
  TextNodeVM/CalloutNodeVM → edits that node's text in place, commit updates the VM.
- **Serializer swap:** `node-serializers-default.ts` `text`/`callout` `matches`
  switch to `instanceof TextNodeVM` (excluding Callout) / `instanceof
  CalloutNodeVM`; `deserialize` builds the VMs (`new TextNodeVM()` / `new
  CalloutNodeVM()`), reusing `serializeShapeText`/`applySerializedText` for the
  text payload and the second-pass `leaderTargetId` wiring (now resolving to a VM
  by id). Legacy scenes (`kind:'text'`/`'callout'`) still load — the legacy
  fallback maps them onto the same serializers, now yielding VMs.
- **Consumers:** the diagram demo's `new TextShape()` / `new Callout()` become
  `new TextNodeVM()` / `new CalloutNodeVM()`; `CreateNode('text')` and any
  document factory that produced `TextShape`/`Callout` now emit the VMs.
- **Tests:** TextNodeVM renders its label via the template; edit round-trips a
  label change to the VM; CalloutNodeVM draws a leader to its target and re-routes
  when the target moves; serialize round-trip for both (typed + legacy) reloads as
  the VMs; update the M3 `m3-node-serialize` and `shape-text`/`text-shape`
  assertions from `TextShape`/`Callout` to the VM types.

## Migration & compatibility

- **Dual nothing.** Each stage fully migrates its concern; no lingering dual path.
- **Serialize back-compat holds.** Stage C keeps the legacy `kind:'text'/'callout'`
  read working (now materializing VMs); typed `type:'text'/'callout'` records are
  unchanged in shape (the `data` payload is the same text/leader blob).
- **Consumers stay green after each stage.** The diagram demo and Plexus freeform
  shapes must pass after A, after B, and after C. Text/Callout consumers change
  only in Stage C.

## Testing (gate)

Full `npm test` green with the **two M4 group skips retired** (only the pre-existing
baseline skips remain); `npm run typecheck` + `npm run typecheck:demos` clean; the
diagram demo groups/move/align, connects (with VM ports), and creates/edits text +
callouts. Each stage lists its own regression set above and must be green before the
next stage begins.

## Risks

- **Stage C is the bulk.** The leader (Canvas-injected Shape → template-declared
  `Shape` bound to a `LeaderGeometry` DP) and in-place edit (Figure-intrinsic
  `BeginEdit` → template-hosted editable block) are the entangled seams. Building C
  last means the group bug-fix (A) and port fidelity (B) land green independently,
  and P1 (arch icon+label) is unblocked regardless of C's iteration.
- **Group member key discipline (A).** `positionKeysOf` must pick the correct DP
  keys per member type; a wrong key silently no-ops translate/bbox. Covered by the
  move-group and nested-group tests.
- **Port host parity (B).** `GetSideSlot` shared between Figure and VM must produce
  identical slot distribution, or connectors to VM vs Figure nodes fan out
  differently. Covered by the side-slot distribution test.
- **Edit seam (C).** The double-click→edit path must reach the VM's text, not the
  empty container. Covered by the label-edit round-trip test.

## Out of scope

- `GroupViewModel` (explicitly rejected — `Group` stays a container control).
- Connector VMs (connectors remain endpoint+routing objects; node-model only).
- Syncing in-place label edits back into a consumer's domain model (a P1 follow-up).
