# LayoutTransform — Design

**Date:** 2026-08-14
**Status:** Approved (brainstorm) — pending spec review → implementation plan
**Owner repo:** Mural (framework primitive on `Visual`).

## Goal

Add a WPF-style **`LayoutTransform`** to mural: a `Transform` that participates in
**layout** (it changes an element's measured/arranged *size*), not just rendering.
Unlike `RenderTransform` — applied after layout, invisible to measure — a
`LayoutTransform` makes the layout system see the transformed size, so a scaled
element reports a larger `DesiredSize` and a containing `ScrollViewer` grows its
scrollable extent (real scrollbars). This is the primitive the diagram's
"scrollbars + zoom" rework (SP4) builds on.

## Why (motivating case)

mural has **only `RenderTransform`** (post-layout) and **no `LayoutTransform`**
(verified: zero occurrences). A render-scaled panel still reports its natural size,
so a wrapping `ScrollViewer` never grows its extent — which is exactly why the
first diagram-zoom attempt used a pure render-transform camera with a
scroll-neutralized viewport (no scrollbars). A general `LayoutTransform` removes
that limitation for the whole framework: `LayoutTransform = Scale(zoom)` on the
diagram's items panel yields native scrollbars that grow with zoom, with scrolling
as pan.

## Architecture (one paragraph)

`LayoutTransform` is a new DP on `Visual` (the layout base:
[visual.ts](../../src/visual-engine/visual.ts) — `Measure`→`MeasureOverride`→
`DesiredSize` at L1150/1162, `Arrange`→`ArrangeOverride`→`ArrangedRect`/
`RenderSize` at L1271). When set and non-identity it hooks four points: **measure**
maps available size into the child's local space and reports the child's desired
size **transformed to its bounding box**; **arrange** runs `ArrangeOverride` in the
child's local (untransformed) space and records an *effective layout matrix* that
maps that local content into the element's transformed footprint; the **SVG
emitter** ([svg-renderer.ts:459](../../src/visual-engine/drawing/svg-renderer.ts))
composes that matrix into the element's `<g transform>`; and the **adorner layer**
([adorner.ts:162](../../src/visual-engine/adorner.ts)) composes it in its ancestor
walk so handles stay correct. Every path is gated on the transform being
non-identity, so with no `LayoutTransform` (the default) behavior is byte-for-byte
unchanged — the same backward-compat discipline the adorner change already uses.

## Existing facts this builds on

- **Layout base = `Visual`.** `Measure(availableSize)` subtracts margin →
  `MeasureOverride(constrained)` → clamps to Min/Max → stores `DesiredSize`
  (incl. margin). `Arrange(finalRect)` subtracts margin, applies alignment →
  `ArrangedRect` + `ArrangeOverride(renderSize)` → `RenderSize`.
- **`RenderTransform` DP pattern** (to mirror): `Model.RegisterProperty<Transform |
  undefined>(Visual, 'RenderTransform', undefined, MetaData.Render)` (L268), with
  Freezable owner-wiring so inner-DP changes (e.g. `ScaleTransform.ScaleX`)
  invalidate the owner. A `LayoutTransform` uses `MetaData.Measure | MetaData.Arrange`
  instead of `MetaData.Render`, so it invalidates layout.
- **SVG emission** ([svg-renderer.ts:459-518](../../src/visual-engine/drawing/svg-renderer.ts))
  composes the outer `<g transform>` as `translate(ArrangedRect.X,Y)` then a
  `RenderTransform` pivoted by `RenderTransformOrigin × ArrangedRect.W/H`. In SVG a
  string `A B` applies `B` to a point first, then `A`.
- **Adorner composition** ([adorner.ts:162-219](../../src/visual-engine/adorner.ts))
  walks adorned→layer-parent, per ancestor composing `Translate(rect.X,Y)` and the
  pivoted `RenderTransform`, then maps the adorned rect's 4 corners → bbox. It reads
  `ArrangedRect`, `RenderTransform`, `RenderTransformOrigin`, `RenderSize`.
- **`Transform` family + `Matrix`** ([transform.ts](../../src/visual-engine/drawing/transform.ts),
  [primitives.ts](../../src/visual-engine/primitives.ts)): `Matrix.Scale/Translate/Rotate`,
  `m1.Multiply(m2)` = apply `m1` first, `m.Transform(point)`, `m.Invert(): Matrix |
  undefined`, `m.IsIdentity`.
- **`ScrollContentPresenter`** takes its extent from the content's measured
  `DesiredSize` in clip-and-translate mode
  ([scroll-content-presenter.ts:178](../../src/basic/scroll/scroll-content-presenter.ts)) —
  so a `LayoutTransform`-scaled child yields a scaled extent with **no** custom
  `IScrollInfo`.

## Design

### D1 — the DP

```ts
public static readonly LayoutTransformKey = Model.RegisterProperty<Transform | undefined>(
    Visual, 'LayoutTransform', undefined, MetaData.Measure | MetaData.Arrange);
public get LayoutTransform(): Transform | undefined { ... }
public set LayoutTransform(v: Transform | undefined) { ... }
```

Wire the Freezable owner exactly like `RenderTransform` so changing an inner DP of
the assigned transform (`ScaleTransform.ScaleX`) invalidates measure/arrange on the
owner. A helper `_layoutMatrix(): Matrix | undefined` returns the transform's
matrix when set and non-identity, else `undefined` (the fast path guard).

### D2 — measure

In `Visual.Measure`, around the `MeasureOverride` call, when `_layoutMatrix()` is
defined (`M`):

1. `availLocal = transformBounds(availableSize − margin, M.Invert() ?? Identity)` —
   the available space mapped into the child's own space (bbox). Fall back to the
   un-inverted size if `M` is singular.
2. `measured = MeasureOverride(constrain(availLocal))`; clamp to Min/Max **in local
   space** (Min/Max constrain the child's own size).
3. `_layoutLocalSize = clampedLocal` — remember for arrange.
4. `DesiredSize = transformBounds(clampedLocal, M) + margin` — the element's footprint
   in parent space is the transformed bounding box.

Identity/undefined → the current code path unchanged (no inverse, no bbox).

*Exactness:* the child-desired→parent bbox (step 4) is exact for **any** affine
transform. The available-size inverse (step 1) is exact for scale/translate and a
reasonable heuristic for rotation (WPF's own handling is likewise heuristic). The
diagram uses uniform scale, where every step is exact.

### D3 — arrange

In `Visual.Arrange`, after the existing margin + alignment computes the element's
parent-space slot, when `M` is defined:

1. `localSize = _layoutLocalSize` (the size the child measured at). Run
   `RenderSize = ArrangeOverride(localSize)` — the child lays out in **local**
   (untransformed) coordinates.
2. Compute the transformed bbox of `Rect(0,0,RenderSize)` under `M`; its min corner
   is `(bx,by)` and size is `transformedSize`.
3. `ArrangedRect` footprint size = `transformedSize` (positioned by the existing
   alignment offset).
4. Store the **effective layout matrix** `_effectiveLayout = M.Multiply(Translate(−bx,−by))`
   — apply `M` to a local point, then shift so the transformed content's bbox min
   sits at the element's local origin `(0,0)`.

Identity/undefined → current path (`RenderSize = ArrangeOverride(renderSize)`),
`_effectiveLayout = undefined`.

*v1 limitation:* `Stretch` alignment combined with a non-uniform-scale/rotating
`LayoutTransform` reuses the measured local size rather than re-deriving a stretched
local size; correct for uniform scale (the diagram) and for non-stretch alignment.
Documented; revisit only if a real case needs it.

### D4 — SVG emission

In `applyTransform`, when the visual has an `_effectiveLayout`, compose it into the
`<g transform>` **inner** to any `RenderTransform` (WPF order: LayoutTransform
applies to content first, then RenderTransform), and outer-most the arrange offset:

```
translate(ArrangedRect.X, ArrangedRect.Y)  [ RenderTransform pivoted by RenderTransformOrigin × RenderSize ]  matrix(_effectiveLayout)
```

(string left→right; the rightmost `_effectiveLayout` is applied to a local point
first). When only a `LayoutTransform` is set (the diagram case) this reduces to
`translate(rect) matrix(_effectiveLayout)`. The re-emit already fires on
arrange/measure invalidation, which a `LayoutTransform` change triggers.

### D5 — adorner composition

In `computeAdornedRectInLayerFrame`'s ancestor loop, compose the ancestor's
`_effectiveLayout` in the same position the emitter uses — between the pivoted
`RenderTransform` and the `Translate(rect.X,Y)` offset — so an adorned element under
a `LayoutTransform` ancestor projects to the correct on-screen rect and its handles
stay a constant size (identical benefit to the SP1 `RenderTransform` composition).
Reads one extra field per ancestor (`_effectiveLayout`); identity ancestors are a
no-op.

### D6 — helper

`transformBounds(size: Size, m: Matrix): Size` — map the 4 corners of
`Rect(0,0,size)` through `m`, return the axis-aligned bounding-box size. Lives in
`transform.ts` (or `primitives.ts` next to `Matrix`). Pure; unit-tested directly.

## Testing

**Headless (unit):**
- `transformBounds`: `Scale(2,3)` on `(100,50)` → `(200,150)`; `Rotate(90°)` on
  `(100,50)` → `(50,100)`; identity → unchanged.
- **Measure:** a leaf of desired `(100,50)` with `LayoutTransform = Scale(2,3)` →
  owner `DesiredSize (200,150)`; identity `LayoutTransform` → `(100,50)` (regression).
- **Arrange:** child arranges at local size; owner `ArrangedRect` footprint = transformed
  bbox; `RenderSize` = local size.
- **Adorner:** an adorned element under a `LayoutTransform = Scale(2)` ancestor projects
  to a 2× rect (mirrors the existing `RenderTransform` adorner test); identity → no-op.
- **The proof test:** `Border [ LayoutTransform = Scale(2) ]` wrapping fixed `(500,800)`
  content, inside a `ScrollViewer` → `ScrollViewer.ExtentWidth == 1000`,
  `ExtentHeight == 1600`. Validates the entire SP4 premise.

**Live-smoke (SP4, not here):** scrollbars grow with zoom; scroll = pan; hit-testing
under scale (DOM `getScreenCTM` folds in the emitted matrix).

## Risks & mitigations

- **Core-`Visual` blast radius.** Mitigated by the non-identity guard: default
  (undefined) `LayoutTransform` runs the current code verbatim; the full existing
  suite must stay green. The proof + regression tests lock this.
- **LT/RT interaction order.** Only defined once (LT inner, RT outer, WPF-consistent);
  the diagram uses one at a time, so the composite path is exercised by unit tests
  rather than in production first.
- **Rotation available-size heuristic** — documented; out of the diagram's path.

## Decomposition (this arc)

- **SP3 (this spec, mural framework):** the `LayoutTransform` primitive on `Visual`
  + emitter + adorner + `transformBounds` + tests. Publish mural minor (0.8.0).
- **SP4 (mural diagram):** `LayoutTransform = Scale(Zoom)` on the items panel;
  re-enable `PART_Scroll`; pan = scroll offset; Ctrl+wheel zoom-at-cursor via
  offset; Fit via offset; retire `PanX/PanY`; keep `Zoom`, commands, connector
  hit-band, constant-size adorners.
- **SP5 (Plexus):** persist `Zoom` + scroll offset; hydrate; toolbar/keyboard
  unchanged.

## Out of scope (v1 / YAGNI)

- Exact WPF `FindMaximalAreaLocalSpaceRect` available-size solving for rotation
  (heuristic bbox inverse is enough; scale is exact).
- `Stretch`-under-rotation local-size re-derivation.
- Animating `LayoutTransform` (works via DP writes, but no dedicated tweening path).
