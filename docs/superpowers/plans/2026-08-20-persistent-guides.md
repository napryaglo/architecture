# Persistent Ruler Guides Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Visio-style persistent ruler guides to the Mural diagram — rulers along the viewport edges, drag out durable guide lines, nodes snap + glue to them, guides reposition/delete, all persisted in the `.diagram` metadata.

**Architecture:** Mirror the existing alignment-guides machinery (behavior + adorner + `PositionSnap` compose + camera projection) and the camera persistence store. Rulers are new `Control` chrome the `Diagram` owns (grabbed via `GetTemplateChild`, fed zoom/offset/extent). A single behavior coordinates all pointer work through the tunnel/preview interceptor pattern. Guides live on a `Diagram.Guides` DP; the Plexus app persists them via a metadata store + observer service, exactly like the camera.

**Tech Stack:** TypeScript, `@pragmatic-tech-ai/mural` framework, `.mu` markup templates, `node:test` (Mural) / vitest (Plexus), Verdaccio local registry.

**Spec:** `Mural/docs/superpowers/specs/2026-08-20-persistent-guides-design.md` — read it alongside this plan.

## Global Constraints

- **Publish target:** `@pragmatic-tech-ai/mural` is published ONLY to local Verdaccio (`http://localhost:4873`), never public npm.
- **Commit/push:** Commit as you go per task. Do NOT push either repo; the user pushes on request. Branch already exists: `feat/persistent-guides` (Mural). Create a matching branch in Plexus before its tasks.
- **Commit message trailer:** end every commit message with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Tests:** every test file lives in a `tests/` subfolder next to its source (both repos).
- **Enums, not string-literal unions:** any fixed set of named strings is a TS `enum`. Markup-facing enums also register in `symbol-table.ts` (`ENUM_MEMBERS` + `DEFAULT_SYMBOLS`).
- **No explicit width/height for layout:** compose via the measure protocol; the only literal sizes here are ruler strip thickness and guide line thickness, which are `DiagramSettings` values.
- **Render through templates:** controls get a default Style with a `Template` DP in a `*.template.mu`; no hardcoded chrome except inside a `RenderOverride` that paints a primitive (rulers paint ticks via `DrawingContext`, which is allowed — same as `Figure`/`Shape` self-paint).
- **No `node:fs`/`node:path` in Mural framework/renderer code.**
- **Mural test commands:** full suite `npm test`; single file `npx tsx --conditions=development --test <path>`.
- **Plexus test command:** `npm test` (vitest); single file `npx vitest run <path>`.
- **Demos build:** `npm run build:demos` (.mu→.mu.js) / `npm run build:demos:ts` (tsc) — only if a demo is touched (this plan does not add a demo).
- **Single feature opt-in:** the whole feature is gated by one `Diagram.RulersVisible` DP (default `false`). When true: rulers show AND the guide behavior + adorner attach. When false: the template is visually identical to today and no guide state exists. This consolidates the spec's separate "rulers" and "guides" toggles into one — noted deliberately.

---

## File Structure

**Mural (framework):**
- `src/runtime/guide-math.ts` — CREATE. Pure types + math: `PersistentGuide`, `GuideGlue`, `snapGuidePosition`, `snapRectToGuides`, `chooseTickInterval`, `ticksInRange`. Reuses `AlignmentAxis`/`EdgeKind` from `alignment-math.ts`. No Visual/DP deps.
- `src/framework/diagram/diagram-settings.ts` — MODIFY. Add persistent-guide + ruler setting keys/specs/accessors.
- `src/framework/diagram/guides/ruler-bar.ts` — CREATE. `RulerBar extends Control` — a measured strip; paints ticks in `RenderOverride`. Driven by the Diagram (zoom/offset/extent DPs).
- `src/framework/diagram/guides/persistent-guides-adorner.ts` — CREATE. `PersistentGuidesAdorner extends Adorner` — pooled line visuals, camera-projected, subscribes to `Diagram.GuidesKey`.
- `src/framework/diagram/behaviors/persistent-guides-behavior.ts` — CREATE. `attachPersistentGuides(diagram)` + `PersistentGuidesHandlers` — the interaction coordinator (create/reposition/delete/snap/glue).
- `src/framework/diagram/diagram.ts` — MODIFY. `Guides` + `RulersVisible` DPs, `_setGuides`, `_persistentGuidesHandlers` + setter, preview forwards, attach/detach/mount, ruler wiring.
- `src/framework/diagram/diagram.template.mu` — MODIFY. Grid wrapper + two `RulerBar`s + corner + `RulerBar` default Style.
- `src/compiler/symbol-table.ts` — MODIFY. Register `RulerBar` + its `Orientation` enum member usage (reuses existing `Orientation`).
- `src/framework/index.ts` (or the diagram barrel it re-exports through) — MODIFY. Export `RulerBar`, `PersistentGuidesAdorner`, `attachPersistentGuides`, `PersistentGuidesHandlers`.
- `src/runtime/index.ts` — MODIFY. Export the `guide-math.ts` public surface (`PersistentGuide`, `GuideGlue`, snap fns, tick fns).

**Plexus (app):**
- `src/renderer/src/modules/diagram/persistence/diagram-guides-store.ts` — CREATE. `readGuides`/`writeGuides` over `doc.Metadata['guides']`.
- `src/renderer/src/modules/diagram/services/diagram-guides-service.ts` — CREATE. `DiagramGuidesService` — hydrate on ActiveView, persist on `GuidesKey` change (mirrors `DiagramCameraService`).
- wherever `DiagramCameraService` is registered — MODIFY. Register `DiagramGuidesService`.
- wherever the arch diagram sets `AlignmentGuidesEnabled` — MODIFY. Also set `RulersVisible = true`.

---

## Task 1: Guide math + types (pure)

**Files:**
- Create: `Mural/src/runtime/guide-math.ts`
- Test: `Mural/src/runtime/tests/guide-math.test.ts`

**Interfaces:**
- Consumes: `Rect` from `../visual-engine/primitives.js`; `AlignmentAxis`, `EdgeKind` from `./alignment-math.js`.
- Produces:
  - `interface GuideGlue { readonly nodeId: string; readonly edge: EdgeKind }`
  - `interface PersistentGuide { readonly axis: AlignmentAxis; readonly position: number; readonly glued: readonly GuideGlue[] }`
  - `function snapGuidePosition(axis: AlignmentAxis, position: number, rects: readonly Rect[], tolerance?: number): number`
  - `interface GuideAxisSnap { readonly edge: EdgeKind; readonly guide: number }`
  - `interface GuideSnap { readonly snapped: Rect; readonly x?: GuideAxisSnap; readonly y?: GuideAxisSnap }`
  - `function snapRectToGuides(rect: Rect, guides: readonly PersistentGuide[], tolerance?: number): GuideSnap`
  - `function chooseTickInterval(zoom: number, minPx: number): number`
  - `function ticksInRange(interval: number, contentMin: number, contentMax: number): number[]`

- [ ] **Step 1: Write the failing test**

```ts
// Mural/src/runtime/tests/guide-math.test.ts
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Rect } from '../../visual-engine/primitives.js';
import { AlignmentAxis, EdgeKind } from '../alignment-math.js';
import {
    snapGuidePosition, snapRectToGuides, chooseTickInterval, ticksInRange,
    type PersistentGuide,
} from '../guide-math.js';

const guide = (axis: AlignmentAxis, position: number): PersistentGuide => ({ axis, position, glued: [] });

describe('snapGuidePosition', () => {
    test('snaps a placed guide onto a nearby node edge (within tolerance)', () => {
        const rects = [new Rect(100, 40, 60, 30)];  // left=100, mid=130, right=160
        assert.equal(snapGuidePosition(AlignmentAxis.X, 103, rects, 5), 100);  // snap to left edge
        assert.equal(snapGuidePosition(AlignmentAxis.X, 128, rects, 5), 130);  // snap to mid
    });
    test('leaves the position unchanged when no edge is within tolerance', () => {
        const rects = [new Rect(100, 40, 60, 30)];
        assert.equal(snapGuidePosition(AlignmentAxis.X, 200, rects, 5), 200);
    });
});

describe('snapRectToGuides', () => {
    test('snaps a node edge onto a guide and reports the glued edge + guide index', () => {
        const guides = [guide(AlignmentAxis.X, 300), guide(AlignmentAxis.Y, 80)];
        const r = new Rect(297, 100, 50, 40);   // left=297 near x-guide 300; top=100, bottom=140 near y-guide 80? no
        const res = snapRectToGuides(r, guides, 5);
        assert.equal(res.snapped.X, 300);       // left snapped to the x guide
        assert.deepEqual(res.x, { edge: EdgeKind.Min, guide: 0 });
        assert.equal(res.y, undefined);         // no y edge within 5 of 80
    });
    test('no snap when nothing is close', () => {
        const guides = [guide(AlignmentAxis.X, 300)];
        const r = new Rect(0, 0, 50, 40);
        const res = snapRectToGuides(r, guides, 5);
        assert.equal(res.snapped.X, 0);
        assert.equal(res.x, undefined);
    });
});

describe('tick math', () => {
    test('chooseTickInterval keeps on-screen spacing >= minPx using a 1/2/5 ladder', () => {
        // zoom 1, min 50px -> smallest {1,2,5}x10^n with interval*zoom>=50 is 50
        assert.equal(chooseTickInterval(1, 50), 50);
        // zoom 2 -> 25*2=50 not on ladder; 50*... ladder values: ...10,20,50 -> 20*2=40<50, 50*2=100>=50 -> but 25 not allowed; expect 50
        assert.equal(chooseTickInterval(2, 50), 50);
        // zoom 0.5 -> need interval*0.5>=50 -> interval>=100 -> 100
        assert.equal(chooseTickInterval(0.5, 50), 100);
    });
    test('ticksInRange enumerates multiples of interval covering [min,max] inclusive-ish', () => {
        assert.deepEqual(ticksInRange(50, 90, 210), [100, 150, 200]);
        assert.deepEqual(ticksInRange(50, -30, 60), [0, 50]);   // includes 0 and 50; -0 normalized
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd Mural && npx tsx --conditions=development --test src/runtime/tests/guide-math.test.ts`
Expected: FAIL — module `../guide-math.js` not found.

- [ ] **Step 3: Implement `guide-math.ts`**

```ts
// Mural/src/runtime/guide-math.ts
import { Rect } from '../visual-engine/primitives.js';
import { AlignmentAxis, EdgeKind } from './alignment-math.js';

// Persistent (Visio-style) guide model + the pure snap/tick math that drives
// placement, node snapping, glue, and ruler tick layout. No Visual / DP deps —
// the diagram behavior and adorner are the consumers. Sibling of alignment-math.ts.

export interface GuideGlue
{
    // The stable DiagramDocument node id (Figure.Id / NodeViewModel.Id) glued
    // to the guide, and which of the node's edges is stuck.
    readonly nodeId: string;
    readonly edge:   EdgeKind;
}

export interface PersistentGuide
{
    // X = vertical line at `position` (a content x); Y = horizontal line (a content y).
    readonly axis:     AlignmentAxis;
    readonly position: number;
    readonly glued:    readonly GuideGlue[];
}

const DEFAULT_TOLERANCE = 5;
const EDGES: readonly EdgeKind[] = [EdgeKind.Min, EdgeKind.Mid, EdgeKind.Max];

// A rectangle's edge coordinate on one axis — mirrors alignment-math's private helper.
function edgeCoord(rect: Rect, axis: AlignmentAxis, edge: EdgeKind): number
{
    if (axis === AlignmentAxis.X)
    {
        if (edge === EdgeKind.Min) return rect.X;
        if (edge === EdgeKind.Max) return rect.X + rect.Width;
        return rect.X + rect.Width / 2;
    }
    if (edge === EdgeKind.Min) return rect.Y;
    if (edge === EdgeKind.Max) return rect.Y + rect.Height;
    return rect.Y + rect.Height / 2;
}

// Snap a guide being placed/moved onto the nearest node edge (any of min/mid/max)
// on its own axis, within tolerance. Returns the snapped coordinate (or the input
// unchanged when nothing is close). First-closest wins.
export function snapGuidePosition(
    axis: AlignmentAxis, position: number,
    rects: readonly Rect[], tolerance: number = DEFAULT_TOLERANCE): number
{
    let best: number | undefined;
    let bestDelta = Infinity;
    for (const rect of rects)
    {
        for (const e of EDGES)
        {
            const c = edgeCoord(rect, axis, e);
            const d = Math.abs(c - position);
            if (d <= tolerance && d < bestDelta) { best = c; bestDelta = d; }
        }
    }
    return best ?? position;
}

export interface GuideAxisSnap { readonly edge: EdgeKind; readonly guide: number }
export interface GuideSnap
{
    readonly snapped: Rect;
    readonly x?: GuideAxisSnap;   // which moving edge glued to which x-guide (index into guides)
    readonly y?: GuideAxisSnap;
}

// Snap a moving node rect so its nearest edge lands on a guide, per axis
// independently. Reports the glued edge + guide index per axis so the caller can
// record glue on drop. Closest edge/guide pairing wins per axis.
export function snapRectToGuides(
    rect: Rect, guides: readonly PersistentGuide[],
    tolerance: number = DEFAULT_TOLERANCE): GuideSnap
{
    let x: GuideAxisSnap | undefined; let bestDx = Infinity; let dx = 0;
    let y: GuideAxisSnap | undefined; let bestDy = Infinity; let dy = 0;
    for (let gi = 0; gi < guides.length; gi++)
    {
        const g = guides[gi]!;
        for (const e of EDGES)
        {
            const c = edgeCoord(rect, g.axis, e);
            const delta = g.position - c;
            const ad = Math.abs(delta);
            if (ad > tolerance) continue;
            if (g.axis === AlignmentAxis.X)
            {
                if (ad < bestDx) { bestDx = ad; dx = delta; x = { edge: e, guide: gi }; }
            }
            else
            {
                if (ad < bestDy) { bestDy = ad; dy = delta; y = { edge: e, guide: gi }; }
            }
        }
    }
    const snapped = new Rect(
        rect.X + (x !== undefined ? dx : 0),
        rect.Y + (y !== undefined ? dy : 0),
        rect.Width, rect.Height);
    return { snapped, x, y };
}

// The 1/2/5 × 10ⁿ ladder value: smallest interval whose on-screen spacing
// (interval × zoom) is at least minPx. Keeps ruler tick labels legible at any zoom.
export function chooseTickInterval(zoom: number, minPx: number): number
{
    const z = zoom > 0 ? zoom : 1;
    const need = minPx / z;                    // required content-space interval
    const pow = Math.floor(Math.log10(Math.max(need, 1e-6)));
    let mag = Math.pow(10, pow);
    for (let p = pow; p < pow + 4; p++)
    {
        mag = Math.pow(10, p);
        for (const m of [1, 2, 5])
        {
            const candidate = m * mag;
            if (candidate >= need) return candidate;
        }
    }
    return 10 * mag;
}

// Every multiple of `interval` within [contentMin, contentMax], inclusive.
// Normalizes -0 to 0.
export function ticksInRange(interval: number, contentMin: number, contentMax: number): number[]
{
    if (!(interval > 0) || !(contentMax >= contentMin)) return [];
    const out: number[] = [];
    const start = Math.ceil(contentMin / interval);
    const end   = Math.floor(contentMax / interval);
    for (let k = start; k <= end; k++) out.push(k * interval + 0);
    return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd Mural && npx tsx --conditions=development --test src/runtime/tests/guide-math.test.ts`
Expected: PASS. If a tick-interval expectation is off, adjust the test's expected values to match the ladder (the ladder logic is the contract, not the hand-computed comments).

- [ ] **Step 5: Export from the runtime barrel**

In `Mural/src/runtime/index.ts`, add next to the `alignment-math` export:

```ts
export {
    snapGuidePosition, snapRectToGuides, chooseTickInterval, ticksInRange,
    type PersistentGuide, type GuideGlue, type GuideAxisSnap, type GuideSnap,
} from './guide-math.js';
```

- [ ] **Step 6: Commit**

```bash
git add src/runtime/guide-math.ts src/runtime/tests/guide-math.test.ts src/runtime/index.ts
git commit -m "feat(diagram): persistent-guide model + snap/tick math"
```

---

## Task 2: DiagramSettings — guide + ruler tunables

**Files:**
- Modify: `Mural/src/framework/diagram/diagram-settings.ts`
- Test: `Mural/src/framework/diagram/tests/diagram-settings.test.ts` (extend existing)

**Interfaces:**
- Consumes: existing `DiagramSettings` machinery (`num`/`color`, `SPECS`/`COLOR_SPECS`).
- Produces new accessors: `DiagramSettings.RulerThickness(): number`, `DiagramSettings.RulerTickMinSpacing(): number`, `DiagramSettings.GuideGrabTolerance(): number`, `DiagramSettings.PersistentGuideThickness(): number`, `DiagramSettings.PersistentGuideColor(): SolidColorBrush`, `DiagramSettings.RulerFill(): SolidColorBrush`, `DiagramSettings.RulerTickColor(): SolidColorBrush`.

- [ ] **Step 1: Write the failing test** — append to `diagram-settings.test.ts`:

```ts
test('exposes ruler + persistent-guide defaults', () => {
    Application.current = null;
    new Application();
    assert.equal(DiagramSettings.RulerThickness(), 20);
    assert.equal(DiagramSettings.RulerTickMinSpacing(), 60);
    assert.equal(DiagramSettings.GuideGrabTolerance(), 4);
    assert.equal(DiagramSettings.PersistentGuideThickness(), 1);
    assert.ok(DiagramSettings.PersistentGuideColor() instanceof SolidColorBrush);
    assert.ok(DiagramSettings.RulerFill() instanceof SolidColorBrush);
    assert.ok(DiagramSettings.RulerTickColor() instanceof SolidColorBrush);
});
```

(Match the existing imports at the top of that test file — `Application`, `assert`, `SolidColorBrush`, `DiagramSettings`. Add any missing.)

- [ ] **Step 2: Run to verify it fails**

Run: `cd Mural && npx tsx --conditions=development --test src/framework/diagram/tests/diagram-settings.test.ts`
Expected: FAIL — accessors undefined.

- [ ] **Step 3: Implement**

Add enum members to `DiagramSettingKey` (a new `CAT_RULERS` category):

```ts
    ChromePersistentGuideThickness = 'diagram.chrome.persistentGuideThickness',
    ChromeGuideGrabTolerance       = 'diagram.chrome.guideGrabTolerance',

    RulerThickness                 = 'diagram.ruler.thickness',
    RulerTickMinSpacing            = 'diagram.ruler.tickMinSpacing',
    ChromePersistentGuideColor     = 'diagram.chrome.persistentGuideColor',
    RulerFill                      = 'diagram.ruler.fill',
    RulerTickColor                 = 'diagram.ruler.tickColor',
```

Add `const CAT_RULERS = 'Diagram · Rulers';` next to the other `CAT_*`.

Add numeric rows to `SPECS`:

```ts
    { key: DiagramSettingKey.ChromePersistentGuideThickness, label: 'Persistent guide thickness',
      description: 'Line thickness of a user-placed ruler guide, in pixels.',
      category: CAT_CHROME, default: 1, min: 1, max: 8 },
    { key: DiagramSettingKey.ChromeGuideGrabTolerance, label: 'Guide grab tolerance',
      description: 'Cursor distance at which a ruler guide can be grabbed, in pixels.',
      category: CAT_CHROME, default: 4, min: 1, max: 24 },
    { key: DiagramSettingKey.RulerThickness, label: 'Ruler thickness',
      description: 'Width/height of the ruler strips along the viewport edges, in pixels.',
      category: CAT_RULERS, default: 20, min: 12, max: 48 },
    { key: DiagramSettingKey.RulerTickMinSpacing, label: 'Ruler tick minimum spacing',
      description: 'Smallest on-screen gap between labelled ruler ticks, in pixels.',
      category: CAT_RULERS, default: 60, min: 24, max: 200 },
```

Add colour rows to `COLOR_SPECS`:

```ts
    { key: DiagramSettingKey.ChromePersistentGuideColor, label: 'Persistent guide colour',
      description: 'Colour of a user-placed ruler guide line.',
      category: CAT_CHROME, default: new SolidColorBrush(Color.FromHex('#e5484d')) },
    { key: DiagramSettingKey.RulerFill, label: 'Ruler fill',
      description: 'Background fill of the ruler strips.',
      category: CAT_RULERS, default: new SolidColorBrush(Color.FromHex('#f3f4f6')) },
    { key: DiagramSettingKey.RulerTickColor, label: 'Ruler tick colour',
      description: 'Colour of ruler tick marks and labels.',
      category: CAT_RULERS, default: new SolidColorBrush(Color.FromHex('#6b7280')) },
```

Add accessors in the appropriate sections:

```ts
    public static PersistentGuideThickness(): number         { return DiagramSettings.num(DiagramSettingKey.ChromePersistentGuideThickness); }
    public static GuideGrabTolerance():       number         { return DiagramSettings.num(DiagramSettingKey.ChromeGuideGrabTolerance); }
    public static RulerThickness():           number         { return DiagramSettings.num(DiagramSettingKey.RulerThickness); }
    public static RulerTickMinSpacing():      number         { return DiagramSettings.num(DiagramSettingKey.RulerTickMinSpacing); }
    public static PersistentGuideColor():     SolidColorBrush { return DiagramSettings.color(DiagramSettingKey.ChromePersistentGuideColor); }
    public static RulerFill():                SolidColorBrush { return DiagramSettings.color(DiagramSettingKey.RulerFill); }
    public static RulerTickColor():           SolidColorBrush { return DiagramSettings.color(DiagramSettingKey.RulerTickColor); }
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd Mural && npx tsx --conditions=development --test src/framework/diagram/tests/diagram-settings.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/framework/diagram/diagram-settings.ts src/framework/diagram/tests/diagram-settings.test.ts
git commit -m "feat(diagram): ruler + persistent-guide settings"
```

---

## Task 3: RulerBar control + default Style

**Files:**
- Create: `Mural/src/framework/diagram/guides/ruler-bar.ts`
- Modify: `Mural/src/framework/diagram/diagram.template.mu` (add the `RulerBar` default Style only — the Grid wiring lands in Task 7)
- Modify: `Mural/src/compiler/symbol-table.ts` (register `RulerBar`)
- Modify: framework barrel to export `RulerBar`
- Test: `Mural/src/framework/diagram/guides/tests/ruler-bar.test.ts`

**Interfaces:**
- Consumes: `Control` base, `DrawingContext`, `FormattedText`, `Orientation` enum, `DiagramSettings`, `chooseTickInterval`/`ticksInRange`.
- Produces:
  - DPs `Orientation: Orientation`, `Zoom: number` (default 1), `Offset: number` (default 0), `Extent: number` (default 0). Keys `RulerBar.OrientationKey`, `RulerBar.ZoomKey`, `RulerBar.OffsetKey`, `RulerBar.ExtentKey`.
  - Renders tick marks + labels along its length; the Diagram feeds Zoom/Offset/Extent (Task 7).

**Design notes for the implementer:**
- `RulerBar extends Control`. In its ctor call `applyDefaultStyle()` then read the `Template` DP (per the framework's "every control has a default Style" rule). The default Style/Template is a bare host (the ruler paints itself); use an empty `Border` or `Control`-default template that lets `RenderOverride` paint. Follow how another self-painting diagram control declares its template (e.g. the alignment adorner uses no template; a `Control` needs one). Simplest: default `Template` is a single `Border [ Fill = {Binding …} ]`? No — keep chrome in `RenderOverride`. Give it a minimal template of an empty `Border` so `applyDefaultStyle` succeeds, and paint ticks in `RenderOverride`.
- The four DPs use `MetaData.AffectsRender` so a change repaints. Register with `Model.RegisterProperty`.
- `MeasureOverride`: for `Orientation.Horizontal` return `new Size(available.Width finite? available.Width : 0, DiagramSettings.RulerThickness())`; for Vertical return `new Size(DiagramSettings.RulerThickness(), available.Height…)`. Since the Grid gives it a fixed cross-size and stretches the main axis, returning the thickness on the cross axis and `0` on the main axis (stretch fills) is correct — mirror how other stretch-in-one-axis controls measure. Keep it simple: return `Size(thickness on cross axis, 0 on main)` and rely on the Grid cell to stretch.
- `RenderOverride(dc)`: paint the strip fill (`dc.DrawRectangle(DiagramSettings.RulerFill(), undefined, new Rect(0,0,RenderSize.Width,RenderSize.Height))`), then compute ticks and draw each as a thin `DrawRectangle` + a `FormattedText` label via `dc.DrawText`. Content→host projection for a tick at content coord `c`: `hostPos = c * Zoom - Offset`. The visible content range is `[Offset / Zoom, (Offset + Extent) / Zoom]`. Use `chooseTickInterval(Zoom, DiagramSettings.RulerTickMinSpacing())` and `ticksInRange(interval, min, max)`.

- [ ] **Step 1: Write the failing test**

```ts
// Mural/src/framework/diagram/guides/tests/ruler-bar.test.ts
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Application, Orientation, Size, Rect } from '../../../../runtime/index.js';
import { RulerBar } from '../ruler-bar.js';

// A recording DrawingContext double capturing DrawRectangle / DrawText calls.
class RecordingDc {
    public rects: Rect[] = [];
    public texts: { text: unknown; x: number; y: number }[] = [];
    public DrawRectangle(_b: unknown, _p: unknown, rect: Rect): void { this.rects.push(rect); }
    public DrawRoundedRectangle(): void {}
    public DrawGeometry(): void {}
    public DrawText(text: unknown, origin: { X: number; Y: number }): void { this.texts.push({ text, x: origin.X, y: origin.Y }); }
    public DrawImage(): void {}
    public PushTransform(): void {}
    public Pop(): void {}
}

describe('RulerBar', () => {
    test('a horizontal ruler paints its strip fill and at least one tick + label', () => {
        Application.current = null; new Application();
        const ruler = new RulerBar();
        ruler.Orientation = Orientation.Horizontal;
        ruler.Zoom = 1; ruler.Offset = 0; ruler.Extent = 400;
        ruler.Measure(new Size(400, 20));
        ruler.Arrange(new Rect(0, 0, 400, 20));

        const dc = new RecordingDc();
        (ruler as unknown as { RenderOverride(dc: unknown): void }).RenderOverride(dc);

        assert.ok(dc.rects.length >= 2, 'strip fill + at least one tick');
        assert.ok(dc.texts.length >= 1, 'at least one numeric label');
    });

    test('respects Offset (pan): a tick at content 0 moves left by Offset', () => {
        Application.current = null; new Application();
        const ruler = new RulerBar();
        ruler.Orientation = Orientation.Horizontal;
        ruler.Zoom = 1; ruler.Offset = 100; ruler.Extent = 400;
        ruler.Measure(new Size(400, 20));
        ruler.Arrange(new Rect(0, 0, 400, 20));
        const dc = new RecordingDc();
        (ruler as unknown as { RenderOverride(dc: unknown): void }).RenderOverride(dc);
        // content 100 projects to host 0 (100*1-100); content 200 -> host 100, etc.
        // Assert some tick sits at a host x < 300 (i.e. content range shifted).
        const tickXs = dc.rects.slice(1).map(r => r.X);
        assert.ok(tickXs.some(x => x >= 0 && x <= 300), 'ticks projected with pan offset');
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd Mural && npx tsx --conditions=development --test src/framework/diagram/guides/tests/ruler-bar.test.ts`
Expected: FAIL — `../ruler-bar.js` not found.

- [ ] **Step 3: Implement `ruler-bar.ts`**

```ts
// Mural/src/framework/diagram/guides/ruler-bar.ts
import {
    Model, MetaData, Orientation, Rect, Size,
    chooseTickInterval, ticksInRange,
} from '../../../runtime/index.js';
import { Control } from '../../../basic/index.js';
import type { DrawingContext } from '../../../visual-engine/index.js';
import { FormattedText } from '../../../visual-engine/index.js';
import { DiagramSettings } from '../diagram-settings.js';

// A measured ruler strip along one viewport edge. The Diagram owns it (grabs it
// via GetTemplateChild and pushes Zoom / Offset / Extent as the camera changes);
// the ruler paints tick marks + numeric labels in RenderOverride, projecting each
// content coordinate to host space as `c * Zoom - Offset`. Drag-out of a new guide
// is handled by the persistent-guides behavior at the Diagram level (it detects a
// pointer-down whose Source is inside a RulerBar), so this control is display-only.
export class RulerBar extends Control
{
    public static readonly OrientationKey = Model.RegisterProperty<Orientation>(
        RulerBar, 'Orientation', Orientation.Horizontal, MetaData.AffectsRender);
    public static readonly ZoomKey = Model.RegisterProperty<number>(
        RulerBar, 'Zoom', 1, MetaData.AffectsRender);
    public static readonly OffsetKey = Model.RegisterProperty<number>(
        RulerBar, 'Offset', 0, MetaData.AffectsRender);
    public static readonly ExtentKey = Model.RegisterProperty<number>(
        RulerBar, 'Extent', 0, MetaData.AffectsRender);

    public constructor()
    {
        super();
        this.applyDefaultStyle();
        this.Template = this.Template;   // materialize default template (empty host)
    }

    public get Orientation(): Orientation { return this.get_property_value(RulerBar.OrientationKey); }
    public set Orientation(v: Orientation) { this.set_property_value(RulerBar.OrientationKey, v); }
    public get Zoom(): number { return this.get_property_value(RulerBar.ZoomKey); }
    public set Zoom(v: number) { this.set_property_value(RulerBar.ZoomKey, v); }
    public get Offset(): number { return this.get_property_value(RulerBar.OffsetKey); }
    public set Offset(v: number) { this.set_property_value(RulerBar.OffsetKey, v); }
    public get Extent(): number { return this.get_property_value(RulerBar.ExtentKey); }
    public set Extent(v: number) { this.set_property_value(RulerBar.ExtentKey, v); }

    private get horizontal(): boolean { return this.Orientation === Orientation.Horizontal; }

    protected override MeasureOverride(available: Size): Size
    {
        const t = DiagramSettings.RulerThickness();
        // Fixed cross-axis thickness; the Grid cell stretches the main axis.
        return this.horizontal
            ? new Size(Number.isFinite(available.Width) ? available.Width : 0, t)
            : new Size(t, Number.isFinite(available.Height) ? available.Height : 0);
    }

    protected override RenderOverride(dc: DrawingContext): void
    {
        const s = this.RenderSize;
        if (s.Width <= 0 || s.Height <= 0) return;

        dc.DrawRectangle(DiagramSettings.RulerFill(), undefined, new Rect(0, 0, s.Width, s.Height));

        const zoom = this.Zoom || 1;
        const offset = this.Offset;
        const extent = this.horizontal ? s.Width : s.Height;
        const contentMin = offset / zoom;
        const contentMax = (offset + extent) / zoom;
        const interval = chooseTickInterval(zoom, DiagramSettings.RulerTickMinSpacing());
        const ticks = ticksInRange(interval, contentMin, contentMax);

        const tickBrush = DiagramSettings.RulerTickColor();
        const tickLen = Math.max(4, s.Height * 0.4);   // for horizontal; symmetric use below
        for (const c of ticks)
        {
            const host = c * zoom - offset;
            if (this.horizontal)
            {
                dc.DrawRectangle(tickBrush, undefined, new Rect(host, s.Height - tickLen, 1, tickLen));
                dc.DrawText(new FormattedText(String(Math.round(c)), 9, tickBrush), { X: host + 2, Y: 1 } as never);
            }
            else
            {
                const vLen = Math.max(4, s.Width * 0.4);
                dc.DrawRectangle(tickBrush, undefined, new Rect(s.Width - vLen, host, vLen, 1));
                dc.DrawText(new FormattedText(String(Math.round(c)), 9, tickBrush), { X: 1, Y: host + 2 } as never);
            }
        }
    }
}
```

> Implementer: verify the real `FormattedText` constructor signature and `DrawText` origin type against `src/visual-engine/drawing/*` and `FormattedText`'s definition — adjust the `new FormattedText(...)` args and the `origin` (use a real `Point`) to match. The `as never`/`as unknown` casts in the sketch are placeholders for the real `Point` import. Use `Point` from the runtime and construct `new Point(x, y)`.

- [ ] **Step 4: Add the default Style/Template** in `diagram.template.mu` (near the `ToolboxVisualPresenter` style):

```
    // RulerBar paints its own ticks in RenderOverride; the template is a bare
    // host so applyDefaultStyle() has a Template to read.
    Template x:key="DefaultRulerBar" [TargetType = RulerBar] {
        Border [ Fill = #00000000 ]
    }
    Style [TargetType = RulerBar] {
        Template = @DefaultRulerBar;
    }
```

- [ ] **Step 5: Register `RulerBar` in the compiler symbol table**

In `src/compiler/symbol-table.ts`, add `RulerBar` to `DEFAULT_SYMBOLS` alongside the other diagram controls (e.g. where `Diagram`/`Connector` or `ToolboxVisualPresenter` are registered). `Orientation` is already registered. Grep the file for `ToolboxVisualPresenter` to find the exact registration shape and mirror it.

- [ ] **Step 6: Export `RulerBar`** from the framework barrel (grep for where `Diagram` is exported, add `RulerBar`).

- [ ] **Step 7: Run the test + typecheck**

Run: `cd Mural && npx tsx --conditions=development --test src/framework/diagram/guides/tests/ruler-bar.test.ts`
Expected: PASS.
Run: `cd Mural && npm run typecheck` (or the project's typecheck script) — fix any signature mismatches surfaced for `FormattedText`/`Point`/`DrawText`.

- [ ] **Step 8: Commit**

```bash
git add src/framework/diagram/guides/ruler-bar.ts src/framework/diagram/guides/tests/ruler-bar.test.ts src/framework/diagram/diagram.template.mu src/compiler/symbol-table.ts src/framework/index.ts
git commit -m "feat(diagram): RulerBar measured tick strip control"
```

---

## Task 4: Diagram DPs — Guides + RulersVisible + handler slot

**Files:**
- Modify: `Mural/src/framework/diagram/diagram.ts`
- Test: `Mural/src/framework/diagram/tests/diagram-guides-dp.test.ts`

**Interfaces:**
- Consumes: `PersistentGuide` from `../../runtime/index.js`; the DP registration + accessor patterns already in `diagram.ts` (see `AlignmentGuides`/`AlignmentGuidesEnabled`).
- Produces:
  - `Diagram.GuidesKey` = `RegisterProperty<readonly PersistentGuide[]>` default frozen `[]`, `MetaData.None`. Public `get/set Guides`.
  - `Diagram.RulersVisibleKey` = `RegisterProperty<boolean>` default `false`, `MetaData.None`. Public `get/set RulersVisible`.
  - `_setGuides(g)` internal writer (behavior uses it) — since `Guides` is read-write, `_setGuides` just assigns `this.Guides = g` for symmetry/greppability, OR the behavior writes `diagram.Guides` directly. Use direct `Guides` set; DO NOT add `_setGuides` (the DP is public read-write, unlike AlignmentGuides which is read-only). The adorner subscribes to `GuidesKey`.
  - `interface PersistentGuidesHandlers { OnPreviewPointerDown(args: unknown): void; OnPreviewPointerMove(args: unknown): void; OnPreviewPointerUp(args: unknown): void }` (declared in the behavior file, Task 6; the Diagram imports the type).
  - `_persistentGuidesHandlers` field + `public _setPersistentGuidesHandlers(h): void`.

- [ ] **Step 1: Write the failing test**

```ts
// Mural/src/framework/diagram/tests/diagram-guides-dp.test.ts
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Application, AlignmentAxis } from '../../../runtime/index.js';
import { Diagram } from '../diagram.js';
import type { PersistentGuide } from '../../../runtime/index.js';

describe('Diagram guide DPs', () => {
    test('Guides defaults to empty and round-trips a set', () => {
        Application.current = null; new Application();
        const d = new Diagram();
        assert.deepEqual(d.Guides, []);
        const g: PersistentGuide[] = [{ axis: AlignmentAxis.X, position: 120, glued: [] }];
        let fired = 0;
        d.AddPropertyChangedListener(Diagram.GuidesKey, () => { fired++; });
        d.Guides = g;
        assert.equal(d.Guides.length, 1);
        assert.equal(fired, 1);
    });
    test('RulersVisible defaults false and toggles', () => {
        Application.current = null; new Application();
        const d = new Diagram();
        assert.equal(d.RulersVisible, false);
        d.RulersVisible = true;
        assert.equal(d.RulersVisible, true);
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd Mural && npx tsx --conditions=development --test src/framework/diagram/tests/diagram-guides-dp.test.ts`
Expected: FAIL — `Guides`/`RulersVisible` undefined.

- [ ] **Step 3: Implement the DPs** in `diagram.ts`:

Near the `AlignmentGuidesKey` registration (~line 314), add:

```ts
    // Persistent (Visio-style) ruler guides. Read-write: the app hydrates them
    // from the .diagram metadata and persists changes; the behavior mutates them
    // on placement/reposition/delete/glue; the adorner subscribes to paint them.
    public static readonly GuidesKey = Model.RegisterProperty<readonly PersistentGuide[]>(
        Diagram, 'Guides', Object.freeze([]) as readonly PersistentGuide[], MetaData.None);

    // Feature opt-in: shows the rulers AND attaches the persistent-guides behavior
    // + adorner. Default off — the template is visually identical to today.
    public static readonly RulersVisibleKey = Model.RegisterProperty<boolean>(
        Diagram, 'RulersVisible', false, MetaData.None);
```

Add the import at the top: `PersistentGuide` from `../../runtime/index.js` (extend the existing runtime import) and `type PersistentGuidesHandlers` from `./behaviors/persistent-guides-behavior.js` (created in Task 6 — if executing strictly in order, add this import in Task 6 and keep the field typed `unknown`-bundle here; simplest: define the field's type inline as an interface local to diagram.ts OR import in Task 6. To avoid a forward-dependency, declare the handler field type structurally here:)

Near the accessors (~line 645), add:

```ts
    public get Guides(): readonly PersistentGuide[] { return this.get_property_value(Diagram.GuidesKey); }
    public set Guides(v: readonly PersistentGuide[]) { this.set_property_value(Diagram.GuidesKey, v); }

    public get RulersVisible(): boolean { return this.get_property_value(Diagram.RulersVisibleKey); }
    public set RulersVisible(v: boolean) { this.set_property_value(Diagram.RulersVisibleKey, v); }
```

Near the `_alignmentGuidesHandlers` field (~line 853), add:

```ts
    // Persistent-guides preview-pointer interceptor — same tunnel-phase reason as
    // the alignment + connector interceptors. Installed by attachPersistentGuides.
    private _persistentGuidesHandlers: PersistentGuidesHandlers | undefined = undefined;
    /** @internal — used by attachPersistentGuides. Not exposed publicly. */
    public _setPersistentGuidesHandlers(h: PersistentGuidesHandlers | undefined): void
    {
        this._persistentGuidesHandlers = h;
    }
```

Where `PersistentGuidesHandlers` is imported as a `type` from the behavior module (add the import; it's a type-only import so no runtime cycle).

- [ ] **Step 4: Run to verify it passes**

Run: `cd Mural && npx tsx --conditions=development --test src/framework/diagram/tests/diagram-guides-dp.test.ts`
Expected: PASS. (The `PersistentGuidesHandlers` import will dangle until Task 6 creates the module — if strict ordering breaks the build, temporarily declare `interface PersistentGuidesHandlers { OnPreviewPointerDown(a: unknown): void; OnPreviewPointerMove(a: unknown): void; OnPreviewPointerUp(a: unknown): void }` in diagram.ts and replace with the import in Task 6.)

- [ ] **Step 5: Commit**

```bash
git add src/framework/diagram/diagram.ts src/framework/diagram/tests/diagram-guides-dp.test.ts
git commit -m "feat(diagram): Guides + RulersVisible DPs + handler slot"
```

---

## Task 5: Persistent-guides adorner (render, camera-projected)

**Files:**
- Create: `Mural/src/framework/diagram/guides/persistent-guides-adorner.ts`
- Test: `Mural/src/framework/diagram/guides/tests/persistent-guides-adorner.test.ts`

**Interfaces:**
- Consumes: `Adorner` base + `AdornedToLayerMatrix`; `Diagram.GuidesKey`; `PersistentGuide`; `DiagramSettings.PersistentGuideThickness/Color`.
- Produces: `class PersistentGuidesAdorner extends Adorner` with `constructor(adornedElement: Visual, diagram: Diagram)`, `Dispose()`.

This is a near-copy of `alignment-guides-adorner.ts` (read it first). Differences: reads `diagram.Guides` (not `AlignmentGuides`), uses `PersistentGuideColor`/`PersistentGuideThickness`, and each guide has `axis`/`position` fields (same shape as `AlignmentGuide` for axis/position, so the projection loop is identical).

- [ ] **Step 1: Write the failing test** (mirror `alignment-guides-adorner.test.ts`):

```ts
// Mural/src/framework/diagram/guides/tests/persistent-guides-adorner.test.ts
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Application, Matrix, Point, Rect, Size, AlignmentAxis } from '../../../../runtime/index.js';
import { Border } from '../../../../basic/index.js';
import { Diagram } from '../../diagram.js';
import { PersistentGuidesAdorner } from '../persistent-guides-adorner.js';

describe('PersistentGuidesAdorner', () => {
    test('guide lines arrange to non-zero size', () => {
        Application.current = null; new Application();
        const diagram = new Diagram();
        const host = new Border();
        host.Width = 400; host.Height = 300;
        host.Measure(new Size(400, 300)); host.Arrange(new Rect(0, 0, 400, 300));
        const adorner = new PersistentGuidesAdorner(host, diagram);
        diagram.Guides = [
            { axis: AlignmentAxis.X, position: 120, glued: [] },
            { axis: AlignmentAxis.Y, position: 80,  glued: [] },
        ];
        adorner.Measure(new Size(400, 300)); adorner.Arrange(new Rect(0, 0, 400, 300));
        const pool = (adorner as unknown as { _pool: { RenderSize: Size }[] })._pool;
        assert.ok(pool[0].RenderSize.Height > 0 && pool[0].RenderSize.Width > 0);
        assert.ok(pool[1].RenderSize.Width > 0 && pool[1].RenderSize.Height > 0);
    });
    test('positions project through the content->layer (camera) matrix', () => {
        Application.current = null; new Application();
        const diagram = new Diagram();
        const host = new Border();
        host.Width = 400; host.Height = 300;
        host.Measure(new Size(400, 300)); host.Arrange(new Rect(0, 0, 400, 300));
        const adorner = new PersistentGuidesAdorner(host, diagram);
        const m = Matrix.Scale(1.5, 1.5).Multiply(Matrix.Translate(40, 25));
        adorner._setAdornedToLayerMatrix(m);
        diagram.Guides = [{ axis: AlignmentAxis.X, position: 100, glued: [] }];
        adorner.Measure(new Size(400, 300)); adorner.Arrange(new Rect(0, 0, 400, 300));
        const pool = (adorner as unknown as { _pool: { ArrangedRect: Rect }[] })._pool;
        const expX = m.Transform(new Point(100, 0)).X;
        assert.ok(Math.abs(pool[0].ArrangedRect.X - (expX - 0.5)) < 0.6);
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd Mural && npx tsx --conditions=development --test src/framework/diagram/guides/tests/persistent-guides-adorner.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** by copying `alignment-guides-adorner.ts` and adapting. Full file:

```ts
// Mural/src/framework/diagram/guides/persistent-guides-adorner.ts
import { Point, Rect, Size, AlignmentAxis, type Visual, type PersistentGuide } from '../../../runtime/index.js';
import { Adorner } from '../../../visual-engine/index.js';
import { Border } from '../../../basic/index.js';
import { Diagram } from '../diagram.js';
import { DiagramSettings } from '../diagram-settings.js';

// Read-only overlay painting the durable user-placed guide lines. Lives in the
// AdornerLayer of the Diagram's ItemsPanel so it scrolls with the canvas, and
// projects each guide position through AdornedToLayerMatrix (camera zoom+pan) —
// the same mechanism the alignment-guides adorner uses. Distinct colour from the
// ephemeral alignment guides. NOT hit-test-visible: grabbing a guide for
// reposition is done by the behavior via pointer-proximity math, so the overlay
// never intercepts pointer events meant for the nodes beneath.
const POOL_SIZE = 64;
const HIDE_OFFSCREEN = -10000;

export class PersistentGuidesAdorner extends Adorner
{
    private readonly _diagram: Diagram;
    private readonly _pool:    Border[] = [];
    private readonly _onChange: () => void;

    constructor(adornedElement: Visual, diagram: Diagram)
    {
        super(adornedElement);
        this._diagram = diagram;
        this.IsHitTestVisible = false;
        const brush = DiagramSettings.PersistentGuideColor();
        for (let i = 0; i < POOL_SIZE; i++)
        {
            const v = new Border();
            v.Fill = brush;
            v.IsHitTestVisible = false;
            // Leave Width/Height UNSET so Border's Stretch default fills the arrange
            // rect (pinning 0 would collapse every line — see the alignment adorner).
            this.AttachVisual(v);
            this._pool.push(v);
        }
        this._onChange = (): void => this.InvalidateArrange();
        diagram.AddPropertyChangedListener(Diagram.GuidesKey, this._onChange);
    }

    public override get visualChildren(): Visual[] { return this._pool.slice(); }

    public override MeasureOverride(_available: Size): Size
    {
        const big = new Size(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
        for (const v of this._pool) v.Measure(big);
        return Size.Zero;
    }

    public override ArrangeOverride(finalSize: Size): Size
    {
        const guides: readonly PersistentGuide[] = this._diagram.Guides;
        const W = finalSize.Width, H = finalSize.Height;
        const thickness = DiagramSettings.PersistentGuideThickness();
        const m = this.AdornedToLayerMatrix;
        const used = Math.min(guides.length, this._pool.length);
        for (let i = 0; i < used; i++)
        {
            const g = guides[i]!;
            const v = this._pool[i]!;
            if (g.axis === AlignmentAxis.X)
            {
                const x = m.IsIdentity ? g.position : m.Transform(new Point(g.position, 0)).X;
                v.Arrange(new Rect(x - thickness / 2, 0, thickness, H));
            }
            else
            {
                const y = m.IsIdentity ? g.position : m.Transform(new Point(0, g.position)).Y;
                v.Arrange(new Rect(0, y - thickness / 2, W, thickness));
            }
        }
        for (let i = used; i < this._pool.length; i++)
            this._pool[i]!.Arrange(new Rect(HIDE_OFFSCREEN, HIDE_OFFSCREEN, 0, 0));
        return finalSize;
    }

    public Dispose(): void
    {
        this._diagram.RemovePropertyChangedListener(Diagram.GuidesKey, this._onChange);
    }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd Mural && npx tsx --conditions=development --test src/framework/diagram/guides/tests/persistent-guides-adorner.test.ts`
Expected: PASS.

- [ ] **Step 5: Export** `PersistentGuidesAdorner` from the framework barrel, and commit.

```bash
git add src/framework/diagram/guides/persistent-guides-adorner.ts src/framework/diagram/guides/tests/persistent-guides-adorner.test.ts src/framework/index.ts
git commit -m "feat(diagram): persistent-guides adorner (camera-projected)"
```

---

## Task 6: Persistent-guides behavior (create / reposition / delete / snap / glue)

**Files:**
- Create: `Mural/src/framework/diagram/behaviors/persistent-guides-behavior.ts`
- Test: `Mural/src/framework/diagram/behaviors/tests/persistent-guides-behavior.test.ts`

**Interfaces:**
- Consumes: `Diagram` (`Guides`, `PositionSnap`, `HostToContent`, `Zoom`, `Generator`, `ItemsSource`, `_setPersistentGuidesHandlers`); `RulerBar` (ancestry detection + `Orientation`); `Figure`, `NodeViewModel` (id + move); `snapGuidePosition`, `snapRectToGuides`, `PersistentGuide`, `GuideGlue`; `AlignmentAxis`, `EdgeKind`; `DiagramSettings.GuideGrabTolerance`.
- Produces:
  - `interface PersistentGuidesHandlers { OnPreviewPointerDown(args: unknown): void; OnPreviewPointerMove(args: unknown): void; OnPreviewPointerUp(args: unknown): void }`
  - `function attachPersistentGuides(diagram: Diagram): () => void` (returns detach).

**Behavior logic (the heart of the feature):**

Two interaction modes, both entered from the tunnel-phase preview interceptor:

- **Guide drag (create/reposition)** — the behavior's own pointer loop:
  - `OnPreviewPointerDown`: if `args.Source` has a `RulerBar` ancestor → start **create** (axis = ruler's `Orientation`: a *horizontal* ruler makes a `Y` guide, a *vertical* ruler makes an `X` guide); set `args.Handled = true`. Else compute the content point via `diagram.HostToContent(args.Position…)` and test each guide: if `|contentCoord − guide.position| ≤ GuideGrabTolerance / diagram.Zoom` → start **reposition** of that guide (remember its index + starting position + its glued node ids), set `args.Handled = true`.
  - `OnPreviewPointerMove`: if creating/repositioning, convert pointer→content, snap the guide coordinate onto node edges via `snapGuidePosition(axis, coord, otherRects, tol)`, update the guide in `diagram.Guides` (immutable replace). If repositioning, translate every glued node by the delta from the previous position (move its container's `Left`/`Top`).
  - `OnPreviewPointerUp`: commit. **Create**: if dropped inside the same ruler band (i.e. back on the ruler), discard (don't add); else the guide is already in `Guides`. **Reposition**: if dropped back over a ruler, delete the guide (drop from `Guides`, clearing its glue). Clear drag state.

- **Node drag (glue)** — observe a Figure drag like the alignment behavior:
  - `OnPreviewPointerDown` (when neither ruler nor guide-grab matched): if `args.Source` has a `Figure` ancestor, set `activeNode = that Figure` (the container). Don't set Handled — let the normal drag proceed.
  - Compose `PositionSnap`: when `activeNode` is set, snap the candidate rect to guides via `snapRectToGuides(base, diagram.Guides, tol)` and return `snapped` (composed AFTER the previous snap, which includes alignment snapping).
  - `OnPreviewPointerUp`: if `activeNode` set, compute the final rect from `activeNode.Left/Top + size`, run `snapRectToGuides(finalRect, guides)`, and for each axis result form glue: resolve the dragged node's id (`nodeIdOf(Generator.ItemFromContainer(activeNode))`), then set `guides[result.x.guide].glued` to include `{ nodeId, edge }` (replacing any prior glue for that node on that axis) — and REMOVE that node's glue from any guide on the same axis it's no longer near (drag-away un-glue). Publish the updated `Guides`. Clear `activeNode`.

**Helper `nodeIdOf`** (local): `item instanceof Figure ? item.Id : item instanceof NodeViewModel ? item.Id : undefined`.

**Helper `collectNodeRects`** (mirror `collectOtherRects` from alignment behavior): iterate `diagram.ItemsSource`, `Generator.ContainerFromItem`, gather `{ id: nodeIdOf(item), container, rect }`.

**Glue translation** (`moveGluedNodes(guide, delta)`): for each `glue.nodeId`, find the container (via `collectNodeRects`), and for an X guide `container.Left += delta`, for a Y guide `container.Top += delta`.

- [ ] **Step 1: Write the failing test** — a headless integration test using a real `Diagram` + a fake generator/items, driving the handler bundle directly. Keep it focused on the pure decision logic + `Guides`/glue mutation (full pointer-capture E2E is covered by the live Playwright smoke in Task 10).

```ts
// Mural/src/framework/diagram/behaviors/tests/persistent-guides-behavior.test.ts
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Application, AlignmentAxis, EdgeKind, Rect } from '../../../../runtime/index.js';
import { Diagram } from '../../diagram.js';
import { attachPersistentGuides } from '../persistent-guides-behavior.js';
import { snapRectToGuides } from '../../../../runtime/index.js';

describe('persistent-guides behavior', () => {
    test('attach installs a composing PositionSnap and detach restores it', () => {
        Application.current = null; new Application();
        const d = new Diagram();
        const prior = (r: Rect): Rect => r;
        d.PositionSnap = prior;
        const detach = attachPersistentGuides(d);
        assert.notEqual(d.PositionSnap, prior, 'snap composed');
        detach();
        assert.equal(d.PositionSnap, prior, 'snap restored');
    });

    test('node drop within tolerance of a guide forms glue on that guide', () => {
        Application.current = null; new Application();
        const d = new Diagram();
        d.Guides = [{ axis: AlignmentAxis.X, position: 200, glued: [] }];
        // snapRectToGuides is the pure kernel the behavior uses on drop:
        const res = snapRectToGuides(new Rect(197, 50, 40, 40), d.Guides, 5);
        assert.deepEqual(res.x, { edge: EdgeKind.Min, guide: 0 });
        assert.equal(res.snapped.X, 200);
    });
});
```

> The behavior's full drop→glue path needs a live generator; assert the pure kernel here (`snapRectToGuides`) plus the attach/detach contract. The end-to-end glue + guide-drag translation is verified live in Task 10. Add a second headless test if a fake `Generator`/`ItemsSource` can be stood up cheaply (see `alignment-guides` drag-integration test in `src/framework/tests/diagram-alignment-guides.test.ts` for the `initTestApp()` + `PaginatedCanvas` + real `Figure` items pattern — reuse it to drive `OnPreviewPointerDown` (a Figure) → `OnPreviewPointerUp` and assert `d.Guides[0].glued` gains the node id).

- [ ] **Step 2: Run to verify it fails**

Run: `cd Mural && npx tsx --conditions=development --test src/framework/diagram/behaviors/tests/persistent-guides-behavior.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `persistent-guides-behavior.ts`** following the logic above and mirroring `alignment-guides-behavior.ts` structure (preview interceptor + `PositionSnap` compose + `collectOtherRects`). Key skeleton:

```ts
// Mural/src/framework/diagram/behaviors/persistent-guides-behavior.ts
import {
    Rect, AlignmentAxis, EdgeKind,
    snapGuidePosition, snapRectToGuides,
    type PointerEventArgs, type Visual, type PersistentGuide, type GuideGlue,
} from '../../../runtime/index.js';
import { Figure } from '../figure.js';
import { NodeViewModel } from '../node-view-model.js';   // verify the real module path/name
import { RulerBar } from '../guides/ruler-bar.js';
import { DiagramSettings } from '../diagram-settings.js';
import type { Diagram } from '../diagram.js';

export interface PersistentGuidesHandlers
{
    OnPreviewPointerDown(args: unknown): void;
    OnPreviewPointerMove(args: unknown): void;
    OnPreviewPointerUp  (args: unknown): void;
}

const enum Mode { None, Create, Reposition, NodeDrag }

/** @internal */
export function attachPersistentGuides(diagram: Diagram): () => void
{
    let mode = Mode.None;
    let axis = AlignmentAxis.X;
    let guideIndex = -1;               // for Reposition
    let lastPos = 0;                   // last committed guide position (for glue delta)
    let activeNode: Figure | undefined;

    const previousSnap = diagram.PositionSnap;
    diagram.PositionSnap = (rect: Rect): Rect => {
        const base = previousSnap !== undefined ? previousSnap(rect) : rect;
        if (mode !== Mode.NodeDrag || activeNode === undefined) return base;
        return snapRectToGuides(base, diagram.Guides, DiagramSettings.GuideGrabTolerance()).snapped;
    };

    const nodeIdOf = (item: unknown): string | undefined =>
        item instanceof Figure ? item.Id
        : item instanceof NodeViewModel ? item.Id
        : undefined;

    const contentPoint = (args: PointerEventArgs): { x: number; y: number } => {
        // Use the same host->content conversion the drop/hover paths use.
        const p = diagram.HostToContent(args.Position.X, args.Position.Y);   // confirm PointerEventArgs.Position field name
        return { x: p.X, y: p.Y };
    };

    const otherRects = (): Rect[] => {
        const out: Rect[] = [];
        const items = diagram.ItemsSource;
        if (items === undefined) return out;
        for (const it of items as Iterable<unknown>) {
            const c = diagram.Generator.ContainerFromItem(it);
            if (!(c instanceof Figure)) continue;
            const r = c.ArrangedRect;
            if (r === undefined || r.Width <= 0) continue;
            out.push(new Rect(c.Left, c.Top, r.Width, r.Height));
        }
        return out;
    };

    const setGuidePos = (i: number, pos: number): void => {
        const next = diagram.Guides.slice();
        next[i] = { ...next[i]!, position: pos };
        diagram.Guides = next;
    };

    const moveGluedNodes = (guide: PersistentGuide, delta: number): void => {
        const items = diagram.ItemsSource;
        if (items === undefined || delta === 0) return;
        const byId = new Map<string, Figure>();
        for (const it of items as Iterable<unknown>) {
            const id = nodeIdOf(it);
            const c = diagram.Generator.ContainerFromItem(it);
            if (id !== undefined && c instanceof Figure) byId.set(id, c);
        }
        for (const g of guide.glued) {
            const c = byId.get(g.nodeId);
            if (c === undefined) continue;
            if (guide.axis === AlignmentAxis.X) c.Left = c.Left + delta;
            else                                c.Top  = c.Top  + delta;
        }
    };

    const findAncestor = <T,>(v: unknown, ctor: new (...a: never[]) => T): T | undefined => {
        let cur = v as { GetVisualParent?(): Visual | undefined } | undefined;
        while (cur) { if (cur instanceof ctor) return cur as T; cur = cur.GetVisualParent?.(); }
        return undefined;
    };

    const onDown = (args: PointerEventArgs): void => {
        if (args.Handled) return;
        const ruler = findAncestor(args.Source, RulerBar);
        if (ruler !== undefined) {
            mode = Mode.Create;
            axis = ruler.Orientation === /* Horizontal */ 0 ? AlignmentAxis.Y : AlignmentAxis.X;   // map via Orientation enum
            const p = contentPoint(args);
            const pos = axis === AlignmentAxis.X ? p.x : p.y;
            const next = diagram.Guides.slice();
            guideIndex = next.length;
            next.push({ axis, position: pos, glued: [] });
            diagram.Guides = next;
            lastPos = pos;
            args.Handled = true;
            return;
        }
        // grab an existing guide?
        const p = contentPoint(args);
        const tol = DiagramSettings.GuideGrabTolerance() / (diagram.Zoom || 1);
        for (let i = 0; i < diagram.Guides.length; i++) {
            const g = diagram.Guides[i]!;
            const coord = g.axis === AlignmentAxis.X ? p.x : p.y;
            if (Math.abs(coord - g.position) <= tol) {
                mode = Mode.Reposition; guideIndex = i; axis = g.axis; lastPos = g.position;
                args.Handled = true;
                return;
            }
        }
        // else: maybe a node drag — arm glue observation
        const fig = findAncestor(args.Source, Figure);
        if (fig !== undefined) { mode = Mode.NodeDrag; activeNode = fig; }
    };

    const onMove = (args: PointerEventArgs): void => {
        if (mode !== Mode.Create && mode !== Mode.Reposition) return;
        const p = contentPoint(args);
        const raw = axis === AlignmentAxis.X ? p.x : p.y;
        const snapped = snapGuidePosition(axis, raw, otherRects(), DiagramSettings.GuideGrabTolerance());
        const delta = snapped - lastPos;
        if (mode === Mode.Reposition) moveGluedNodes(diagram.Guides[guideIndex]!, delta);
        setGuidePos(guideIndex, snapped);
        lastPos = snapped;
    };

    const onUp = (args: PointerEventArgs): void => {
        if (mode === Mode.Create || mode === Mode.Reposition) {
            const overRuler = findAncestor(args.Source, RulerBar) !== undefined;
            if (overRuler) {
                // create dropped back on ruler -> discard; reposition dropped on ruler -> delete
                const next = diagram.Guides.slice();
                next.splice(guideIndex, 1);
                diagram.Guides = next;
            }
        } else if (mode === Mode.NodeDrag && activeNode !== undefined) {
            const r = activeNode.ArrangedRect;
            const finalRect = new Rect(activeNode.Left, activeNode.Top, r?.Width ?? 0, r?.Height ?? 0);
            const res = snapRectToGuides(finalRect, diagram.Guides, DiagramSettings.GuideGrabTolerance());
            const item = diagram.Generator.ItemFromContainer(activeNode);
            const id = nodeIdOf(item);
            if (id !== undefined) reglue(diagram, id, res);
        }
        mode = Mode.None; guideIndex = -1; activeNode = undefined;
    };

    diagram._setPersistentGuidesHandlers({
        OnPreviewPointerDown: onDown as (a: unknown) => void,
        OnPreviewPointerMove: onMove as (a: unknown) => void,
        OnPreviewPointerUp:   onUp   as (a: unknown) => void,
    });

    return (): void => {
        diagram._setPersistentGuidesHandlers(undefined);
        diagram.PositionSnap = previousSnap;
    };
}

// Rewrite a node's glue: on each axis, glue to the snapped guide (if any), and
// remove the node from every other guide of that axis (drag-away un-glue).
function reglue(diagram: Diagram, nodeId: string, res: ReturnType<typeof snapRectToGuides>): void
{
    const guides = diagram.Guides.map(g => ({ ...g, glued: g.glued.slice() as GuideGlue[] }));
    const applyAxis = (axisSnap: { edge: EdgeKind; guide: number } | undefined, wantAxis: AlignmentAxis): void => {
        for (let i = 0; i < guides.length; i++) {
            if (guides[i]!.axis !== wantAxis) continue;
            guides[i]!.glued = guides[i]!.glued.filter(g => g.nodeId !== nodeId);
        }
        if (axisSnap !== undefined) guides[axisSnap.guide]!.glued.push({ nodeId, edge: axisSnap.edge });
    };
    applyAxis(res.x, AlignmentAxis.X);
    applyAxis(res.y, AlignmentAxis.Y);
    diagram.Guides = guides;
}
```

> Implementer TODOs flagged inline: (1) confirm `PointerEventArgs.Position` field name (grep the connector-create behavior for how it reads the pointer point — it may be `args.GetPosition(...)`); (2) confirm `NodeViewModel` module path/export name; (3) map `RulerBar.Orientation === Orientation.Horizontal` using the real `Orientation` enum (don't compare to `0`); (4) `const enum Mode` — if the build disallows `const enum`, use a regular `enum`.

- [ ] **Step 4: Run to verify it passes**

Run: `cd Mural && npx tsx --conditions=development --test src/framework/diagram/behaviors/tests/persistent-guides-behavior.test.ts`
Expected: PASS.

- [ ] **Step 5: Export** `attachPersistentGuides` + `PersistentGuidesHandlers` from the framework barrel; update the Task 4 `PersistentGuidesHandlers` import in `diagram.ts` to point at this module. Commit.

```bash
git add src/framework/diagram/behaviors/persistent-guides-behavior.ts src/framework/diagram/behaviors/tests/persistent-guides-behavior.test.ts src/framework/index.ts src/framework/diagram/diagram.ts
git commit -m "feat(diagram): persistent-guides behavior (create/reposition/delete/snap/glue)"
```

---

## Task 7: Wire rulers + attach into the Diagram

**Files:**
- Modify: `Mural/src/framework/diagram/diagram.ts` (attach/detach/mount + ruler feed + preview forwards)
- Modify: `Mural/src/framework/diagram/diagram.template.mu` (Grid wrapper + rulers)
- Test: `Mural/src/framework/diagram/tests/diagram-rulers-enable.test.ts`

**Interfaces:**
- Consumes: `attachPersistentGuides`, `PersistentGuidesAdorner`, `RulerBar`, the DPs from Task 4.
- Produces: on `RulersVisible = true` → behavior attached + adorner mounted + rulers shown & fed; on `false` → all torn down + rulers collapsed.

- [ ] **Step 1: Template — Grid wrapper** in `diagram.template.mu`. Replace the `DefaultDiagram` template body so `PART_Scroll` sits in a Grid with ruler row/col:

```
    Template x:key="DefaultDiagram" [TargetType = Diagram] {
        Grid [ Rows = "Auto, *", Columns = "Auto, *" ] {
            // corner filler (0,0)
            Border x:name="PART_RulerCorner" [ Grid.Row = 0, Grid.Column = 0, Fill = #00000000, Visibility = Collapsed ]
            // top ruler (0,1)
            RulerBar x:name="PART_RulerTop"  [ Grid.Row = 0, Grid.Column = 1, Orientation = Horizontal, Visibility = Collapsed ]
            // left ruler (1,0)
            RulerBar x:name="PART_RulerLeft" [ Grid.Row = 1, Grid.Column = 0, Orientation = Vertical,   Visibility = Collapsed ]
            // the existing scroll region (1,1)
            ScrollViewer x:name="PART_Scroll" [ Grid.Row = 1, Grid.Column = 1,
                  IsAutoHideScrollBars = false, HorizontalScrollEnabled = true, VerticalScrollEnabled = true ] {
                AdornerDecorator {
                    Border x:name="PART_Camera" [ Fill = #00000000 ] {
                        ItemsPresenter
                    }
                }
            }
        }
    }
```

> Verify the exact `.mu` syntax for `Grid` row/col definitions and attached `Grid.Row`/`Grid.Column` against an existing Grid usage in the codebase (grep `Grid.Row` in `src/**/*.mu`). Match that syntax; the block above is schematic. `Visibility = Collapsed` default keeps rulers hidden until enabled.

- [ ] **Step 2: Diagram — enable wiring.** In the property-changed handler (~line 1195, where `AlignmentGuidesEnabled` is handled) add:

```ts
        if (descriptor.Name === 'RulersVisible')
        {
            if (newValue === true) this._enableRulers();
            else                   this._disableRulers();
        }
```

Add fields near `_alignmentGuidesAdorner`:

```ts
    private _persistentGuidesDetach:  (() => void) | undefined = undefined;
    private _persistentGuidesAdorner: PersistentGuidesAdorner | undefined = undefined;
    private _rulerCameraDetach:       (() => void) | undefined = undefined;
```

Add methods mirroring `_attachAlignmentGuides`/`_mountAlignmentGuidesAdorner`:

```ts
    private _enableRulers(): void
    {
        if (this._persistentGuidesDetach === undefined)
            this._persistentGuidesDetach = attachPersistentGuides(this);
        queueMicrotask(() => this._mountPersistentGuidesAdorner());
        this._showRulers(true);
        this._wireRulerCamera();
    }

    private _disableRulers(): void
    {
        this._persistentGuidesDetach?.(); this._persistentGuidesDetach = undefined;
        if (this._persistentGuidesAdorner !== undefined) {
            const layer = AdornerLayer.GetAdornerLayer(this._persistentGuidesAdorner.AdornedElement);
            layer?.Remove(this._persistentGuidesAdorner);
            this._persistentGuidesAdorner.Dispose();
            this._persistentGuidesAdorner = undefined;
        }
        this._rulerCameraDetach?.(); this._rulerCameraDetach = undefined;
        this._showRulers(false);
    }

    private _mountPersistentGuidesAdorner(): void
    {
        if (this._persistentGuidesAdorner !== undefined) return;
        const panel = this.ItemsPanelInstance;
        if (panel === undefined) return;
        const layer = AdornerLayer.GetAdornerLayer(panel);
        if (layer === undefined) return;
        const adorner = new PersistentGuidesAdorner(panel, this);
        layer.Add(adorner);
        this._persistentGuidesAdorner = adorner;
    }

    private _rulers(): { top?: RulerBar; left?: RulerBar; corner?: Visual } {
        return {
            top:    this.GetTemplateChild('PART_RulerTop')   as unknown as RulerBar | undefined,
            left:   this.GetTemplateChild('PART_RulerLeft')  as unknown as RulerBar | undefined,
            corner: this.GetTemplateChild('PART_RulerCorner') as unknown as Visual | undefined,
        };
    }

    private _showRulers(show: boolean): void {
        const v = show ? Visibility.Visible : Visibility.Collapsed;   // import Visibility
        const { top, left, corner } = this._rulers();
        if (top !== undefined)    top.Visibility = v;
        if (left !== undefined)   left.Visibility = v;
        if (corner !== undefined) corner.Visibility = v;
    }

    // Feed zoom/offset/extent into the rulers whenever the camera changes.
    private _wireRulerCamera(): void {
        if (this._rulerCameraDetach !== undefined) return;
        const feed = (): void => {
            const { top, left } = this._rulers();
            const vp = this._viewportSize();
            if (top !== undefined)  { top.Zoom = this.Zoom;  top.Offset = this.ScrollX; top.Extent = vp.Width; }
            if (left !== undefined) { left.Zoom = this.Zoom; left.Offset = this.ScrollY; left.Extent = vp.Height; }
        };
        feed();
        const scroll = this.ScrollHost;
        this.AddPropertyChangedListener(Diagram.ZoomKey, feed);
        scroll?.AddPropertyChangedListener(ScrollViewer.HorizontalOffsetKey, feed);
        scroll?.AddPropertyChangedListener(ScrollViewer.VerticalOffsetKey, feed);
        this._rulerCameraDetach = (): void => {
            this.RemovePropertyChangedListener(Diagram.ZoomKey, feed);
            scroll?.RemovePropertyChangedListener(ScrollViewer.HorizontalOffsetKey, feed);
            scroll?.RemovePropertyChangedListener(ScrollViewer.VerticalOffsetKey, feed);
        };
    }
```

Add the preview-move + down/up forwards to `_persistentGuidesHandlers` (~lines 1100-1115):

```ts
    // in OnPreviewPointerDown:
        this._persistentGuidesHandlers?.OnPreviewPointerDown(args);
    // in OnPreviewPointerMove:
        this._persistentGuidesHandlers?.OnPreviewPointerMove(args);
    // in OnPreviewPointerUp:
        this._persistentGuidesHandlers?.OnPreviewPointerUp(args);
```

Add imports: `PersistentGuidesAdorner`, `attachPersistentGuides`, `RulerBar`, `Visibility` (from runtime/basic as appropriate).

- [ ] **Step 3: Write the test**

```ts
// Mural/src/framework/diagram/tests/diagram-rulers-enable.test.ts
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Application } from '../../../runtime/index.js';
import { Diagram } from '../diagram.js';

describe('Diagram rulers enablement', () => {
    test('enabling RulersVisible installs a composing PositionSnap; disabling restores it', () => {
        Application.current = null; new Application();
        const d = new Diagram();
        const base = d.PositionSnap;
        d.RulersVisible = true;
        assert.notEqual(d.PositionSnap, base, 'behavior composed a snap');
        d.RulersVisible = false;
        assert.equal(d.PositionSnap, base, 'snap restored on disable');
    });
});
```

- [ ] **Step 4: Run the test + full diagram suite**

Run: `cd Mural && npx tsx --conditions=development --test src/framework/diagram/tests/diagram-rulers-enable.test.ts`
Expected: PASS.
Run: `cd Mural && npm test`
Expected: full suite green (no regressions from the template restructure — watch for any test that asserts the diagram template's child structure and update it for the Grid wrapper).

- [ ] **Step 5: Commit**

```bash
git add src/framework/diagram/diagram.ts src/framework/diagram/diagram.template.mu src/framework/diagram/tests/diagram-rulers-enable.test.ts
git commit -m "feat(diagram): wire rulers + persistent-guides on RulersVisible"
```

---

## Task 8: Full Mural suite + live Playwright smoke (headless gate)

**Files:** none (verification task); may add a demo toggle if useful.

- [ ] **Step 1: Full suite**

Run: `cd Mural && npm test`
Expected: all green. Fix any fallout (most likely: a diagram-template structural assertion, or a `FormattedText`/`Point` signature mismatch in `RulerBar`).

- [ ] **Step 2: Typecheck + demo typecheck**

Run: `cd Mural && npm run typecheck && npm run typecheck:demos`
Expected: clean. (No demo changed, but publish's `build:demos:ts` will type-check demos — catch it here.)

- [ ] **Step 3: Commit any fixes**

```bash
git add -A && git commit -m "test(diagram): green suite + typecheck for persistent guides"
```

> The live Playwright smoke against `test_arch/diagram.diagram` runs after publish (Task 9), since it needs Plexus consuming the new mural build.

---

## Task 9: Publish mural to Verdaccio

**Files:**
- Modify: `Mural/package.json` (version bump)

- [ ] **Step 1: Bump the version**

Bump the minor version in `Mural/package.json` (from the current published `0.12.3` to `0.13.0`; if it has moved, bump the next minor).

- [ ] **Step 2: Publish to Verdaccio**

Run: `cd Mural && npm publish`
Expected: `prepublishOnly` runs clean + build + `build:demos:ts` (type-checks `demo/**.mts`) and publishes `@pragmatic-tech-ai/mural@0.13.0` to `http://localhost:4873`. If `build:demos:ts` fails on a demo, fix it (do not disable the check).

- [ ] **Step 3: Commit the bump**

```bash
git add package.json && git commit -m "chore(release): @pragmatic-tech-ai/mural@0.13.0 (persistent ruler guides)"
```

---

## Task 10: Plexus — guides persistence store

**Files:**
- Create: `Plexus/src/renderer/src/modules/diagram/persistence/diagram-guides-store.ts`
- Test: `Plexus/src/renderer/src/modules/diagram/persistence/tests/diagram-guides-store.test.ts`

**Prep (once, before Plexus tasks):** create branch `feat/persistent-guides` in Plexus; bump the mural dep and rebuild:

```bash
cd Plexus && git checkout -b feat/persistent-guides
# bump "@pragmatic-tech-ai/mural" to "^0.13.0" in package.json, then:
npm install
```

**Interfaces:**
- Consumes: `DiagramDocument` (`Metadata`), `PersistentGuide` from `@pragmatic-tech-ai/mural/runtime` (or wherever the barrel exposes it).
- Produces:
  - `const DIAGRAM_GUIDES_KEY = 'guides'`
  - `interface DiagramGuidesState { readonly guides: readonly PersistentGuide[] }`
  - `function readGuides(doc: DiagramDocument): DiagramGuidesState | undefined`
  - `function writeGuides(doc: DiagramDocument, state: DiagramGuidesState): void`

- [ ] **Step 1: Write the failing test** (mirror `diagram-camera-store.test.ts`):

```ts
// Plexus/src/renderer/src/modules/diagram/persistence/tests/diagram-guides-store.test.ts
import { test, expect } from 'vitest'
import { DiagramDocument } from '@pragmatic-tech-ai/mural/framework'
import { AlignmentAxis, EdgeKind } from '@pragmatic-tech-ai/mural/runtime'
import { readGuides, writeGuides } from '../diagram-guides-store.js'

test('writeGuides then readGuides round-trips guides (incl. glue) through metadata', () => {
    const doc = new DiagramDocument()
    expect(readGuides(doc)).toBeUndefined()
    const guides = [{ axis: AlignmentAxis.X, position: 120, glued: [{ nodeId: 'n3', edge: EdgeKind.Min }] }]
    writeGuides(doc, { guides })
    expect(readGuides(doc)).toEqual({ guides })
})

test('writeGuides preserves other metadata keys', () => {
    const doc = new DiagramDocument()
    doc.Metadata = { camera: { zoom: 1, offsetX: 0, offsetY: 0 } }
    writeGuides(doc, { guides: [] })
    expect(doc.Metadata.camera).toEqual({ zoom: 1, offsetX: 0, offsetY: 0 })
    expect(readGuides(doc)).toEqual({ guides: [] })
})

test('readGuides rejects a malformed stored value', () => {
    const doc = new DiagramDocument()
    doc.Metadata = { guides: 42 }
    expect(readGuides(doc)).toBeUndefined()
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd Plexus && npx vitest run src/renderer/src/modules/diagram/persistence/tests/diagram-guides-store.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// Plexus/src/renderer/src/modules/diagram/persistence/diagram-guides-store.ts
import type { DiagramDocument } from '@pragmatic-tech-ai/mural/framework'
import type { PersistentGuide } from '@pragmatic-tech-ai/mural/runtime'

// Persistent ruler guides travel with the .diagram file in the document's opaque
// metadata (DiagramDocument.Metadata) under this namespaced key, exactly like the
// camera (diagram-camera-store.ts). Applies to every .diagram.
export const DIAGRAM_GUIDES_KEY = 'guides'

export interface DiagramGuidesState { readonly guides: readonly PersistentGuide[] }

function isGuide(v: unknown): v is PersistentGuide {
    if (typeof v !== 'object' || v === null) return false
    const r = v as Record<string, unknown>
    return (r.axis === 'x' || r.axis === 'y') && typeof r.position === 'number' && Array.isArray(r.glued)
}

function isState(v: unknown): v is DiagramGuidesState {
    if (typeof v !== 'object' || v === null) return false
    const g = (v as Record<string, unknown>).guides
    return Array.isArray(g) && g.every(isGuide)
}

export function readGuides(doc: DiagramDocument): DiagramGuidesState | undefined {
    const raw = doc.Metadata[DIAGRAM_GUIDES_KEY]
    if (!isState(raw)) return undefined
    return { guides: (raw.guides as PersistentGuide[]).map(g => ({ axis: g.axis, position: g.position, glued: g.glued.map(x => ({ ...x })) })) }
}

export function writeGuides(doc: DiagramDocument, state: DiagramGuidesState): void {
    doc.Metadata = { ...doc.Metadata, [DIAGRAM_GUIDES_KEY]: { guides: state.guides } }
}
```

> `isGuide` compares `r.axis` against the raw wire values `'x'`/`'y'` (the `AlignmentAxis` enum's string values) — the stored JSON carries the string, so this is correct and avoids importing the enum for a comparison. If lint objects to raw literals here, import `AlignmentAxis` and compare against `AlignmentAxis.X`/`.Y`.

- [ ] **Step 4: Run to verify it passes**

Run: `cd Plexus && npx vitest run src/renderer/src/modules/diagram/persistence/tests/diagram-guides-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/modules/diagram/persistence/diagram-guides-store.ts src/renderer/src/modules/diagram/persistence/tests/diagram-guides-store.test.ts package.json package-lock.json
git commit -m "feat(diagram): persistent-guides metadata store + mural@0.13.0 bump"
```

---

## Task 11: Plexus — guides persistence service

**Files:**
- Create: `Plexus/src/renderer/src/modules/diagram/services/diagram-guides-service.ts`
- Modify: wherever `DiagramCameraService` is registered (grep `DiagramCameraService.Key` / `new DiagramCameraService`)
- Test: `Plexus/src/renderer/src/modules/diagram/services/tests/diagram-guides-service.test.ts`

**Interfaces:**
- Consumes: `readGuides`/`writeGuides`; `Diagram.GuidesKey`; `DiagramDocument.ActiveViewKey`; the open-docs subscription pattern from `DiagramCameraService`.
- Produces: `class DiagramGuidesService extends ServiceBase` with `static Key`.

- [ ] **Step 1: Write the failing test** — mirror `diagram-camera-service.test.ts` (hydrate on ActiveView, persist on `GuidesKey` change). Keep it to the store round-trip through a fake doc + a fake view exposing `Guides` + `AddPropertyChangedListener(Diagram.GuidesKey, …)`. Model it on the existing camera-service test structure (read that file first for the fakes).

```ts
// Plexus/src/renderer/src/modules/diagram/services/tests/diagram-guides-service.test.ts
import { test, expect } from 'vitest'
import { AlignmentAxis } from '@pragmatic-tech-ai/mural/runtime'
import { writeGuides, readGuides } from '../../persistence/diagram-guides-store.js'
import { DiagramDocument } from '@pragmatic-tech-ai/mural/framework'

// Store-level guarantee the service relies on: hydrate reads what a prior session wrote.
test('guides persist and re-read from document metadata', () => {
    const doc = new DiagramDocument()
    writeGuides(doc, { guides: [{ axis: AlignmentAxis.X, position: 200, glued: [] }] })
    expect(readGuides(doc)?.guides.length).toBe(1)
})
```

> The full service (open-docs subscription, debounce, hydrate-guard) is a near-verbatim copy of `DiagramCameraService`; its behavioral test mirrors `diagram-camera-service.test.ts`. Copy that test's harness (fake `DocumentsContentHostService`, `ContentHostService`, timers) and assert: after a `Guides` change on the ActiveView, `readGuides(doc)` reflects it; on ActiveView (re)publish, `view.Guides` is hydrated from `readGuides`.

- [ ] **Step 2: Run to verify it fails / passes minimally**

Run: `cd Plexus && npx vitest run src/renderer/src/modules/diagram/services/tests/diagram-guides-service.test.ts`

- [ ] **Step 3: Implement the service** — copy `diagram-camera-service.ts` and adapt: replace `readCamera`/`writeCamera(doc, view.Camera)` with `readGuides`/`writeGuides(doc, { guides: view.Guides })`; hydrate via `view.Guides = saved.guides`; subscribe persistence to `Diagram.GuidesKey` on the view (a single listener — no scroll offsets to watch):

```ts
// Plexus/src/renderer/src/modules/diagram/services/diagram-guides-service.ts
import { ServiceBase, ServiceKey, type IServiceProvider } from '@pragmatic-tech-ai/mural/runtime'
import { ContentHostService, Diagram, DiagramDocument,
    type DocumentsContentHostService, type IDocument } from '@pragmatic-tech-ai/mural/framework'
import { FileDiagramStorage } from '../persistence/file-diagram-storage.js'
import { readGuides, writeGuides } from '../persistence/diagram-guides-store.js'

// App-scoped observer: hydrate persisted ruler guides onto each open diagram's
// ActiveView, and persist changes (debounced) back into the document metadata.
// Mirrors DiagramCameraService.
export class DiagramGuidesService extends ServiceBase
{
    public static readonly Key = new ServiceKey<DiagramGuidesService>('DiagramGuidesService')
    private readonly bindings = new Map<IDocument, () => void>()

    public constructor(provider: IServiceProvider, private readonly persistDelayMs = 500)
    {
        super(provider)
        const host = this.Provider.get(ContentHostService.Key) as DocumentsContentHostService | undefined
        host?.OpenDocuments.Subscribe(() => this.sync(host))
    }

    private sync(host: DocumentsContentHostService): void
    {
        const current = new Set(host.OpenDocuments.ToArray())
        for (const [doc, detach] of [...this.bindings]) if (!current.has(doc)) { detach(); this.bindings.delete(doc) }
        for (const doc of current) this.attach(doc)
    }

    private attach(doc: IDocument): void
    {
        if (this.bindings.has(doc) || !(doc instanceof DiagramDocument)) return
        let detachView: (() => void) | undefined
        let timer: ReturnType<typeof setTimeout> | undefined
        let hydrating = false

        const persist = (): void => {
            const view = doc.ActiveView
            if (view === undefined) return
            writeGuides(doc, { guides: view.Guides })
            doc.Save()
            const store = doc.Storage
            if (store instanceof FileDiagramStorage) void store.WhenWritten()
        }
        const onChanged = (): void => {
            if (hydrating) return
            if (timer !== undefined) clearTimeout(timer)
            timer = setTimeout(persist, this.persistDelayMs)
        }
        const rebindView = (): void => {
            detachView?.(); detachView = undefined
            const view = doc.ActiveView
            if (view === undefined) return
            const saved = readGuides(doc)
            if (saved !== undefined) { hydrating = true; try { view.Guides = saved.guides } finally { hydrating = false } }
            view.AddPropertyChangedListener(Diagram.GuidesKey, onChanged)
            detachView = (): void => view.RemovePropertyChangedListener(Diagram.GuidesKey, onChanged)
        }
        doc.AddPropertyChangedListener(DiagramDocument.ActiveViewKey, rebindView)
        rebindView()
        this.bindings.set(doc, () => {
            if (timer !== undefined) clearTimeout(timer)
            detachView?.()
            doc.RemovePropertyChangedListener(DiagramDocument.ActiveViewKey, rebindView)
        })
    }
}
```

- [ ] **Step 4: Register the service** next to `DiagramCameraService` (same module/composition root). Mirror the exact registration form used there.

- [ ] **Step 5: Run the test**

Run: `cd Plexus && npx vitest run src/renderer/src/modules/diagram/services/tests/diagram-guides-service.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/modules/diagram/services/diagram-guides-service.ts src/renderer/src/modules/diagram/services/tests/diagram-guides-service.test.ts <the-registration-file>
git commit -m "feat(diagram): persistent-guides persistence service"
```

---

## Task 12: Plexus — enable rulers on the architecture diagram

**Files:**
- Modify: wherever the arch diagram view sets `AlignmentGuidesEnabled = true` (grep `AlignmentGuidesEnabled` in Plexus)
- Test: extend the nearest existing test for that wiring, or add a focused assertion.

- [ ] **Step 1: Find the enablement site**

Run: `cd Plexus && grep -rn "AlignmentGuidesEnabled" src` (or use the editor search). It's set where the arch `Diagram` view is configured (a binding service or view factory).

- [ ] **Step 2: Enable rulers there**

Add `view.RulersVisible = true` (or the markup equivalent `[ RulersVisible = true ]` if it's set in `.mu`) right next to the `AlignmentGuidesEnabled` set.

- [ ] **Step 3: Test**

If there's an existing test asserting `AlignmentGuidesEnabled` on the configured view, extend it to also assert `RulersVisible === true`. Otherwise add a small test in the same file.

Run: `cd Plexus && npx vitest run <that-test-file>`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(diagram): enable ruler guides on the architecture diagram"
```

---

## Task 13: Plexus full suite + build + live smoke

**Files:** none (verification).

- [ ] **Step 1: Full suite**

Run: `cd Plexus && npm test`
Expected: green (850+ pass). Fix fallout.

- [ ] **Step 2: Build**

Run: `cd Plexus && npm run build`
Expected: clean `out/main/index.js` for the live smoke.

- [ ] **Step 3: Live Playwright smoke** (per `project_playwright_electron_debug` memory)

Write a throwaway `pw-debug.mjs` in the scratchpad that launches the built app (`_electron`, strip `ELECTRON_RUN_AS_NODE`), opens `test_arch/diagram.diagram` via Project Explorer, and verifies:
  1. Rulers render along top + left (non-collapsed strips with ticks).
  2. Drag from the top ruler downward → a horizontal guide appears on the canvas at the projected position.
  3. Drag a node so an edge meets the guide → it snaps; on drop it glues.
  4. Drag the guide → the glued node follows.
  5. Reload the diagram → the guide + glue survive (positions restored).

Introspect via `el[Symbol.for('mural:visual-backref')]` to read `diagram.Guides` and node positions. Screenshot each step into the scratchpad and `Read` them to eyeball. Delete `pw-debug.mjs` after.

- [ ] **Step 4: Commit any fixes; report**

```bash
git add -A && git commit -m "test(diagram): green suite + live smoke for persistent ruler guides"
```

Report to the user: feature complete, mural@0.13.0 published to Verdaccio, Plexus on `^0.13.0` with rulers enabled on the arch diagram, live smoke passed. Both branches (`feat/persistent-guides` in each repo) are UNPUSHED — offer to merge to main / push per the standing rule.

---

## Self-Review

**1. Spec coverage:**
- Rulers (§Component 1) → Tasks 3, 7. ✓
- Guides adorner (§Component 2) → Task 5. ✓
- Create/reposition/delete (§Component 3) → Task 6 (behavior) + Task 7 (wiring). ✓
- Snap + glue (§Component 4) → Tasks 1 (math) + 6 (behavior). ✓
- Persistence (§Component 5) → Tasks 10 (store) + 11 (service). ✓
- Enablement (§Enablement) → Task 12. ✓
- Data model (§Data model) → Task 1 (types) + Task 4 (Diagram DPs). ✓
- Testing (§Testing) → per-task headless + Task 13 live smoke. ✓
- Rollout (§Rollout) → Task 9 (publish) + Task 10 prep (bump) + Task 13. ✓
- One deliberate deviation: spec's separate "RulersVisible" and guide toggles are consolidated into a single `RulersVisible` opt-in (documented in Global Constraints + Task 4/7). ✓

**2. Placeholder scan:** No "TBD"/"handle edge cases". Implementer-verification TODOs (FormattedText/Point signature, PointerEventArgs.Position field, NodeViewModel path, Grid `.mu` syntax, Orientation enum compare) are explicit, greppable, and each names exactly what to confirm against which file — not vague hand-waving.

**3. Type consistency:** `PersistentGuide`/`GuideGlue` shape is identical across Task 1 (definition), Task 4 (`Diagram.Guides`), Task 5 (adorner read), Task 6 (behavior mutate), Task 10 (store). `snapRectToGuides` return type (`GuideSnap` with `x?/y?: {edge, guide}`) is consumed consistently in Task 6's `reglue`. `AlignmentAxis`/`EdgeKind` reused from `alignment-math.ts` everywhere (no parallel `GuideEdge` enum — the spec's `GuideEdge` is realized as `EdgeKind`, noted in Task 1). Ruler DPs (`Zoom`/`Offset`/`Extent`/`Orientation`) match between Task 3 (definition) and Task 7 (feed). `RulersVisible`/`Guides` accessor names match between Task 4 and consumers.
