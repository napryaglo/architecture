# Shape Hit-Geometry Design

**Date:** 2026-08-18
**Status:** Approved (design)
**Repo:** `@pragmatic-tech-ai/mural`

## Problem

A `Shape` is hit-tested against its **bounding box** (the `mural-hit` pad), so
clicks in the empty corners of a round/irregular shape still register on it. We
want hit-testing **confined to the shape's outline** — the silhouette, stroke
included.

The blocker: base `Shape` paints from a `Geometry` DP, but the catalog shapes
(`Ellipse`, `Rectangle`, `Heart`, …) **build their geometry locally inside
`RenderOverride` and never store `this.Geometry`**
([shape.ts:27-32](../../../src/basic/shapes/shape.ts)). There is no single place
their geometry exists to hand to the hit region.

`Visual.HitTestGeometry` already does exactly the confinement we want — when set,
picking consults `Geometry.Contains(localPoint)` and the renderer drops the
box pad ([visual.ts:374-389](../../../src/visual-engine/visual.ts)). It is
`MetaData.None` (setting it never invalidates) and interpreted in the Visual's
local coordinate space. The work is producing each shape's geometry to feed it.

## Approach

Add one seam to `Shape`: **`protected buildGeometry(size: Size): Geometry | undefined`**,
returning the shape's outline in local render coordinates. It is the single
source of geometry for both the hit region and (for shapes that draw exactly
their outline) painting. `Shape.ArrangeOverride` sets `HitTestGeometry` from it,
guarded. This is the geometry seam the Figure/Shape consolidation also needs.

Rejected: setting `HitTestGeometry` per shape without a shared seam (duplicates
geometry construction, no consolidation payoff); dropping the pad and relying on
raw SVG `pointer-events` (fill=none shapes have no hittable interior, and it
bypasses the framework's `HitTestGeometry` mechanism).

## Hit geometry = outer slot silhouette (stroke-inclusive)

`Ellipse`/`Rectangle` draw **stroke-inset** outlines (radius/rect shrunk by
half-thickness so the stroke sits inside the slot —
[ellipse.ts:22-38](../../../src/basic/shapes/ellipse.ts),
[rectangle.ts:28-46](../../../src/basic/shapes/rectangle.ts)). The hit region is
the **outer** slot outline (un-inset), so the entire shape **including its
stroke** is grabbable, and only the box corners fall through. For `Ellipse` the
stroke's outer edge is exactly the slot radius, so the outer silhouette covers
the whole stroke precisely. Shapes that don't inset (Heart, Cookie, …) draw
their outline directly, so outer == drawn for them.

## Components

### Base `Shape` (`src/basic/shapes/shape.ts`)

- **`protected buildGeometry(size: Size): Geometry | undefined`** — base returns
  `this.Geometry` **only when it maps 1:1 to the slot** (i.e. `fitTransform`
  returns undefined — the Figure-shape / authored-at-size / `Path` case);
  otherwise `undefined`. (Scaled-icon shapes that need the fit transform keep the
  box pad — deferred; the geometry-clone needed to bake the fit into a
  local-space hit region is out of scope.)
- **`ArrangeOverride(finalSize)`** — after computing size, set the hit region:
  ```
  const g = (guard) ? this.buildGeometry(finalSize) : undefined;
  this.HitTestGeometry = g;
  return finalSize;
  ```
  where **guard** = `finalSize.Width > 0 && finalSize.Height > 0 &&
  this.HitTestStrokeWidth === 0`. Setting `HitTestGeometry` (MetaData.None) in
  arrange is safe — no invalidation loop.

### Guard rationale — open/thin shapes opt out

`HitTestStrokeWidth > 0` means a shape uses the transparent **hit band** for a
thin/open route (connectors, hairlines); a zero-area outline would make it
*un*-hittable, so those keep the band and get no `HitTestGeometry`. Open catalog
shapes (`Line`, `Arc`) opt out by returning `undefined` from `buildGeometry`.

### Catalog shapes (~19 files under `src/basic/shapes/`)

Each closed-silhouette shape (`Ellipse`, `Rectangle`, `Heart`, `Squircle`,
`Triangle`, `Pill`, `Semicircle`, `Arch`, `Bun`, `Clamshell`, `Clover`,
`Cookie`, `Fan`, `Ghostish`, `Puffy`, `RadialWave`, `PixelShape`, `Arrow`, …):

- Override **`buildGeometry(size)`** returning the shape's outer outline at the
  slot (the geometry math currently inlined in `RenderOverride`).
- `RenderOverride` calls `this.buildGeometry(size)` instead of rebuilding —
  except `Ellipse`/`Rectangle`, whose `RenderOverride` keeps its own
  stroke-inset construction for **drawing** while `buildGeometry` returns the
  **un-inset outer** outline for hit. Fill/stroke painting is otherwise
  unchanged.
- Open shapes (`Line`, `Arc`) return `undefined` from `buildGeometry` (or set
  `HitTestStrokeWidth`), so they keep AABB / band behavior.

`connector.ts` and `connector-interactions-behavior.ts` already use
`HitTestStrokeWidth` and are unaffected (the guard skips them).

## Data flow

```
arrange(finalSize) ─► Shape.ArrangeOverride
                       └─ HitTestGeometry = buildGeometry(finalSize)   [if guard passes]
render            ─► RenderOverride ─► draws buildGeometry(size) (or stroke-inset variant)
hit-test          ─► browser pick, then Geometry.Contains(localPoint) on HitTestGeometry
                       └─ outside the silhouette ─► falls through to parent
```

## Testing

- **Silhouette confinement** (Ellipse, Rectangle, Heart): after arrange,
  `HitTestGeometry` is set; `Contains` is true for a point inside the outline and
  **false for a bounding-box corner** outside it.
- **Stroke-inclusive** (Ellipse with a thick stroke): a point on the stroke band
  (between the fill edge and the slot edge) is `Contains`-true — the outer
  silhouette covers the stroke.
- **Guard / opt-out**: a shape with `HitTestStrokeWidth > 0` gets **no**
  `HitTestGeometry`; a degenerate (0×0) arranged size yields none; an open shape
  (`Line`) yields none.
- **Render unchanged**: refactored shapes still paint the same geometry —
  existing shape render tests stay green (add a paint assertion where a shape had
  none).

## Scope & constraints

- Base `Shape` + ~19 catalog shape files; mechanical (extract geometry into
  `buildGeometry`, call it from `RenderOverride`). One plan.
- Additive: `buildGeometry` is a new protected virtual; `HitTestGeometry` is an
  existing DP. No public API removed. Connectors/band shapes unaffected.
- Every test file lives in a `tests/` subfolder next to its source.
- Enums over string-literal unions (none introduced).
- Deferred: silhouette hit for scaled-icon (`fitTransform`-needing) `Geometry`-DP
  shapes — they keep the box pad until the geometry-copy path is worth adding.
