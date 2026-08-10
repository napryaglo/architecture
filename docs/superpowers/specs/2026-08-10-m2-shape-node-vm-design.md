# M2 — Shapes on the VM Engine (`ShapeNodeVM`)

**Parent:** `2026-08-10-unified-node-viewmodel-engine-design.md` (§3, stage M2).
**Depends on:** M1 (container hosts VM content + two-way position binding).

**Goal:** Migrate freeform shapes off the intrinsic-`Figure` path onto the VM
engine: `Nodes` holds `ShapeNodeVM`s rendered by a `[DataType=ShapeNodeVM]`
DataTemplate inside the M1 container; `CreateNode`/`CombineSelection` emit VMs; the
mutation APIs (`Delete`/`Group`/`Ungroup`/`Combine`) and `Group` itself operate on VM
items. The demo stays green at the stage boundary (holistic — the user's choice).

## Scope

**In:** `ShapeNodeVM`, the shape DataTemplate, `GroupViewModel`, `CreateNode` +
`CombineSelection` emitting VMs, `DeleteNodes`/`Group`/`Ungroup`/`CombineSelection`
operating on VM items, resize (container→VM→geometry rescale), and migrating the
Figure-assuming tests (`diagram-distribute-newarch` + demo) to container/VM shape.

**Out (deferred):**
- **Serialize** — the typed-VM `.diagram` format is M3. Until then Save/Load stay on
  the current Figure format; M2 keeps `_serialize`/`_deserialize` working by mapping
  VM↔legacy (or gating the change behind M3). See §6.
- **Connectors + ports fidelity** — M4. In M2 connectors keep anchoring to the
  **container Figure** (the visual under the cursor); only the `DeleteNodes` connector
  cascade learns the VM↔container mapping (§5). Port topology falls back to the default
  provider for VM shapes; per-kind port fidelity is M4.
- **Text/Callout VMs** — M3.

## Design

### 1. `ShapeNodeVM` — `framework/diagram/shape-node-vm.ts` (new)

`extends NodeViewModel`, porting `Figure`'s geometry logic:
- DPs: `Kind` (string), `Geometry` (scaled `PathGeometry`), `Fill` (Brush), `Stroke`
  (Pen). Private `_source` (unit-1 `PathGeometry`).
- `static fromKind(kind, left, top, opts?)` — pulls `SHAPE_CATALOG_MAP.get(kind).unit()`
  into `_source`, sets `Width`/`Height`, rebuilds `Geometry`.
- `static fromSource(source, left, top, opts?)` — combined-geometry path (Combine).
- On `Width`/`Height` change → `_rebuildGeometry()` = `scaleGeometry(_source, W, H)`
  (identical to `Figure._rebuildGeometry`). Exposes `_getSource()` for Combine.
- Satisfies the `CombinableShape` duck-type (`shape-catalog.ts`), so `mergeShapes`
  consumes VMs directly.

### 2. Shape DataTemplate — `diagram.template.mu`

`DataTemplate [DataType = ShapeNodeVM]` drawing the shape (the visual that used to be
the Figure's intrinsic `PART_Shape`):
```
DataTemplate [ DataType = ShapeNodeVM ] {
    Shape [ Geometry = $Geometry, Fill = $Fill, Stroke = $Stroke, Width = $Width, Height = $Height ]
}
```
`$`-bindings resolve against the VM (the container sets the template visual's
`DataContext = VM`). The container's own intrinsic `PART_Shape` stays for now but is
inert for VM shapes (`Geometry` undefined on the container Figure); it is removed once
nothing rides the intrinsic path (end of M2 / M3).

### 3. `GroupViewModel` — `framework/diagram/group-view-model.ts` (new)

`Group` today is a `ContentControl` holding `ObservableCollection<Figure | Group>`.
Migrate to a `GroupViewModel extends NodeViewModel` holding
`ObservableCollection<NodeViewModel>` members with the same bbox-tracking semantics
(members' `Left`/`Top`/`Width`/`Height` changes recompute the group bounds), plus a
`[DataType=GroupViewModel]` DataTemplate rendering the group frame. `Parent`
back-references move to `NodeViewModel`. `Group`/`Ungroup`/leaf enumeration operate on
VM members. The existing `Group` control is retired once nothing constructs it.

### 4. Mutation APIs — `diagram-document.ts`

- `CreateNode(kind,x,y)` → `ShapeNodeVM.fromKind(...)`, `Nodes.Add(vm)`; returns the VM.
- `CombineSelection(items, mode)` → collect `ShapeNodeVM` leaves, `mergeShapes(...)`,
  `ShapeNodeVM.fromSource(...)`; replace inputs.
- `DeleteNodes(items)` → remove `NodeViewModel`/`GroupViewModel` entries from `Nodes`
  (instanceof checks retargeted from `Figure|Group` to the VM types).
- `Group`/`Ungroup` → operate on VM members via `GroupViewModel`.
- `_topLevel` walks the VM `Parent` chain.

### 5. `DeleteNodes` connector cascade (VM↔container)

Connector endpoints still hold the **container Figure** (M4 migrates them). The cascade
that drops connectors whose endpoint references a deleted node must map the deleted VM
items to their containers via `diagram.Generator.ContainerFromItem(vm)` (or the reverse
map the generator exposes). The connector-create behavior is unchanged (it anchors to
the container under the cursor).

### 6. Serialize interim

`_serialize`/`_deserialize` are Figure-shaped and belong to M3. For M2, either:
(a) keep them functioning by serializing the container Figures (walk `Nodes` → containers)
into the legacy format, or (b) mark Save/Load as M3-pending in the demo and skip the
round-trip test. Chosen: **(a)** — serialize the VM's `Kind`/`Left`/`Top`/`W`/`H` into
the existing `{kind,left,top,w,h,d}` node record so Save/Load keep working; M3 replaces
this with the typed-VM format.

## Testing

- **ShapeNodeVM geometry:** `fromKind('rectangle')` builds `_source` + scaled `Geometry`;
  size change rescales.
- **Render:** a `CreateNode('rectangle')` VM renders a `Shape` (its `Geometry`) in the
  container subtree via the DataTemplate; the intrinsic `PART_Shape` is empty.
- **Mutation on VMs:** Delete removes the VM; Group wraps two VMs into a `GroupViewModel`
  (bbox = union); Ungroup restores; Combine(union) of two VMs yields one `ShapeNodeVM`.
- **Migrated `diagram-distribute-newarch`:** Distribute/Align now assert through the
  container (`diagram.Generator.ContainerFromItem(vm).ArrangedRect`), since `CreateNode`
  returns a VM. Group-drag + AlignCenter-with-group cases go through `GroupViewModel`.
- **Serialize interim:** Save then Load round-trips a `CreateNode('rectangle')` scene
  (legacy format via §6a).
- **Demo:** `demo/demos/diagram` still creates/drags/groups/combines/aligns shapes.

## Risks

- **Group rewrite** is the largest piece — bbox tracking, Parent chains, leaf/subgroup
  enumeration, group-drag partners (`figure.ts` reads `Parent`/`Members` duck-typed).
  The duck-typed group-drag in `Figure.OnPointerDown` already tolerates a `Parent`/
  `Members` shape, which eases the container↔VM bridge.
- **Resize** must drive `container.Width/Height → VM.Width/Height → Geometry` — verify
  the SelectionResize adorner writes the container, whose two-way binding updates the VM.
- **Connector cascade** VM↔container mapping (§5) — a wrong map silently orphans
  connectors on delete.
- Holistic scope: this is materially larger than M1. The plan will be many tasks; each
  must keep the demo green.
