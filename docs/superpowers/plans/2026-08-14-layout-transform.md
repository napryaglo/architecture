# LayoutTransform Implementation Plan (SP3 — mural)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a WPF-style `LayoutTransform` to `Visual` — a `Transform` that changes an element's measured/arranged *size* (not just rendering) — so a scaled element reports a larger `DesiredSize` and a containing `ScrollViewer` grows real scrollbars.

**Architecture:** A `LayoutTransform` DP on `Visual` (`MetaData.Measure | Arrange`). `Measure` reports the child's desired size transformed to its bounding box and remembers the child's local size; `Arrange` runs `ArrangeOverride` in local space and records an *effective layout matrix* mapping local content into the transformed footprint; the SVG emitter and the adorner layer compose that matrix. All paths gated on the transform being non-identity, so the default (undefined) path is byte-for-byte unchanged.

**Tech Stack:** TypeScript, mural framework, `node:test` runner (`npx tsx --test`), published to local Verdaccio.

**Design doc:** `docs/superpowers/specs/2026-08-14-layout-transform-design.md`.

## Global Constraints

- **Test location:** every test file lives in a `tests/` subfolder next to the code it exercises (e.g. `src/visual-engine/tests/…`), never beside the source.
- **Enums over string-literal unions.**
- **DP pattern:** `Model.RegisterProperty<T>(Owner, 'Name', default, MetaData.X)` + `get_property_value`/`set_property_value` accessors. `LayoutTransform` uses `MetaData.Measure | MetaData.Arrange`.
- **Backward compatibility is load-bearing:** when `LayoutTransform` is undefined or identity, every hooked method must execute its pre-existing code path unchanged. The full existing suite (4284+ tests) must stay green after every task.
- **Matrix convention:** `m1.Multiply(m2)` applies `m1` first (row-vector). `Matrix.Transform(point)`, `Matrix.Invert(): Matrix | undefined`, `Matrix.IsIdentity`, `Matrix.Scale/Translate/Rotate`.
- **SVG transform string order:** in `A B`, `B` applies to a point first, then `A` (rightmost-first).
- **Commit** after each task with a green suite. Publishing to Verdaccio is a human step — do not publish from the plan.

## File Structure

- `src/visual-engine/drawing/transform.ts` — **MODIFY.** Add `transformBounds(size, matrix): Size`.
- `src/visual-engine/tests/transform-bounds.test.ts` — **NEW.**
- `src/visual-engine/visual.ts` — **MODIFY.** `LayoutTransform` DP + Freezable wiring + `_layoutMatrix()` guard + `_layoutLocalSize`/`_effectiveLayout` fields + measure & arrange hooks + a public `EffectiveLayoutMatrix` getter (for the emitter/adorner).
- `src/visual-engine/tests/visual-layout-transform.test.ts` — **NEW.** DP, measure bbox, arrange local + footprint, identity no-op.
- `src/visual-engine/drawing/svg-renderer.ts` — **MODIFY.** Extract a pure `buildTransformAttr(...)` and compose `EffectiveLayoutMatrix`.
- `src/visual-engine/drawing/tests/build-transform-attr.test.ts` — **NEW.**
- `src/visual-engine/adorner.ts` — **MODIFY.** Compose each ancestor's `EffectiveLayoutMatrix` in the walk.
- `src/runtime/tests/adorner.test.ts` — **MODIFY.** Add a LayoutTransform-ancestor projection test.
- `src/framework/tests/scroll-viewer.test.ts` — **MODIFY.** Add the "scaled extent" proof test.
- `package.json` — **MODIFY.** Bump minor (0.7.0 → 0.8.0).

---

### Task 1: `transformBounds` helper

**Files:**
- Modify: `src/visual-engine/drawing/transform.ts`
- Test: `src/visual-engine/tests/transform-bounds.test.ts`

**Interfaces:**
- Consumes: `Matrix` (`Matrix.Scale`, `Matrix.Rotate`, `m.Transform(point)`), `Point`, `Size` from `../primitives.js`.
- Produces: `export function transformBounds(size: Size, m: Matrix): Size` — the axis-aligned bounding-box size of `Rect(0,0,size)` mapped through `m`.

- [ ] **Step 1: Write the failing test**

```ts
// src/visual-engine/tests/transform-bounds.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Size, Matrix } from '../primitives.js';
import { transformBounds } from '../drawing/transform.js';

test('scale grows the bounding box by the scale factors', () => {
    const b = transformBounds(new Size(100, 50), Matrix.Scale(2, 3));
    assert.equal(b.Width, 200);
    assert.equal(b.Height, 150);
});

test('90-degree rotation swaps width and height', () => {
    const b = transformBounds(new Size(100, 50), Matrix.Rotate(Math.PI / 2));
    assert.ok(Math.abs(b.Width - 50) < 1e-9);
    assert.ok(Math.abs(b.Height - 100) < 1e-9);
});

test('identity leaves the size unchanged', () => {
    const b = transformBounds(new Size(100, 50), Matrix.Identity);
    assert.equal(b.Width, 100);
    assert.equal(b.Height, 50);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx tsx --test src/visual-engine/tests/transform-bounds.test.ts`
Expected: FAIL — `transformBounds` not exported.

- [ ] **Step 3: Implement** (append to `transform.ts`)

```ts
import { Point, Size } from '../primitives.js';   // add Size if not already imported

// The axis-aligned bounding-box SIZE of Rect(0,0,size) mapped through `m`.
// Used by LayoutTransform to report an element's transformed footprint.
export function transformBounds(size: Size, m: Matrix): Size {
    const c0 = m.Transform(new Point(0, 0));
    const c1 = m.Transform(new Point(size.Width, 0));
    const c2 = m.Transform(new Point(0, size.Height));
    const c3 = m.Transform(new Point(size.Width, size.Height));
    const minX = Math.min(c0.X, c1.X, c2.X, c3.X);
    const minY = Math.min(c0.Y, c1.Y, c2.Y, c3.Y);
    const maxX = Math.max(c0.X, c1.X, c2.X, c3.X);
    const maxY = Math.max(c0.Y, c1.Y, c2.Y, c3.Y);
    return new Size(maxX - minX, maxY - minY);
}
```

- [ ] **Step 4: Run to verify pass** — `npx tsx --test src/visual-engine/tests/transform-bounds.test.ts` → PASS (3).

- [ ] **Step 5: Commit**

```bash
git add src/visual-engine/drawing/transform.ts src/visual-engine/tests/transform-bounds.test.ts
git commit -m "feat(visual-engine): transformBounds helper (bbox of a size under a matrix)"
```

---

### Task 2: `LayoutTransform` DP + Freezable wiring

**Files:**
- Modify: `src/visual-engine/visual.ts` (DP near `RenderTransformKey` L268; accessors near L719; Freezable owner-wiring wherever `RenderTransform` registers its owner ~L262)
- Test: `src/visual-engine/tests/visual-layout-transform.test.ts`

**Interfaces:**
- Consumes: `Transform`, `Matrix`, `MetaData`, `Model`.
- Produces on `Visual`:
  - `static readonly LayoutTransformKey`
  - `get/set LayoutTransform(): Transform | undefined`
  - `protected _layoutMatrix(): Matrix | undefined` — the transform's matrix when set and non-identity, else undefined (fast-path guard).

- [ ] **Step 1: Write the failing test**

```ts
// src/visual-engine/tests/visual-layout-transform.test.ts
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Application, Size, Rect } from '../../runtime/index.js';
import { Border } from '../../basic/border.js';
import { ScaleTransform } from '../drawing/transform.js';

class Leaf extends Border {}   // Border measures its child; used as a sized host below

describe('Visual.LayoutTransform DP', () => {
    beforeEach(() => { Application.current = null; });

    test('defaults to undefined and round-trips a value', () => {
        const b = new Border();
        assert.equal(b.LayoutTransform, undefined);
        const t = new ScaleTransform(2, 2);
        b.LayoutTransform = t;
        assert.equal(b.LayoutTransform, t);
    });

    test('changing an inner transform DP invalidates the owner measure', () => {
        const host = new Border();
        const child = new Border();
        child.Width = 100; child.Height = 50;
        host.SetChild(child);
        const t = new ScaleTransform(2, 2);
        host.LayoutTransform = t;
        host.Measure(new Size(1000, 1000));
        host.Arrange(new Rect(0, 0, 1000, 1000));
        assert.equal(host.IsMeasureValid, true);
        t.ScaleX = 3;   // inner change must dirty the owner
        assert.equal(host.IsMeasureValid, false);
    });
});
```

- [ ] **Step 2: Run to verify failure** — `npx tsx --test src/visual-engine/tests/visual-layout-transform.test.ts` → FAIL (`LayoutTransform` undefined member / not invalidating).

- [ ] **Step 3: Implement** (`visual.ts`)

Register the DP next to `RenderTransformKey`:

```ts
public static readonly LayoutTransformKey = Model.RegisterProperty<Transform | undefined>(
    Visual, 'LayoutTransform', undefined, MetaData.Measure | MetaData.Arrange);
```

Accessors next to `RenderTransform`'s:

```ts
public get LayoutTransform(): Transform | undefined { return this.get_property_value(Visual.LayoutTransformKey); }
public set LayoutTransform(value: Transform | undefined) { this.set_property_value(Visual.LayoutTransformKey, value); }
```

Guard helper (near the other layout helpers):

```ts
// The layout transform's matrix when set and non-identity, else undefined —
// the fast-path guard used by measure/arrange/emit/adorner.
protected _layoutMatrix(): Matrix | undefined {
    const lt = this.LayoutTransform;
    if (lt === undefined || lt.Matrix.IsIdentity) return undefined;
    return lt.Matrix;
}
```

Freezable owner-wiring: find where `RenderTransform` registers the owning `Visual` as a Freezable owner so inner-DP changes fire `InvalidateVisual()` (~L262). Mirror it for `LayoutTransform`, but the invalidation must dirty **layout** (`InvalidateMeasure()`), not just visual. If the existing mechanism is generic over the DP's `MetaData` flags, `MetaData.Measure | Arrange` already routes to `InvalidateMeasure`; confirm by the test above. If `RenderTransform`'s owner-hook hardcodes `InvalidateVisual`, add a parallel hook for `LayoutTransformKey` that calls `InvalidateMeasure()`.

Ensure `Transform` and `Matrix` are imported in `visual.ts` (they are, for `RenderTransform`).

- [ ] **Step 4: Run to verify pass** — the new test PASSES; run the visual/layout suite `npx tsx --test src/visual-engine/tests/*.test.ts` to confirm no regression.

- [ ] **Step 5: Commit**

```bash
git add src/visual-engine/visual.ts src/visual-engine/tests/visual-layout-transform.test.ts
git commit -m "feat(visual): LayoutTransform DP + Freezable measure-invalidation wiring"
```

---

### Task 3: Measure hook — transformed bounding box

**Files:**
- Modify: `src/visual-engine/visual.ts` (`Measure`, around the `MeasureOverride` call L1150 / `DesiredSize` store L1162)
- Modify: `src/visual-engine/tests/visual-layout-transform.test.ts` (add)
- Modify: `src/framework/tests/scroll-viewer.test.ts` (add the proof test)

**Interfaces:**
- Consumes: `transformBounds` (Task 1); `_layoutMatrix()` (Task 2).
- Produces: `DesiredSize` = `transformBounds(childLocalDesired, M) + margin` when `M` is defined; a private `_layoutLocalSize: Size` holding the child's local (untransformed) desired size for arrange. Identity/undefined → the current path.

- [ ] **Step 1: Write the failing tests**

```ts
// add to visual-layout-transform.test.ts
test('measure reports the child desired size transformed to its bounding box', () => {
    const host = new Border();
    const child = new Border();
    child.Width = 100; child.Height = 50;
    host.SetChild(child);
    host.LayoutTransform = new ScaleTransform(2, 3);
    host.Measure(new Size(1000, 1000));
    assert.equal(host.DesiredSize.Width, 200);
    assert.equal(host.DesiredSize.Height, 150);
});

test('identity/undefined LayoutTransform leaves DesiredSize at natural size (regression)', () => {
    const host = new Border();
    const child = new Border();
    child.Width = 100; child.Height = 50;
    host.SetChild(child);
    host.Measure(new Size(1000, 1000));
    assert.equal(host.DesiredSize.Width, 100);
    assert.equal(host.DesiredSize.Height, 50);
});
```

```ts
// add to src/framework/tests/scroll-viewer.test.ts (mirror its existing FixedRect/extent test)
import { ScaleTransform } from '../../visual-engine/drawing/transform.js';
import { Border } from '../../basic/border.js';

test('a LayoutTransform-scaled child grows the ScrollViewer extent (scrollbars follow zoom)', () => {
    const sv = new ScrollViewer();
    const host = new Border();
    host.SetChild(new FixedRect(new Size(500, 800)));   // FixedRect helper already in this file
    host.LayoutTransform = new ScaleTransform(2, 2);
    sv.Content = host;
    sv.Measure(new Size(100, 200));
    assert.equal(sv.ExtentWidth, 1000);
    assert.equal(sv.ExtentHeight, 1600);
});
```

*(If the scroll-viewer test file names the fixed-size helper differently than `FixedRect`, use that file's existing helper — Task's implementer confirms the name from the file.)*

- [ ] **Step 2: Run to verify failure** — both new tests FAIL (DesiredSize/extent at natural size).

- [ ] **Step 3: Implement** (`visual.ts` `Measure`)

Add a private field near the other layout fields (L595):

```ts
private _layoutLocalSize: Size = Size.Zero;
```

In `Measure`, wrap the `MeasureOverride` + `DesiredSize` computation. Let `avail` be the margin-subtracted available size the code already computes, and `M = this._layoutMatrix()`:

```ts
// (existing) avail = availableSize minus margin, constrained
let measureAvail = avail;
if (M !== undefined) {
    const inv = M.Invert();
    measureAvail = inv !== undefined ? transformBounds(avail, inv) : avail;
}
const measured = this.MeasureOverride(measureAvail);
// (existing) clamp `measured` to Min/Max -> `clampedLocal`
this._layoutLocalSize = clampedLocal;
const footprint = M !== undefined ? transformBounds(clampedLocal, M) : clampedLocal;
this._desiredSize = new Size(footprint.Width + marginH, footprint.Height + marginV);
```

Keep the exact existing clamp/margin variable names; only insert the inverse-available mapping before `MeasureOverride`, store `_layoutLocalSize`, and bbox the clamped size before adding margin. When `M === undefined` the values equal the current computation (no behavior change). Import `transformBounds` and `Size`.

- [ ] **Step 4: Run to verify pass** — new measure tests + the ScrollViewer proof PASS; run the full `src/visual-engine` + `src/framework` suites → green.

- [ ] **Step 5: Commit**

```bash
git add src/visual-engine/visual.ts src/visual-engine/tests/visual-layout-transform.test.ts src/framework/tests/scroll-viewer.test.ts
git commit -m "feat(visual): LayoutTransform measure — report transformed bounding box"
```

---

### Task 4: Arrange hook — local ArrangeOverride + effective layout matrix

**Files:**
- Modify: `src/visual-engine/visual.ts` (`Arrange`, around `ArrangeOverride` L1271 + `ArrangedRect` store L1265)
- Modify: `src/visual-engine/tests/visual-layout-transform.test.ts` (add)

**Interfaces:**
- Consumes: `_layoutMatrix()`, `_layoutLocalSize`, `transformBounds`, `Matrix`, `Point`.
- Produces: `RenderSize` = `ArrangeOverride(localSize)` (local coords); `ArrangedRect` footprint = transformed bbox; a private `_effectiveLayout: Matrix | undefined` + a public getter `get EffectiveLayoutMatrix(): Matrix | undefined` for the emitter/adorner.

- [ ] **Step 1: Write the failing test**

```ts
// add to visual-layout-transform.test.ts
test('arrange lays the child out in local space and footprints the transformed bbox', () => {
    const host = new Border();
    const child = new Border();
    child.Width = 100; child.Height = 50;
    host.SetChild(child);
    host.LayoutTransform = new ScaleTransform(2, 3);
    host.Measure(new Size(1000, 1000));
    host.Arrange(new Rect(0, 0, 1000, 1000));
    // Child arranged at natural (local) size:
    assert.equal(child.RenderSize.Width, 100);
    assert.equal(child.RenderSize.Height, 50);
    // Host's effective layout matrix scales local -> footprint:
    const m = host.EffectiveLayoutMatrix;
    assert.ok(m !== undefined);
    assert.equal(m!.M11, 2);
    assert.equal(m!.M22, 3);
});

test('no LayoutTransform leaves EffectiveLayoutMatrix undefined (regression)', () => {
    const host = new Border();
    host.SetChild(new Border());
    host.Measure(new Size(400, 400));
    host.Arrange(new Rect(0, 0, 400, 400));
    assert.equal(host.EffectiveLayoutMatrix, undefined);
});
```

- [ ] **Step 2: Run to verify failure** — FAIL (`EffectiveLayoutMatrix` undefined member; child arranged at scaled size).

- [ ] **Step 3: Implement** (`visual.ts` `Arrange`)

Fields + getter:

```ts
private _effectiveLayout: Matrix | undefined = undefined;
public get EffectiveLayoutMatrix(): Matrix | undefined { return this._effectiveLayout; }
```

In `Arrange`, where the code currently computes `renderSize` and calls `this._renderSize = this.ArrangeOverride(renderSize)` (L1271), branch on `M = this._layoutMatrix()`:

```ts
if (M !== undefined) {
    const localSize = this._layoutLocalSize;
    this._renderSize = this.ArrangeOverride(localSize);           // child lays out in LOCAL space
    // transformed bbox of the local render rect; shift so its min corner is at (0,0)
    const rs = this._renderSize;
    const c0 = M.Transform(new Point(0, 0));
    const c1 = M.Transform(new Point(rs.Width, 0));
    const c2 = M.Transform(new Point(0, rs.Height));
    const c3 = M.Transform(new Point(rs.Width, rs.Height));
    const bx = Math.min(c0.X, c1.X, c2.X, c3.X);
    const by = Math.min(c0.Y, c1.Y, c2.Y, c3.Y);
    this._effectiveLayout = M.Multiply(Matrix.Translate(-bx, -by));   // apply M, then shift bbox to origin
    // footprint size the parent-space ArrangedRect should carry:
    const fw = Math.max(c0.X, c1.X, c2.X, c3.X) - bx;
    const fh = Math.max(c0.Y, c1.Y, c2.Y, c3.Y) - by;
    this._arrangedRect = new Rect(this._arrangedRect.X, this._arrangedRect.Y, fw, fh);
} else {
    this._effectiveLayout = undefined;
    this._renderSize = this.ArrangeOverride(renderSize);          // (existing path, unchanged)
}
```

Keep the existing alignment computation that produced `this._arrangedRect.X/Y` and `renderSize`; the `M !== undefined` branch only overrides the footprint size and `RenderSize`. Import `Point` and `Matrix` if not already.

*Note:* the SVG emitter (Task 5) still translates by `ArrangedRect.X/Y`, so leaving the footprint origin as the alignment-derived `X/Y` keeps positioning correct.

- [ ] **Step 4: Run to verify pass** — new arrange tests PASS; visual-engine suite green.

- [ ] **Step 5: Commit**

```bash
git add src/visual-engine/visual.ts src/visual-engine/tests/visual-layout-transform.test.ts
git commit -m "feat(visual): LayoutTransform arrange — local ArrangeOverride + effective layout matrix"
```

---

### Task 5: SVG emission composes the effective layout matrix

**Files:**
- Modify: `src/visual-engine/drawing/svg-renderer.ts` (`applyTransform` L459-518 — extract a pure builder)
- Test: `src/visual-engine/drawing/tests/build-transform-attr.test.ts` (NEW)

**Interfaces:**
- Consumes: `Rect`, `Matrix`, `Point`, `formatNumber` (already in the renderer).
- Produces: `export function buildTransformAttr(args: { rect: Rect; layout?: Matrix; render?: Matrix; origin: Point; renderSize: Size }): string | undefined` — the composed `transform` attribute (or undefined for the no-op case). `applyTransform` calls it with `visual.EffectiveLayoutMatrix` as `layout`.

- [ ] **Step 1: Write the failing test**

```ts
// src/visual-engine/drawing/tests/build-transform-attr.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rect, Point, Size, Matrix } from '../../primitives.js';
import { buildTransformAttr } from '../svg-renderer.js';

test('no transforms and no offset -> undefined (no attribute)', () => {
    assert.equal(buildTransformAttr({ rect: new Rect(0, 0, 10, 10), origin: Point.Zero, renderSize: new Size(10, 10) }), undefined);
});

test('layout matrix is emitted inner to the arrange offset', () => {
    const s = buildTransformAttr({
        rect: new Rect(30, 40, 200, 150),
        layout: Matrix.Scale(2, 3),
        origin: Point.Zero,
        renderSize: new Size(100, 50),
    });
    // translate to position, then the layout matrix (rightmost applies first)
    assert.equal(s, 'translate(30,40) matrix(2,0,0,3,0,0)');
});

test('offset only (no matrices) still emits a translate (regression)', () => {
    const s = buildTransformAttr({ rect: new Rect(5, 6, 10, 10), origin: Point.Zero, renderSize: new Size(10, 10) });
    assert.equal(s, 'translate(5,6)');
});
```

*(Match the exact spacing/format the current `applyTransform` produces — the implementer aligns the strings to `formatNumber` output; adjust the expected literals if `formatNumber` trims differently.)*

- [ ] **Step 2: Run to verify failure** — FAIL (`buildTransformAttr` not exported).

- [ ] **Step 3: Implement** — extract the parts-building from `applyTransform` into an exported pure function, add the `layout` matrix **inner** to `render` (rightmost in the string), and have `applyTransform` call it:

```ts
export function buildTransformAttr(args: { rect: Rect; layout?: Matrix; render?: Matrix; origin: Point; renderSize: Size }): string | undefined {
    const { rect, layout, render, origin, renderSize } = args;
    const hasRender = render !== undefined && !render.IsIdentity;
    const hasLayout = layout !== undefined && !layout.IsIdentity;
    const hasOffset = rect.X !== 0 || rect.Y !== 0;
    if (!hasRender && !hasLayout && !hasOffset) return undefined;
    const parts: string[] = [];
    if (hasOffset) parts.push(`translate(${formatNumber(rect.X)},${formatNumber(rect.Y)})`);
    if (hasRender) {
        const ox = origin.X * renderSize.Width;
        const oy = origin.Y * renderSize.Height;
        if (ox !== 0 || oy !== 0) parts.push(`translate(${formatNumber(ox)},${formatNumber(oy)})`);
        const m = render!;
        parts.push(`matrix(${formatNumber(m.M11)},${formatNumber(m.M12)},${formatNumber(m.M21)},${formatNumber(m.M22)},${formatNumber(m.OffsetX)},${formatNumber(m.OffsetY)})`);
        if (ox !== 0 || oy !== 0) parts.push(`translate(${formatNumber(-ox)},${formatNumber(-oy)})`);
    }
    if (hasLayout) {
        const m = layout!;
        parts.push(`matrix(${formatNumber(m.M11)},${formatNumber(m.M12)},${formatNumber(m.M21)},${formatNumber(m.M22)},${formatNumber(m.OffsetX)},${formatNumber(m.OffsetY)})`);
    }
    return parts.length > 0 ? parts.join(' ') : undefined;
}
```

Then in `applyTransform`, replace the inline string building with:

```ts
const attr = buildTransformAttr({
    rect: visual.ArrangedRect,
    layout: visual.EffectiveLayoutMatrix,
    render: visual.RenderTransform?.Matrix,
    origin: visual.RenderTransformOrigin,
    renderSize: visual.RenderSize,
});
if (attr === undefined) outer.removeAttribute('transform'); else outer.setAttribute('transform', attr);
```

Note the RenderTransform pivot now uses `RenderSize` (equal to `ArrangedRect.W/H` when there is no LayoutTransform, so unchanged for existing content). Ensure `applyTransform` re-runs when `EffectiveLayoutMatrix` changes — it already re-runs on arrange invalidation, which a LayoutTransform change triggers.

- [ ] **Step 4: Run to verify pass** — `build-transform-attr.test.ts` PASS; run the renderer suite + full visual-engine suite → green (existing render tests confirm the extraction preserved output).

- [ ] **Step 5: Commit**

```bash
git add src/visual-engine/drawing/svg-renderer.ts src/visual-engine/drawing/tests/build-transform-attr.test.ts
git commit -m "feat(svg-renderer): compose LayoutTransform into the element transform"
```

---

### Task 6: Adorner layer composes the effective layout matrix

**Files:**
- Modify: `src/visual-engine/adorner.ts` (`computeAdornedRectInLayerFrame` L162-219, the ancestor loop)
- Modify: `src/runtime/tests/adorner.test.ts` (add a LayoutTransform-ancestor test)

**Interfaces:**
- Consumes: `Visual.EffectiveLayoutMatrix` (Task 4), `Matrix`, `Point`.
- Produces: adorners project correctly when an ancestor has a `LayoutTransform`; identity/no-LT ancestors unchanged.

- [ ] **Step 1: Write the failing test** (append to `adorner.test.ts`, reusing its `layout`/`TestAdorner` helpers)

```ts
test('projects the adorned rect through an ancestor LayoutTransform (scale)', () => {
    const { decorator, canvas, squares } = layout({ x: 10, y: 20, side: 30 });
    canvas.LayoutTransform = new ScaleTransform(2, 2);   // layout-scale the adorned element's parent
    const adorner = new TestAdorner(squares[0]!);
    decorator.AdornerLayer.Add(adorner);
    decorator.InvalidateMeasure();
    decorator.Measure(new Size(600, 600));
    decorator.Arrange(new Rect(0, 0, 600, 600));
    const r = adorner.ArrangedRect;
    // square local (10,20,30,30) under a 2x layout scale on the canvas -> (20,40,60,60)
    assert.equal(r.X, 20);
    assert.equal(r.Y, 40);
    assert.equal(r.Width, 60);
    assert.equal(r.Height, 60);
});
```

*(Import `ScaleTransform` if not already imported in the file — it already imports it for the RenderTransform test.)*

- [ ] **Step 2: Run to verify failure** — FAIL (adorner projects at unscaled `(10,20,30,30)`).

- [ ] **Step 3: Implement** — in the ancestor loop, compose `cur.EffectiveLayoutMatrix` in the same position the emitter uses (layout inner to the arrange offset, i.e. multiplied before the `Translate(rect.X,Y)`):

```ts
let local = Matrix.Translate(rect.X, rect.Y);
const rt = cur.RenderTransform;
if (rt !== undefined && !rt.Matrix.IsIdentity) {
    const origin = cur.RenderTransformOrigin;
    const ox = origin.X * rect.Width;   // (unchanged pivot math)
    const oy = origin.Y * rect.Height;
    const pivoted = Matrix.Translate(-ox, -oy).Multiply(rt.Matrix).Multiply(Matrix.Translate(ox, oy));
    local = pivoted.Multiply(local);
}
const lm = cur.EffectiveLayoutMatrix;   // NEW: layout transform inner to the arrange offset
if (lm !== undefined) local = lm.Multiply(local);
m = m.Multiply(local);
```

(`lm.Multiply(local)` = apply the layout matrix first, then the arrange offset — matching `translate(rect) … matrix(layout)` in the emitter, where `layout` applies to a point first.)

- [ ] **Step 4: Run to verify pass** — the new test PASSES; the whole `adorner.test.ts` (incl. the pre-existing RenderTransform + identity cases) stays green.

- [ ] **Step 5: Commit**

```bash
git add src/visual-engine/adorner.ts src/runtime/tests/adorner.test.ts
git commit -m "feat(adorner): compose ancestor LayoutTransform when positioning adorners"
```

---

### Task 7: Full suite + version bump

**Files:**
- Modify: `package.json` (0.7.0 → 0.8.0)

- [ ] **Step 1: Full suite + build**

Run the full mural suite and the template build:
```bash
npm test
npm run build:templates
npm run typecheck
```
Expected: all green (the LayoutTransform is new public `Visual` API; nothing regresses because every hook is identity-guarded).

- [ ] **Step 2: Bump the version** — `package.json` `0.7.0` → `0.8.0` (new public `Visual.LayoutTransform` API).

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: bump 0.8.0 — Visual.LayoutTransform public API"
```

*(Publishing to local Verdaccio is a human step; SP4 consumes 0.8.0 after it's published.)*

---

## Self-Review

**Spec coverage:** D1 DP → Task 2; D2 measure → Task 3; D3 arrange + effective matrix → Task 4; D4 SVG emit → Task 5; D5 adorner → Task 6; D6 `transformBounds` → Task 1. The proof test (ScrollViewer scaled extent) → Task 3. Backward-compat regressions → Tasks 3/4/6 identity cases + the full suite in Task 7.

**Placeholder scan:** Two spots reference existing-but-unquoted specifics with concrete fallbacks flagged inline: the scroll-viewer test's fixed-size helper name (Task 3) and the exact `formatNumber` spacing in the emitted string (Task 5). Both have a stated resolution (use the file's existing helper / align to `formatNumber` output). All logic is spelled out.

**Type consistency:** `transformBounds(size, matrix): Size` used in Tasks 1/3/4. `_layoutMatrix(): Matrix | undefined` (Task 2) consumed in Tasks 3/4. `_layoutLocalSize: Size` set in Task 3, read in Task 4. `EffectiveLayoutMatrix: Matrix | undefined` produced in Task 4, consumed in Tasks 5/6. `buildTransformAttr` signature consistent (Task 5). The Multiply order (`M.Multiply(Translate(-bx,-by))`, `lm.Multiply(local)`) is consistent between arrange (Task 4), emit (Task 5), and adorner (Task 6).

## Out of scope (this plan)

- SP4 diagram rework (items-panel `LayoutTransform`, scroll-based pan, zoom-at-cursor via offset, Fit via offset, retire `PanX/PanY`).
- SP5 Plexus persistence (zoom + scroll offset).
- Rotation available-size exact solving; Stretch-under-rotation local re-derivation; LayoutTransform animation.
