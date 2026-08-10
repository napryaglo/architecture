# M2 — Shapes on the VM Engine (`ShapeNodeVM`)

**Parent:** `2026-08-10-unified-node-viewmodel-engine-design.md` (§3, stage M2).
**Depends on:** M1 (container hosts VM content + two-way position binding).

**Goal:** Migrate freeform shapes off the intrinsic-`Figure` path onto the VM engine:
`Nodes` holds `ShapeNodeVM`s rendered by a `[DataType=ShapeNodeVM]` DataTemplate inside
the M1 container; `CreateNode`/`CombineSelection` emit VMs; `DeleteNodes` and
ungrouped-shape `Combine` operate on VM items; resize drives the geometry rescale
through the container→VM binding.

## Scope

**In:** `ShapeNodeVM`, the shape DataTemplate, `CreateNode` + `CombineSelection`
emitting VMs, `DeleteNodes` + ungrouped `CombineSelection` operating on VM items,
resize (container→VM→geometry rescale), and migrating the Figure-assuming shape tests.

**Out (deferred):**
- **Groups → M4.** `Group`/`Ungroup` and the `Group` control stay Figure-based; they do
  not accept VM shapes yet. Grouping VM shapes is unsupported in M2/M3. The
  group-related `diagram-distribute-newarch` tests are **temporarily skipped**
  (`test.skip` + a `TODO(M4)` note) and re-enabled when `GroupViewModel` lands.
- **Connectors + ports → M3/M4.** Connector endpoints stay Figure-based; the
  `DeleteNodes` connector cascade for VM items is M3. Port topology falls back to the
  default provider for VM shapes; per-kind fidelity is M4.
- **Typed-VM serialize → M3.** M2 keeps Save/Load working via the legacy format (§5).
- **Text/Callout VMs → M4.**

## Design

### 1. `ShapeNodeVM` — `framework/diagram/shape-node-vm.ts` (new)

`extends NodeViewModel`, porting `Figure`'s geometry logic verbatim:
- DPs: `Kind` (string), `Geometry` (scaled `PathGeometry | undefined`), `Fill` (Brush),
  `Stroke` (Pen). Private `_source` (unit-1 `PathGeometry`).
- `static fromKind(kind, left, top, opts?)` — `SHAPE_CATALOG_MAP.get(kind).unit()` →
  `_source`; set `Width`/`Height`; `_rebuildGeometry()`.
- `static fromSource(source, left, top, opts?)` — combined-geometry path (Combine).
- On `Width`/`Height` change → `_rebuildGeometry()` = `scaleGeometry(_source, W, H)`
  (identical to `Figure._rebuildGeometry`). `_getSource()` for Combine.
- Satisfies the `CombinableShape` duck-type (`shape-catalog.ts` `mergeShapes`), so
  Combine consumes VMs with no adapter.

Fill/Stroke defaults match `Figure` (the same `DEFAULT_FILL` / stroke-from-settings), so
a migrated shape looks identical.

### 2. Shape DataTemplate — `diagram.template.mu`

`DataTemplate [DataType = ShapeNodeVM]` drawing the shape the Figure's intrinsic
`PART_Shape` used to paint:
```
DataTemplate [ DataType = ShapeNodeVM ] {
    Shape [ Geometry = $Geometry, Fill = $Fill, Stroke = $Stroke, Width = $Width, Height = $Height ]
}
```
`$`-bindings resolve against the VM (the container sets the resolved visual's
`DataContext = VM`). The container's intrinsic `PART_Shape` stays but is inert for VM
shapes (`Geometry` undefined on the container Figure); its removal waits until nothing
rides the intrinsic path (M4, after text/callout migrate).

### 3. Mutation APIs — `diagram-document.ts`

- `CreateNode(kind,x,y)` → `ShapeNodeVM.fromKind(...)`, assign `Id`, `Nodes.Add(vm)`;
  return the VM. (Return type widens from `Figure | null` to `ShapeNodeVM | null`.)
- `CombineSelection(items, mode)` → collect the `ShapeNodeVM` leaves among `items`
  (ignore Figure-based Groups for now — group-combine is M4), `mergeShapes(...)`,
  `ShapeNodeVM.fromSource(...)`, copy Fill/Stroke, replace inputs.
- `DeleteNodes(items)` → remove `NodeViewModel` entries from `Nodes` (instanceof check
  adds `NodeViewModel`; the connector cascade for VM items is M3, so M2 leaves the
  existing Figure cascade untouched and notes VM-node connector cleanup as M3).
- `Group`/`Ungroup` unchanged (Figure-based); documented as not accepting VM shapes
  until M4.

### 4. Resize

The `SelectionResize` adorner writes the container `Figure.Width`/`Height`; the M1
two-way binding pushes those to `ShapeNodeVM.Width`/`Height`, whose change handler
rebuilds `Geometry`, which the DataTemplate's `Shape` re-renders. Verify the adorner
targets the container (it selects `_selectedContainers`, which are Figures) so the
chain holds.

### 5. Serialize interim

`_serialize`/`_deserialize` stay Figure-shaped (M3 replaces them). For M2, serialize a
`ShapeNodeVM` into the existing `{kind,left,top,w,h,d}` node record by reading the VM's
`Kind`/`Left`/`Top`/`Width`/`Height`/`_getSource()`; `_deserialize` still rebuilds via
`Figure.fromKind`/`fromSource` **but wraps into a `ShapeNodeVM`** so a loaded scene is on
the VM path too. Keep this minimal — it is throwaway, replaced by M3's typed-VM format.

## Testing

- **`ShapeNodeVM` geometry:** `fromKind('rectangle')` builds `_source` + scaled
  `Geometry`; a `Width`/`Height` change rescales `Geometry`.
- **Render:** `doc.CreateNode('rectangle')` yields a `ShapeNodeVM`; after layout its
  container hosts a `Shape` (bound `Geometry`) via the DataTemplate; the container's
  intrinsic `PART_Shape` has no geometry.
- **Delete:** `DeleteNodes([vm])` removes it from `Nodes`.
- **Combine:** `CombineSelection([vmA, vmB], Union)` → one `ShapeNodeVM`, inputs gone.
- **Resize:** setting the container `Figure.Width` rescales the VM's `Geometry`.
- **Migrated `diagram-distribute-newarch`:** Distribute/Align assert through the
  container (`diagram.Generator.ContainerFromItem(vm).ArrangedRect`); the two
  **group** cases (`Dragging a Figure inside a Group…`, `AlignCenter with a Group…`)
  are `test.skip`ped with `TODO(M4: groups on VM engine)`.
- **Serialize interim:** Save→Load round-trips a `CreateNode('rectangle')` scene and the
  reloaded node is a `ShapeNodeVM`.
- **Demo:** `demo/demos/diagram` creates/drags/aligns/combines shapes (group/connector
  actions are the known M3/M4 gap).

## Risks

- **Shared `CreateNode` collapse.** `CreateNode` returning a VM breaks every test/asset
  that assumed a `Figure` with `.ArrangedRect`; all such shape assertions route through
  the container. The group cases can't be migrated yet (skipped, not deleted).
- **Resize chain** must survive container→VM→geometry; a broken link leaves shapes that
  move but don't resize.
- **Combine + groups:** `CombineSelection` must ignore Figure-based Group members
  cleanly (they can't be VM leaves yet) rather than crash on a mixed selection.
- Interim non-green: group/connector demo actions are knowingly broken between M2 and
  M3/M4 — acceptable per the agreed staging.
