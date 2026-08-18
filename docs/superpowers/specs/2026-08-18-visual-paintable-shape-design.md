# Visual as a Paintable Shape (Fill / Stroke / Geometry / ClipChildren)

**Date:** 2026-08-18
**Status:** Approved (design)
**Repo:** `@pragmatic-lab/mural`
**Supersedes:** [2026-08-18-clip-children-on-visual-design.md](2026-08-18-clip-children-on-visual-design.md)
(ClipChildren is folded in here)

## Problem

Painting a shape — a geometry filled and stroked — plus everything derived from
that shape (clip-to-bounds, hit region, and now clipping children to the inside
of the stroke) is scattered and duplicated:

- **Fill** lives on `Visual` as **`Background`**
  ([visual.ts:741](../../../src/visual-engine/visual.ts)), yet **`Shape` declares its
  own `Fill`** ([shape.ts:37](../../../src/basic/shapes/shape.ts)) that shadows it, and
  `HeartPresenter` mirrors that again.
- **Stroke** lives only on `Shape` (and the `HeartPresenter` copy). No base concept.
- **Geometry** lives on `Shape` (`Geometry` DP) and, separately, as the clip/bounds hook
  `buildClipGeometry(size)` on `Visual`
  ([the ClipToBounds design](2026-08-17-visual-clip-to-bounds-design.md)) and as
  `HitTestGeometry`. Three notions of "this visual's shape."
- **Clip-children to inside the border** isn't expressible: `Clip`/`ClipToBounds` clip
  the whole subtree uniformly, so they'd eat the stroke.

## Decisions (resolved)

1. **Fill naming — rename `Background` → `Fill`** framework-wide. The base fill brush
   becomes `Fill`; every `Background=` call site and DP reference migrates. `Shape`'s
   duplicate `Fill` DP is removed (it becomes the inherited base `Fill` — no alias
   needed). Shape/heart markup `Fill=` keeps working.
2. **`Border` migrates** onto the base fill+stroke: uniform `BorderBrush` + uniform
   `BorderThickness` → the base `Stroke` over Border's rounded-rect geometry; `Fill`
   (née `Background`) is the base fill. Non-uniform `BorderThickness` keeps Border's
   bespoke four-rect frame.
3. **Base paint lives in `Visual.RenderOverride`; overriding subclasses call
   `super.RenderOverride(dc)` first.** No separate paint step. See the two wrinkles this
   creates under *Base paint via `super`* below — both must be handled in the plan.

## Approach

Make **one shape geometry per Visual the single source of truth**, and let `Visual`
paint it:

- The existing **`buildClipGeometry(size)`** hook *is* the visual's shape geometry — the
  **outer outline**. Base = bounds rect; `Border` = rounded rect; a shape = its silhouette.
- `Visual.RenderOverride` paints that geometry with **`Fill`** + a new **`Stroke`**.
- **`ClipToBounds`**, **`ChildClip`**, and **`HitTestGeometry`** derive from the same
  geometry (see the convention).
- **`Shape`** / **`HeartPresenter`** collapse onto it; **`Border`** migrates; **ClipChildren**
  rides the same geometry via a renderer children-group.

Everything defaults to today's behavior: `Stroke` undefined ⇒ no stroke; base paint fires
only when a geometry and a brush/pen are present; `ClipChildren` default false. A plain
`Panel`/`Control` is unchanged apart from the mechanical `Background`→`Fill` rename.

## Geometry convention (the crux of "one geometry")

`DrawGeometry` strokes **centered** on its path. `buildClipGeometry` is the **outer
outline**; three stroke-aware derivations off one inset knob:

- **Paint** — outline inset by `t/2` (centered stroke's outer edge lands on the outline;
  painting the outline directly would spill half the stroke).
- **`ClipToBounds` / `HitTestGeometry`** — the outline itself (the whole painted shape).
- **`buildChildClipGeometry`** — outline inset by `t` (children clear the stroke's inner
  edge).

Exactly the outer / half-pen / full-pen relationship `HeartPresenter` proved, now on one
base geometry.

## Components

### `Visual` (visual-engine/visual.ts)

- **Rename `Background` → `Fill`** (`Brush | undefined`, `MetaData.Render`). Mechanical
  sweep across the tree and markup symbol table.
- **`Stroke: Pen | undefined` DP** — `MetaData.Render`, default undefined. Consolidation
  target for `Shape.Stroke`.
- **`buildClipGeometry(size): Geometry`** — unchanged signature; documented as the outer
  outline (base = bounds rect).
- **Base `RenderOverride(dc)` paint** — if `buildClipGeometry(renderSize)` is
  non-degenerate and (`Fill` or `Stroke`) is set, `dc.DrawGeometry(Fill, Stroke,
  outline.inset(Stroke.Thickness/2))`. No-op when both are undefined ⇒ existing visuals
  unaffected. Subclasses that override `RenderOverride` call `super.RenderOverride(dc)`
  first, then draw on top.
- **`ClipChildren: boolean` DP** — default false, `MetaData.Arrange`.
- **`buildChildClipGeometry(size): Geometry | undefined`** — default: `buildClipGeometry`
  inset by the full `Stroke.Thickness`. Subclasses may override for non-uniform insets.
- **`ChildClip: Geometry | undefined` DP** — `MetaData.None`, set by `syncChildClip` at
  arrange (parallel to `syncClipToBounds`), read by the renderers.

### Base paint via `super` (wrinkles from decision #3)

1. **Audit every `RenderOverride` override.** With the base paint in `RenderOverride`,
   any subclass that overrides it and does *not* call `super` silently loses the base
   shape paint. The plan must enumerate all overrides and add `super.RenderOverride(dc)`
   where the shape paint is wanted (and deliberately *not* where it isn't, e.g. text/panels).
2. **`Shape`'s fit transform can't wrap `super`.** `Shape` paints shared icons under a
   fit transform ([shape.ts RenderOverride](../../../src/basic/shapes/shape.ts)); `super`
   runs the base paint *without* that transform, so `Shape` can't wrap it by calling
   `super`. Resolution: `Shape.buildClipGeometry` returns the geometry **already fitted**
   to the slot (bake the fit into the geometry), so the base paint needs no transform
   frame. The invisible `HitTestStrokeWidth` band stays in `Shape.RenderOverride` after
   the `super` call.

### Rendering — children-group clip (folded ClipChildren spec)

- **`RenderableVisual`** gains `readonly ChildClip`.
- **`SvgRenderer`**: when `ChildClip` is set, children recurse into a lazily-created
  `<g class="mural-children" clip-path>` after `mural-own`; own paint stays unclipped;
  geometry is in the visual's local space (no per-child translation). Incremental group
  lifecycle; orphan sweep treats it as owned. Reuse the generalized clipPath builder.
- **`headless-target`**: push `ChildClip` after own paint, before recursing children; pop
  after.
- **Hit-testing**: the `mural-children` group is transparent to the back-ref walk;
  clip-path clips pointer events, so clipped-away content isn't hittable. Per-visual
  `HitTestGeometry` unaffected.

### `Shape` (basic/shapes/shape.ts) — consolidation

- Remove `Shape.FillKey` / `Shape.StrokeKey`; use inherited `Visual.Fill` / `Visual.Stroke`.
- `Shape.buildClipGeometry` returns `this.Geometry` **fitted to the slot** (bakes the fit —
  see wrinkle #2), so the base paint draws it directly.
- `Shape.RenderOverride` → `super.RenderOverride(dc)` for the shape paint, then only the
  invisible `HitTestStrokeWidth` band. `HitTestGeometry = silhouette` stays.
- **Inset migration (behavioral, pixel-parity target).** Catalog shapes' `buildGeometry`
  self-insets by `t/2` today (e.g. [heart.ts](../../../src/basic/shapes/heart.ts)); under
  the convention `buildClipGeometry` returns the **outer outline (inset 0)** and the base
  paint applies the `t/2` inset — else it's double-counted. Each catalog shape drops its
  `t/2` self-inset; net render identical. Touches every catalog shape and its hit-geometry
  tests — the highest-churn part of phase 2.

### `HeartPresenter` (basic/heart-presenter.ts) — consolidation

- Drop local `Fill`/`Stroke`/`ClipChildren` DPs and `clipContent`; inherit from `Visual`.
- `buildClipGeometry(size)` → the outer heart (inset 0); base paint applies the `t/2`.
- `buildChildClipGeometry(size)` → heart inset by the full pen.
- `RenderOverride` → just `super.RenderOverride(dc)` (or removed entirely).
- `OnPropertyChanged` → `InvalidateArrange()` on a `Stroke` edge (render-only input feeding
  the arrange-time `ChildClip`).

### `Border` (basic/border.ts) — migration (decision #2)

- Uniform border ⇒ base `Stroke` = `Pen(BorderBrush, uniform BorderThickness)` over the
  rounded-rect geometry; `Fill` (née `Background`) is the base fill. `Border.RenderOverride`
  calls `super` for the uniform case. Non-uniform ⇒ keep the four-rect path (after `super`,
  suppress the base stroke for that case).
- `buildChildClipGeometry` = inner rounded rect inset by `BorderThickness` (opt-in via
  `ClipChildren`).

## Data flow

```
Arrange → ArrangeOverride → syncClipToBounds → syncChildClip
Render  → RenderOverride: super (Fill + Stroke over fitted buildClipGeometry, inset t/2)
                        → subclass content on top
        → children (under mural-children group iff ChildClip set)
```

## Backward compatibility

- `Stroke` default undefined + base paint no-op without brush/pen + `ClipChildren` false ⇒
  no visual changes until opt-in.
- **`Background` → `Fill` is a breaking rename** — every call site (framework, demos,
  markup symbol table, tests) migrates in one mechanical pass. No behavior change.
- Shape/heart markup `Fill=` keeps working (now the inherited base DP).
- `Border` uniform borders must render **pixel-identically** through the base stroke
  (parity test); non-uniform unchanged.

## Testing

- **Visual (unit):** base `RenderOverride` draws `buildClipGeometry` (inset `t/2`) with
  `Fill`+`Stroke`; no-op when both undefined; `super` composition (subclass content on
  top). `Stroke` DP round-trips. `ClipChildren`/`ChildClip`/latch.
- **Shape (unit):** inherited `Fill`/`Stroke`; fitted `buildClipGeometry`; catalog render +
  hit-geometry suites green after the inset migration.
- **HeartPresenter (unit):** hit = outer heart, painted = half-pen heart, child clip =
  full-pen heart, strictly nested; `Stroke` edge re-arranges.
- **Border (unit + pixel parity):** uniform via base stroke identical; non-uniform four
  rects; `buildChildClipGeometry` = inner rounded rect.
- **SvgRenderer / headless:** children group; own paint layering; push/pop parity.
- **Regression:** full `src/**`; shapes / border / renderer suites are the canaries.

## Risks

- **Widest blast radius in the framework** — `Visual` is every control's root. Default-off
  guards + the shapes/border/renderer suites are the tripwires.
- **`super.RenderOverride` audit** (wrinkle #1) — a missed `super` call silently drops the
  base paint; a wrong one double-paints. Enumerate every override.
- **`Background`→`Fill` rename** touches many files at once — do it as one isolated
  mechanical commit to keep the diff reviewable.
- **`Shape` fit-transform baking** (wrinkle #2) — the fitted-geometry approach must match
  today's transform-frame output for shared icons.
- **Two renderers in parity** (SvgRenderer group vs headless push/pop).

## Phasing (recommended build order)

0. **Rename `Background` → `Fill`** — isolated mechanical commit, all tests green.
1. **`Visual.Stroke` + base `RenderOverride` paint**, default-off; `super` audit of
   existing overrides; unit + no-regression.
2. **`Shape` consolidation** — drop duplicate DPs, fitted geometry, inset migration; shapes
   suites green.
3. **`Border` migration**; pixel parity.
4. **ClipChildren** — `ChildClip` + `syncChildClip` + both renderers +
   `buildChildClipGeometry` (Visual/Border/HeartPresenter); `HeartPresenter` collapse.

Each phase lands green before the next.
