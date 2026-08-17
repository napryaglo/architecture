# Visual ClipToBounds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hoist clip-to-bounds from `Border` onto `Visual` behind a virtual `buildClipGeometry` hook, retype `Clip` to `Geometry | undefined`, and collapse `Border` to a single geometry-authoring override.

**Architecture:** `Visual` gains a `ClipToBounds` DP (Arrange-metadata), an ownership latch, an arrange-tail `syncClipToBounds` that centralizes the degenerate-size guard, and a protected virtual `buildClipGeometry(size)` (base: a bounds rectangle). `Border` overrides only the hook (its rounded/asymmetric rect) and promotes `CornerRadius` to Arrange-metadata so the clip refreshes on re-arrange. `ScrollViewer`/`ScrollContentPresenter` set `Clip` directly with the flag off and are untouched — the latch protects them.

**Tech Stack:** TypeScript (ESM, strict), `@pragmatic-lab/mural`. Tests: `node:test` + `node:assert/strict`, run via `tsx --conditions=development --test`.

## Global Constraints

- The DP move is **atomic**: wiring `syncClipToBounds` into `Visual.Arrange` overwrites Border's rounded clip with the base rect unless Border simultaneously overrides `buildClipGeometry` and drops its own `applyClipToBounds`. Implement both files before running the Border suite; commit together.
- Additive on `Visual`; `Border` loses only members now inherited or unnecessary. `Border.ClipToBounds` keeps the same DP name (now inherited) — no consumer breaks.
- `Clip` retyped `unknown` → `Geometry | undefined`; the two render consumers (`svg-renderer.applyClip` duck-typing, DrawingContext `PushClip` `instanceof`) keep working unchanged.
- Every test file lives in a `tests/` subfolder next to its source.
- Enums over string-literal unions (none introduced here).
- Run the full suite with `npm test` (`tsx --conditions=development --test --test-force-exit "src/**/*.test.ts"`). Single-file runs: `npx tsx --conditions=development --test <path>`.
- Commit messages end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## Task 1: Hoist ClipToBounds to Visual and collapse Border

**Files:**
- Modify: `src/visual-engine/visual.ts` (import at :20, `Clip` DP at :318, `Clip` accessor at :1128-1129, new members, `Arrange` tail at :1350)
- Modify: `src/basic/border.ts` (imports at :11 and :21-23, `CornerRadius` metadata at :98, `ArrangeOverride` at :209, delete `ClipToBounds` DP :128-140 + accessors :163-164, delete `OnPropertyChanged` :213-223, delete `applyClipToBounds` + latch :225-248, add `buildClipGeometry` override)
- Create: `src/visual-engine/tests/visual-clip.test.ts`
- Modify: `src/basic/tests/border.test.ts:163-170` (retarget the CornerRadius-refresh test)

**Interfaces:**
- Produces on `Visual`:
  - `ClipToBounds: boolean` DP (default `false`, `MetaData.Arrange`)
  - `Clip: Geometry | undefined` (retyped from `unknown`)
  - `protected buildClipGeometry(size: Size): Geometry` — base returns a bounds `RectangleGeometry`; override to shape the clip. Called only with a positive size.
- Consumes: `RectangleGeometry(rect?, radiusX?, radiusY?)`, `Rect`, `Size`, `Geometry` (all importable in `visual.ts` without a cycle — `geometry.ts` imports nothing from `visual.ts`).

- [ ] **Step 1: Write the failing Visual-level tests**

Create `src/visual-engine/tests/visual-clip.test.ts`:

```ts
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Element, Rect, Size } from '../../runtime/index.js';
import { RectangleGeometry } from '../index.js';

// Minimal Visual leaf: reports a fixed DesiredSize so arrange produces a
// known RenderSize. ClipToBounds lives on Visual, so a plain Element exercises it.
class Leaf extends Element
{
    constructor(private readonly desired: Size) { super(); }
    protected override MeasureOverride(_available: Size): Size { return this.desired; }
}

const arranged = (v: Element, w: number, h: number): void => {
    v.Measure(new Size(w, h));
    v.Arrange(new Rect(0, 0, w, h));
};

describe('Visual ClipToBounds', () => {
    test('off by default → no clip', () => {
        const v = new Leaf(new Size(40, 20));
        arranged(v, 40, 20);
        assert.equal(v.Clip, undefined);
    });

    test('on → a bounds RectangleGeometry (no radius) after arrange', () => {
        const v = new Leaf(new Size(40, 20));
        v.ClipToBounds = true;
        arranged(v, 40, 20);
        const clip = v.Clip as RectangleGeometry;
        assert.ok(clip instanceof RectangleGeometry);
        assert.equal(clip.Rect.Width, 40);
        assert.equal(clip.Rect.Height, 20);
        assert.equal(clip.RadiusX, 0);
    });

    test('toggling ClipToBounds off re-arranges and clears the clip it applied', () => {
        const v = new Leaf(new Size(40, 20));
        v.ClipToBounds = true;
        arranged(v, 40, 20);
        assert.ok(v.Clip !== undefined);
        v.ClipToBounds = false;                 // Arrange-metadata → invalidates arrange
        v.Arrange(new Rect(0, 0, 40, 20));
        assert.equal(v.Clip, undefined);
    });

    test('a hand-set Clip with ClipToBounds off survives an arrange (latch invariant)', () => {
        const v = new Leaf(new Size(40, 20));
        const hand = new RectangleGeometry(new Rect(0, 0, 5, 5));
        v.Clip = hand;
        arranged(v, 40, 20);
        assert.equal(v.Clip, hand);
    });

    test('a degenerate arranged size yields no clip', () => {
        const v = new Leaf(new Size(0, 0));
        v.ClipToBounds = true;
        v.Measure(new Size(0, 0));
        v.Arrange(new Rect(0, 0, 0, 0));
        assert.equal(v.Clip, undefined);
    });
});
```

- [ ] **Step 2: Run the Visual tests to verify they fail**

Run: `npx tsx --conditions=development --test src/visual-engine/tests/visual-clip.test.ts`
Expected: FAIL — `ClipToBounds` is not a property on `Visual` yet (setter is undefined / clip never set).

- [ ] **Step 3: Add the value import for `RectangleGeometry` in `visual.ts`**

In `src/visual-engine/visual.ts`, change the geometry import (line 20) from a type-only import to include the value:

```ts
import { RectangleGeometry, type Geometry } from './geometry/geometry.js';
```

- [ ] **Step 4: Retype the `Clip` DP and add the `ClipToBounds` DP**

In `src/visual-engine/visual.ts`, replace the `ClipKey` registration (line 318) and add `ClipToBoundsKey` right after it:

```ts
    public static readonly ClipKey = Model.RegisterProperty<Geometry | undefined>(Visual, 'Clip', undefined, MetaData.Render);

    // When true, clip this Visual and its subtree to its arranged bounds at
    // render time. Off by default (WPF parity). The clip geometry comes from
    // buildClipGeometry (base: a bounds rectangle; subclasses override to shape
    // it), applied at the tail of Arrange via syncClipToBounds — which owns the
    // Clip DP only while this flag is on, so a hand-set Clip is never clobbered.
    public static readonly ClipToBoundsKey = Model.RegisterProperty<boolean>(Visual, 'ClipToBounds', false, MetaData.Arrange);
```

- [ ] **Step 5: Retype the `Clip` accessor and add the `ClipToBounds` accessor**

In `src/visual-engine/visual.ts`, replace the `Clip` getter/setter (lines 1128-1129) with the retyped pair plus the `ClipToBounds` accessor:

```ts
    public get Clip(): Geometry | undefined { return this.get_property_value(Visual.ClipKey); }
    public set Clip(value: Geometry | undefined) { this.set_property_value(Visual.ClipKey, value); }

    public get ClipToBounds(): boolean { return this.get_property_value(Visual.ClipToBoundsKey); }
    public set ClipToBounds(value: boolean) { this.set_property_value(Visual.ClipToBoundsKey, value); }
```

- [ ] **Step 6: Add the latch, the `buildClipGeometry` hook, and `syncClipToBounds`**

In `src/visual-engine/visual.ts`, add these members to the `Visual` class (place them just below the `ClipToBounds` accessor from Step 5):

```ts
    // Owns the Clip DP only while ClipToBounds is on (see syncClipToBounds).
    private _clipToBoundsApplied = false;

    // The clip geometry for ClipToBounds, in this Visual's local space. Base
    // returns a rectangle of the arranged bounds; subclasses override to shape
    // the clip (e.g. Border's rounded rect). Called only with a positive size —
    // the degenerate guard lives in syncClipToBounds.
    protected buildClipGeometry(size: Size): Geometry
    {
        return new RectangleGeometry(new Rect(0, 0, size.Width, size.Height));
    }

    // Reconcile Clip with ClipToBounds at arrange time. When on, build + apply
    // the clip and latch ownership; when off, clear only a clip we applied. A
    // hand-set Clip (ClipToBounds off) is never touched.
    private syncClipToBounds(size: Size): void
    {
        if (this.ClipToBounds)
        {
            if (size.Width <= 0 || size.Height <= 0) return;   // wait for a real arranged size
            this.Clip = this.buildClipGeometry(size);
            this._clipToBoundsApplied = true;
        }
        else if (this._clipToBoundsApplied)
        {
            this.Clip = undefined;
            this._clipToBoundsApplied = false;
        }
    }
```

- [ ] **Step 7: Call `syncClipToBounds` at the tail of the normal `Arrange` path**

In `src/visual-engine/visual.ts`, the normal arrange path ends at `this._isArrangeValid = true;` (line 1350). Add the sync call immediately after it, so `_renderSize` is final (the `Visibility.Collapsed` early-return at line 1265-1271 deliberately skips it — a collapsed Visual isn't rendered):

```ts
        this._isArrangeValid = true;
        this.syncClipToBounds(this._renderSize);
    }
```

- [ ] **Step 8: Collapse `Border` onto the hook**

In `src/basic/border.ts`, make these edits:

1. Remove the now-unused `PropertyDescriptor` import (line 11) — it was only used by the `OnPropertyChanged` deleted below. Add `type Geometry` to the visual-engine import (lines 14-23) for the override's return type:

```ts
import {
    ArcSegment,
    Brush,
    LineSegment,
    PathFigure,
    PathGeometry,
    Pen,
    RectangleGeometry,
    SweepDirection,
    type Geometry,
} from '../visual-engine/index.js';
```

2. Promote `CornerRadius` to Arrange-metadata so a corner change re-arranges and refreshes the clip (line 98). Keep the coerce factory that follows unchanged:

```ts
    public static readonly CornerRadiusKey = Model.RegisterProperty<number | CornerRadius>(
        Border, 'CornerRadius', 0,
        MetaData.Arrange | MetaData.Render,
```

3. Delete the `ClipToBounds` DP declaration and its doc comment (lines 128-140 — the block from `// When true, clip the child` through the `ClipToBoundsKey` registration).

4. Delete the `ClipToBounds` getter/setter (lines 163-164):

```ts
    public get ClipToBounds(): boolean { return this.get_property_value(Border.ClipToBoundsKey); }
    public set ClipToBounds(value: boolean) { this.set_property_value(Border.ClipToBoundsKey, value); }
```

5. Remove the `applyClipToBounds` call from `ArrangeOverride` (line 209) — delete just that line, keep the `return finalSize;`:

```ts
            this.child.Arrange(childRect);
        }
        return finalSize;
    }
```

6. Delete the entire `OnPropertyChanged` override (lines 213-223) — its only body was the `CornerRadius` clip-refresh, now handled by re-arrange.

7. Delete the `_clipToBoundsApplied` field and the `applyClipToBounds` method (lines 225-248 — the comment block, the field, and the method).

8. Add the `buildClipGeometry` override next to `resolveCorners` (which it reuses). Place it just above `resolveCorners` (line 250):

```ts
    protected override buildClipGeometry(size: Size): Geometry
    {
        const { tl, tr, br, bl } = this.resolveCorners(size);
        const rect = new Rect(0, 0, size.Width, size.Height);
        const uniform = tl === tr && tr === br && br === bl;
        return uniform
            ? new RectangleGeometry(rect, tl, tl)   // rounded (square when tl === 0)
            : new RectangleGeometry(rect);          // asymmetric corners → rectangular clip
    }
```

- [ ] **Step 9: Retarget the Border CornerRadius-refresh test**

In `src/basic/tests/border.test.ts`, replace the test at lines 163-170 (CornerRadius refresh) — it now refreshes via re-arrange rather than synchronously, since `CornerRadius` is Arrange-metadata:

```ts
    test('a CornerRadius change refreshes the clip radius on re-arrange', () => {
        const b = new Border(new FixedSize(new Size(40, 20)));
        b.CornerRadius = 6;
        b.ClipToBounds = true;
        arranged(b, 40, 20);
        b.CornerRadius = 10;                 // Arrange-metadata → invalidates arrange
        b.Arrange(new Rect(0, 0, 40, 20));   // re-arrange refreshes the clip
        assert.equal((b.Clip as RectangleGeometry).RadiusX, 10);
    });
```

- [ ] **Step 10: Run the Visual and Border suites to verify they pass**

Run: `npx tsx --conditions=development --test src/visual-engine/tests/visual-clip.test.ts src/basic/tests/border.test.ts`
Expected: PASS — all Visual clip tests and all Border tests (including the retargeted CornerRadius-refresh and the existing `off by default` / rounded / asymmetric / toggle-off cases).

- [ ] **Step 11: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (confirms `PropertyDescriptor` was the only stale import, the `Geometry` import resolves, and every signature is consistent).

- [ ] **Step 12: Run the full mural suite**

Run: `npm test`
Expected: all green — in particular `ScrollViewer` / scroll-content-presenter tests still pass (their hand-set `Clip` is untouched by the latch).

- [ ] **Step 13: Commit**

```bash
git add src/visual-engine/visual.ts src/basic/border.ts src/visual-engine/tests/visual-clip.test.ts src/basic/tests/border.test.ts
git commit -m "$(cat <<'EOF'
feat(visual): hoist ClipToBounds to Visual behind buildClipGeometry

ClipToBounds + ownership latch + arrange-time sync move to Visual, delegating
clip geometry to a virtual buildClipGeometry (base: bounds rect). Border
collapses to the rounded-rect override with CornerRadius promoted to
Arrange-metadata. Clip DP retyped unknown -> Geometry | undefined. ScrollViewer
untouched (hand-set Clip protected by the latch).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage:**
- `Visual.ClipToBounds` DP (Arrange-metadata) → Step 4.
- `buildClipGeometry` hook, base bounds rect → Step 6.
- Latch + `syncClipToBounds` with centralized degenerate guard → Step 6.
- `Arrange`-tail sync → Step 7.
- `Clip` retyped to `Geometry | undefined` → Steps 3-5.
- Border collapses to the override; `CornerRadius` → Arrange-metadata; deletions → Step 8.
- ScrollViewer unchanged; latch invariant → Step 8 (no edit) + Step 10/12 (verify) + Visual latch test Step 1.
- Testing (retargeted Border tests + new Visual tests + Border reactivity) → Steps 1, 9, 10.

**Placeholder scan:** none — every code step carries the actual code; deletions name exact line ranges and the surrounding kept lines.

**Type consistency:** `buildClipGeometry(size: Size): Geometry` is declared identically on `Visual` (Step 6) and overridden on `Border` (Step 8). `Clip: Geometry | undefined` and `ClipToBounds: boolean` accessor/DP names match across Visual definition and Border/test use. `RectangleGeometry(rect, radiusX, radiusY)` usage matches its ctor. The new Visual test's `Leaf extends Element` mirrors the existing `FixedSize extends Element` pattern in `border.test.ts`.
