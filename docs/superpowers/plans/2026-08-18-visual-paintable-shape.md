# Visual as a Paintable Shape — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give base `Visual` a paintable shape — one geometry filled with `Fill` and stroked with `Stroke` — and derive clip-to-bounds, hit region, and a new inset children-clip from it; consolidate `Shape`, `Border`, and `HeartPresenter` onto it.

**Architecture:** `buildClipGeometry(size)` becomes the single "shape geometry" (the outer outline). `Visual.RenderOverride` paints it (`Fill` + `Stroke`, inset by half the pen so the centered stroke stays inside). `ClipToBounds`/`HitTestGeometry` use the outline; a new `ChildClip` (outline inset by the full pen) clips children via a renderer children-group. `Background` is renamed to `Fill` framework-wide.

**Tech Stack:** TypeScript (ESM, `.ts`), `node:test` + `tsx` runner, jsdom for renderer tests, `Model.RegisterProperty` DP system, SVG DOM renderer + headless target.

**Spec:** [docs/superpowers/specs/2026-08-18-visual-paintable-shape-design.md](../specs/2026-08-18-visual-paintable-shape-design.md)

## Global Constraints

- Tests live in a `tests/` subfolder next to the code (`src/foo/tests/x.test.ts`); the runner globs `src/**/*.test.ts`.
- Run one test file: `npm run test:file "<path>"`. Full suite: `npm test`.
- Enums over string-literal unions; no bare string literals for fixed option sets.
- Every change defaults to today's behavior: `Stroke` undefined ⇒ no stroke; base paint no-ops without a brush/pen; `ClipChildren` default `false`.
- Markup-facing renames must also update the compiler symbol table ([src/compiler/symbol-table.ts](../../../src/compiler/symbol-table.ts)) and DEFAULT_SYMBOLS where the token is author-visible.
- Commit message trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Each phase must leave `npm test` fully green before the next begins.

---

## Phase 0 — Rename `Background` → `Fill`

Mechanical, isolated, reviewable-on-its-own. The existing suite is the safety net.

### Task 0.1: Rename the `Visual.Background` DP to `Fill`

**Files:**
- Modify: `src/visual-engine/visual.ts` (the `BackgroundKey` DP registration + `Background` getter/setter near [visual.ts:741](../../../src/visual-engine/visual.ts))
- Modify: every reader/writer across `src/**` and `demo/**` (find them in Step 1)
- Modify: `src/compiler/symbol-table.ts` if `Background` is an author-facing property token
- Test: existing suite (no new test — this is a rename verified by green)

**Interfaces:**
- Produces: `Visual.FillKey: PropertyKey<Brush | undefined>`, `get/set Fill(): Brush | undefined`. Replaces `BackgroundKey` / `Background`.

- [ ] **Step 1: Enumerate every reference**

```bash
grep -rn "Background" src/ demo/ | grep -v "node_modules" > /tmp/bg-refs.txt
wc -l /tmp/bg-refs.txt
```
Review the list. Distinguish the `Visual.Background` DP (rename) from unrelated `background` CSS strings / host-chrome (leave those). Note `BackgroundKey`, `.Background`, `'Background'` string keys, and symbol-table entries.

- [ ] **Step 2: Confirm the suite is green before touching anything**

Run: `npm test`
Expected: PASS (baseline).

- [ ] **Step 3: Rename the DP in `visual.ts`**

```ts
public static readonly FillKey = Model.RegisterProperty<Brush | undefined>(
    Visual, 'Fill', undefined, MetaData.Render);
public get Fill(): Brush | undefined { return this.get_property_value(Visual.FillKey); }
public set Fill(value: Brush | undefined) { this.set_property_value(Visual.FillKey, value); }
```
Update the doc comment (`/** Fill brush … */`).

- [ ] **Step 4: Update every call site**

Rename `Visual.BackgroundKey`→`Visual.FillKey`, `.Background`→`.Fill`, and any `'Background'` string DP key →`'Fill'` across the files from Step 1 (framework, controls, demos, templates). Update the symbol table token if present.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS (same count as Step 2). Fix any missed reference until green.

- [ ] **Step 6: Build demos + templates to catch markup references**

Run: `npm run build`
Expected: no errors. Fix any `Background=` in `.mu` files → `Fill=`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor(visual): rename Background DP to Fill

Mechanical framework-wide rename; no behavior change. Fill becomes the base
fill brush that Visual will paint (see visual-paintable-shape spec).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 1 — `Visual.Stroke` + base `RenderOverride` paint

### Task 1.1: Add `Visual.Stroke` DP

**Files:**
- Modify: `src/visual-engine/visual.ts` (near the new `Fill` DP)
- Test: `src/visual-engine/tests/visual-shape-paint.test.ts` (create)

**Interfaces:**
- Produces: `Visual.StrokeKey: PropertyKey<Pen | undefined>`, `get/set Stroke(): Pen | undefined`.

- [ ] **Step 1: Write the failing test**

```ts
// src/visual-engine/tests/visual-shape-paint.test.ts
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Visual, Size, Rect, Color } from '../../runtime/index.js';
import { Pen, SolidColorBrush } from '../index.js';

describe('Visual.Stroke', () => {
    test('Stroke DP round-trips', () => {
        const v = new (class extends Visual {})();
        const pen = new Pen(new SolidColorBrush(Color.FromHex('#f0f')), 2);
        v.Stroke = pen;
        assert.equal(v.Stroke, pen);
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:file "src/visual-engine/tests/visual-shape-paint.test.ts"`
Expected: FAIL (`Stroke` not a property / undefined).

- [ ] **Step 3: Add the DP**

```ts
public static readonly StrokeKey = Model.RegisterProperty<Pen | undefined>(
    Visual, 'Stroke', undefined, MetaData.Render);
public get Stroke(): Pen | undefined { return this.get_property_value(Visual.StrokeKey); }
public set Stroke(value: Pen | undefined) { this.set_property_value(Visual.StrokeKey, value); }
```
Import `Pen` if not already imported in `visual.ts`.

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:file "src/visual-engine/tests/visual-shape-paint.test.ts"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(visual): add Stroke pen DP

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 1.2: Base `RenderOverride` paints the shape geometry

**Files:**
- Modify: `src/visual-engine/visual.ts` (`RenderOverride`, and a private inset helper)
- Test: `src/visual-engine/tests/visual-shape-paint.test.ts` (extend)

**Interfaces:**
- Consumes: `buildClipGeometry(size): Geometry` (base returns bounds rect — already exists), `Fill`, `Stroke`.
- Produces: `Visual.RenderOverride(dc)` draws `Fill`+`Stroke` over `buildClipGeometry(renderSize)` inset by `Stroke.Thickness/2`; no-op when both brushes undefined. Subclasses override and call `super.RenderOverride(dc)` first.

- [ ] **Step 1: Write the failing test**

```ts
function drawn(v: { Render: (dc: never) => void }): Array<{ brush: unknown; pen: unknown; geom: unknown }> {
    const calls: Array<{ brush: unknown; pen: unknown; geom: unknown }> = [];
    v.Render({
        DrawGeometry: (brush: unknown, pen: unknown, geom: unknown) => calls.push({ brush, pen, geom }),
        DrawRectangle: () => {}, DrawText: () => {}, PushTransform: () => {}, PushClip: () => {}, Pop: () => {},
    } as never);
    return calls;
}

test('a Visual with Fill paints its clip geometry once', () => {
    const v = new (class extends Visual {})();
    const fill = new SolidColorBrush(Color.FromHex('#0f0'));
    v.Fill = fill;
    v.Measure(new Size(100, 60)); v.Arrange(new Rect(0, 0, 100, 60));
    const calls = drawn(v);
    assert.equal(calls.length, 1, 'one DrawGeometry for the shape');
    assert.equal(calls[0].brush, fill);
});

test('a Visual with neither Fill nor Stroke paints nothing', () => {
    const v = new (class extends Visual {})();
    v.Measure(new Size(100, 60)); v.Arrange(new Rect(0, 0, 100, 60));
    assert.equal(drawn(v).length, 0);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:file "src/visual-engine/tests/visual-shape-paint.test.ts"`
Expected: FAIL (0 draws — base `RenderOverride` is empty today).

- [ ] **Step 3: Implement base paint**

```ts
protected override RenderOverride(dc: DrawingContext): void
{
    const fill = this.Fill, stroke = this.Stroke;
    if (fill === undefined && stroke === undefined) return;
    const size = this.RenderSize;
    if (size.Width <= 0 || size.Height <= 0) return;
    const half = (stroke?.Thickness ?? 0) / 2;
    const geo = this.buildClipGeometry(insetSize(size, half)); // paint inset by t/2
    // NOTE: buildClipGeometry builds at a size; translate/inset via the
    // helper so the stroke's outer edge lands on the outline.
    dc.DrawGeometry(fill, stroke, geo);
}
```
Add a small helper that produces the inset geometry. Base `buildClipGeometry` is a rect, so the simplest correct base is: build the rect at full size, then inset the rect by `half` on each edge. Implement `buildClipGeometry` to accept the already-inset rect by having `RenderOverride` construct `new Rect(half, half, W-2*half, H-2*half)` and pass through a new protected `paintGeometry(size, inset)` OR keep `buildClipGeometry(size)` returning the outline and inset in `RenderOverride`. Choose the latter: base builds `RectangleGeometry(new Rect(half, half, W - 2*half, H - 2*half))`.

Concretely, replace the body with an inline inset rect for the base and let subclasses override the outline hook:

```ts
protected override RenderOverride(dc: DrawingContext): void
{
    const fill = this.Fill, stroke = this.Stroke;
    if (fill === undefined && stroke === undefined) return;
    const s = this.RenderSize;
    if (s.Width <= 0 || s.Height <= 0) return;
    const half = (stroke?.Thickness ?? 0) / 2;
    const geo = this.buildPaintGeometry(s, half);
    dc.DrawGeometry(fill, stroke, geo);
}

// The shape to PAINT: the outline (buildClipGeometry) inset by `inset` px so a
// centred stroke stays inside. Base insets its rect; shape subclasses inset their
// silhouette. Kept separate from buildClipGeometry (the outline) so clip/hit use
// the un-inset outline.
protected buildPaintGeometry(size: Size, inset: number): Geometry
{
    return new RectangleGeometry(new Rect(inset, inset, size.Width - 2 * inset, size.Height - 2 * inset));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:file "src/visual-engine/tests/visual-shape-paint.test.ts"`
Expected: PASS.

- [ ] **Step 5: Run the full suite (catch subclasses that must call super)**

Run: `npm test`
Expected: PASS. Any subclass whose `RenderOverride` now needs the base paint is handled in Task 1.3; a red here that is *only* about missing base paint is expected and addressed next — note which suites fail.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(visual): paint Fill+Stroke over the shape geometry in RenderOverride

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 1.3: Audit `RenderOverride` overrides for `super`

**Files:**
- Modify: each `RenderOverride` override that should keep painting the base shape (enumerate in Step 1)
- Test: existing suites are the check

- [ ] **Step 1: Enumerate every override**

```bash
grep -rn "RenderOverride" src/ | grep -v "tests/" | grep "override"
```
For each, decide: does this visual want the base `Fill`/`Stroke` paint? Panels/TextBlock that never set `Fill`/`Stroke` are unaffected (base no-ops), so they need no `super` — but adding a harmless `super.RenderOverride(dc)` at the top is safe and future-proof. `Shape`/`Border`/`HeartPresenter` are handled in their own phases.

- [ ] **Step 2: Add `super.RenderOverride(dc)` where the base paint is wanted**

For each identified override, insert `super.RenderOverride(dc);` as the first line so base fill/stroke paints under the subclass content.

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "refactor(visual): call super.RenderOverride so base shape paint composes

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase 2 — `Shape` consolidation

### Task 2.1: `Shape` inherits `Fill`/`Stroke`; geometry feeds `buildClipGeometry`

**Files:**
- Modify: `src/basic/shapes/shape.ts` (remove `FillKey`/`StrokeKey`; add `buildClipGeometry`/`buildPaintGeometry` overrides; slim `RenderOverride`)
- Test: `src/basic/tests/shape-hit-geometry-catalog.test.ts` and `shape-hit-geometry-transformed.test.ts` (the canaries — must stay green)

**Interfaces:**
- Consumes: `Visual.Fill`/`Visual.Stroke`, `Visual.buildPaintGeometry`.
- Produces: `Shape.buildClipGeometry(size)` returns the fitted silhouette; `Shape.Fill`/`Shape.Stroke` resolve to the inherited DPs.

- [ ] **Step 1: Run the shape canaries green (baseline)**

Run: `npm run test:file "src/basic/tests/shape-hit-geometry-catalog.test.ts"`
Expected: PASS.

- [ ] **Step 2: Write a failing test for the inherited Fill**

```ts
// add to src/basic/tests/shape-hit-geometry-catalog.test.ts (or a new shape-paint test)
test('Shape uses the inherited Visual.Fill', () => {
    const e = new Ellipse();
    const fill = new SolidColorBrush(Color.Black);
    e.Fill = fill;
    assert.equal(e.Fill, fill);                 // same DP as Visual.Fill
    assert.equal((Ellipse as unknown as { FillKey?: unknown }).FillKey, undefined,
        'Shape no longer declares its own FillKey');
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm run test:file "src/basic/tests/shape-hit-geometry-catalog.test.ts"`
Expected: FAIL (`Shape.FillKey` still defined).

- [ ] **Step 4: Remove Shape's `FillKey`/`StrokeKey`; add geometry hooks**

In `shape.ts`: delete `FillKey`/`StrokeKey` and their getters (keep `Fill`/`Stroke` names via the inherited DPs — the getters/setters can be removed entirely so the inherited ones apply). Add:

```ts
protected override buildClipGeometry(size: Size): Geometry {
    return this.buildGeometry(size) ?? new RectangleGeometry(new Rect(0, 0, size.Width, size.Height));
}
// Shapes draw their exact outline, so paint = the silhouette itself (fit baked in);
// no extra half-pen inset beyond what buildGeometry already yields post-migration.
protected override buildPaintGeometry(size: Size, _inset: number): Geometry {
    return this.buildClipGeometry(size);
}
```
Slim `RenderOverride` to `super.RenderOverride(dc)` plus the `HitTestStrokeWidth` band (keep the band logic; drop the main `DrawGeometry`).

- [ ] **Step 5: Run the shape canaries**

Run: `npm run test:file "src/basic/tests/shape-hit-geometry-catalog.test.ts"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "refactor(shape): consolidate Fill/Stroke onto Visual, feed geometry hook

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 2.2: Catalog-shape inset migration (drop self-inset by `t/2`)

**Files:**
- Modify: each `src/basic/shapes/*.ts` whose `buildGeometry` insets by `t/2` (heart, clover, puffy, …)
- Test: `src/basic/tests/shape-hit-geometry-catalog.test.ts` (parity)

- [ ] **Step 1: Enumerate self-insetting shapes**

```bash
grep -rln "Stroke?.Thickness\|/ 2\|half" src/basic/shapes/
```
Confirm which `buildGeometry` methods subtract the stroke; these return the centreline today and must return the outer outline (inset 0).

- [ ] **Step 2: For each shape, add a parity render test, verify it fails after the change, then adjust**

For a representative shape (Heart), assert the drawn geometry with a stroke matches the outer outline inset by `t/2` (i.e. render is unchanged vs. baseline). Capture baseline `DrawGeometry` bounds pre-change, then after removing the self-inset confirm the base paint reproduces them.

- [ ] **Step 3: Remove the `t/2` self-inset from each `buildGeometry`**

Replace `half = t/2; w = size - t; point = half + …` with `inset 0` (the un-inset outline). The base paint's `buildPaintGeometry`/half-pen handling now supplies the inset. (Note: because Task 2.1 set `buildPaintGeometry = buildClipGeometry`, add the `t/2` inset back into `Shape.buildPaintGeometry` here instead — inset the silhouette by `inset`.)

- [ ] **Step 4: Run the shape suites**

Run: `npm run test:file "src/basic/tests/shape-hit-geometry-catalog.test.ts"` and `shape-hit-geometry-transformed.test.ts`
Expected: PASS (parity).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "refactor(shapes): return outer outline; base paint owns the stroke inset

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase 3 — `Border` migration

### Task 3.1: Uniform borders paint through base `Stroke`

**Files:**
- Modify: `src/basic/border.ts` (`RenderOverride` → `super` for uniform; keep four-rect for non-uniform)
- Test: `src/basic/tests/` border render tests + a new pixel-parity test

**Interfaces:**
- Consumes: `Visual.Fill`/`Visual.Stroke`, `Border.buildClipGeometry` (rounded rect — exists).

- [ ] **Step 1: Baseline border render tests green**

Run: `npm run test:file "src/basic/tests/border-*.test.ts"` (adjust glob to actual names)
Expected: PASS.

- [ ] **Step 2: Write a failing parity test**

Assert that a uniform `Border` (BorderBrush + uniform BorderThickness) emits one stroked rounded-rect `DrawGeometry` with the base `Stroke`, matching the old four-rect visual result's outline. (Compare emitted geometry/pen.)

- [ ] **Step 3: Migrate `Border.RenderOverride`**

For uniform `BorderThickness`: set nothing special — let `super.RenderOverride(dc)` paint `Fill` + `Stroke = Pen(BorderBrush, thickness)` over the rounded-rect `buildClipGeometry`. Compute/assign the `Stroke` from `BorderBrush`+`BorderThickness` (in `OnPropertyChanged`/arrange, or lazily in `RenderOverride` before `super`). For non-uniform: after `super` (which paints fill; suppress base stroke by leaving `Stroke` undefined in this case), draw the existing four rects.

- [ ] **Step 4: Run border tests + full suite**

Run: `npm run test:file "src/basic/tests/border-*.test.ts"` then `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "refactor(border): paint uniform border via base Fill/Stroke

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase 4 — ClipChildren

### Task 4.1: `Visual.ClipChildren` + `ChildClip` + `syncChildClip`

**Files:**
- Modify: `src/visual-engine/visual.ts`
- Test: `src/visual-engine/tests/visual-child-clip.test.ts` (create)

**Interfaces:**
- Produces: `Visual.ClipChildren: boolean`, `Visual.ChildClip: Geometry | undefined` (internal-set), `protected buildChildClipGeometry(size): Geometry | undefined` (default: `buildClipGeometry` inset by full `Stroke.Thickness`).

- [ ] **Step 1: Write the failing test**

```ts
import { Visual, Size, Rect } from '../../runtime/index.js';
import { Pen, SolidColorBrush, PathGeometry } from '../index.js';

test('ClipChildren on ⇒ ChildClip built; off ⇒ undefined', () => {
    const v = new (class extends Visual {})();
    v.Stroke = new Pen(new SolidColorBrush({} as never), 10);
    v.Measure(new Size(100, 100)); v.Arrange(new Rect(0, 0, 100, 100));
    assert.equal(v.ChildClip, undefined);
    v.ClipChildren = true;
    v.Measure(new Size(100, 100)); v.Arrange(new Rect(0, 0, 100, 100));
    assert.ok(v.ChildClip, 'ChildClip present when on');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:file "src/visual-engine/tests/visual-child-clip.test.ts"`
Expected: FAIL (`ClipChildren`/`ChildClip` undefined).

- [ ] **Step 3: Implement the DPs, hook, and sync**

```ts
public static readonly ClipChildrenKey = Model.RegisterProperty<boolean>(
    Visual, 'ClipChildren', false, MetaData.Arrange);
public get ClipChildren(): boolean { return this.get_property_value(Visual.ClipChildrenKey); }
public set ClipChildren(v: boolean) { this.set_property_value(Visual.ClipChildrenKey, v); }

public static readonly ChildClipKey = Model.RegisterProperty<Geometry | undefined>(
    Visual, 'ChildClip', undefined, MetaData.None);
public get ChildClip(): Geometry | undefined { return this.get_property_value(Visual.ChildClipKey); }
protected set ChildClip(v: Geometry | undefined) { this.set_property_value(Visual.ChildClipKey, v); }

protected buildChildClipGeometry(size: Size): Geometry | undefined {
    const t = this.Stroke?.Thickness ?? 0;
    return this.buildClipGeometry(insetBy(size, t)); // full-pen inset
}

private _childClipApplied = false;
private syncChildClip(size: Size): void {
    if (this.ClipChildren) {
        if (size.Width <= 0 || size.Height <= 0) return;
        this.ChildClip = this.buildChildClipGeometry(size);
        this._childClipApplied = true;
    } else if (this._childClipApplied) {
        this.ChildClip = undefined;
        this._childClipApplied = false;
    }
}
```
Call `this.syncChildClip(this._renderSize)` in `Arrange`, right after `syncClipToBounds`.

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:file "src/visual-engine/tests/visual-child-clip.test.ts"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(visual): ClipChildren + ChildClip + buildChildClipGeometry

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 4.2: `SvgRenderer` children-group clip

**Files:**
- Modify: `src/visual-engine/drawing/svg-renderer.ts` (`RenderableVisual` interface; the walk at ~line 486; a `mural-children` group; generalize the clipPath builder)
- Test: `src/visual-engine/tests/svg-renderer.test.ts` (extend)

**Interfaces:**
- Consumes: `RenderableVisual.ChildClip`.

- [ ] **Step 1: Write the failing test**

```ts
test('ChildClip wraps children in a clipped mural-children group', () => {
    const { document, surface } = makeDom();
    const renderer = new SvgRenderer(surface, { document });
    const border = new Border();
    const child = new Border(); child.Background = new SolidColorBrush(Color.FromHex('#4caf50'));
    border.SetChild(child);
    border.ClipChildren = true;
    border.Stroke = new Pen(new SolidColorBrush(Color.FromHex('#000')), 8);
    border.Measure(new Size(100, 100)); border.Arrange(new Rect(0, 0, 100, 100));
    renderer.Render(border, undefined, null, null);
    const group = surface.querySelector('g.mural-children');
    assert.ok(group, 'children group exists');
    assert.ok(group!.getAttribute('clip-path'), 'group is clipped');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:file "src/visual-engine/tests/svg-renderer.test.ts"`
Expected: FAIL (no `mural-children`).

- [ ] **Step 3: Add `ChildClip` to `RenderableVisual` and the group logic**

Add `readonly ChildClip: unknown;` to the interface. In the walk, when `visual.ChildClip` is set, ensure a `<g class="mural-children">` exists in the `info` record (after `mural-own`), apply the clip-path to it via the generalized clip builder (extract from `applyClip`), and pass the group as the parent for child `walk` calls; else pass `info.outer` as today. Remove/re-parent the group when `ChildClip` clears. Exclude the group from the orphan sweep.

- [ ] **Step 4: Run renderer tests**

Run: `npm run test:file "src/visual-engine/tests/svg-renderer.test.ts"`
Expected: PASS (new + existing).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(svg-renderer): clip children under a mural-children group

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 4.3: `headless-target` push/pop `ChildClip`

**Files:**
- Modify: `src/visual-engine/targets/headless-target.ts` (~line 98-109)
- Test: `src/visual-engine/tests/` headless coverage (extend or add)

- [ ] **Step 1: Write the failing test**

Assert that, walking a `ClipChildren` visual, `ChildClip` is pushed after own paint and popped after children (mirror the existing `Clip` push/pop test).

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:file "<headless test path>"`
Expected: FAIL.

- [ ] **Step 3: Implement push/pop**

After own paint, before the child loop, if `visual.ChildClip` push it; pop after the loop.

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:file "<headless test path>"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(headless): push ChildClip around children

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 4.4: `Border` + `HeartPresenter` child-clip hooks; collapse `HeartPresenter`

**Files:**
- Modify: `src/basic/border.ts` (`buildChildClipGeometry` = inner rounded rect)
- Modify: `src/basic/heart-presenter.ts` (drop local DPs/`clipContent`; override `buildClipGeometry`/`buildChildClipGeometry`; `OnPropertyChanged` → `InvalidateArrange` on `Stroke`)
- Test: `src/basic/tests/heart-presenter.test.ts` (retarget existing tests at the hooks)

- [ ] **Step 1: Update HeartPresenter tests to the new shape**

Retarget the existing offset/clip tests: `buildClipGeometry` = outer heart, base paint = inset `t/2`, `ChildClip` = heart inset by full pen (assert via `ChildClip` bounds strictly inside the painted heart). Keep the "default off ⇒ no `ChildClip`" test.

- [ ] **Step 2: Run to verify they fail**

Run: `npm run test:file "src/basic/tests/heart-presenter.test.ts"`
Expected: FAIL (old local `ClipChildren`/`clipContent` gone).

- [ ] **Step 3: Collapse HeartPresenter onto the base hooks**

Remove local `Fill`/`Stroke`/`ClipChildren` DPs and `clipContent`. Add:
```ts
protected override buildClipGeometry(size: Size): Geometry { return this.buildHeart(size, 0)!; }         // outer
protected override buildChildClipGeometry(size: Size): Geometry | undefined {
    return this.buildHeart(size, this.Stroke?.Thickness ?? 0);                                            // full pen
}
protected override buildPaintGeometry(size: Size, inset: number): Geometry { return this.buildHeart(size, inset)!; }
protected override OnPropertyChanged(d, o, n) {
    super.OnPropertyChanged(d, o, n);
    if (d.Owner === Visual && d.Name === 'Stroke') this.InvalidateArrange();
}
```
`buildHeart(size, inset)` keeps the `P(fx,fy)` helper (drop the `dx,dy` params — group clip is in visual space).

- [ ] **Step 4: Add Border's inner-rounded-rect hook**

```ts
protected override buildChildClipGeometry(size: Size): Geometry | undefined {
    const bt = this.BorderThickness;
    const { tl } = this.resolveCorners(size);
    const rect = new Rect(bt.Left, bt.Top, Math.max(0, size.Width - bt.Horizontal), Math.max(0, size.Height - bt.Vertical));
    return new RectangleGeometry(rect, Math.max(0, tl - bt.Left), Math.max(0, tl - bt.Top));
}
```

- [ ] **Step 5: Update the demo**

`demo/demos/hit-test/hit-test.mu` already sets `ClipChildren = true`; rebuild demos. Confirm no local-DP references remain.

- [ ] **Step 6: Run heart + border + full suite**

Run: `npm run test:file "src/basic/tests/heart-presenter.test.ts"` then `npm test` then `npm run build`
Expected: PASS / no errors.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "refactor(clip-children): move onto Visual; collapse HeartPresenter; Border inner clip

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification

- [ ] `npm test` fully green.
- [ ] `npm run build` clean.
- [ ] Manually re-check the hit-test demo (heart paints, border fully visible, long label clipped inside the border) and a thick rounded `Border` with `ClipChildren=true`.
