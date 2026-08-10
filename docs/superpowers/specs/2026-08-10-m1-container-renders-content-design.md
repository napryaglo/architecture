# M1 — Figure Container Renders Content (VM path)

**Parent:** `2026-08-10-unified-node-viewmodel-engine-design.md` (§3, stage M1).

**Goal:** Make the wrapped-VM node path real: when `DiagramDocument.Nodes` holds a
node view-model, the Diagram wraps it in a `Figure` **container** whose `Content` is
the VM, hosted by a `ContentPresenter` that resolves the VM's `[DataType=…]`
DataTemplate, with the container's position/size two-way bound to the VM. The
intrinsic-shape (items-are-Figures) path is untouched — both coexist after M1.

## Scope

In: the container `ContentPresenter`, a `NodeViewModel` position/size base, the
two-way position binding in `bindContainer`, and a proof VM + DataTemplate in tests.
Out: migrating shapes/text/callout (M2/M3), serialize (M3), Plexus (P1).

## Design

### 1. `NodeViewModel` base — `framework/diagram/node-view-model.ts` (new)

The position/size contract every node VM satisfies. A plain `Model` subclass:

```ts
export class NodeViewModel extends Model {
    public static readonly LeftKey   = Model.RegisterProperty<number>(NodeViewModel, 'Left',   0, MetaData.None);
    public static readonly TopKey    = Model.RegisterProperty<number>(NodeViewModel, 'Top',    0, MetaData.None);
    public static readonly WidthKey  = Model.RegisterProperty<number>(NodeViewModel, 'Width',  DiagramSettings.ShapeDefaultSize(), MetaData.None);
    public static readonly HeightKey = Model.RegisterProperty<number>(NodeViewModel, 'Height', DiagramSettings.ShapeDefaultSize(), MetaData.None);
    // get/set for Left, Top, Width, Height
}
```

Node VMs (ShapeNodeVM, ArchNodeVM, …) extend this in later stages. Not itself
serializable — the per-VM serializers (M3) read these DPs.

### 2. Figure container template — add a `ContentPresenter`

`ContentControl.applyContent` slots the DataTemplate-resolved visual into
`this.templateContentPresenter`. The current `DefaultFigure` template (a Canvas with
`PART_Shape` + `PART_LabelHost`) has none, so VM content never renders. Add a
`ContentPresenter` sized to the figure footprint:

```
Template x:key="DefaultFigure" [TargetType = Figure] {
    Canvas {
        Shape x:name="PART_Shape" [ Geometry = $$Geometry, Fill = $$Fill, Stroke = $$Stroke, Width = $$Width, Height = $$Height ]
        ContentPresenter x:name="PART_Content" [ Width = $$Width, Height = $$Height ]
        Border x:name="PART_LabelHost" [ Width = $$Width, Height = $$Height ]
    }
}
```

- **Intrinsic shape (items-are-Figures):** `Content` is undefined → presenter empty →
  the `Shape` paints as today. No behavior change.
- **VM container:** `Content` = VM, `Geometry` undefined → `Shape` paints nothing, the
  presenter hosts the resolved `[DataType]` visual (its `DataContext` = the VM).

### 3. Two-way position binding — `Diagram.bindContainer`

`bindContainer` already sets `Tag`/`DataContext`/`Content = item` for a `Model` item.
When the item is a `NodeViewModel`, additionally install two-way bindings so drag /
arrow-nudge on the container write back to the VM and serialize (M3) reads position
off the VM:

```ts
if (item instanceof NodeViewModel) {
    node.set_property_value(Figure.LeftKey,   new Binding(item, 'Left',   BindingMode.TwoWay));
    node.set_property_value(Figure.TopKey,    new Binding(item, 'Top',    BindingMode.TwoWay));
    node.set_property_value(Figure.WidthKey,  new Binding(item, 'Width',  BindingMode.TwoWay));
    node.set_property_value(Figure.HeightKey, new Binding(item, 'Height', BindingMode.TwoWay));
}
```

`Figure.Left/Top` are `BindsTwoWayByDefault`, so writes from drag propagate to the VM.
`RebindContainerForItemOverride` (recycle) runs the same `bindContainer`, so recycled
containers rebind cleanly.

### 4. Selection

`bindContainer` already sets `node.Tag = item`, and `Selector.exposedValueOf` returns
the `Tag`, so `SelectedItem`/`SelectedItems`/`SelectionChanged` surface the VM, not the
container. No change needed — covered by a regression test.

## Testing

New `framework/diagram/tests/m1-container-content.test.ts`:

- **Renders template:** a `TestNodeVM extends NodeViewModel` + a registered
  `[DataType=TestNodeVM]` DataTemplate (a `Border` containing a `TextBlock` bound to a
  VM string DP). Add the VM to `doc.Nodes`, lay out, assert the container's
  `templateContentPresenter` hosts the template's visual (a `Border`) — and the
  "can not resolve template" red diagnostic is NOT present.
- **Position two-way in:** set `vm.Left = 120` → container `Figure.Left === 120` and
  `ArrangedRect.X === 120` after layout.
- **Position two-way out (drag):** write container `Figure.Left = 60` (simulating a
  drag commit) → `vm.Left === 60`.
- **Selection surfaces VM:** `HandleContainerClick(container)` → `SelectedItem === vm`.
- **Regression:** an intrinsic `CreateNode('rectangle', …)` still renders its shape
  (`PART_Shape` geometry present, presenter empty) and the existing
  `diagram-distribute-newarch` suite stays green.

## Risks / notes

- The `ContentPresenter` must not steal hit-testing from the container's drag
  (Figure owns `OnPointerDown`). If the presenter swallows pointer events, the drag
  breaks — verify the drag regression and, if needed, set the presenter
  `IsHitTestVisible = false` (the arch/tile visuals are display-only; the container
  owns interaction).
- `NodeViewModel` importing `DiagramSettings` for the default size keeps sizing
  consistent with `Figure`; if that creates a cycle, inline the constant.
