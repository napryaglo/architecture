# Uniform Figure Realization — Design

**Status:** Approved for planning (2026-08-19)

## Goal

Make every diagram `Figure` realize identically. Remove `Figure`'s dedicated
`Geometry` and `Kind` device properties; carry each shape's identity in a single
per-instance geometry that drives the inherited `Visual` paint and clip seams.
After this change the only per-instance difference between two figures is that
geometry — the class, the template, and the render path are uniform.

## Background — current state

`Figure extends ContentControl` (framework/diagram/figure.ts). Today a Figure:

- carries its own `GeometryKey` (a `PathGeometry`) and `KindKey` (a catalog
  string), plus a private `_source` (the unit-1 path that is the real source of
  truth). Resize rebuilds the visible geometry: `_rebuildGeometry()` →
  `this.Geometry = scaleGeometry(_source, W, H)`.
- does **not** paint the shape itself. Its default template `DefaultFigure`
  (diagram.template.mu) hosts an inner `Shape` primitive (`PART_Shape`) bound to
  `$$Geometry / $$Fill / $$Stroke / $$Width / $$Height`, plus `PART_Content`
  (a `ContentPresenter`) and `PART_LabelHost` (a `Border` holding the
  `ShapeText`).

The framework already grew every seam this needs:

- `Visual.RenderOverride` (visual-engine/visual.ts:1563) paints `Fill` + `Stroke`
  over `buildPaintGeometry(size, half)`, a no-op only when **both** Fill and
  Stroke are unset. `ContentControl` / `Control` / `Element` do not override it,
  so a `Figure` already reaches this base paint. Concrete shapes instead draw
  their geometry directly in an overridden `RenderOverride` (basic/shapes/shape.ts:141)
  with a centred stroke and no self-clip, which keeps the stroke crisp.
- **Two clip slots, verified in the renderer.** `Clip` (visual.ts:324) is a
  whole-subtree mask: the SVG renderer applies it to `info.outer`, which wraps
  the Visual's own paint **and** its children (svg-renderer.ts:473) — so putting
  the shape in `Clip` would shave the outer half of the own stroke, and there is
  no geometry-offset utility to inset an arbitrary path to compensate.
  `ChildClip` (visual.ts:345) is a **children-only** mask, applied to a child
  group inserted *after* own paint so "own paint stays unclipped"
  (svg-renderer.ts:493; test svg-renderer.test.ts:402). It is driven by
  `ClipChildren` (visual.ts:339, default off) → `buildChildClipGeometry(size)`
  (visual.ts:1210) at the tail of Arrange. Its doc comment is the exact
  behaviour we want: *"clips children to a shape while the stroke itself keeps
  painting."*

Because today `buildPaintGeometry` base returns the **bounds rect** and a Figure
has a Fill default (`OverrideMetadata Figure.FillKey = DEFAULT_FILL`) plus a ctor
Stroke, a Figure currently self-paints a filled+stroked **bounds rectangle**
behind its `PART_Shape` — a latent artifact this refactor removes.

## Decisions (locked)

1. **Visual paints the shape; delete `PART_Shape`.** The inherited/overridden
   `Visual` paint path draws the figure; the template becomes content + label
   only.
2. **One per-instance geometry drives paint + clip via the seams — not the raw
   `Clip` DP.** Store the scaled silhouette in a private field; surface it
   through `buildPaintGeometry` (own paint), `buildChildClipGeometry` (children
   mask), and `buildClipGeometry` (hit / clip-to-bounds). The raw `Clip` DP is
   left untouched, because it self-masks and would shave the stroke.
3. **Children clip to the silhouette via `ChildClip`.** Set `ClipChildren = true`
   so content + label are masked to the shape while the own stroke keeps painting
   crisp. This is the base mechanism built for exactly this.
4. **Delete `Geometry` and `Kind` DPs.** Delete `Figure.GeometryKey`,
   `Figure.KindKey`, and all `Kind` consumers.
5. **Default ports become bbox for all.** Delete the `Kind`-keyed
   `DEFAULT_PORT_PROVIDERS` table; `resolveDefaultPortProvider` always returns the
   bbox `FALLBACK_PROVIDER`. Special topologies are opt-in via
   `Figure.PortProvider`.
6. **Hit-testing stays bbox (unchanged).** A draggable node wants a forgiving
   grab area; confining picking to the silhouette is orthogonal and not done
   here.
7. **Scope = `Figure` only.** `ShapeNodeVM` and the VM-as-items DataTemplate path
   are a follow-up. The self-paint guard (below) keeps that path from regressing
   meanwhile.

## Design

### The single geometry + the seams

- Delete `Figure.GeometryKey` and its `Geometry` accessors. Keep `_source`
  (unit-1) as the identity, plus a private `_shape: Geometry | undefined` — the
  scaled silhouette, rebuilt on construct-from-source and on Width/Height change:
  `this._shape = scaleGeometry(this._source, this.Width, this.Height)`
  (replaces the old write to the `Geometry` DP; same trigger points).
- Paint (own, crisp): override `buildPaintGeometry(size, _inset): Geometry` to
  return `this._shape ?? super.buildPaintGeometry(size, _inset)`. The inherited
  `Visual.RenderOverride` then draws `Fill` + `Stroke` over the silhouette. Own
  paint is not self-clipped (we never set the `Clip` DP), so the centred stroke
  straddles the outline exactly as `Shape` does — full width, crisp. The `inset`
  is intentionally ignored: it exists to keep a stroke inside a *self* mask, and
  there is no self mask here.
- Children mask: override `buildChildClipGeometry(size): Geometry` to return
  `this._shape`, and set `this.ClipChildren = true`. `syncChildClip` fills the
  `ChildClip` slot at Arrange; the renderer clips content + label to the
  silhouette while own paint stays out of that group.
- Hit / clip-to-bounds consistency: override `buildClipGeometry(size): Geometry`
  to return `this._shape ?? super.buildClipGeometry(size)`. (Not used for the own
  paint or the children mask; kept coherent for any future `ClipToBounds` or
  silhouette hit-testing. `ClipToBounds` stays **off**.)
- **Never set the raw `Clip` DP.** All shaping goes through the three
  `build*Geometry` seams + `ClipChildren`.

### Self-paint guard

`Figure.RenderOverride(dc)`:

```ts
protected override RenderOverride(dc: DrawingContext): void
{
    if (this._shape === undefined) return;   // neutral container: nothing to paint
    super.RenderOverride(dc);                // Fill + Stroke over buildPaintGeometry (= _shape)
}
```

A shape Figure paints its silhouette; a neutral container Figure (wrapped VM, no
`_source`, no `_shape`) paints nothing — removing the current bounds-rect artifact
instead of carrying it into the self-paint model.

### Template

`DefaultFigure` (diagram.template.mu): delete `PART_Shape` and its bindings. Keep
`PART_Content` (`ContentPresenter`) and `PART_LabelHost` (`Border` holding the
`ShapeText`). Both are children, so `ChildClip` masks them to the silhouette
(decision 3). The Figure's own paint draws the shape under them.

### Kind removal — all consumers

- `Figure.KindKey` + `Kind` accessors — deleted.
- `fromKind` / `ApplyCatalogKind` / `_setKindFromCatalog`: keep the `kind`
  parameter as a **construction-time catalog selector**
  (`SHAPE_CATALOG_MAP.get` → `entry.unit()` → `_source`), but stop storing it on
  a DP. `_setKindFromCatalog` sets `_source` and rebuilds `_shape`.
- `FigureFromSourceOptions.kind` (serialization round-trip hint) — deleted.
- `FIELD_SOURCE_NAMES`: drop `'Kind'`.
- `_resolveField` + `FieldKind.Kind`: drop the `Kind` label-field token. Confirm
  no template/demo depends on `{Kind}` before removal.
- `default-port-providers.ts`: delete `DEFAULT_PORT_PROVIDERS`;
  `resolveDefaultPortProvider(host)` returns `FALLBACK_PROVIDER` and drops the
  `{ readonly Kind: string }` host shape.

### Serialization — not affected (Figure scope)

Verified: the framework node serializers match `ShapeNodeVM` / `TextNodeVM` /
`CalloutNodeVM` (node-serializers-default.ts:126,199,231) — **none matches a bare
`Figure`**. Persisted geometric shapes are `ShapeNodeVM` (the `'shape'`
serializer owns `kind` + `d`), which is out of scope. A Figure-with-geometry
appears only where it is not persisted:

- toolbox tile previews — `ShapeVisualResolver.Resolve` → `Figure.fromKind`
  (shape-visual-resolver.ts:21),
- demos that subclass `Figure` + `ApplyCatalogKind` (e.g. commands-vm.mts),
- any "items-are-Figures" diagram that holds Figures with geometry directly.

So this change touches **no serialization**. The `kind`/`d` persistence and its
back-compat live on `ShapeNodeVM` and move with the `ShapeNodeVM` follow-up.

## Data flow (after)

```
construct(fromKind/fromSource) ─▶ _source (unit-1) ─▶ _rebuildGeometry
     └▶ this._shape = scaleGeometry(_source, W, H); ClipChildren = true
Arrange ─▶ syncChildClip: ChildClip = buildChildClipGeometry = _shape (children only)
Render  ─▶ Figure.RenderOverride: _shape? super : return
             └▶ Visual paints Fill+Stroke over buildPaintGeometry(= _shape)   [own paint, crisp]
           children (content/label) rendered in the ChildClip group           [masked to _shape]
Resize (W/H change) ─▶ _rebuildGeometry ─▶ _shape rescaled ─▶ re-mask + re-paint
```

## Out of scope / follow-ups

- **`ShapeNodeVM` + VM-as-items path.** The `DataTemplate [DataType=ShapeNodeVM]`
  renders its own inner `Shape`; the wrapping container Figure stays neutral
  (no `_source` → self-paint guard paints nothing). Folding `ShapeNodeVM` onto
  the same model is a separate change.
- **Overlay label layer** so labels can escape the silhouette clip.
- **Silhouette hit-testing** for figures, if the bbox grab area proves wrong.

## Accepted consequences

- Labels clip to the shape silhouette (text can be cut on stars / arrows / thin
  shapes). Own outlines stay crisp.
- Reloaded ellipse / triangle / heart figures get bbox ports (their prior
  radial / vertex / custom defaults are not restored unless `PortProvider` is set).

## Testing strategy

Unit tests (Mural `tests/` convention, `tsx --test`):

- **Own paint = silhouette, crisp** — a Figure `fromKind('ellipse')` emits one
  `DrawGeometry(Fill, Stroke, <ellipse>)` over a recording DrawingContext (not a
  bounds rect); the stroke geometry is the full silhouette (no inset / no shave).
- **Children clip** — `ClipChildren` is true and `buildChildClipGeometry(size)`
  returns the silhouette; the `Clip` DP is never set by the Figure.
- **Self-paint guard** — a bare `new Figure()` (no `_source`) has
  `_shape === undefined` and its `RenderOverride` emits nothing.
- **Resize** — Width/Height change rescales `_shape` (assert via
  `buildPaintGeometry` / `buildChildClipGeometry`).
- **Kind removed** — `Figure` has no `Kind` DP / accessor; `fromKind` still
  builds the correct `_source`; `resolveDefaultPortProvider` returns the bbox
  provider for every input.
- **Preview + demo render** — `ShapeVisualResolver.Resolve('ellipse', Tile)`
  yields a Figure whose own paint is the ellipse silhouette (no bounds rect); a
  demo `ApplyCatalogKind('rectangle')` Figure paints its rect.
- **Regression** — existing Figure drag / selection / side-endpoint / label
  tests stay green. (No serialization test — Figure geometry is not persisted;
  that belongs to the `ShapeNodeVM` follow-up.)

Full framework suite (`npm test`) green before merge; `.mu` under `src/**` +
`demo/**` referencing `Figure.Geometry` / `Kind` / `PART_Shape` swept and rebuilt
(`build:templates` + `build:demos`; tracked `.mu.js`).

## Risks

- **`.mu` / demo sweep.** Any template binding `$$Geometry` / `Kind` on a Figure,
  or referencing `PART_Shape`, must be updated; stale tracked `.mu.js` throw
  "Cannot read properties of undefined (reading 'descriptor')".
- **VM-as-items neutrality.** Verify a wrapped `ShapeNodeVM`'s container Figure
  stays transparent (guard paints nothing) so the DataTemplate's shape is not
  backed by a stray rect.
- **`{Kind}` field usage.** Grep templates/demos for `{Kind}` before removing the
  field token.
- **ChildClip cost.** `ClipChildren` adds a per-Figure clip group; confirm no
  measurable render regression on dense diagrams (the clip geometry is rebuilt
  only at Arrange, parallel to the existing `ClipToBounds` path).
