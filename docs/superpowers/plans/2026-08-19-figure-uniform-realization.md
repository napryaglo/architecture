# Uniform Figure Realization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every `Figure` realize identically — one per-instance silhouette drives the inherited `Visual` paint (crisp own stroke) and a children-only `ChildClip` (label/content masked to the shape) — deleting `Figure`'s `Geometry` and `Kind` DPs and the inner `PART_Shape`.

**Architecture:** `Figure extends ContentControl`. The base `Visual` already paints `Fill`+`Stroke` over `buildPaintGeometry` and clips children to `buildChildClipGeometry` when `ClipChildren` is on (own paint stays unclipped). Figure overrides those geometry seams to return its scaled silhouette (a private `_shape` field), so no inner `Shape` primitive and no `Kind`/`Geometry` DP are needed. The raw `Clip` DP is never used (it would mask own paint and shave the stroke).

**Tech Stack:** TypeScript (ESM, strict), Mural visual-engine + framework, `tsx --test`. Spec: `docs/superpowers/specs/2026-08-19-figure-uniform-realization-design.md`.

## Global Constraints

- Every test file lives in a `tests/` subfolder next to its source (`src/framework/diagram/tests/figure.test.ts`).
- Run all tests: `npm test`. Single file: `npx tsx --conditions=development --test <path>`.
- Enums over string-literal unions; layout composes without explicit width/height; renderer/framework must not import `node:fs`/`node:path`.
- Framework templates compile to `build/` (gitignored) via `npm run build:templates`; demos via `npm run build:demos` (tracked `.mu.js`). Commit only when the plan says to; branch is `feat/figure-uniform-realization`.
- Commit messages end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Scope is `Figure` ONLY. Do not touch `ShapeNodeVM`, its `Kind`, or the `'shape'`/`'text'`/`'callout'` node serializers.

---

### Task 1: Figure self-paints its silhouette + clips children

Swap the render model: Figure paints its own shape via the inherited Visual paint path and masks content/label with `ChildClip`. Delete `Figure.GeometryKey` and the template's `PART_Shape`.

**Files:**
- Modify: `src/framework/diagram/figure.ts`
- Modify: `src/framework/diagram/diagram.template.mu`
- Test: `src/framework/diagram/tests/figure-render.test.ts` (create)

**Interfaces:**
- Consumes (from `Visual`, all `protected`): `buildPaintGeometry(size: Size, inset: number): Geometry`, `buildClipGeometry(size: Size): Geometry`, `buildChildClipGeometry(size: Size): Geometry | undefined`, `RenderOverride(dc: DrawingContext): void`, DP `ClipChildren: boolean`.
- Consumes: `scaleGeometry(source: PathGeometry | undefined, width, height): PathGeometry | undefined` (shape-catalog.ts).
- Produces: private `_shape: PathGeometry | undefined` (the scaled silhouette), rebuilt by the existing `_rebuildGeometry()`; `Figure.GeometryKey`/`Geometry` accessors removed.

- [ ] **Step 1: Write the failing test**

Create `src/framework/diagram/tests/figure-render.test.ts`. Use the `CapturingContext` pattern from the shape tests (e.g. `src/basic/tests/heart-bun-ghostish.test.ts:23`).

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Size, type DrawingContext } from '../../../runtime/index.js';
import type { Brush, Geometry, Pen, Transform, Point } from '../../../visual-engine/index.js';
import { Figure } from '../figure.js';

// Minimal recording DC: capture DrawGeometry calls, ignore the rest.
class CapturingContext implements DrawingContext {
    public geometries: { fill: Brush | undefined; stroke: Pen | undefined; geometry: Geometry }[] = [];
    DrawGeometry(fill: Brush | undefined, stroke: Pen | undefined, geometry: Geometry): void {
        this.geometries.push({ fill, stroke, geometry });
    }
    // no-op the rest of the interface
    DrawRectangle(): void {}
    DrawLine(): void {}
    DrawEllipse(): void {}
    DrawText(): void {}
    DrawImage(): void {}
    DrawGlyphRun(): void {}
    PushTransform(_t: Transform): void {}
    PushClip(_g: Geometry): void {}
    PushOpacity(_o: number): void {}
    Pop(): void {}
}

function render(f: Figure, w: number, h: number): CapturingContext {
    f.Width = w; f.Height = h;
    f.Measure(new Size(w, h));
    f.Arrange({ X: 0, Y: 0, Width: w, Height: h } as unknown as never); // Rect
    const dc = new CapturingContext();
    (f as unknown as { RenderOverride(dc: DrawingContext): void }).RenderOverride(dc);
    return dc;
}

test('a catalog Figure paints its own silhouette (not a bounds rect)', () => {
    const f = Figure.fromKind('ellipse', 0, 0, { width: 80, height: 60 });
    const dc = render(f, 80, 60);
    assert.equal(dc.geometries.length, 1);
    const b = dc.geometries[0].geometry.GetBounds();
    // silhouette fills the slot; an ellipse's own bounds match the box
    assert.ok(Math.abs(b.Width - 80) < 1 && Math.abs(b.Height - 60) < 1);
    assert.notEqual(dc.geometries[0].fill, undefined); // Figure has a Fill default
});

test('a bare Figure with no shape paints nothing (self-paint guard)', () => {
    const f = new Figure();
    const dc = render(f, 40, 40);
    assert.equal(dc.geometries.length, 0);
});

test('ClipChildren is on for a shaped Figure and its child clip is the silhouette', () => {
    const f = Figure.fromKind('ellipse', 0, 0, { width: 80, height: 60 });
    f.Width = 80; f.Height = 60;
    assert.equal(f.ClipChildren, true);
    const g = (f as unknown as { buildChildClipGeometry(s: Size): Geometry | undefined })
        .buildChildClipGeometry(new Size(80, 60));
    assert.notEqual(g, undefined);
});

test('resize rescales the painted silhouette', () => {
    const f = Figure.fromKind('rectangle', 0, 0, { width: 40, height: 40 });
    const dc = render(f, 120, 30);
    const b = dc.geometries[0].geometry.GetBounds();
    assert.ok(Math.abs(b.Width - 120) < 1 && Math.abs(b.Height - 30) < 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --conditions=development --test src/framework/diagram/tests/figure-render.test.ts`
Expected: FAIL — Figure still paints via `PART_Shape`/base bounds rect; `ClipChildren` is false; `_shape` doesn't exist.

- [ ] **Step 3: Implement — add `_shape` + seams, delete `Geometry` DP, guard paint**

In `src/framework/diagram/figure.ts`:

1. Add `Geometry` + `DrawingContext` to imports:
   - from `'../../visual-engine/index.js'`: add `type Geometry`.
   - from `'../../runtime/index.js'`: add `type DrawingContext`.
2. Delete the `GeometryKey` DP (lines ~127-131) and the `Geometry` get/set accessors (lines ~451-452).
3. Add the field next to `_source`:
   ```ts
   // The scaled silhouette this Figure paints + clips children to. Rebuilt from
   // _source on resize. Replaces the old Geometry DP; never stored in the Clip DP
   // (that masks own paint and would shave the stroke).
   private _shape: PathGeometry | undefined = undefined;
   ```
4. Rewrite `_rebuildGeometry()`:
   ```ts
   private _rebuildGeometry(): void
   {
       if (this._source === undefined) { this._shape = undefined; this.ClipChildren = false; return; }
       this._shape = scaleGeometry(this._source, this.Width, this.Height);
       this.ClipChildren = this._shape !== undefined;   // clip content/label to the shape
       this.InvalidateVisual();                         // MetaData.Render was on the old DP; keep repaint
   }
   ```
5. Override the geometry seams + guard (place after `_rebuildGeometry`):
   ```ts
   // The silhouette drives own paint, the children clip, and hit/clip-to-bounds.
   // Never routed through the raw Clip DP (whole-subtree mask → would shave the
   // own stroke); ChildClip masks the label/content while the stroke keeps painting.
   protected override buildPaintGeometry(size: Size, inset: number): Geometry
   {
       return this._shape ?? super.buildPaintGeometry(size, inset);
   }
   protected override buildChildClipGeometry(size: Size): Geometry | undefined
   {
       return this._shape ?? super.buildChildClipGeometry(size);
   }
   protected override buildClipGeometry(size: Size): Geometry
   {
       return this._shape ?? super.buildClipGeometry(size);
   }
   protected override RenderOverride(dc: DrawingContext): void
   {
       if (this._shape === undefined) return;   // neutral container: nothing to paint
       super.RenderOverride(dc);                // Fill + Stroke over buildPaintGeometry (= _shape)
   }
   ```

In `src/framework/diagram/diagram.template.mu`: in the `DefaultFigure` template, delete the `Shape x:name="PART_Shape"` element and its `[ Geometry=$$Geometry, Fill=$$Fill, Stroke=$$Stroke, Width=$$Width, Height=$$Height ]` bindings. Keep `PART_Content` and `PART_LabelHost`.

- [ ] **Step 4: Rebuild templates and run tests**

Run: `npm run build:templates && npx tsx --conditions=development --test src/framework/diagram/tests/figure-render.test.ts`
Expected: PASS (4/4).

- [ ] **Step 5: Guard against regressions in existing Figure tests**

Run: `npx tsx --conditions=development --test src/framework/diagram/tests/figure.test.ts`
Expected: PASS. If a test asserted `Figure.Geometry`, update it to assert via `buildPaintGeometry(size, 0)` / `_getSource()`; do NOT re-add the DP.

- [ ] **Step 6: Commit**

```bash
git add src/framework/diagram/figure.ts src/framework/diagram/diagram.template.mu src/framework/diagram/tests/figure-render.test.ts
git commit -m "feat(figure): self-paint silhouette + ChildClip; drop Geometry DP and PART_Shape"
```

---

### Task 2: Remove `Kind` from Figure and collapse default ports to bbox

`Kind` and the default port table are interdependent — `Figure.Ports` calls `resolveDefaultPortProvider(this)`, which reads `host.Kind`. Remove both together so the build stays green.

**Files:**
- Modify: `src/framework/diagram/figure.ts`
- Modify: `src/framework/diagram/port-providers/default-port-providers.ts`
- Test: `src/framework/diagram/tests/figure-kind-removed.test.ts` (create)

**Interfaces:**
- Consumes: `Figure._source` + `Figure._rebuildGeometry` (Task 1).
- Produces: `Figure` has no `Kind` DP/accessor; `fromKind`/`ApplyCatalogKind`/`_setKindFromCatalog` keep the `kind` string only as a construction-time catalog selector; `resolveDefaultPortProvider(): IPortProvider` returns the bbox `FALLBACK_PROVIDER` for all figures.

- [ ] **Step 1: Write the failing test**

Create `src/framework/diagram/tests/figure-kind-removed.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Figure } from '../figure.js';
import { resolveDefaultPortProvider } from '../port-providers/default-port-providers.js';
import { BoundingBoxPorts } from '../port-providers/bounding-box-ports.js';

test('Figure no longer exposes a Kind DP or accessor', () => {
    const f = Figure.fromKind('ellipse', 0, 0);
    assert.equal((f as unknown as { Kind?: unknown }).Kind, undefined);
});

test('fromKind still builds the catalog source (drawable shape)', () => {
    const f = Figure.fromKind('ellipse', 0, 0, { width: 40, height: 40 });
    assert.notEqual(f._getSource(), undefined);
});

test('default ports are bounding-box for every figure', () => {
    const ell = Figure.fromKind('ellipse', 0, 0);
    const tri = Figure.fromKind('triangle', 0, 0);
    assert.ok(resolveDefaultPortProvider() instanceof BoundingBoxPorts);
    assert.ok(ell.Ports.length > 0 && tri.Ports.length > 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --conditions=development --test src/framework/diagram/tests/figure-kind-removed.test.ts`
Expected: FAIL — `Kind` still exists; `resolveDefaultPortProvider` requires a `{ Kind }` arg.

- [ ] **Step 3: Implement**

In `src/framework/diagram/port-providers/default-port-providers.ts`: delete `DEFAULT_PORT_PROVIDERS` and its shape imports (`RadialPorts`, `VertexPorts`, `CustomPortProvider`, `Port*` if now unused); keep `BoundingBoxPorts` + `FALLBACK_PROVIDER`. Replace the resolver:
```ts
// Default ports are bbox for every figure (1 per side). Shapes that need a
// different topology set Figure.PortProvider explicitly.
export function resolveDefaultPortProvider(): IPortProvider
{
    return FALLBACK_PROVIDER;
}
```

In `src/framework/diagram/figure.ts`:
- Delete the `KindKey` DP (lines ~124-125) and the `Kind` get/set accessors (lines ~449-450).
- `_setKindFromCatalog(kind, source)`: drop `this.set_property_value(Figure.KindKey, kind)`; keep `this._source = source; this._rebuildGeometry();`. The `kind` param stays (callers still pass it to select the catalog entry) but is no longer stored.
- `fromSource`: drop the `if (options?.kind !== undefined) set KindKey` line; remove `kind` from `FigureFromSourceOptions`.
- `Figure.Ports` getter: change `resolveDefaultPortProvider(this)` → `resolveDefaultPortProvider()`.
- `FIELD_SOURCE_NAMES`: remove `'Kind'`.
- `_resolveField`: delete the `case FieldKind.Kind:` branch (falls through to `default: undefined`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --conditions=development --test src/framework/diagram/tests/figure-kind-removed.test.ts`
Expected: PASS (3/3). Then typecheck: `npx tsc --noEmit` — fix any now-unused imports in the two files.

- [ ] **Step 5: Commit**

```bash
git add src/framework/diagram/figure.ts src/framework/diagram/port-providers/default-port-providers.ts src/framework/diagram/tests/figure-kind-removed.test.ts
git commit -m "feat(figure): remove Kind DP + consumers; default ports become bbox-for-all"
```

---

### Task 3: Sweep templates/demos, full suite green, finish

Confirm no other code binds the removed members, rebuild demos, run the whole suite, and finish the branch.

**Files:**
- Modify (as needed): `demo/**` `.mts`/`.mu` referencing `Figure.Geometry` / `Figure.Kind` / `PART_Shape` / `{Kind}`.

- [ ] **Step 1: Find stragglers**

Run (report only):
```bash
grep -rn "Figure.*\.Kind\b\|\.GeometryKey\|Figure.*\.Geometry\b\|PART_Shape\|{Kind}" src demo --include=*.ts --include=*.mts --include=*.mu | grep -viE "ShapeNodeVM|tests/"
```
Expected: only intended sites. `ShapeNodeVM.Kind`/`.Geometry` are out of scope — leave them. `{Kind}` in any template/demo must be removed or repointed (the field token is gone).

- [ ] **Step 2: Update + rebuild demos**

Apply the edits from Step 1 (a demo reading `figure.Kind`/`figure.Geometry` switches to `_getSource()` or drops the read; `ApplyCatalogKind` callers are unchanged). Then:
```bash
npm run typecheck:demos && npm run build:demos && npm run build:templates
```
Expected: clean typecheck; demos + templates rebuilt.

- [ ] **Step 3: Full suite**

Run: `npm test`
Expected: all green. Investigate any failure before proceeding (systematic-debugging).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(figure): sweep demos/templates for removed Geometry/Kind/PART_Shape; suite green"
```

- [ ] **Step 5: Finish the branch**

Announce and use **superpowers:finishing-a-development-branch** (base branch: `main`). Do not push or merge without the user's explicit choice.

---

## Self-review notes

- Spec coverage: decisions 1-4 → Task 1; 4(Kind)+5(ports) → Task 2; 6(hit=bbox) is a no-op (nothing added); 7(scope) enforced by the Global Constraint + Step-1 grep. Serialization is N/A (verified). ✓
- Type consistency: `_shape: PathGeometry | undefined` (a `Geometry`); seams return `Geometry`/`Geometry | undefined` matching Visual signatures; `resolveDefaultPortProvider()` is nullary everywhere after Task 2. ✓
- The `Rect` cast in the test harness (`f.Arrange`) may need the real `Rect` import from runtime — adjust to the project's `Rect` constructor when writing the test.
