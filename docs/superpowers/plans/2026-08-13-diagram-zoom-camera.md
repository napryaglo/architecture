# Diagram Zoom & Camera (SP1 — mural) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the mural `Diagram` a zoomable, infinite-canvas camera (10–400%) with constant-size selection handles, a full set of zoom interactions, Fit / Fit-to-Selection, and camera state exposed for the host to persist.

**Architecture:** Diagram content renders under a camera `RenderTransform` (scale + translate) on a `PART_Camera` host spliced between a scroll-neutralized `ScrollViewer` and the `ItemsPresenter`. Rendering and DOM-native hit-testing are transform-transparent, so they work under zoom for free. Selection handles stay constant-size because the `AdornerDecorator` sits *outside* `PART_Camera` and the adorner layer is taught to compose ancestor render transforms when positioning adorners. Gestures (a `ZoomPanBehavior`) and commands (buttons/keyboard) drive the camera DPs.

**Tech Stack:** TypeScript, mural framework (`node:test`), `.mu` markup compiled by the mural CLI. Published to local Verdaccio.

## Global Constraints

- **Test location:** every test file lives in a `tests/` subfolder next to the code it exercises (e.g. `src/framework/diagram/tests/…`), never beside the source.
- **Enums over string-literal unions:** any fixed set of named string values is a real `enum` (PascalCase members, explicit string values), never a union type or bare literals. Markup-facing enums also register in `src/compiler/symbol-table.ts` (`ENUM_MEMBERS` + `DEFAULT_SYMBOLS`).
- **Default Style rule:** every UI-facing control has a default `Style` in a `*.template.mu`. Pure layout containers (a bare `Single`/`Border` decorator used only in a template, like `AdornerDecorator`) are exempt.
- **DP pattern:** `Model.RegisterProperty<T>(Owner, 'Name', default, MetaData.X)` (or `RegisterReadOnlyProperty`) + `get_property_value`/`set_property_value` accessors.
- **Camera semantics:** screen = content · Zoom + Pan. Interactive zoom clamps to **[0.1, 4.0]**; Fit may scale to a hard floor of **0.02** to frame huge diagrams. Identity default (Zoom 1, Pan 0).
- **No LayoutTransform** exists in mural — the camera is pure `RenderTransform`; never rely on it changing measured extent.
- **Commit** after each task with a green suite.

## File Structure

- `src/framework/diagram/camera.ts` — **NEW.** Pure camera value + math: the `Camera` type, `cameraMatrix`, `zoomAtPoint`, `fitBounds`. No mural-visual imports.
- `src/framework/diagram/tests/camera.test.ts` — **NEW.** Unit tests for camera math.
- `src/framework/diagram/diagram.ts` — **MODIFY.** Camera DPs, `PART_Camera` wiring, zoom commands, camera handler slots + `OnPointerWheel` override, `CameraEnabled` gating.
- `src/framework/diagram/diagram.template.mu` — **MODIFY.** `DefaultDiagram` gains `PART_Camera` + scroll-neutralized `ScrollViewer`; add the zoom-control overlay.
- `src/framework/diagram/behaviors/zoom-pan-behavior.ts` — **NEW.** `attachZoomPan(diagram)`: wheel-zoom/pan + grab-pan.
- `src/framework/diagram/tests/zoom-pan-behavior.test.ts` — **NEW.** Handler-level tests.
- `src/visual-engine/adorner.ts` — **MODIFY.** `computeAdornedRectInLayerFrame` composes ancestor `RenderTransform`s.
- `src/runtime/tests/adorner.test.ts` — **MODIFY.** Add transform-projection + identity-no-op tests.
- `src/framework/diagram/connector.ts` — **MODIFY.** Track camera zoom → `HitTestStrokeWidth = base / zoom`.
- `src/framework/diagram/tests/diagram-camera.test.ts` — **NEW.** DP/command/PART wiring + connector hit-band tests.

---

### Task 1: Camera value type + math (`camera.ts`)

**Files:**
- Create: `src/framework/diagram/camera.ts`
- Test: `src/framework/diagram/tests/camera.test.ts`

**Interfaces:**
- Consumes: `Matrix` from `../../visual-engine/primitives.js` (`Matrix.Scale(sx,sy)`, `Matrix.Translate(dx,dy)`, `m.Multiply(other)` — leftmost applies first, `m.Transform(point)`, `m.Invert(): Matrix | undefined`), `Point`, `Rect`, `Size` from the same module.
- Produces:
  - `interface Camera { readonly zoom: number; readonly panX: number; readonly panY: number }`
  - `const CAMERA_MIN = 0.1`, `CAMERA_MAX = 4.0`, `CAMERA_FIT_FLOOR = 0.02`
  - `function cameraMatrix(c: Camera): Matrix`
  - `function clampZoom(z: number): number`
  - `function zoomAtPoint(c: Camera, pivot: Point, factor: number): Camera`
  - `function fitBounds(content: Rect, viewport: Size, padding: number): Camera`

- [ ] **Step 1: Write the failing test**

```ts
// src/framework/diagram/tests/camera.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Point, Rect, Size } from '../../../visual-engine/primitives.js';
import { cameraMatrix, zoomAtPoint, fitBounds, clampZoom, CAMERA_MIN, CAMERA_MAX } from '../camera.js';

test('cameraMatrix maps content->screen as content*zoom + pan', () => {
    const m = cameraMatrix({ zoom: 2, panX: 30, panY: 50 });
    const s = m.Transform(new Point(10, 10));
    assert.equal(s.X, 10 * 2 + 30);
    assert.equal(s.Y, 10 * 2 + 50);
});

test('zoomAtPoint keeps the content point under the pivot fixed', () => {
    const before = { zoom: 1, panX: 0, panY: 0 };
    const pivot = new Point(100, 80);
    const after = zoomAtPoint(before, pivot, 2);
    // The screen point that was at `pivot` must still be at `pivot`.
    const s = cameraMatrix(after).Transform(
        cameraMatrix(before).Invert()!.Transform(pivot));
    assert.ok(Math.abs(s.X - pivot.X) < 1e-9);
    assert.ok(Math.abs(s.Y - pivot.Y) < 1e-9);
    assert.equal(after.zoom, 2);
});

test('zoomAtPoint clamps zoom to the interactive range', () => {
    assert.equal(zoomAtPoint({ zoom: CAMERA_MAX, panX: 0, panY: 0 }, new Point(0, 0), 2).zoom, CAMERA_MAX);
    assert.equal(zoomAtPoint({ zoom: CAMERA_MIN, panX: 0, panY: 0 }, new Point(0, 0), 0.5).zoom, CAMERA_MIN);
    assert.equal(clampZoom(99), CAMERA_MAX);
});

test('fitBounds centers content in the viewport with padding', () => {
    // 100x100 content, 500x300 viewport, 20 padding.
    const c = fitBounds(new Rect(0, 0, 100, 100), new Size(500, 300), 20);
    // limiting axis is height: (300-40)/100 = 2.6
    assert.ok(Math.abs(c.zoom - 2.6) < 1e-9);
    // content center (50,50)*2.6 + pan == viewport center (250,150)
    const center = cameraMatrix(c).Transform(new Point(50, 50));
    assert.ok(Math.abs(center.X - 250) < 1e-9);
    assert.ok(Math.abs(center.Y - 150) < 1e-9);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx tsx --test src/framework/diagram/tests/camera.test.ts` (or the repo's `node:test` runner)
Expected: FAIL — `camera.js` does not exist.

- [ ] **Step 3: Write the implementation**

```ts
// src/framework/diagram/camera.ts
import { Matrix, Point, Rect, Size } from '../../visual-engine/primitives.js';

// The diagram camera: content maps to screen as `screen = content * zoom + pan`.
// Pan is in screen pixels (post-scale). Pure value + math — no mural-visual deps.
export interface Camera { readonly zoom: number; readonly panX: number; readonly panY: number; }

export const CAMERA_MIN = 0.1;         // interactive zoom-out floor (10%)
export const CAMERA_MAX = 4.0;         // interactive zoom-in ceiling (400%)
export const CAMERA_FIT_FLOOR = 0.02;  // Fit may go this low to frame huge diagrams

export function clampZoom(z: number): number { return Math.max(CAMERA_MIN, Math.min(CAMERA_MAX, z)); }

// Scale first, then translate (leftmost Multiply factor applies first to a point).
export function cameraMatrix(c: Camera): Matrix {
    return Matrix.Scale(c.zoom, c.zoom).Multiply(Matrix.Translate(c.panX, c.panY));
}

// Zoom by `factor` about `pivot` (a screen point), keeping the content under the
// pivot fixed. Clamped to the interactive range.
export function zoomAtPoint(c: Camera, pivot: Point, factor: number): Camera {
    const zoom = clampZoom(c.zoom * factor);
    // content point currently under the pivot: (pivot - pan) / zoom
    const cx = (pivot.X - c.panX) / c.zoom;
    const cy = (pivot.Y - c.panY) / c.zoom;
    // choose pan so that same content point maps back to the pivot at the new zoom
    return { zoom, panX: pivot.X - cx * zoom, panY: pivot.Y - cy * zoom };
}

// Frame `content` (content-space rect) centered in `viewport` with `padding`
// pixels of inset. Zoom clamped to [CAMERA_FIT_FLOOR, CAMERA_MAX].
export function fitBounds(content: Rect, viewport: Size, padding: number): Camera {
    const availW = Math.max(1, viewport.Width - padding * 2);
    const availH = Math.max(1, viewport.Height - padding * 2);
    const w = Math.max(1, content.Width);
    const h = Math.max(1, content.Height);
    const zoom = Math.max(CAMERA_FIT_FLOOR, Math.min(CAMERA_MAX, Math.min(availW / w, availH / h)));
    const contentCx = content.X + content.Width / 2;
    const contentCy = content.Y + content.Height / 2;
    return {
        zoom,
        panX: viewport.Width / 2 - contentCx * zoom,
        panY: viewport.Height / 2 - contentCy * zoom,
    };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx tsx --test src/framework/diagram/tests/camera.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/framework/diagram/camera.ts src/framework/diagram/tests/camera.test.ts
git commit -m "feat(diagram): camera value type + zoom/fit math"
```

---

### Task 2: Transform-aware adorner layer (`adorner.ts`)

**Files:**
- Modify: `src/visual-engine/adorner.ts` (`AdornerLayer.computeAdornedRectInLayerFrame`, ~L162-193)
- Test: `src/runtime/tests/adorner.test.ts` (add two tests)

**Interfaces:**
- Consumes: `Visual.RenderTransform: Transform | undefined`, `Visual.ArrangedRect: Rect`, `Visual.RenderSize: Size`, `Visual.RenderTransformOrigin: Point`, `Visual.GetVisualParent()`, `Matrix` (`Matrix.Identity`, `Matrix.Translate`, `m.Multiply`, `m.Transform`), `Rect`, `Point`.
- Produces: unchanged public signature of `computeAdornedRectInLayerFrame`; now composes ancestor `RenderTransform`s so adorners track transformed elements. Identity transforms are a no-op (backward compatible).

- [ ] **Step 1: Write the failing tests** (append to `src/runtime/tests/adorner.test.ts`, reusing its `layout`/`TestAdorner` helpers; add imports for `ScaleTransform`, `TranslateTransform`, `TransformGroup`, `Point`)

```ts
test('projects the adorned rect through an ancestor RenderTransform (scale+translate)', () => {
    const { decorator, canvas, squares } = layout({ x: 10, y: 20, side: 30 });
    // Put a 2x scale + (100,50) translate on the canvas (the adorned element's parent).
    const g = new TransformGroup();
    g.Children.Add(new ScaleTransform(2, 2));
    g.Children.Add(new TranslateTransform(100, 50));
    canvas.RenderTransform = g;

    const adorner = new TestAdorner(squares[0]!);
    decorator.AdornerLayer.Add(adorner);
    decorator.InvalidateMeasure();
    decorator.Measure(new Size(600, 600));
    decorator.Arrange(new Rect(0, 0, 600, 600));

    const r = adorner.ArrangedRect;
    // square top-left (10,20) -> *2 + (100,50) = (120, 90); size 30 -> 60.
    assert.equal(r.X, 120);
    assert.equal(r.Y, 90);
    assert.equal(r.Width, 60);
    assert.equal(r.Height, 60);
});

test('identity ancestor transform leaves the adorned rect unchanged (regression)', () => {
    const { decorator, squares } = layout({ x: 10, y: 20, side: 30 });
    const adorner = new TestAdorner(squares[0]!);
    decorator.AdornerLayer.Add(adorner);
    decorator.InvalidateMeasure();
    decorator.Measure(new Size(400, 400));
    decorator.Arrange(new Rect(0, 0, 400, 400));
    const r = adorner.ArrangedRect;
    assert.equal(r.X, 10);
    assert.equal(r.Y, 20);
    assert.equal(r.Width, 30);
    assert.equal(r.Height, 30);
});
```

*(If `TestAdorner.Placement` returns the adorned rect verbatim, these assert the projected rect directly. Confirm `TestAdorner` in the file returns `adornedRect` from `Placement`; if it clamps to `desiredSize`, give it a large desired size so the rect passes through.)*

- [ ] **Step 2: Run to verify failure**

Run: `npx tsx --test src/runtime/tests/adorner.test.ts`
Expected: FAIL — projection test sees `(10,20,30,30)` (offsets only, transform ignored).

- [ ] **Step 3: Implement — compose ancestor transforms**

Replace `computeAdornedRectInLayerFrame`:

```ts
private computeAdornedRectInLayerFrame(adorner: Adorner): Rect
{
    // Build the transform from the adorned element's local space up to the
    // layer parent's frame, composing each ancestor's ArrangedRect offset AND
    // its RenderTransform (with RenderTransformOrigin pivot) — matching the SVG
    // renderer's effective transform. Then map the adorned element's local rect
    // through it. Identity transforms compose to no-ops (backward compatible).
    const adorned = adorner.AdornedElement;
    const stop = this.GetVisualParent();
    let m = Matrix.Identity;
    let cur: Visual | undefined = adorned;
    while (cur !== undefined && cur !== stop)
    {
        const rect = cur.ArrangedRect;
        const rt = cur.RenderTransform;
        // local = pivot . matrix . -pivot, then offset by ArrangedRect (the
        // renderer applies translate(rect) OUTSIDE the render transform).
        let local = Matrix.Translate(rect.X, rect.Y);
        if (rt !== undefined && !rt.Matrix.IsIdentity)
        {
            const origin = cur.RenderTransformOrigin;
            const ox = origin.X * rect.Width;
            const oy = origin.Y * rect.Height;
            const withPivot = Matrix.Translate(-ox, -oy).Multiply(rt.Matrix).Multiply(Matrix.Translate(ox, oy));
            local = withPivot.Multiply(local);   // pivoted render transform, then the arrange offset
        }
        // accumulate child-first (leftmost applies first to a point)
        m = m.Multiply(local);
        cur = cur.GetVisualParent();
    }
    if (cur === undefined) return new Rect(0, 0, 0, 0);

    const rs = adorned.RenderSize;
    const p0 = m.Transform(new Point(0, 0));
    const p1 = m.Transform(new Point(rs.Width, 0));
    const p2 = m.Transform(new Point(0, rs.Height));
    const p3 = m.Transform(new Point(rs.Width, rs.Height));
    const minX = Math.min(p0.X, p1.X, p2.X, p3.X) - this.ArrangedRect.X;
    const minY = Math.min(p0.Y, p1.Y, p2.Y, p3.Y) - this.ArrangedRect.Y;
    const maxX = Math.max(p0.X, p1.X, p2.X, p3.X) - this.ArrangedRect.X;
    const maxY = Math.max(p0.Y, p1.Y, p2.Y, p3.Y) - this.ArrangedRect.Y;
    return new Rect(minX, minY, maxX - minX, maxY - minY);
}
```

Add imports at the top of `adorner.ts`: `Matrix`, `Point` from `./primitives.js` (already imports `Rect, Size`).

- [ ] **Step 4: Run to verify pass**

Run: `npx tsx --test src/runtime/tests/adorner.test.ts`
Expected: PASS — including all pre-existing adorner tests (identity no-op).

- [ ] **Step 5: Commit**

```bash
git add src/visual-engine/adorner.ts src/runtime/tests/adorner.test.ts
git commit -m "feat(adorner): compose ancestor RenderTransforms when positioning adorners"
```

---

### Task 3: Camera DPs + PART_Camera wiring + template (`diagram.ts`, `diagram.template.mu`)

**Files:**
- Modify: `src/framework/diagram/diagram.ts` (add DPs + camera transform wiring)
- Modify: `src/framework/diagram/diagram.template.mu` (`DefaultDiagram`)
- Test: `src/framework/diagram/tests/diagram-camera.test.ts` (NEW)

**Interfaces:**
- Consumes: `cameraMatrix` from `../camera.js`; `ScaleTransform`, `TranslateTransform`, `TransformGroup` from `../../visual-engine/drawing/transform.js`; `GetTemplateChild('PART_Camera')`.
- Produces on `Diagram`:
  - DPs `ZoomKey`/`Zoom: number` (default 1), `PanXKey`/`PanX: number` (0), `PanYKey`/`PanY: number` (0), all `MetaData.None`.
  - `get Camera(): Camera` / `SetCamera(c: Camera): void` (clamps zoom to interactive range).
  - Applies a `TransformGroup([Scale, Translate])` as `PART_Camera.RenderTransform`, updated on camera DP change.

- [ ] **Step 1: Write the failing test**

```ts
// src/framework/diagram/tests/diagram-camera.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Diagram } from '../diagram.js';

test('Diagram exposes an identity camera by default', () => {
    const d = new Diagram();
    assert.equal(d.Zoom, 1);
    assert.equal(d.PanX, 0);
    assert.equal(d.PanY, 0);
});

test('SetCamera clamps zoom to the interactive range and updates DPs', () => {
    const d = new Diagram();
    d.SetCamera({ zoom: 99, panX: 12, panY: 34 });
    assert.equal(d.Zoom, 4);      // CAMERA_MAX
    assert.equal(d.PanX, 12);
    assert.equal(d.PanY, 34);
});

test('camera DPs drive PART_Camera.RenderTransform matrix', () => {
    const d = new Diagram();
    d.SetCamera({ zoom: 2, panX: 30, panY: 50 });
    const host = (d as unknown as { GetTemplateChild(n: string): { RenderTransform?: { Matrix: { M11: number; OffsetX: number; OffsetY: number } } } | undefined })
        .GetTemplateChild('PART_Camera');
    const m = host?.RenderTransform?.Matrix;
    assert.ok(m !== undefined);
    assert.equal(m!.M11, 2);        // scale x
    assert.equal(m!.OffsetX, 30);   // pan x
    assert.equal(m!.OffsetY, 50);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx tsx --test src/framework/diagram/tests/diagram-camera.test.ts`
Expected: FAIL — `Zoom` undefined / no `PART_Camera`.

- [ ] **Step 3a: Rewrite the template** (`diagram.template.mu`, `DefaultDiagram`)

```
Template x:key="DefaultDiagram" [TargetType = Diagram] {
    ScrollViewer x:name="PART_Scroll"
        [ IsAutoHideScrollBars    = false,
          HorizontalScrollEnabled = false,   // scroll neutralized — the camera pans
          VerticalScrollEnabled   = false ] {
        AdornerDecorator {                     // OUTSIDE the camera -> constant-size adorners
            Border x:name="PART_Camera" [ Background = #00000000 ] {   // pure transform host
                ItemsPresenter
            }
        }
    }
}
```

- [ ] **Step 3b: Add camera DPs + wiring** (`diagram.ts`)

Register DPs near the other DP declarations:

```ts
public static readonly ZoomKey = Model.RegisterProperty<number>(Diagram, 'Zoom', 1, MetaData.None);
public static readonly PanXKey = Model.RegisterProperty<number>(Diagram, 'PanX', 0, MetaData.None);
public static readonly PanYKey = Model.RegisterProperty<number>(Diagram, 'PanY', 0, MetaData.None);
```

Accessors (with the other getters/setters):

```ts
public get Zoom(): number { return this.get_property_value(Diagram.ZoomKey); }
public set Zoom(v: number) { this.set_property_value(Diagram.ZoomKey, v); }
public get PanX(): number { return this.get_property_value(Diagram.PanXKey); }
public set PanX(v: number) { this.set_property_value(Diagram.PanXKey, v); }
public get PanY(): number { return this.get_property_value(Diagram.PanYKey); }
public set PanY(v: number) { this.set_property_value(Diagram.PanYKey, v); }

public get Camera(): Camera { return { zoom: this.Zoom, panX: this.PanX, panY: this.PanY }; }
public SetCamera(c: Camera): void {
    this.Zoom = clampZoom(c.zoom);
    this.PanX = c.panX;
    this.PanY = c.panY;
}
```

Private transform fields + lazy build (resolve `PART_Camera` on first camera write — the template is applied in the ctor):

```ts
private _camScale?: ScaleTransform;
private _camTranslate?: TranslateTransform;

private _ensureCameraTransform(): void {
    if (this._camScale !== undefined) return;
    const host = this.GetTemplateChild('PART_Camera');
    if (host === undefined) return;
    this._camScale = new ScaleTransform(this.Zoom, this.Zoom);
    this._camTranslate = new TranslateTransform(this.PanX, this.PanY);
    const group = new TransformGroup();
    group.Children.Add(this._camScale);        // scale first
    group.Children.Add(this._camTranslate);    // then translate
    host.RenderTransform = group;
}

private _syncCameraTransform(): void {
    this._ensureCameraTransform();
    if (this._camScale === undefined || this._camTranslate === undefined) return;
    this._camScale.ScaleX = this.Zoom;
    this._camScale.ScaleY = this.Zoom;
    this._camTranslate.X = this.PanX;
    this._camTranslate.Y = this.PanY;
}
```

In the existing `OnPropertyChanged(args)` override, react to camera keys:

```ts
if (args.Property === Diagram.ZoomKey || args.Property === Diagram.PanXKey || args.Property === Diagram.PanYKey) {
    this._syncCameraTransform();
}
```

Add imports: `import { Camera, clampZoom } from './camera.js';` and `import { ScaleTransform, TranslateTransform, TransformGroup } from '../../visual-engine/drawing/transform.js';`.

- [ ] **Step 4: Run to verify pass**

Run: `npx tsx --test src/framework/diagram/tests/diagram-camera.test.ts` then the diagram suite `npx tsx --test src/framework/diagram/tests/*.test.ts`.
Expected: PASS (3 new) + existing diagram tests still green.

- [ ] **Step 5: Commit**

```bash
git add src/framework/diagram/diagram.ts src/framework/diagram/diagram.template.mu src/framework/diagram/tests/diagram-camera.test.ts
git commit -m "feat(diagram): camera DPs driving a PART_Camera RenderTransform"
```

---

### Task 4: Zoom commands + Fit / Fit-to-Selection (`diagram.ts`)

**Files:**
- Modify: `src/framework/diagram/diagram.ts`
- Test: `src/framework/diagram/tests/diagram-camera.test.ts` (add)

**Interfaces:**
- Consumes: `fitBounds`, `zoomAtPoint`, `clampZoom` from `../camera.js`; `Rect`, `Size`, `Point`; `this.ItemsPanelInstance` (the items `Canvas`, whose `visualChildren` are the item containers with valid `ArrangedRect`s after layout); `PART_Scroll`'s `ViewportWidth`/`ViewportHeight` for the viewport size.
- Produces on `Diagram`:
  - `ZoomIn(): void`, `ZoomOut(): void`, `ResetZoom(): void`
  - `Fit(): void`, `FitToSelection(): void`
  - `contentBounds(onlySelected: boolean): Rect | undefined` (private helper)
  - `ZoomInCommand` / `ZoomOutCommand` / `ResetZoomCommand` / `FitCommand` / `FitToSelectionCommand` `ICommand` read-only DPs bound by the overlay + host keyboard.

- [ ] **Step 1: Write the failing test**

```ts
test('ZoomIn/ZoomOut step the zoom about the viewport center, clamped', () => {
    const d = new Diagram();
    d.SetCamera({ zoom: 1, panX: 0, panY: 0 });
    d.ZoomIn();
    assert.ok(d.Zoom > 1);
    d.ResetZoom();
    assert.equal(d.Zoom, 1);
    assert.equal(d.PanX, 0);
    assert.equal(d.PanY, 0);
});

test('Fit frames the content bounds into the viewport', () => {
    const d = new Diagram();
    // Stub content + viewport via the test seam (see Step 3): 100x100 content at
    // (0,0), 500x300 viewport, padding 24.
    (d as unknown as { _testContent(r: import('../../../visual-engine/primitives.js').Rect | undefined): void })
        ._testContent(new (require('../../../visual-engine/primitives.js').Rect)(0, 0, 100, 100));
    (d as unknown as { _testViewport(w: number, h: number): void })._testViewport(500, 300);
    d.Fit();
    assert.ok(Math.abs(d.Zoom - Math.min((500 - 48) / 100, (300 - 48) / 100)) < 1e-9);
});
```

*(The `_testContent` / `_testViewport` seams exist only to make bounds/viewport injectable in `node:test` where there is no live layout; production reads `ItemsPanelInstance` + `PART_Scroll`. Keep them `@internal`.)*

- [ ] **Step 2: Run to verify failure**

Run: `npx tsx --test src/framework/diagram/tests/diagram-camera.test.ts`
Expected: FAIL — `ZoomIn` undefined.

- [ ] **Step 3: Implement commands + bounds**

```ts
private static readonly ZOOM_STEP = 1.2;

private _viewportSize(): Size {
    if (this._testViewportSize !== undefined) return this._testViewportSize;
    const sv = this.GetTemplateChild('PART_Scroll') as { ViewportWidth?: number; ViewportHeight?: number } | undefined;
    return new Size(sv?.ViewportWidth ?? this.RenderSize.Width, sv?.ViewportHeight ?? this.RenderSize.Height);
}

// Union of item-container ArrangedRects (content space). onlySelected filters to
// the current selection. Undefined when there is nothing to frame.
private contentBounds(onlySelected: boolean): Rect | undefined {
    if (this._testContentBounds !== undefined) return this._testContentBounds;
    const panel = this.ItemsPanelInstance;
    if (panel === undefined) return undefined;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const child of panel.visualChildren) {
        if (onlySelected && (child as { IsSelected?: boolean }).IsSelected !== true) continue;
        const r = child.ArrangedRect;
        if (r.Width === 0 && r.Height === 0) continue;
        minX = Math.min(minX, r.X); minY = Math.min(minY, r.Y);
        maxX = Math.max(maxX, r.X + r.Width); maxY = Math.max(maxY, r.Y + r.Height);
    }
    if (!isFinite(minX)) return undefined;
    return new Rect(minX, minY, maxX - minX, maxY - minY);
}

private _centerPivot(): Point { const v = this._viewportSize(); return new Point(v.Width / 2, v.Height / 2); }

public ZoomIn(): void { this.SetCamera(zoomAtPoint(this.Camera, this._centerPivot(), Diagram.ZOOM_STEP)); }
public ZoomOut(): void { this.SetCamera(zoomAtPoint(this.Camera, this._centerPivot(), 1 / Diagram.ZOOM_STEP)); }
public ResetZoom(): void { this.SetCamera({ zoom: 1, panX: 0, panY: 0 }); }

public Fit(): void {
    const b = this.contentBounds(false);
    if (b !== undefined) this._applyFit(fitBounds(b, this._viewportSize(), 24));
}
public FitToSelection(): void {
    const b = this.contentBounds(true) ?? this.contentBounds(false);
    if (b !== undefined) this._applyFit(fitBounds(b, this._viewportSize(), 24));
}

// Fit can legitimately produce zoom below the interactive floor; bypass clampZoom.
private _applyFit(c: Camera): void { this.Zoom = c.zoom; this.PanX = c.panX; this.PanY = c.panY; }
```

Register the command DPs as read-only (`Model.RegisterReadOnlyProperty<ICommand>`), seed `RelayCommand`s in the ctor pointing at the methods, and expose getters (`ZoomInCommand`, etc.). Add `_testContentBounds`/`_testViewportSize` private fields + `_testContent`/`_testViewport` setters marked `@internal`.

- [ ] **Step 4: Run to verify pass**

Run: `npx tsx --test src/framework/diagram/tests/diagram-camera.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/framework/diagram/diagram.ts src/framework/diagram/tests/diagram-camera.test.ts
git commit -m "feat(diagram): zoom-in/out/reset + Fit / Fit-to-Selection commands"
```

---

### Task 5: ZoomPanBehavior — wheel-zoom, wheel-pan, grab-pan (`zoom-pan-behavior.ts`)

**Files:**
- Create: `src/framework/diagram/behaviors/zoom-pan-behavior.ts`
- Modify: `src/framework/diagram/diagram.ts` (camera handler slots + `OnPointerWheel` override + `CameraEnabled` DP gating)
- Test: `src/framework/diagram/tests/zoom-pan-behavior.test.ts` (NEW)

**Interfaces:**
- Consumes: `zoomAtPoint` from `../camera.js`; `Point`; `WheelEventArgs`/`PointerEventArgs` (fields `HostX`, `HostY`, `DeltaY`, `CtrlKey`, `Button`, `Handled`) from the input layer; the diagram-local pivot (screen point in `PART_Camera`'s pre-transform frame) computed by summing `ArrangedRect` from `PART_Camera.GetVisualParent()` up.
- Produces:
  - `export function attachZoomPan(diagram: Diagram): () => void`
  - On `Diagram`: `CameraEnabledKey`/`CameraEnabled: boolean` (default false); internal `_setCameraHandlers({ OnWheel, OnGrabStart, OnGrabMove, OnGrabEnd })`; an `OnPointerWheel` override that forwards to `OnWheel` when set.

- [ ] **Step 1: Write the failing test** (handler-level — no live DOM)

```ts
// src/framework/diagram/tests/zoom-pan-behavior.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Diagram } from '../diagram.js';
import { attachZoomPan } from '../zoom-pan-behavior.js';

function wheel(hostX: number, hostY: number, deltaY: number, ctrl: boolean) {
    return { HostX: hostX, HostY: hostY, DeltaY: deltaY, CtrlKey: ctrl, Handled: false };
}

test('ctrl+wheel up zooms in about the cursor; plain wheel pans', () => {
    const d = new Diagram();
    d.CameraEnabled = true;
    const detach = attachZoomPan(d);
    d.SetCamera({ zoom: 1, panX: 0, panY: 0 });

    // ctrl+wheel-up (negative deltaY = zoom in) at (100,100)
    (d as unknown as { _dispatchWheel(a: unknown): void })._dispatchWheel(wheel(100, 100, -100, true));
    assert.ok(d.Zoom > 1);

    // plain wheel pans (no zoom change)
    const z = d.Zoom;
    (d as unknown as { _dispatchWheel(a: unknown): void })._dispatchWheel(wheel(0, 0, 120, false));
    assert.equal(d.Zoom, z);
    assert.notEqual(d.PanY, 0);   // panned vertically
    detach();
});

test('detach stops the behavior from reacting', () => {
    const d = new Diagram();
    d.CameraEnabled = true;
    const detach = attachZoomPan(d);
    detach();
    d.SetCamera({ zoom: 1, panX: 0, panY: 0 });
    (d as unknown as { _dispatchWheel(a: unknown): void })._dispatchWheel(wheel(50, 50, -100, true));
    assert.equal(d.Zoom, 1);
});
```

*(`_dispatchWheel` is an `@internal` test seam that runs the same path `OnPointerWheel` uses — it forwards to the registered `OnWheel` handler.)*

- [ ] **Step 2: Run to verify failure**

Run: `npx tsx --test src/framework/diagram/tests/zoom-pan-behavior.test.ts`
Expected: FAIL — `attachZoomPan` / `CameraEnabled` missing.

- [ ] **Step 3a: Diagram handler slots + wheel override** (`diagram.ts`)

```ts
public static readonly CameraEnabledKey = Model.RegisterProperty<boolean>(Diagram, 'CameraEnabled', false, MetaData.None);
public get CameraEnabled(): boolean { return this.get_property_value(Diagram.CameraEnabledKey); }
public set CameraEnabled(v: boolean) { this.set_property_value(Diagram.CameraEnabledKey, v); }

interface CameraHandlers {
    OnWheel(args: { HostX: number; HostY: number; DeltaY: number; CtrlKey: boolean; Handled: boolean }): void;
    OnGrabStart(args: PointerEventArgs): void;
    OnGrabMove(args: PointerEventArgs): void;
    OnGrabEnd(args: PointerEventArgs): void;
}
private _cameraHandlers?: CameraHandlers;
public _setCameraHandlers(h: CameraHandlers | undefined): void { this._cameraHandlers = h; }  // @internal

protected override OnPointerWheel(args: WheelEventArgs): void {
    // ScrollViewer scroll is disabled, so the wheel bubbles here unconsumed.
    if (this._cameraHandlers !== undefined) { this._cameraHandlers.OnWheel(args as unknown as { HostX: number; HostY: number; DeltaY: number; CtrlKey: boolean; Handled: boolean }); return; }
    super.OnPointerWheel(args);
}
public _dispatchWheel(args: { HostX: number; HostY: number; DeltaY: number; CtrlKey: boolean; Handled: boolean }): void { this._cameraHandlers?.OnWheel(args); }  // @internal test seam
```

Wire `CameraEnabled` in `OnPropertyChanged` to attach/detach the behavior (mirror `_attachAlignmentGuides`):

```ts
if (args.Property === Diagram.CameraEnabledKey) {
    if (this.CameraEnabled) { this._cameraDetach ??= attachZoomPan(this); }
    else { this._cameraDetach?.(); this._cameraDetach = undefined; }
}
```

Import `attachZoomPan` from `./zoom-pan-behavior.js`.

- [ ] **Step 3b: The behavior** (`zoom-pan-behavior.ts`)

```ts
import { Diagram } from '../diagram.js';
import { Point } from '../../../visual-engine/primitives.js';
import { zoomAtPoint } from '../camera.js';

const WHEEL_ZOOM_STEP = 1.0015;   // per delta unit; e^(delta*k)-ish feel
const WHEEL_PAN_SCALE = 1;

// Pointer host-coords -> PART_Camera pre-transform frame (where pan lives):
// sum ArrangedRect offsets from the camera host's PARENT up to the root.
function cameraPivot(diagram: Diagram, hostX: number, hostY: number): Point {
    const host = (diagram as unknown as { GetTemplateChild(n: string): { GetVisualParent(): unknown } | undefined }).GetTemplateChild('PART_Camera');
    let ox = 0, oy = 0;
    let cur = host?.GetVisualParent() as { ArrangedRect: { X: number; Y: number }; GetVisualParent(): unknown } | undefined;
    while (cur !== undefined) { ox += cur.ArrangedRect.X; oy += cur.ArrangedRect.Y; cur = cur.GetVisualParent() as typeof cur; }
    return new Point(hostX - ox, hostY - oy);
}

export function attachZoomPan(diagram: Diagram): () => void {
    let grabbing = false;
    let lastX = 0, lastY = 0;

    diagram._setCameraHandlers({
        OnWheel(args) {
            if (args.CtrlKey) {
                const factor = Math.pow(WHEEL_ZOOM_STEP, -args.DeltaY);  // up (negative) = zoom in
                diagram.SetCamera(zoomAtPoint(diagram.Camera, cameraPivot(diagram, args.HostX, args.HostY), factor));
            } else {
                diagram.PanY = diagram.PanY - args.DeltaY * WHEEL_PAN_SCALE;
            }
            args.Handled = true;
        },
        OnGrabStart(args) {
            // Middle button, or the space-grab flag the host sets. Begin pan.
            grabbing = true; lastX = args.HostX; lastY = args.HostY;
        },
        OnGrabMove(args) {
            if (!grabbing) return;
            diagram.PanX = diagram.PanX + (args.HostX - lastX);
            diagram.PanY = diagram.PanY + (args.HostY - lastY);
            lastX = args.HostX; lastY = args.HostY;
        },
        OnGrabEnd() { grabbing = false; },
    });

    return (): void => diagram._setCameraHandlers(undefined);
}
```

*(Grab-start/move/end are driven by the Diagram's preview pointer handlers for middle-button / space-held drag, wired the same way `_setConnectorInteractionsHandlers` forwards preview pointers; connect `OnGrab*` to those in `diagram.ts` alongside the wheel override. Pinch maps to `OnWheel` with `CtrlKey=true` on platforms that synthesize ctrl+wheel for pinch; native pinch events, if present, call the same `zoomAtPoint` path.)*

- [ ] **Step 4: Run to verify pass**

Run: `npx tsx --test src/framework/diagram/tests/zoom-pan-behavior.test.ts` + the diagram suite.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/framework/diagram/behaviors/zoom-pan-behavior.ts src/framework/diagram/diagram.ts src/framework/diagram/tests/zoom-pan-behavior.test.ts
git commit -m "feat(diagram): ZoomPanBehavior — wheel-zoom-at-cursor, wheel-pan, grab-pan"
```

---

### Task 6: Connector hit-band constant width under zoom (`connector.ts`)

**Files:**
- Modify: `src/framework/diagram/connector.ts`
- Test: `src/framework/diagram/tests/diagram-camera.test.ts` (add)

**Interfaces:**
- Consumes: `Shape.HitTestStrokeWidthKey`, `DiagramSettings.ConnectorHitWidth()` (default 14). The owning `Diagram`'s `Zoom` (a connector reaches its diagram via its parent chain or the model it belongs to).
- Produces: on zoom change, each connector sets `HitTestStrokeWidth = ConnectorHitWidth() / zoom` so the click band stays a constant on-screen width.

- [ ] **Step 1: Write the failing test**

```ts
test('connector hit band scales inversely with zoom', () => {
    const d = new Diagram();
    const c = makeConnectorInDiagram(d);   // helper: add a connector wired to d
    d.SetCamera({ zoom: 2, panX: 0, panY: 0 });
    const base = 14;  // DiagramSettings.ConnectorHitWidth() default
    const w = (c as unknown as { get_property_value(k: unknown): number }).get_property_value(
        (await import('../shape.js')).Shape.HitTestStrokeWidthKey);
    assert.ok(Math.abs(w - base / 2) < 1e-6);
});
```

*(Provide `makeConnectorInDiagram` in the test; it constructs a `Connector`, associates it with `d` the way the diagram wires connectors, and triggers a camera sync.)*

- [ ] **Step 2: Run to verify failure**

Run: `npx tsx --test src/framework/diagram/tests/diagram-camera.test.ts`
Expected: FAIL — hit width unchanged at 14.

- [ ] **Step 3: Implement**

In `Connector`, add a method invoked when the owning diagram's zoom changes:

```ts
// Keep the invisible click/hover band a constant ON-SCREEN width regardless of
// the diagram camera zoom (the geometry is scaled by the camera transform).
public applyCameraZoom(zoom: number): void {
    const base = DiagramSettings.ConnectorHitWidth();
    this.set_property_value(Shape.HitTestStrokeWidthKey, base / Math.max(zoom, 0.0001));
}
```

Have the `Diagram`, in `_syncCameraTransform()` (Task 3), fan out to its connectors: iterate `this.ItemsPanelInstance?.visualChildren`, and for each `Connector` call `applyCameraZoom(this.Zoom)`. (Connectors are among the diagram's items; the exact accessor mirrors how the diagram already enumerates connectors for routing.)

- [ ] **Step 4: Run to verify pass**

Run: `npx tsx --test src/framework/diagram/tests/diagram-camera.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/framework/diagram/connector.ts src/framework/diagram/diagram.ts src/framework/diagram/tests/diagram-camera.test.ts
git commit -m "feat(diagram): keep connector hit band a constant on-screen width under zoom"
```

---

### Task 7: Zoom-control overlay + version bump + publish

**Files:**
- Modify: `src/framework/diagram/diagram.template.mu` (add the overlay inside `PART_Scroll`, as a sibling of `AdornerDecorator`, pinned bottom-right)
- Modify: `package.json` (version bump)
- Test: `src/framework/diagram/tests/diagram-camera.test.ts` (binding smoke) + full suite

**Interfaces:**
- Consumes: `Diagram.ZoomInCommand`, `ZoomOutCommand`, `ResetZoomCommand`, `FitCommand`, `FitToSelectionCommand`, and `Zoom` (for the `%` readout).
- Produces: an on-canvas control cluster; no new public code API.

- [ ] **Step 1: Add the overlay to the template**

Inside `PART_Scroll`, after `AdornerDecorator`, add a bottom-right cluster bound to the diagram commands (the template's DataContext is the `Diagram`):

```
StackPanel [ Orientation = Horizontal, HorizontalAlignment = Right, VerticalAlignment = Bottom, Margin = (12) ] {
    Button [ Command = $FitCommand ]            { TextBlock [ Text = "Fit" ] }
    Button [ Command = $ZoomOutCommand ]        { TextBlock [ Text = "−" ] }
    TextBlock [ Text = $Zoom << ZoomPercent, VerticalAlignment = Center, Margin = (8,0,8,0) ]
    Button [ Command = $ZoomInCommand ]         { TextBlock [ Text = "+" ] }
}
```

Add a `ZoomPercent` value converter (number → `"NNN%"`) registered like other mural converters, and register it in the compiler symbol table if converters must be declared there (follow an existing converter, e.g. `ToVisibility`).

- [ ] **Step 2: Binding smoke test**

```ts
test('zoom commands are present for the overlay to bind', () => {
    const d = new Diagram();
    assert.ok(d.ZoomInCommand !== undefined);
    assert.ok(d.FitCommand !== undefined);
    assert.ok(d.FitToSelectionCommand !== undefined);
});
```

Run: `npx tsx --test src/framework/diagram/tests/diagram-camera.test.ts` — PASS.

- [ ] **Step 3: Full suite + build**

Run the full mural suite and the `.mu` build the repo uses (e.g. `npm test` and the mural CLI compile) to confirm the template compiles and nothing regressed.
Expected: all green; template compiles.

- [ ] **Step 4: Version bump**

Bump `package.json` minor (e.g. `0.6.24` → `0.7.0`) — this ships new public `Diagram` API (camera DPs + commands + `CameraEnabled`).

- [ ] **Step 5: Commit**

```bash
git add src/framework/diagram/diagram.template.mu package.json src/framework/diagram/tests/diagram-camera.test.ts
git commit -m "feat(diagram): zoom-control overlay; bump 0.7.0"
```

*(Publishing to local Verdaccio is done by the human per the repo's release step; do not publish from the plan.)*

---

## Self-Review

**Spec coverage:** M1 camera state → Task 3; M2 CameraHost → Task 3 (Border host); M3 template → Task 3 + Task 7 (overlay); M4 adorner layer → Task 2; M5 ZoomPanBehavior → Task 5; M6 UI+Fit → Task 4 (commands/Fit) + Task 7 (overlay); M7 connector hit-band → Task 6. Interaction set: wheel-zoom/pan + grab-pan (Task 5), buttons + Fit/Fit-to-Selection (Task 4/7), keyboard → host binds the command DPs (SP2). Persistence is SP2 (Plexus). Range clamp → Task 1. Constant-size adorners → Task 2 + template placement (Task 3).

**Placeholder scan:** Two spots are deliberately parameterized against existing-but-unquoted APIs and flagged inline, not left vague: (a) how the diagram enumerates its connectors in Task 6 — use the same enumeration the router already uses; (b) the item "is selected" predicate in Task 4 `contentBounds` — confirm the container's selection flag name. Both have concrete fallback code; the implementer confirms the exact accessor against `diagram.ts`. All logic is spelled out.

**Type consistency:** `Camera` shape and `cameraMatrix`/`zoomAtPoint`/`fitBounds` signatures are consistent across Tasks 1, 3, 4, 5. `clampZoom` used in Task 1/3. `CAMERA_MAX = 4.0` asserted consistently (Task 1 test, Task 3 test). `PART_Camera` name consistent (Tasks 2/3/5). `_setCameraHandlers`/`OnWheel` shape consistent (Task 5).

## Out of scope (this plan)

- Plexus wiring: bump, set `Diagram.CameraEnabled = true`, persist camera in `.diagram` metadata, bind keyboard (Ctrl +/−/0) to the command DPs — **SP2**.
- Auto-Fit on first open, minimap, animated zoom, LOD/culling.
