# Paged Diagram Inspector + Size/Position Page — Design

**Status:** approved design, pre-plan
**Date:** 2026-08-20
**Home:** `@pragmatic-lab/mural` (framework), consumed by Plexus via version bump
**Sub-project:** 1 of 2. Sub-project 2 (Text Box text-frame model + page) is deferred and out of scope here.

## Goal

Turn the diagram inspector from a single scrolling `ShapeFormatControl` into a
**multipage inspector** driven by a horizontal `NavigationRail`. Page 1 ("Style")
is the existing shape-format control, moved verbatim. Page 2 ("Size & Position")
is a new editor that replicates PowerPoint's Format-Shape *Size* and *Position*
sections for the selected diagram shape, in **native pixels**.

## Non-goals (this sub-project)

- The **Text Box** section (vertical alignment, autofit, margins, wrap, text
  direction, columns). No model support exists; it is sub-project 2.
- Picture-only fields from the reference screenshot: *Resolution*, *Best scale
  for slide show*, *Relative to original picture size* — disabled even in
  PowerPoint for non-pictures. Dropped.
- **Rotation-aware selection/resize adorners.** Rotation renders (see §4) but the
  selection handles remain axis-aligned around the unrotated bounds. Rotating the
  handles is a follow-up.
- **Multi-select geometry editing** and **connector geometry**. Size/Position
  fields are enabled only for a single selected shape (`Figure`). This is an
  accepted limitation, not a bug.

## Background (current state)

- `DiagramInspector` is a Mural framework model exposed as `DiagramDocument.Inspector`,
  with a `View` (observable `Diagram`) set from the active view's selection.
  Its `DataTemplate` today is:
  `Border > ScrollViewer > ShapeFormatControl` bound to the Diagram's aggregate
  selection DPs (`SelectionFormatFill/Stroke`, cap templates, `SelectionIsConnector`, …).
  (`Mural/src/framework/diagram/diagram.template.mu`, `diagram-inspector.ts`.)
- `NavigationRail` (extends `Selector`) + `NavigationItem` (extends `ContentControl`,
  has `Icon`, `Label`, `IsSelected`) are Mural framework controls. The dock-tabs
  service already uses a **horizontal** `NavigationRail` (items panel =
  `StackPanel[Orientation=Horizontal]`) with `SelectedItem` two-way + a
  `ContentPresenter` presenting the selected panel — the exact paged pattern to reuse.
- Reusable field widgets: `SpinEdit` (`Value/Minimum/Maximum`, two-way), `ComboBox`
  (`ItemsSource/SelectedItem`), `Switch` (`IsChecked`), and the 2-column
  label/control `Grid` used by the layout inspector.
- Shape model (`figure.ts`): geometry is `Left`, `Top` (own DPs) + `Width`,
  `Height` (from `Visual`, default `NaN`, `MetaData.Measure`). All **raw pixels**.
  Persisted node record is `{ id, left, top, w, h }` + type payload. **No** rotation,
  scale, anchor, or z-index. Geometric shapes have `SizeToContent=false`, so
  `Width/Height` are directly settable (setting them rebuilds the scaled geometry).

## Architecture

```
DiagramInspector (model)
├── Pages: ObservableCollection<InspectorPage>   [ShapeStylePage, SizePositionPage]
├── SelectedPage: InspectorPage                  (two-way, driven by the rail)
└── View: Diagram                                (existing; propagated to pages)

DataTemplate[DiagramInspector]
  DockPanel
    NavigationRail (Dock=Top, horizontal)  items=$Pages  selected=$SelectedPage
    ContentPresenter  Content=$SelectedPage  ReuseContentViews=true

DataTemplate[ShapeStylePage]   -> ScrollViewer > ShapeFormatControl  (bindings via $View)
DataTemplate[SizePositionPage] -> ScrollViewer > SizePositionControl (bindings via $View)
```

Each page model is a thin object holding `Title: string` and `View: Diagram`. The
page body binds through `$View` to the Diagram's selection state, so no selection
surface is duplicated onto the page models. `ContentPresenter` + per-type
`DataTemplate` picks the right body automatically; `ReuseContentViews=true`
preserves each page's built view across switches.

### Data flow (Size/Position)

```
single selected Figure
   ⇅ (two-way)
Diagram primary-selection geometry DPs
   ⇅
SizePositionPage.View  →  SizePositionControl (raw DPs: Left/Top/Width/Height/Rotation/BaseW/BaseH)
   ⇅ (view-side conversion: anchor, scale, lock-aspect)
SpinEdit / ComboBox / Switch fields
```

Editing a field writes the raw value up the chain; the Diagram routes the write to
the primary selected `Figure`, which re-arranges/re-renders and marks the document
dirty. Values persist on save.

## Components

### 4.1 Inspector paging

- `DiagramInspector` gains:
  - `PagesKey` (read-only `ObservableCollection<InspectorPage>`).
  - `SelectedPageKey` (`InspectorPage | undefined`, two-way).
  - On `View` change: (re)build the two pages with the new `View`, keep
    `SelectedPage` on the same index (default index 0 = Style).
- `InspectorPage` base (Mural framework model): `Title: string`, `View: Diagram | undefined`.
  Subclasses `ShapeStylePage`, `SizePositionPage` (type discriminators for the
  `DataTemplate` match; no extra members required).
- Template rewrite in `diagram.template.mu` per the Architecture block. The
  `ShapeFormatControl` bindings move under `ShapeStylePage`'s template unchanged in
  meaning (`Fill = $View.SelectionFormatFill`, etc.).

### 4.2 SizePositionControl (new framework control)

- `size-position-control.ts` extends `Control`; default `Style` + `Template` in
  `size-position-control.template.mu` (per the "every control has a default Style"
  rule). Registered in `symbol-table.ts`.
- **Raw DPs** (two-way, bound to the Diagram primary selection):
  `Left`, `Top`, `Width`, `Height`, `Rotation`, `BaseWidth`, `BaseHeight` (numbers),
  and `HasTarget: boolean` (drives `IsEnabled` of the fields).
- **Derived/display DPs** (computed, two-way with conversion):
  - `HorizontalPosition`, `VerticalPosition` — from `Left/Top` and `PositionFrom`.
  - `ScaleWidth`, `ScaleHeight` — percent = size ÷ base × 100.
  - `PositionFrom` — enum `PositionAnchor { TopLeftCorner, Center }` (markup-facing →
    register in `ENUM_MEMBERS`/`DEFAULT_SYMBOLS`).
  - `LockAspectRatio: boolean` — transient control state (not persisted).
- **Conversion logic (in the control, unit-tested):**
  - Anchor: `TopLeftCorner` ⇒ H=Left, V=Top; `Center` ⇒ H=Left+Width/2,
    V=Top+Height/2. Inverse on edit.
  - Scale: `ScaleWidth = Width/BaseWidth*100`; editing `ScaleWidth` sets
    `Width = BaseWidth*ScaleWidth/100`. Base 0/NaN ⇒ scale shown as 100, edits ignored.
  - Lock aspect: when on, editing `Width` scales `Height` by the same ratio (and
    vice versa); `ScaleWidth`/`ScaleHeight` stay linked. Uses the current W:H ratio
    at the moment of edit.
- Template: two labelled sections (**Size**, **Position**) using the 2-column
  label/control `Grid`, `SpinEdit` for numbers (Rotation range e.g. -360..360; sizes
  `Minimum=1`; scale `Minimum` small positive), `ComboBox` for `PositionFrom`,
  `Switch` for `LockAspectRatio`. Fields disabled when `HasTarget=false`.

### 4.3 Figure model additions (`figure.ts`)

- `RotationKey`: `Model.RegisterProperty<number>(Figure, 'Rotation', 0, MetaData.Render | MetaData.BindsTwoWayByDefault)`.
  On change, apply `RenderTransformOrigin=(0.5,0.5)` + `RenderTransform=RotateTransform(Rotation)`.
  Rotation is visual only (no layout/measure effect) — the unrotated `Width/Height`
  remain the Size values, matching PowerPoint.
- `BaseWidthKey`, `BaseHeightKey`: `Model.RegisterProperty<number>(…, NaN, MetaData.None)`.
  Seeded to the initial `Width/Height` when the shape is created/placed; used only
  for Scale %. If unset on an old file, treated as equal to current size (scale 100%).

### 4.4 Diagram primary-selection geometry (`diagram.ts`)

- `HasSingleShapeSelectionKey` (read-only `boolean`): true iff exactly one selected
  item is a geometry `Figure`.
- Two-way DPs reflecting that single Figure: `SelectedNodeLeftKey`,
  `SelectedNodeTopKey`, `SelectedNodeWidthKey`, `SelectedNodeHeightKey`,
  `SelectedNodeRotationKey`, and read-only `SelectedNodeBaseWidthKey`,
  `SelectedNodeBaseHeightKey`.
  - **Read:** mirror the primary Figure's live values; update when selection or the
    Figure's geometry changes.
  - **Write:** route to the primary Figure (`fig.Left = v`, etc.), which re-arranges;
    ignored when `HasSingleShapeSelection` is false.
- The `SizePositionPage` template binds the control's raw DPs to these.

### 4.5 Persistence (`node-serialization.ts`, `node-serializers-default.ts`, `diagram-document.ts`)

- Extend the node base record with **optional** `rot?: number`, `bw?: number`,
  `bh?: number`.
- Serialize: write `rot`/`bw`/`bh` when meaningful (omit `rot` when 0; omit base when
  equal to `w/h`) to keep diffs small and stay backward-compatible.
- Load: read them when present; absent ⇒ rotation 0, base = `w/h`. Older Mural loading
  a file with the new fields ignores the unknown keys (no break).

## Edge cases

- **No selection / multi-select / connector:** Size/Position fields disabled
  (`HasTarget=false`); the page still renders with a hint. Style page unaffected.
- **`Width/Height` NaN** (never explicitly sized): show blank/0 and treat first edit
  as the explicit size; base seeds from the first concrete size.
- **Scale with zero base:** show 100%, ignore scale edits (guard divide-by-zero).
- **Rotation persistence forward-compat:** documented above; round-trips.

## Testing

Unit tests (Node test runner, files under `tests/` next to source):

- `size-position-control`: anchor conversion both directions; scale ↔ size both
  directions; lock-aspect links W/H and scale; zero-base guard; disabled when
  `HasTarget=false`.
- `figure`: setting `Rotation` installs a `RotateTransform` with the right angle and
  origin; `BaseWidth/Height` default behavior.
- serialization: a shape with rotation + base size round-trips (`toStore`→`fromStore`);
  a legacy record (no `rot/bw/bh`) loads with rotation 0 / base = size.
- `diagram` primary-selection DPs: reflect a single selected Figure; writes route to
  it; `HasSingleShapeSelection` false at count 0/2 disables writes.
- inspector paging: `Pages` populated `[Style, SizePosition]`; `SelectedPage` switches;
  each page type resolves its `DataTemplate`; `View` propagates to pages.

## Rollout

- Publish `@pragmatic-lab/mural` to Verdaccio (patch/minor) and bump Plexus. No Plexus
  source change expected beyond the version bump (the inspector is registered/opened
  as today; the new pages are framework-provided). Verify Plexus suite green; live
  smoke the paged inspector + Size/Position editing.

## Open follow-ups (future sub-projects / tasks)

- Sub-project 2: Text Box text-frame model + page.
- Rotation-aware selection/resize adorners.
- Multi-select and connector geometry editing.
