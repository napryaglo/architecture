# Shape Hit-Geometry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Confine `Shape` hit-testing to the shape's own outline instead of its bounding box.

**Architecture:** Add one protected virtual `buildGeometry(size)` to base `Shape` that returns the shape's outline in local render coordinates. `Shape.ArrangeOverride` publishes it as `Visual.HitTestGeometry` (guarded), so picking consults `Geometry.Contains(localPoint)` and the renderer drops the AABB `mural-hit` pad. Catalog shapes override `buildGeometry`; most delegate their `RenderOverride` to it, so geometry has one source.

**Tech Stack:** TypeScript, Mural visual framework (`@pragmatic-lab/mural`). Tests: `node:test` + `node:assert/strict`, run via `npm test`.

## Global Constraints

- Every test file lives in a `tests/` subfolder next to the code it exercises (`src/basic/tests/...`), never beside the source.
- A fixed set of named string values MUST be a TypeScript `enum`, never a string-literal union (none introduced here).
- Layout must compose without explicit `[width=N]`/`[height=N]` fallbacks; use the arrange `finalSize` / measure `available` protocol.
- Renderer/framework code must not import `node:fs` / `node:path`.
- `HitTestGeometry` is interpreted in the Visual's **local** coordinate space and is `MetaData.None` (setting it never invalidates layout/paint).
- **CRITICAL — never read `this.RenderSize` inside `ArrangeOverride`.** `Visual.Arrange` assigns `this._renderSize = this.ArrangeOverride(renderSize)` ([visual.ts:1387](../../../src/visual-engine/visual.ts#L1387)), so during `ArrangeOverride` the getter still holds the *previous* arrange's value. Use the `finalSize` argument.
- Commit messages end with: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Work on branch `feat/shape-hit-geometry` (already created; the spec is committed there). Do not merge/push unless the user asks.

## Background facts (verified against the tree)

- `Visual.HitTestGeometryKey` exists, `MetaData.None`, with public `get/set HitTestGeometry(): Geometry | undefined` ([visual.ts:474-475](../../../src/visual-engine/visual.ts#L474-L475)). When set, the pick pipeline calls `Geometry.Contains(localPoint)` and the SVG renderer drops the `mural-hit` box pad.
- `Geometry.Contains(point)` inverts the geometry's `Transform.Matrix` before the local test ([geometry.ts:139-147](../../../src/visual-engine/geometry/geometry.ts#L139-L147)), and `PathGeometry.localContains` is a full ray-cast — so a `PathGeometry` with its `Transform` DP set hit-tests correctly under rotation/shear.
- Base `Shape.MeasureOverride → Size.Zero`; `Shape.ArrangeOverride(finalSize) → finalSize` (currently a no-op) ([shape.ts:67-75](../../../src/basic/shapes/shape.ts#L67-L75)).
- Base `Shape.RenderOverride` paints `this.Geometry` through a fit transform via `private fitTransform(g)` which reads `this.RenderSize` ([shape.ts:85-165](../../../src/basic/shapes/shape.ts#L85-L165)).
- `Line` and `Arc` never assign `this.Geometry` (they build a local `LineGeometry`/`PathGeometry` in render), so the base `buildGeometry` returns `undefined` for them → they keep AABB/band behavior with **no code change**.
- `Path` assigns its parsed geometry to the inherited `this.Geometry` DP, so the base `buildGeometry` covers it with **no code change**.
- Only `Puffy` and `Slanted` push a `MatrixTransform` at render time (diamond rotation / shear); every other catalog shape draws at identity.

## File Structure

- `src/basic/shapes/shape.ts` — **modified**. `fitTransform` gains an explicit `size` param; new `protected buildGeometry(size)`; `ArrangeOverride` publishes `HitTestGeometry`. This is the whole mechanism; every other file is a per-shape geometry seam.
- `src/basic/shapes/ellipse.ts`, `rectangle.ts` — **modified**. Add `buildGeometry` returning the **un-inset** outer outline (stroke-inclusive hit); keep the existing stroke-inset `RenderOverride`.
- `src/basic/shapes/{triangle,clamshell,cookie,arch,semicircle,fan,pill,pixel-shape}.ts` — **modified**. Extract the geometry into `buildGeometry`; `RenderOverride` delegates to it.
- `src/basic/shapes/{heart,bun,squircle,clover,radial-wave,ghostish,arrow}.ts` — **modified**. Same delegation recipe.
- `src/basic/shapes/{puffy,slanted}.ts` — **modified**. `buildGeometry` builds the figure and bakes the render-time matrix into the returned geometry's `Transform` (hit only); `RenderOverride` unchanged.
- Tests: new files under `src/basic/tests/` (`shape-hit-geometry.test.ts`, `shape-hit-geometry-catalog.test.ts`, `shape-hit-geometry-transformed.test.ts`).

---

### Task 1: Base `Shape` seam — `buildGeometry` + arrange-time `HitTestGeometry`

**Files:**
- Modify: `src/basic/shapes/shape.ts`
- Test: `src/basic/tests/shape-hit-geometry.test.ts`

**Interfaces:**
- Consumes: `Visual.HitTestGeometry` (existing DP), `Size`, `Geometry` (already imported in shape.ts).
- Produces:
  - `protected buildGeometry(size: Size): Geometry | undefined` — overridable by subclasses; base returns `this.Geometry` only when it maps 1:1 to `size`, else `undefined`.
  - `private fitTransform(g: Geometry, size: Size): MatrixTransform | undefined` — now takes the slot size explicitly (was reading `this.RenderSize`).
  - `Shape.ArrangeOverride` now sets `this.HitTestGeometry`.

- [ ] **Step 1: Write the failing test**

Create `src/basic/tests/shape-hit-geometry.test.ts`:

```ts
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Point, Rect, Size } from '../../runtime/index.js';
import { EllipseGeometry, RectangleGeometry } from '../../visual-engine/index.js';
import { Shape } from '../shapes/shape.js';

describe('Shape base — HitTestGeometry from buildGeometry', () => {
    test('1:1 Geometry becomes the hit region; a bbox corner falls through', () => {
        const s = new Shape();
        // Ellipse whose bounds are exactly the 100×100 slot (1:1, no fit).
        s.Geometry = new EllipseGeometry(new Point(50, 50), 50, 50);
        s.Width = 100; s.Height = 100;
        s.Measure(new Size(100, 100));
        s.Arrange(new Rect(0, 0, 100, 100));

        const hit = s.HitTestGeometry;
        assert.ok(hit !== undefined, 'HitTestGeometry set after arrange');
        assert.equal(hit, s.Geometry, 'the 1:1 geometry is the hit region');
        assert.ok(hit!.Contains(new Point(50, 50)), 'centre is inside');
        assert.ok(!hit!.Contains(new Point(2, 2)), 'bbox corner is outside the ellipse');
    });

    test('a geometry that needs a fit transform is deferred (no hit region)', () => {
        const s = new Shape();
        // 24×24 geometry in a 12×12 slot → needs a 0.5 fit → deferred.
        s.Geometry = new RectangleGeometry(new Rect(0, 0, 24, 24));
        s.Width = 12; s.Height = 12;
        s.Measure(new Size(12, 12));
        s.Arrange(new Rect(0, 0, 12, 12));
        assert.equal(s.HitTestGeometry, undefined);
    });

    test('HitTestStrokeWidth > 0 opts out (keeps the transparent hit band)', () => {
        const s = new Shape();
        s.Geometry = new RectangleGeometry(new Rect(0, 0, 100, 100));
        s.Width = 100; s.Height = 100;
        s.HitTestStrokeWidth = 8;
        s.Measure(new Size(100, 100));
        s.Arrange(new Rect(0, 0, 100, 100));
        assert.equal(s.HitTestGeometry, undefined);
    });

    test('degenerate arranged size yields no hit region', () => {
        const s = new Shape();
        s.Geometry = new RectangleGeometry(new Rect(0, 0, 100, 100));
        s.Measure(new Size(800, 600));
        s.Arrange(new Rect(0, 0, 0, 0));
        assert.equal(s.HitTestGeometry, undefined);
    });

    test('no Geometry set yields no hit region (Line/Arc case)', () => {
        const s = new Shape();
        s.Width = 100; s.Height = 40;
        s.Measure(new Size(100, 40));
        s.Arrange(new Rect(0, 0, 100, 40));
        assert.equal(s.HitTestGeometry, undefined);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --conditions=development --test src/basic/tests/shape-hit-geometry.test.ts`
Expected: FAIL — `HitTestGeometry` is `undefined` after arrange (ArrangeOverride is still a no-op).

- [ ] **Step 3: Refactor `fitTransform` to take an explicit slot size**

In `src/basic/shapes/shape.ts`, change the signature and its internal `RenderSize` read. Replace the header of `fitTransform`:

```ts
    private fitTransform(g: Geometry, size: Size): MatrixTransform | undefined
    {
        // Degenerate slot → paint as authored. Guards Connector (Size.Zero
        // route in absolute coords) and any unsized Shape.
        if (!(size.Width > 0) || !(size.Height > 0)
            || !Number.isFinite(size.Width) || !Number.isFinite(size.Height))
        {
            return undefined;
        }
        const b = g.GetBounds();
```

(The rest of the method body is unchanged — it already uses the local `size` variable name for the slot, so only the first two lines that previously read `this.RenderSize` are replaced by the parameter.)

Update the one caller inside `RenderOverride` (was `const fit = this.fitTransform(g);`):

```ts
        const fit = this.fitTransform(g, this.RenderSize);
```

- [ ] **Step 4: Add `buildGeometry` and publish it from `ArrangeOverride`**

In `src/basic/shapes/shape.ts`, replace the existing `ArrangeOverride` (currently `return finalSize;`) with:

```ts
    protected override ArrangeOverride(finalSize: Size): Size
    {
        // Confine hit-testing to the shape's own outline: publish the
        // silhouette as HitTestGeometry so picking consults
        // Geometry.Contains(localPoint) instead of the AABB `mural-hit`
        // pad. HitTestGeometry is MetaData.None, so writing it here never
        // re-invalidates layout. Skip when the slot is degenerate or the
        // shape opts into the transparent hit band (HitTestStrokeWidth > 0,
        // used by connectors / hairlines) — a zero-area outline would make
        // a thin/open route unhittable.
        //
        // Use finalSize, NOT this.RenderSize: Visual.Arrange assigns
        // RenderSize the RETURN of this method, so the getter is still
        // stale here.
        const confine = finalSize.Width > 0 && finalSize.Height > 0
            && this.HitTestStrokeWidth === 0;
        this.HitTestGeometry = confine ? this.buildGeometry(finalSize) : undefined;
        return finalSize;
    }

    // The shape's outline in local render coordinates — the single source
    // of geometry for the hit region (and, for shapes that draw exactly
    // their outline, for painting). Base implementation covers the
    // Geometry-DP shapes (Path, icon-bearing Shapes): return this.Geometry
    // only when it already maps 1:1 to the slot (fitTransform undefined).
    // A geometry that needs the fit transform (a shared icon authored in a
    // different box) would require baking the scale into a cloned geometry
    // to produce a correct local-space hit region — deferred; those keep
    // the AABB pad. Concrete catalog shapes override this to return their
    // computed silhouette.
    protected buildGeometry(size: Size): Geometry | undefined
    {
        const g = this.Geometry;
        if (g === undefined) return undefined;
        return this.fitTransform(g, size) === undefined ? g : undefined;
    }
```

Keep the existing `RenderOverride` as-is except for the `fitTransform` call updated in Step 3.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx tsx --conditions=development --test src/basic/tests/shape-hit-geometry.test.ts`
Expected: PASS (all 5).

Run the existing fit tests to confirm the `fitTransform` refactor is behavior-preserving:
Run: `npx tsx --conditions=development --test src/basic/tests/shape-fit.test.ts`
Expected: PASS (unchanged).

- [ ] **Step 6: Commit**

```bash
git add src/basic/shapes/shape.ts src/basic/tests/shape-hit-geometry.test.ts
git commit -m "feat(shape): confine hit-testing to buildGeometry outline (base seam)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `Ellipse` + `Rectangle` — stroke-inclusive (un-inset) hit outline

**Files:**
- Modify: `src/basic/shapes/ellipse.ts`, `src/basic/shapes/rectangle.ts`
- Test: `src/basic/tests/shape-hit-geometry-catalog.test.ts` (created here; extended in later tasks)

**Interfaces:**
- Consumes: base `Shape.buildGeometry` / `ArrangeOverride` from Task 1.
- Produces: `Ellipse.buildGeometry` and `Rectangle.buildGeometry` returning the **un-inset** outer outline (covers the whole slot incl. stroke). Their `RenderOverride` is unchanged (keeps the stroke-inset drawing).

**Rationale:** These two draw a **stroke-inset** outline so the stroke sits inside the slot. For hit we want the entire shape *including its stroke* grabbable, so `buildGeometry` returns the **outer** (un-inset) outline. For an ellipse the stroke's outer edge is exactly the slot radius, so the outer silhouette covers the stroke precisely.

- [ ] **Step 1: Write the failing test**

Create `src/basic/tests/shape-hit-geometry-catalog.test.ts`:

```ts
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Color, Point, Rect, Size } from '../../runtime/index.js';
import { EllipseGeometry, Pen, RectangleGeometry, SolidColorBrush } from '../../visual-engine/index.js';
import { Ellipse } from '../shapes/ellipse.js';
import { Rectangle } from '../shapes/rectangle.js';

function arrange(shape: { Measure: (s: Size) => void; Arrange: (r: Rect) => void },
                 w: number, h: number): void {
    shape.Measure(new Size(w, h));
    shape.Arrange(new Rect(0, 0, w, h));
}

describe('Ellipse / Rectangle — stroke-inclusive hit outline', () => {
    test('Ellipse hit region is the un-inset slot ellipse (covers the stroke)', () => {
        const e = new Ellipse();
        e.Stroke = new Pen(new SolidColorBrush(Color.Black), 10);
        e.Width = 100; e.Height = 100;
        arrange(e, 100, 100);

        const hit = e.HitTestGeometry as EllipseGeometry;
        assert.ok(hit instanceof EllipseGeometry);
        assert.equal(hit.RadiusX, 50, 'un-inset radius = slot half-width');
        assert.equal(hit.RadiusY, 50);
        // A point on the stroke band (radius ~48, inside outer edge 50 but
        // outside the inset fill edge 45) is hittable.
        assert.ok(hit.Contains(new Point(50 + 48, 50)), 'stroke band is hittable');
        // A bbox corner is outside the ellipse.
        assert.ok(!hit.Contains(new Point(2, 2)), 'bbox corner falls through');
    });

    test('Ellipse still DRAWS the stroke-inset ellipse (render unchanged)', () => {
        const e = new Ellipse();
        e.Stroke = new Pen(new SolidColorBrush(Color.Black), 10);
        e.Width = 100; e.Height = 100;
        arrange(e, 100, 100);
        const geoms: EllipseGeometry[] = [];
        e.Render({
            DrawGeometry: (_b, _p, g) => geoms.push(g as EllipseGeometry),
            DrawRectangle: () => {}, DrawText: () => {},
            PushTransform: () => {}, PushClip: () => {}, Pop: () => {},
        } as never);
        assert.equal(geoms[0]!.RadiusX, 45, 'drawn radius is inset by half-stroke');
    });

    test('Rectangle hit region is the un-inset slot rect (covers the stroke)', () => {
        const r = new Rectangle();
        r.Stroke = new Pen(new SolidColorBrush(Color.Black), 10);
        r.RadiusX = 4; r.RadiusY = 4;
        r.Width = 100; r.Height = 60;
        arrange(r, 100, 60);
        const hit = r.HitTestGeometry as RectangleGeometry;
        assert.ok(hit instanceof RectangleGeometry);
        assert.ok(hit.Rect.Equals(new Rect(0, 0, 100, 60)), 'un-inset full slot');
        assert.equal(hit.RadiusX, 4);
    });

    test('Rectangle still DRAWS the stroke-inset rect (render unchanged)', () => {
        const r = new Rectangle();
        r.Stroke = new Pen(new SolidColorBrush(Color.Black), 4);
        r.Width = 100; r.Height = 100;
        arrange(r, 100, 100);
        const geoms: RectangleGeometry[] = [];
        r.Render({
            DrawGeometry: (_b, _p, g) => geoms.push(g as RectangleGeometry),
            DrawRectangle: () => {}, DrawText: () => {},
            PushTransform: () => {}, PushClip: () => {}, Pop: () => {},
        } as never);
        assert.ok(geoms[0]!.Rect.Equals(new Rect(2, 2, 96, 96)), 'drawn rect inset');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --conditions=development --test src/basic/tests/shape-hit-geometry-catalog.test.ts`
Expected: FAIL — `HitTestGeometry` is `undefined` for `Ellipse`/`Rectangle` (they inherit the base `buildGeometry`, which returns undefined because they never set `this.Geometry`).

- [ ] **Step 3: Add `Ellipse.buildGeometry`**

In `src/basic/shapes/ellipse.ts`, add `Size` to the runtime import and `Geometry` (type) to the visual-engine import, then add the override. Final imports + class body:

```ts
import { Point, Size, type DrawingContext } from '../../runtime/index.js';
import { EllipseGeometry, type Geometry } from '../../visual-engine/index.js';
import { Shape } from './shape.js';
```

Add inside the class (leave `RenderOverride` unchanged):

```ts
    // Hit outline: the UN-inset slot ellipse, so the whole shape including
    // its stroke is grabbable (RenderOverride draws the stroke-inset
    // ellipse; the stroke's outer edge is exactly this radius).
    protected override buildGeometry(size: Size): Geometry | undefined
    {
        return new EllipseGeometry(
            new Point(size.Width / 2, size.Height / 2),
            size.Width / 2, size.Height / 2);
    }
```

- [ ] **Step 4: Add `Rectangle.buildGeometry`**

In `src/basic/shapes/rectangle.ts`, add `Size` to the runtime import and `Geometry` (type) to the visual-engine import, then add the override. Final imports:

```ts
import { MetaData, Model, Rect, Size, type DrawingContext } from '../../runtime/index.js';
import { RectangleGeometry, type Geometry } from '../../visual-engine/index.js';
import { Shape } from './shape.js';
```

Add inside the class (leave `RenderOverride` unchanged):

```ts
    // Hit outline: the UN-inset full-slot rect (with the same corner radii),
    // so the stroke is grabbable. RenderOverride draws the inset rect.
    protected override buildGeometry(size: Size): Geometry | undefined
    {
        return new RectangleGeometry(
            new Rect(0, 0, size.Width, size.Height),
            this.RadiusX, this.RadiusY);
    }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx tsx --conditions=development --test src/basic/tests/shape-hit-geometry-catalog.test.ts`
Expected: PASS (all 4).

Run the existing ellipse/rectangle render suites (render must be unchanged):
Run: `npx tsx --conditions=development --test src/basic/tests/rectangle.test.ts`
Expected: PASS (unchanged).

- [ ] **Step 6: Commit**

```bash
git add src/basic/shapes/ellipse.ts src/basic/shapes/rectangle.ts src/basic/tests/shape-hit-geometry-catalog.test.ts
git commit -m "feat(shape): stroke-inclusive hit outline for Ellipse and Rectangle

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Delegate `RenderOverride` → `buildGeometry` for the identity-transform catalog shapes (batch A)

**Files:**
- Modify: `src/basic/shapes/triangle.ts`, `clamshell.ts`, `cookie.ts`, `arch.ts`, `semicircle.ts`, `fan.ts`, `pill.ts`, `pixel-shape.ts`
- Test: extend `src/basic/tests/shape-hit-geometry-catalog.test.ts`

**Interfaces:**
- Consumes: base `Shape.buildGeometry`/`ArrangeOverride` (Task 1).
- Produces: each listed shape now has `protected override buildGeometry(size: Size): Geometry | undefined` returning its silhouette, and its `RenderOverride` delegates to it. Hit region = the drawn outline (inset — acceptable; the difference from the outer edge is half the stroke).

**The delegation recipe (identical for every shape in this task):**

Each shape's current `RenderOverride` has this exact shape:

```ts
    protected override RenderOverride(dc: DrawingContext): void
    {
        const size = this.RenderSize;
        if (size.Width <= 0 || size.Height <= 0) return;
        const stroke = this.Stroke;
        /* ...builds GEOM from size + this DPs (insetting by half-stroke)... */
        dc.DrawGeometry(this.Fill, stroke, GEOM);
    }
```

Transform it mechanically into:

```ts
    // Outline = the drawn silhouette; single source for paint + hit.
    protected override buildGeometry(size: Size): Geometry | undefined
    {
        if (size.Width <= 0 || size.Height <= 0) return undefined;
        /* ...the SAME geometry-building lines, verbatim, with `size`
           already the parameter (delete the `const size = this.RenderSize`
           line)... */
        return GEOM;
    }

    protected override RenderOverride(dc: DrawingContext): void
    {
        const geom = this.buildGeometry(this.RenderSize);
        if (geom === undefined) return;
        dc.DrawGeometry(this.Fill, this.Stroke, geom);
    }
```

Import edits per file: add `Size` to the `../../runtime/index.js` import; add `type Geometry` to the `../../visual-engine/index.js` import. The geometry math (the `const stroke`, `half`, `w`, `h`, vertex/segment construction) is **moved verbatim** into `buildGeometry` — do not rewrite it.

**Worked example — `triangle.ts` (apply the identical recipe to the other 7):**

```ts
import {
    Geometry,
    MetaData,
    Model,
    Point,
    Size,
    type DrawingContext,
} from '../../runtime/index.js';
import { PathGeometry } from '../../visual-engine/index.js';
import { Shape } from './shape.js';
import { buildRoundedPolygon, maxCornerRadius } from './polygon-helpers.js';
```

> NOTE on imports: `Geometry` is exported from `../../visual-engine/index.js`, **not** `../../runtime/index.js`. Use:
> `import { PathGeometry, type Geometry } from '../../visual-engine/index.js';`
> and add only `Size` to the runtime import. (The block above is corrected below — follow this one.)

```ts
import { MetaData, Model, Point, Size, type DrawingContext } from '../../runtime/index.js';
import { PathGeometry, type Geometry } from '../../visual-engine/index.js';
import { Shape } from './shape.js';
import { buildRoundedPolygon, maxCornerRadius } from './polygon-helpers.js';

export class Triangle extends Shape
{
    public static readonly CornerRadiusKey = Model.RegisterProperty<number>(Triangle, 'CornerRadius', 0, MetaData.Render);

    public get CornerRadius(): number { return this.get_property_value(Triangle.CornerRadiusKey); }
    public set CornerRadius(v: number) { this.set_property_value(Triangle.CornerRadiusKey, v); }

    protected override buildGeometry(size: Size): Geometry | undefined
    {
        if (size.Width <= 0 || size.Height <= 0) return undefined;

        const stroke = this.Stroke;
        const t      = stroke?.Thickness ?? 0;
        const half = t / 2;
        const w    = Math.max(0, size.Width  - t);
        const h    = Math.max(0, size.Height - t);

        const top = new Point(half + w / 2, half);
        const bl  = new Point(half,         half + h);
        const br  = new Point(half + w,     half + h);
        const verts = [top, br, bl];

        const r = Math.max(0, Math.min(this.CornerRadius, maxCornerRadius(verts)));

        return new PathGeometry([buildRoundedPolygon(verts, r)]);
    }

    protected override RenderOverride(dc: DrawingContext): void
    {
        const geom = this.buildGeometry(this.RenderSize);
        if (geom === undefined) return;
        dc.DrawGeometry(this.Fill, this.Stroke, geom);
    }
}
```

**Per-file notes (the geometry body moves verbatim; only these deltas differ):**
- `clamshell.ts`, `cookie.ts` — identical shape to Triangle (rounded polygon). Move body; return `new PathGeometry([buildRoundedPolygon(verts, r)])` (cookie) / `new PathGeometry([figure])` (clamshell — it names the figure).
- `arch.ts`, `semicircle.ts`, `fan.ts` — build `new PathGeometry([figure])`; move body verbatim. These import `Point`/`Size` from runtime and segment classes from visual-engine — just add `Size` (runtime) and `type Geometry` (visual-engine).
- `pill.ts` — returns a `RectangleGeometry` directly (not a `PathGeometry`). `buildGeometry` returns `new RectangleGeometry(new Rect(half, half, w, h), r, r)`; keep the `Rect` import, add `Size` (runtime) and `type Geometry` (visual-engine).
- `pixel-shape.ts` — builds `new PathGeometry(figures)` (multi-figure). Move the whole `for`-loop body into `buildGeometry`, return `new PathGeometry(figures)`. Add `Size` (runtime) and `type Geometry` (visual-engine).

- [ ] **Step 1: Write the failing tests**

Append to `src/basic/tests/shape-hit-geometry-catalog.test.ts` a new block. Import the shapes at the top of the file (`import { Triangle } from '../shapes/triangle.js';`, `import { Cookie } from '../shapes/cookie.js';`, `import { Pill } from '../shapes/pill.js';`, `import { PixelArt } from '../shapes/pixel-shape.js';`, `import { PathGeometry } from '../../visual-engine/index.js';`) and add:

```ts
describe('Catalog shapes batch A — outline hit region', () => {
    test('Triangle: apex-band point inside, empty top corner falls through', () => {
        const tri = new Triangle();
        tri.Width = 100; tri.Height = 100;
        arrange(tri, 100, 100);
        const hit = tri.HitTestGeometry as PathGeometry;
        assert.ok(hit instanceof PathGeometry);
        // Deep inside the triangle body.
        assert.ok(hit.Contains(new Point(50, 90)), 'inside the base');
        // Top-left bbox corner is outside a point-up triangle.
        assert.ok(!hit.Contains(new Point(5, 5)), 'empty corner falls through');
    });

    test('Cookie (hexagon) sets a PathGeometry hit region', () => {
        const c = new Cookie();
        c.Width = 100; c.Height = 100;
        arrange(c, 100, 100);
        assert.ok(c.HitTestGeometry instanceof PathGeometry);
        assert.ok(c.HitTestGeometry!.Contains(new Point(50, 50)), 'centre inside');
    });

    test('Pill sets a rounded-rect hit region covering its centre', () => {
        const p = new Pill();
        p.Width = 120; p.Height = 40;
        arrange(p, 120, 40);
        assert.ok(p.HitTestGeometry!.Contains(new Point(60, 20)));
    });

    test('PixelArt sets a multi-figure hit region', () => {
        const px = new PixelArt();
        px.Width = 64; px.Height = 64;
        arrange(px, 64, 64);
        assert.ok(px.HitTestGeometry instanceof PathGeometry);
        assert.ok(px.HitTestGeometry!.Contains(new Point(32, 32)), 'centre cell inside');
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --conditions=development --test src/basic/tests/shape-hit-geometry-catalog.test.ts`
Expected: FAIL — batch-A shapes still inherit the base `buildGeometry` (returns undefined; they never set `this.Geometry`), so `HitTestGeometry` is `undefined`.

- [ ] **Step 3: Apply the delegation recipe to all 8 files**

Edit `triangle.ts`, `clamshell.ts`, `cookie.ts`, `arch.ts`, `semicircle.ts`, `fan.ts`, `pill.ts`, `pixel-shape.ts` per the recipe above. Commit-friendly: do them one at a time and re-run the file's own render suite after each (see Step 4).

- [ ] **Step 4: Run the render suites to confirm painting is unchanged**

Run each existing suite (they assert the drawn geometry):
`npx tsx --conditions=development --test src/basic/tests/triangle.test.ts`
`npx tsx --conditions=development --test src/basic/tests/cookie.test.ts`
`npx tsx --conditions=development --test src/basic/tests/clamshell.test.ts`
`npx tsx --conditions=development --test src/basic/tests/arch.test.ts`
`npx tsx --conditions=development --test src/basic/tests/semicircle.test.ts`
`npx tsx --conditions=development --test src/basic/tests/fan.test.ts`
`npx tsx --conditions=development --test src/basic/tests/pill.test.ts`
`npx tsx --conditions=development --test src/basic/tests/pixel-shape.test.ts`
Expected: PASS (unchanged) — delegation is behavior-preserving because `buildGeometry` returns the identical geometry `RenderOverride` used to build.

- [ ] **Step 5: Run the new hit-geometry tests**

Run: `npx tsx --conditions=development --test src/basic/tests/shape-hit-geometry-catalog.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/basic/shapes/triangle.ts src/basic/shapes/clamshell.ts src/basic/shapes/cookie.ts src/basic/shapes/arch.ts src/basic/shapes/semicircle.ts src/basic/shapes/fan.ts src/basic/shapes/pill.ts src/basic/shapes/pixel-shape.ts src/basic/tests/shape-hit-geometry-catalog.test.ts
git commit -m "feat(shape): delegate render to buildGeometry for polygon/arc catalog shapes

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Delegate `RenderOverride` → `buildGeometry` for the bezier/sampled catalog shapes (batch B)

**Files:**
- Modify: `src/basic/shapes/heart.ts`, `bun.ts`, `squircle.ts`, `clover.ts`, `radial-wave.ts`, `ghostish.ts`, `arrow.ts`
- Test: extend `src/basic/tests/shape-hit-geometry-catalog.test.ts`

**Interfaces:**
- Consumes: base `Shape.buildGeometry`/`ArrangeOverride` (Task 1).
- Produces: each listed shape has `buildGeometry` returning its `PathGeometry` silhouette; `RenderOverride` delegates. None of these push a transform, so the recipe from Task 3 applies unchanged.

**Recipe:** identical to Task 3. Move the geometry-building body verbatim into `protected override buildGeometry(size: Size): Geometry | undefined` (delete the `const size = this.RenderSize` line; guard `if (size.Width <= 0 || size.Height <= 0) return undefined;`), return the `new PathGeometry([...])`, and reduce `RenderOverride` to the three-line delegation. Add `Size` to the runtime import and `type Geometry` to the visual-engine import in each file.

**Worked example — `heart.ts`:**

```ts
import { Point, Size, type DrawingContext } from '../../runtime/index.js';
import {
    CubicBezierSegment,
    PathFigure,
    PathGeometry,
    type Geometry,
} from '../../visual-engine/index.js';
import { Shape } from './shape.js';

export class Heart extends Shape
{
    protected override buildGeometry(size: Size): Geometry | undefined
    {
        if (size.Width <= 0 || size.Height <= 0) return undefined;

        const stroke = this.Stroke;
        const t      = stroke?.Thickness ?? 0;
        const half = t / 2;
        const w    = Math.max(0, size.Width  - t);
        const h    = Math.max(0, size.Height - t);

        // ...all the anchor/control-point construction, verbatim...
        const valley = new Point(half + w * 0.5, half + h * 0.25);
        // (unchanged body — see current heart.ts lines 35-60)

        const figure = new PathFigure(valley, [
            new CubicBezierSegment(ctrl1L,  ctrl2L,  lobeL),
            new CubicBezierSegment(ctrl1B,  ctrl2B,  point),
            new CubicBezierSegment(ctrl1R,  ctrl2R,  lobeR),
            new CubicBezierSegment(ctrl1RT, ctrl2RT, valley),
        ], true);

        return new PathGeometry([figure]);
    }

    protected override RenderOverride(dc: DrawingContext): void
    {
        const geom = this.buildGeometry(this.RenderSize);
        if (geom === undefined) return;
        dc.DrawGeometry(this.Fill, this.Stroke, geom);
    }
}
```

**Per-file notes:**
- `bun.ts`, `squircle.ts`, `clover.ts`, `radial-wave.ts`, `ghostish.ts`, `arrow.ts` — same recipe; each returns `new PathGeometry([figure])` (or `new PathGeometry([buildSquircleFigure(...)])` for squircle). Their free helper functions (`unit`/`neg`/`offset` in arrow, `buildSquircleFigure`) and DP declarations stay where they are.
- `squircle.ts` also exports `buildSquircleFigure` — leave the export intact (Slanted imports it in Task 5).

- [ ] **Step 1: Write the failing tests**

Append to `src/basic/tests/shape-hit-geometry-catalog.test.ts`. Import `import { Heart } from '../shapes/heart.js';`, `import { Squircle } from '../shapes/squircle.js';`, `import { Clover } from '../shapes/clover.js';` at the top, then:

```ts
describe('Catalog shapes batch B — outline hit region', () => {
    test('Heart: centre inside, top-centre notch/edge corner falls through', () => {
        const hrt = new Heart();
        hrt.Width = 100; hrt.Height = 100;
        arrange(hrt, 100, 100);
        const hit = hrt.HitTestGeometry as PathGeometry;
        assert.ok(hit instanceof PathGeometry);
        assert.ok(hit.Contains(new Point(50, 55)), 'body centre inside');
        assert.ok(!hit.Contains(new Point(50, 2)), 'top-centre valley notch falls through');
    });

    test('Squircle sets a PathGeometry hit region covering its centre', () => {
        const sq = new Squircle();
        sq.Width = 80; sq.Height = 80;
        arrange(sq, 80, 80);
        assert.ok(sq.HitTestGeometry instanceof PathGeometry);
        assert.ok(sq.HitTestGeometry!.Contains(new Point(40, 40)));
    });

    test('Clover sets a PathGeometry hit region; a cusp gap can fall through', () => {
        const cl = new Clover();
        cl.Width = 100; cl.Height = 100;
        arrange(cl, 100, 100);
        assert.ok(cl.HitTestGeometry instanceof PathGeometry);
        assert.ok(cl.HitTestGeometry!.Contains(new Point(50, 50)), 'centre inside');
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --conditions=development --test src/basic/tests/shape-hit-geometry-catalog.test.ts`
Expected: FAIL for the batch-B block (`HitTestGeometry` undefined).

- [ ] **Step 3: Apply the recipe to all 7 files**

Edit `heart.ts`, `bun.ts`, `squircle.ts`, `clover.ts`, `radial-wave.ts`, `ghostish.ts`, `arrow.ts`.

- [ ] **Step 4: Run the render suites to confirm painting is unchanged**

`npx tsx --conditions=development --test src/basic/tests/heart-bun-ghostish.test.ts`
`npx tsx --conditions=development --test src/basic/tests/squircle.test.ts`
`npx tsx --conditions=development --test src/basic/tests/clover.test.ts`
`npx tsx --conditions=development --test src/basic/tests/radial-wave.test.ts`
`npx tsx --conditions=development --test src/basic/tests/arrow.test.ts`
Expected: PASS (unchanged).

- [ ] **Step 5: Run the new hit-geometry tests**

Run: `npx tsx --conditions=development --test src/basic/tests/shape-hit-geometry-catalog.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/basic/shapes/heart.ts src/basic/shapes/bun.ts src/basic/shapes/squircle.ts src/basic/shapes/clover.ts src/basic/shapes/radial-wave.ts src/basic/shapes/ghostish.ts src/basic/shapes/arrow.ts src/basic/tests/shape-hit-geometry-catalog.test.ts
git commit -m "feat(shape): delegate render to buildGeometry for bezier/sampled catalog shapes

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: `Puffy` + `Slanted` — bake the render transform into the hit geometry

**Files:**
- Modify: `src/basic/shapes/puffy.ts`, `src/basic/shapes/slanted.ts`
- Test: `src/basic/tests/shape-hit-geometry-transformed.test.ts`

**Interfaces:**
- Consumes: base `Shape.buildGeometry`/`ArrangeOverride` (Task 1); `Geometry.Transform` DP + `Contains` inversion.
- Produces: `Puffy.buildGeometry` / `Slanted.buildGeometry` returning the figure geometry with its `Transform` set to the render-time rotation/shear matrix (identity when none). `RenderOverride` is **unchanged** (keeps `dc.PushTransform` + draw), so painting is untouched; only the hit region is added.

**Rationale:** These two apply a `MatrixTransform` at render time that is not part of the `PathGeometry`. Setting the returned geometry's `Transform` to the same matrix makes `Geometry.Contains` (which inverts `Transform.Matrix`) test against the *drawn* silhouette. They do NOT delegate render (that would double-apply the transform); they build the figure twice, sharing the existing helpers.

- [ ] **Step 1: Write the failing test**

Create `src/basic/tests/shape-hit-geometry-transformed.test.ts`:

```ts
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Point, Rect, Size } from '../../runtime/index.js';
import { PathGeometry } from '../../visual-engine/index.js';
import { Puffy, PuffyDiamond } from '../shapes/puffy.js';
import { Slanted } from '../shapes/slanted.js';

function arrange(shape: { Measure: (s: Size) => void; Arrange: (r: Rect) => void },
                 w: number, h: number): void {
    shape.Measure(new Size(w, h));
    shape.Arrange(new Rect(0, 0, w, h));
}

describe('Puffy / Slanted — transformed hit geometry', () => {
    test('Puffy (square base) sets a PathGeometry hit region covering its centre', () => {
        const p = new Puffy();
        p.Width = 100; p.Height = 100;
        arrange(p, 100, 100);
        assert.ok(p.HitTestGeometry instanceof PathGeometry);
        assert.ok(p.HitTestGeometry!.Contains(new Point(50, 50)), 'centre inside');
    });

    test('PuffyDiamond bakes the 45° rotation into the hit region (Transform set)', () => {
        const p = new PuffyDiamond();
        p.Width = 100; p.Height = 100;
        arrange(p, 100, 100);
        const hit = p.HitTestGeometry as PathGeometry;
        assert.ok(hit instanceof PathGeometry);
        assert.ok(!hit.Transform.Matrix.IsIdentity, 'rotation baked into Transform');
        assert.ok(hit.Contains(new Point(50, 50)), 'diamond centre inside');
    });

    test('Slanted (default lean) bakes the shear into the hit region', () => {
        const s = new Slanted();
        s.Width = 100; s.Height = 100;
        arrange(s, 100, 100);
        const hit = s.HitTestGeometry as PathGeometry;
        assert.ok(hit instanceof PathGeometry);
        assert.ok(!hit.Transform.Matrix.IsIdentity, 'shear baked into Transform');
        assert.ok(hit.Contains(new Point(50, 50)), 'centre inside the leaned squircle');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --conditions=development --test src/basic/tests/shape-hit-geometry-transformed.test.ts`
Expected: FAIL — `HitTestGeometry` is undefined (Puffy/Slanted inherit the base `buildGeometry`, which returns undefined; they never set `this.Geometry`).

- [ ] **Step 3: Add `Puffy.buildGeometry` (transform baked, render unchanged)**

In `src/basic/shapes/puffy.ts`, add `Size` to the runtime import and `type Geometry` to the visual-engine import. Add this override; keep the existing `RenderOverride` and `buildPuffyFigure` unchanged:

```ts
    // Hit outline: the same puffy figure the renderer draws, with the
    // diamond rotation baked into the geometry's Transform so
    // Geometry.Contains (which inverts Transform) matches the drawn shape.
    // RenderOverride keeps its own dc.PushTransform — do NOT delegate, or
    // the rotation would apply twice.
    protected override buildGeometry(size: Size): Geometry | undefined
    {
        if (size.Width <= 0 || size.Height <= 0) return undefined;

        const stroke = this.Stroke;
        const t      = stroke?.Thickness ?? 0;
        const half = t / 2;
        const w    = Math.max(0, size.Width  - t);
        const h    = Math.max(0, size.Height - t);

        const isDiamond = this.Base === PuffyBase.Diamond;
        const scale  = isDiamond ? Math.SQRT1_2 : 1;
        const innerW = w * scale;
        const innerH = h * scale;
        const offX   = half + (w - innerW) / 2;
        const offY   = half + (h - innerH) / 2;

        const geom = new PathGeometry([buildPuffyFigure(
            offX, offY, innerW, innerH,
            Math.max(1, Math.floor(this.BumpsPerSide)))]);

        if (isDiamond)
        {
            const cx = half + w / 2;
            const cy = half + h / 2;
            const a  = Math.PI / 4;
            const c  = Math.cos(a);
            const s  = Math.sin(a);
            const ox = cx - (cx * c + cy * s);
            const oy = cy - (cx * (-s) + cy * c);
            geom.Transform = new MatrixTransform(new Matrix(c, -s, s, c, ox, oy));
        }
        return geom;
    }
```

`Matrix`, `MatrixTransform`, `PathGeometry`, `PuffyBase`, `buildPuffyFigure` are all already imported/defined in the file. Add `Geometry` (type) to the visual-engine import and `Size` to the runtime import.

- [ ] **Step 4: Add `Slanted.buildGeometry` (shear baked, render unchanged)**

In `src/basic/shapes/slanted.ts`, add `Size` to the runtime import and `type Geometry` to the visual-engine import. Add this override; keep `RenderOverride` and everything else unchanged:

```ts
    // Hit outline: the same sheared squircle the renderer draws, with the
    // shear baked into the geometry's Transform (Contains inverts it).
    // RenderOverride keeps its own dc.PushTransform — do NOT delegate.
    protected override buildGeometry(size: Size): Geometry | undefined
    {
        if (size.Width <= 0 || size.Height <= 0) return undefined;

        const stroke = this.Stroke;
        const t      = stroke?.Thickness ?? 0;
        const half = t / 2;
        const w    = Math.max(0, size.Width  - t);
        const h    = Math.max(0, size.Height - t);

        const lean = this.LeanAngle * Math.PI / 180;
        const tan  = Math.tan(lean);
        const shift = h * Math.abs(tan);

        const innerWidth = Math.max(0, w - shift);
        const innerXL    = half + shift / 2;

        const geom = new PathGeometry([
            buildSquircleFigure(innerXL, half, innerWidth, h, this.Superness)]);

        if (tan !== 0)
        {
            const yBottom = half + h;
            geom.Transform = new MatrixTransform(new Matrix(1, 0, -tan, 1, yBottom * tan, 0));
        }
        return geom;
    }
```

`Matrix`, `MatrixTransform`, `PathGeometry`, `buildSquircleFigure` are already imported. Add `Size` (runtime) and `type Geometry` (visual-engine).

- [ ] **Step 5: Run the new test + the render suites**

Run: `npx tsx --conditions=development --test src/basic/tests/shape-hit-geometry-transformed.test.ts`
Expected: PASS (all 3).

Confirm painting unchanged:
`npx tsx --conditions=development --test src/basic/tests/puffy.test.ts`
`npx tsx --conditions=development --test src/basic/tests/slanted.test.ts`
Expected: PASS (unchanged — `RenderOverride` was not touched).

- [ ] **Step 6: Commit**

```bash
git add src/basic/shapes/puffy.ts src/basic/shapes/slanted.ts src/basic/tests/shape-hit-geometry-transformed.test.ts
git commit -m "feat(shape): bake render transform into hit geometry for Puffy and Slanted

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Full-suite verification

**Files:** none (verification only).

- [ ] **Step 1: Run the whole Mural suite**

Run: `npm test`
Expected: PASS — all pre-existing tests plus the three new hit-geometry test files green. Investigate any failure (especially any diagram/figure interaction test that assumed AABB hit on a `Shape`); a legitimately changed expectation is fixed in that test with a comment, a real regression is fixed in the shape.

- [ ] **Step 2: Typecheck**

Run: `npm run build` (or the project's typecheck script) to confirm no type errors from the new `buildGeometry` overrides / import additions.
Expected: clean.

- [ ] **Step 3: Hand off to finishing-a-development-branch**

Announce and invoke `superpowers:finishing-a-development-branch`. Base branch = `main` (the branch `feat/shape-hit-geometry` forked from `main`). Do not merge/push unless the user chooses to.

---

## Self-Review

**Spec coverage:**
- "Add `buildGeometry(size)` seam to Shape" → Task 1. ✓
- "ArrangeOverride sets HitTestGeometry, guarded (positive size, HitTestStrokeWidth === 0)" → Task 1, Step 4. ✓
- "Base returns this.Geometry only when 1:1 (fitTransform undefined), else undefined; scaled icons deferred" → Task 1 `buildGeometry` + `fitTransform(g, size)`. ✓
- "Hit = outer un-inset silhouette for Ellipse/Rectangle; keep inset render" → Task 2. ✓
- "Catalog shapes override buildGeometry; RenderOverride delegates" → Tasks 3 & 4. ✓
- "Open shapes (Line, Arc) opt out" → covered for free (never set this.Geometry); documented in Background facts. ✓ (no task needed)
- "Connectors/band shapes unaffected (guard skips them)" → Task 1 guard `HitTestStrokeWidth === 0`. ✓
- "Path handled by base" → Background facts (uses this.Geometry DP). ✓ (no task needed)
- Transformed shapes (Puffy/Slanted) — the spec lists them under catalog shapes but they push a render transform; handled correctly via `Geometry.Transform` in Task 5 (a refinement the spec's "…" allowed). ✓

**Placeholder scan:** The batch recipes (Tasks 3-4) move each shape's geometry body *verbatim* — no invented logic; two full worked examples (Triangle, Heart) plus explicit per-file deltas. No TBD/TODO. The one import block that mis-stated `Geometry`'s source is immediately corrected inline. ✓

**Type consistency:** `buildGeometry(size: Size): Geometry | undefined` is used identically in the base and every override. `fitTransform(g: Geometry, size: Size)` — single caller updated in Task 1, Step 3. `HitTestGeometry` get/set confirmed on `Visual`. `Geometry.Transform` is a `Transform`; `new MatrixTransform(new Matrix(...))` matches its type. ✓
