# SP4 — Diagram LayoutTransform camera + scrollbars Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the diagram's SP1 `RenderTransform` camera with a `LayoutTransform` scale + `ScrollViewer` scroll-offset model (real scrollbars, tunnel Ctrl+wheel zoom, Fit), and make node-drag / drop / connector-hover coordinate-correct at all zoom levels.

**Architecture:** Zoom is `PART_Camera.LayoutTransform = Scale(Zoom)` (grows the measured footprint → the re-enabled `ScrollViewer` sizes scrollbars to it). Pan is the `ScrollViewer`'s scroll offset. Host→content coordinates go through one helper `Diagram.HostToContent = (Host − Σ ArrangedRect)/Zoom` (the SCP already bakes `−offset` into the `ArrangedRect` chain; the only extra factor is the uniform camera scale).

**Tech Stack:** TypeScript, mural visual framework, `node:test` via `tsx`.

## Global Constraints

- **Test location:** every test file lives in a `tests/` subfolder next to its source.
- **Framework-importing tests** run with `npm test` (or `npx tsx --conditions=development --test --test-force-exit "src/**/*.test.ts"`). The `--conditions=development` flag is MANDATORY for any test importing `@pragmatic-tech-ai/mural/framework`. Pure value tests (`camera.test.ts`) do not need it.
- **Enums over string-literal unions** (per CLAUDE.md) — no new string-literal union types.
- **No secrets / `.npmrc` committed.** Publish mural only to local Verdaccio.
- **Camera type:** `Camera = { zoom: number; offsetX: number; offsetY: number }` (offset = scroll offset, ≥ 0). Replaces `{ zoom, panX, panY }`.
- **Coordinate identity:** `content = (Host − Σ ArrangedRect.X/Y) / Zoom`; `viewport = content*Zoom − offset`; `zoomAtPoint` pivot is a viewport point.
- **Version:** bump `Mural/package.json` 0.8.0 → **0.9.0** at the end; publish to local Verdaccio for SP5.

---

### Task 1: `camera.ts` — offset-space value + math

**Files:**
- Modify: `src/framework/diagram/camera.ts`
- Test: `src/framework/diagram/tests/camera.test.ts` (rewrite)

**Interfaces:**
- Produces: `Camera { zoom, offsetX, offsetY }`; `cameraMatrix(c): Matrix` (`content → content*zoom − offset`); `zoomAtPoint(c, pivot, factor): Camera` (pivot = viewport point); `fitBounds(content, viewport, padding): Camera` (top-left framing); unchanged `clampZoom`, `CAMERA_MIN/MAX/FIT_FLOOR`.

- [ ] **Step 1: Rewrite the tests** (`camera.test.ts`) for offset space:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Point, Rect, Size } from '../../../visual-engine/primitives.js';
import { cameraMatrix, zoomAtPoint, fitBounds, clampZoom, CAMERA_MIN, CAMERA_MAX } from '../camera.js';

test('cameraMatrix maps content->viewport as content*zoom - offset', () => {
    const m = cameraMatrix({ zoom: 2, offsetX: 30, offsetY: 50 });
    const s = m.Transform(new Point(10, 10));
    assert.equal(s.X, 10 * 2 - 30);
    assert.equal(s.Y, 10 * 2 - 50);
});

test('zoomAtPoint keeps the content point under the pivot fixed', () => {
    const before = { zoom: 1, offsetX: 0, offsetY: 0 };
    const pivot = new Point(100, 80);
    const after = zoomAtPoint(before, pivot, 2);
    const contentUnderPivot = cameraMatrix(before).Invert()!.Transform(pivot);
    const s = cameraMatrix(after).Transform(contentUnderPivot);
    assert.ok(Math.abs(s.X - pivot.X) < 1e-9);
    assert.ok(Math.abs(s.Y - pivot.Y) < 1e-9);
    assert.equal(after.zoom, 2);
});

test('zoomAtPoint clamps zoom to the interactive range', () => {
    assert.equal(zoomAtPoint({ zoom: CAMERA_MAX, offsetX: 0, offsetY: 0 }, new Point(0, 0), 2).zoom, CAMERA_MAX);
    assert.equal(zoomAtPoint({ zoom: CAMERA_MIN, offsetX: 0, offsetY: 0 }, new Point(0, 0), 0.5).zoom, CAMERA_MIN);
    assert.equal(clampZoom(99), CAMERA_MAX);
});

test('fitBounds frames content top-left with padding (no centering)', () => {
    // 100x100 content at (200,100), 500x300 viewport, 20 padding. Limiting axis
    // is height: (300-40)/100 = 2.6.
    const c = fitBounds(new Rect(200, 100, 100, 100), new Size(500, 300), 20);
    assert.ok(Math.abs(c.zoom - 2.6) < 1e-9);
    // content top-left (200,100) maps to (padding, padding) in the viewport.
    const tl = cameraMatrix(c).Transform(new Point(200, 100));
    assert.ok(Math.abs(tl.X - 20) < 1e-9);
    assert.ok(Math.abs(tl.Y - 20) < 1e-9);
});

test('fitBounds clamps offset to >= 0 for content at the origin', () => {
    const c = fitBounds(new Rect(0, 0, 100, 100), new Size(500, 300), 20);
    assert.equal(c.offsetX, 0);
    assert.equal(c.offsetY, 0);
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npx tsx --test --test-force-exit "src/framework/diagram/tests/camera.test.ts"`
Expected: FAIL (type errors / wrong values — old `panX` API).

- [ ] **Step 3: Rewrite `camera.ts`:**

```ts
import { Matrix, Point, Rect, Size } from '../../visual-engine/primitives.js';

// The diagram camera: content maps to the viewport as `viewport = content*zoom
// - offset`. Offset is the ScrollViewer scroll offset (>= 0), NOT a post-scale
// translate. Pure value + math — no mural-visual deps, fully unit-testable.
export interface Camera { readonly zoom: number; readonly offsetX: number; readonly offsetY: number; }

export const CAMERA_MIN = 0.1;
export const CAMERA_MAX = 4.0;
export const CAMERA_FIT_FLOOR = 0.02;

export function clampZoom(z: number): number { return Math.max(CAMERA_MIN, Math.min(CAMERA_MAX, z)); }

// Content -> viewport affine. Scale first, then translate by -offset (leftmost
// Multiply factor applies first to a row-vector point), so viewport = c*zoom - offset.
export function cameraMatrix(c: Camera): Matrix {
    return Matrix.Scale(c.zoom, c.zoom).Multiply(Matrix.Translate(-c.offsetX, -c.offsetY));
}

// Zoom by `factor` about `pivot` (a VIEWPORT point), keeping the content point
// under the pivot fixed. Zoom clamped to the interactive range. Offset may come
// out negative; callers lower-clamp when writing the scroll offset.
export function zoomAtPoint(c: Camera, pivot: Point, factor: number): Camera {
    const zoom = clampZoom(c.zoom * factor);
    const cx = (pivot.X + c.offsetX) / c.zoom;   // content point currently under the pivot
    const cy = (pivot.Y + c.offsetY) / c.zoom;
    return { zoom, offsetX: cx * zoom - pivot.X, offsetY: cy * zoom - pivot.Y };
}

// Frame `content` (a content-space rect) top-left in `viewport` with `padding`
// pixels of inset. A scroll offset can't push content right/down to center it,
// so framing is top-left, not centered. Zoom clamped to [CAMERA_FIT_FLOOR,
// CAMERA_MAX] so Fit can go below the interactive floor for very large diagrams.
export function fitBounds(content: Rect, viewport: Size, padding: number): Camera {
    const availW = Math.max(1, viewport.Width - padding * 2);
    const availH = Math.max(1, viewport.Height - padding * 2);
    const w = Math.max(1, content.Width);
    const h = Math.max(1, content.Height);
    const zoom = Math.max(CAMERA_FIT_FLOOR, Math.min(CAMERA_MAX, Math.min(availW / w, availH / h)));
    return {
        zoom,
        offsetX: Math.max(0, content.X * zoom - padding),
        offsetY: Math.max(0, content.Y * zoom - padding),
    };
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx tsx --test --test-force-exit "src/framework/diagram/tests/camera.test.ts"`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/framework/diagram/camera.ts src/framework/diagram/tests/camera.test.ts
git commit -m "feat(diagram): camera math in scroll-offset space"
```

---

### Task 2: template — enable scroll, drop the render transform

**Files:**
- Modify: `src/framework/diagram/diagram.template.mu:260-278`

- [ ] **Step 1: Replace the `DefaultDiagram` template block** (lines 260-278) with:

```
    Template x:key="DefaultDiagram" [TargetType = Diagram] {
        // Zoom is a LayoutTransform Scale on PART_Camera (grows its measured
        // footprint), so the ScrollViewer sizes real scrollbars to the zoomed
        // content and pan IS the scroll offset. AdornerDecorator wraps
        // PART_Camera (not the items) so selection adorners stay a constant
        // on-screen size — the adorner layer composes PART_Camera's
        // EffectiveLayoutMatrix when positioning them (see adorner.ts).
        ScrollViewer x:name="PART_Scroll"
            [ IsAutoHideScrollBars    = false,
              HorizontalScrollEnabled = true,
              VerticalScrollEnabled   = true ] {
            AdornerDecorator {
                Border x:name="PART_Camera" [ Background = #00000000 ] {
                    ItemsPresenter
                }
            }
        }
    }
```

- [ ] **Step 2: Compile templates, verify clean**

Run: `npm run build:templates`
Expected: no errors; `diagram.template.mu` compiles.

- [ ] **Step 3: Commit**

```bash
git add src/framework/diagram/diagram.template.mu
git commit -m "feat(diagram): enable ScrollViewer scrolling, drop render-camera neutralization"
```

---

### Task 3: `diagram.ts` — LayoutTransform camera, scroll-offset pan, HostToContent, tunnel wheel

**Files:**
- Modify: `src/framework/diagram/diagram.ts` (camera region ~151-166, 460-505, 1096-1171; imports)
- Test: `src/framework/diagram/tests/diagram-camera.test.ts` (rewrite)

**Interfaces:**
- Consumes: `Camera { zoom, offsetX, offsetY }`, `zoomAtPoint`, `fitBounds`, `clampZoom` (Task 1).
- Produces (public): `Diagram.Zoom` (DP, kept); `get ScrollHost(): ScrollViewer | undefined`; `get/set ScrollX`, `get/set ScrollY` (proxy `ScrollHost` offset, lower-clamped to 0); `get Camera(): Camera` / `SetCamera(c)`; `ZoomIn/ZoomOut/ResetZoom/Fit/FitToSelection`; **`HostToContent(hostX, hostY): Point`**. Removes `PanX`/`PanY`.
- Produces (for behaviors): `_setCameraHandlers`, `_dispatchWheel`, `CameraGestureHandlers { OnWheel(args) }`.

- [ ] **Step 1: Rewrite `diagram-camera.test.ts`** (framework test — needs conditions flag):

```ts
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initTestApp } from '../../../basic/tests/test-app.js';
import { Point, Rect } from '../../../visual-engine/primitives.js';
import { Model, ObservableCollection } from '../../../runtime/index.js';
import { Shape } from '../../../basic/shapes/shape.js';
import { ScaleTransform } from '../../../visual-engine/index.js';
import { Diagram } from '../diagram.js';
import { Connector } from '../connector.js';

describe('Diagram camera', () => {
    beforeEach(() => { initTestApp(); });

    test('exposes an identity camera by default', () => {
        const d = new Diagram();
        assert.equal(d.Zoom, 1);
        assert.equal(d.ScrollX, 0);
        assert.equal(d.ScrollY, 0);
    });

    test('SetCamera clamps zoom and writes zoom + scroll offset', () => {
        const d = new Diagram();
        d.SetCamera({ zoom: 99, offsetX: 12, offsetY: 34 });
        assert.equal(d.Zoom, 4);          // CAMERA_MAX
        assert.equal(d.ScrollX, 12);
        assert.equal(d.ScrollY, 34);
    });

    test('ScrollX/ScrollY lower-clamp to 0', () => {
        const d = new Diagram();
        d.ScrollX = -50;
        assert.equal(d.ScrollX, 0);
    });

    test('Zoom drives PART_Camera.LayoutTransform scale', () => {
        const d = new Diagram();
        d.SetCamera({ zoom: 2, offsetX: 0, offsetY: 0 });
        const host = d.GetTemplateChild('PART_Camera');
        const lt = host?.LayoutTransform as ScaleTransform | undefined;
        assert.ok(lt !== undefined, 'PART_Camera has a LayoutTransform');
        assert.equal(lt!.ScaleX, 2);
        assert.equal(lt!.ScaleY, 2);
    });

    test('ZoomIn/ZoomOut about the viewport center round-trip; ResetZoom -> identity', () => {
        const d = new Diagram();
        d._testViewport(500, 300);
        d.SetCamera({ zoom: 1, offsetX: 0, offsetY: 0 });
        d.ZoomIn();
        assert.ok(d.Zoom > 1);
        d.ZoomOut();
        assert.ok(Math.abs(d.Zoom - 1) < 1e-9);
        assert.ok(Math.abs(d.ScrollX) < 1e-9);
        assert.ok(Math.abs(d.ScrollY) < 1e-9);
        d.SetCamera({ zoom: 2, offsetX: 10, offsetY: 20 });
        d.ResetZoom();
        assert.equal(d.Zoom, 1);
        assert.equal(d.ScrollX, 0);
        assert.equal(d.ScrollY, 0);
    });

    test('Fit frames the content bounds into the viewport', () => {
        const d = new Diagram();
        d._testViewport(500, 300);
        d._testContent(new Rect(0, 0, 100, 100));
        d.Fit();
        assert.ok(Math.abs(d.Zoom - Math.min((500 - 48) / 100, (300 - 48) / 100)) < 1e-9);
    });

    test('HostToContent = (host - arrangedRect chain) / Zoom', () => {
        const d = new Diagram();
        d._testViewport(500, 300);
        // At zoom 1 with the panel at the origin, host maps 1:1.
        d.SetCamera({ zoom: 1, offsetX: 0, offsetY: 0 });
        const a = d.HostToContent(120, 80);
        // At zoom 2, the same host point maps to half the content coordinate.
        d.SetCamera({ zoom: 2, offsetX: 0, offsetY: 0 });
        const b = d.HostToContent(120, 80);
        assert.ok(Math.abs(b.X - a.X / 2) < 1e-9);
        assert.ok(Math.abs(b.Y - a.Y / 2) < 1e-9);
    });

    test('zoom commands are present for the overlay + host keyboard to bind', () => {
        const d = new Diagram();
        assert.ok(d.ZoomInCommand !== undefined);
        assert.ok(d.ZoomOutCommand !== undefined);
        assert.ok(d.ResetZoomCommand !== undefined);
        assert.ok(d.FitCommand !== undefined);
        assert.ok(d.FitToSelectionCommand !== undefined);
    });

    test('connector hit band scales inversely with zoom', () => {
        const d = new Diagram();
        const c = new Connector();
        const connectors = new ObservableCollection<Model>();
        connectors.Add(c);
        d.Connectors = connectors;
        d.SetCamera({ zoom: 2, offsetX: 0, offsetY: 0 });
        const w = c.get_property_value(Shape.HitTestStrokeWidthKey);
        assert.ok(Math.abs(w - 14 / 2) < 1e-6, `expected 7, got ${w}`);
    });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx tsx --conditions=development --test --test-force-exit "src/framework/diagram/tests/diagram-camera.test.ts"`
Expected: FAIL (old `PanX` API / `RenderTransform` assertions gone).

- [ ] **Step 3: Update imports in `diagram.ts`.** Ensure `ScaleTransform` is imported from the visual-engine barrel and `Point` from primitives (already imported). Remove now-unused `TransformGroup`, `TranslateTransform` imports if they become unused after Step 6. Ensure `ScrollViewer` type is importable (for `ScrollHost` return type) — import `type { ScrollViewer } from '../surfaces/scroll-viewer.js'` if not present.

- [ ] **Step 4: Remove the Pan DPs.** Delete `PanXKey` / `PanYKey` registrations (~152-153) and the `PanX` / `PanY` accessors (~458-462).

- [ ] **Step 5: Rewrite the camera value API + zoom methods** (~464-505):

```ts
    // The camera as a value. SetCamera clamps zoom to the interactive range;
    // Fit uses the wider range via a direct DP write (see _applyFit).
    public get Camera(): Camera { return { zoom: this.Zoom, offsetX: this.ScrollX, offsetY: this.ScrollY }; }
    public SetCamera(c: Camera): void { this.Zoom = clampZoom(c.zoom); this.ScrollX = c.offsetX; this.ScrollY = c.offsetY; }

    // The enclosing ScrollViewer (PART_Scroll); pan lives on its scroll offset.
    public get ScrollHost(): ScrollViewer | undefined {
        return this.GetTemplateChild('PART_Scroll') as unknown as ScrollViewer | undefined;
    }
    public get ScrollX(): number { return this.ScrollHost?.HorizontalOffset ?? 0; }
    public set ScrollX(v: number) { const sh = this.ScrollHost; if (sh !== undefined) sh.HorizontalOffset = Math.max(0, v); }
    public get ScrollY(): number { return this.ScrollHost?.VerticalOffset ?? 0; }
    public set ScrollY(v: number) { const sh = this.ScrollHost; if (sh !== undefined) sh.VerticalOffset = Math.max(0, v); }

    // Host (viewport) point -> content (item) point. The ArrangedRect chain from
    // the items panel to the root already equals -offset (the SCP arranges its
    // content at -effectiveOffset), so dividing by Zoom (the LayoutTransform
    // scale) yields the content point. Single source of truth for the drop,
    // connector-hover, and figure-drag coordinate conversions.
    public HostToContent(hostX: number, hostY: number): Point {
        let ox = 0, oy = 0;
        let cur: Visual | undefined = this.ItemsPanelInstance;
        while (cur !== undefined) { ox += cur.ArrangedRect.X; oy += cur.ArrangedRect.Y; cur = cur.GetVisualParent(); }
        const z = this.Zoom || 1;
        return new Point((hostX - ox) / z, (hostY - oy) / z);
    }

    private static readonly ZOOM_STEP = 1.2;
    private static readonly FIT_PADDING = 24;

    public ZoomIn(): void  { this.SetCamera(zoomAtPoint(this.Camera, this._centerPivot(), Diagram.ZOOM_STEP)); }
    public ZoomOut(): void { this.SetCamera(zoomAtPoint(this.Camera, this._centerPivot(), 1 / Diagram.ZOOM_STEP)); }
    public ResetZoom(): void { this.SetCamera({ zoom: 1, offsetX: 0, offsetY: 0 }); }

    public Fit(): void {
        const b = this.contentBounds();
        if (b !== undefined) this._applyFit(fitBounds(b, this._viewportSize(), Diagram.FIT_PADDING));
    }
    public FitToSelection(): void {
        const b = this.selectionBounds() ?? this.contentBounds();
        if (b !== undefined) this._applyFit(fitBounds(b, this._viewportSize(), Diagram.FIT_PADDING));
    }

    // Fit can legitimately produce a zoom below the interactive floor; bypass clampZoom.
    private _applyFit(c: Camera): void { this.Zoom = c.zoom; this.ScrollX = c.offsetX; this.ScrollY = c.offsetY; }
    private _centerPivot(): Point { const v = this._viewportSize(); return new Point(v.Width / 2, v.Height / 2); }
```

Keep `_viewportSize()`, `selectionBounds()`, `contentBounds()` unchanged.

- [ ] **Step 6: Replace the camera-transform internals** (~1096-1123):

```ts
    // ── Camera (LayoutTransform scale on PART_Camera) ──────────────────────
    private _camScale?: ScaleTransform;

    // Lazily set PART_Camera's LayoutTransform (the template is applied in the
    // ctor, so GetTemplateChild resolves once a camera write first arrives).
    private _ensureCameraTransform(): void {
        if (this._camScale !== undefined) return;
        const host = this.GetTemplateChild('PART_Camera');
        if (host === undefined) return;
        this._camScale = new ScaleTransform(this.Zoom, this.Zoom);
        host.LayoutTransform = this._camScale;
    }

    private _syncCameraTransform(): void {
        this._ensureCameraTransform();
        if (this._camScale === undefined) return;
        this._camScale.ScaleX = this.Zoom;
        this._camScale.ScaleY = this.Zoom;
    }
```

- [ ] **Step 7: Switch the wheel hook to the tunnel phase and drop grab-pan** (~1075-1094, 1128-1138):

Remove the `this._cameraHandlers?.OnGrabStart/OnGrabMove/OnGrabEnd(args)` calls from the `OnPreviewPointerDown` / `OnPreviewPointerMove` / `OnPreviewPointerUp` / `OnPointerLeave` overrides (keep the `_connectorInteractionsHandlers` calls and `super` calls). Replace the bubble wheel hook:

```ts
    // Camera gesture handlers (installed by attachZoomPan when CameraEnabled flips).
    private _cameraHandlers?: CameraGestureHandlers;
    private _cameraDetach?: () => void;
    public _setCameraHandlers(h: CameraGestureHandlers | undefined): void { this._cameraHandlers = h; }

    // Ctrl+wheel zoom must pre-empt the ScrollViewer, which scrolls in the
    // bubble phase — so the camera handler runs in the TUNNEL phase and marks
    // the event Handled, suppressing the ScrollViewer's bubble scroll. Plain /
    // Shift wheel is left unhandled and bubbles to the ScrollViewer.
    protected override OnPreviewPointerWheel(args: WheelEventArgs): void {
        super.OnPreviewPointerWheel(args);
        this._cameraHandlers?.OnWheel(args);
    }

    // @internal test seam — same path OnPreviewPointerWheel uses, without live routing.
    public _dispatchWheel(args: WheelEventArgs): void { this._cameraHandlers?.OnWheel(args); }
```

Update the `CameraGestureHandlers` interface (~65-66) to just:

```ts
interface CameraGestureHandlers {
    OnWheel(args: WheelEventArgs): void;
}
```

- [ ] **Step 8: Update `OnPropertyChanged`** (~1158-1166): replace the Pan branch:

```ts
        if (descriptor.Name === 'Zoom')
        {
            this._syncCameraTransform();
            // Keep connector click-bands a constant on-screen width under zoom.
            this._applyCameraToConnectors();
        }
```

(Delete the old `Zoom | PanX | PanY` combined branch and the separate Zoom-only connector branch.)

- [ ] **Step 9: Run the camera test, verify pass**

Run: `npx tsx --conditions=development --test --test-force-exit "src/framework/diagram/tests/diagram-camera.test.ts"`
Expected: PASS (10 tests).

- [ ] **Step 10: Typecheck**

Run: `npm run typecheck`
Expected: clean (no unused `TransformGroup`/`TranslateTransform`; `ScaleTransform`, `ScrollViewer` resolve).

- [ ] **Step 11: Commit**

```bash
git add src/framework/diagram/diagram.ts src/framework/diagram/tests/diagram-camera.test.ts
git commit -m "feat(diagram): LayoutTransform camera + scroll-offset pan + HostToContent + tunnel wheel"
```

---

### Task 4: `zoom-pan-behavior.ts` — Ctrl+wheel zoom only

**Files:**
- Modify: `src/framework/diagram/behaviors/zoom-pan-behavior.ts`
- Test: `src/framework/diagram/tests/zoom-pan-behavior.test.ts` (update)

**Interfaces:**
- Consumes: `Diagram.Camera`/`SetCamera`, `Diagram.ScrollHost`, `zoomAtPoint`, `CameraGestureHandlers { OnWheel }`.

- [ ] **Step 1: Update the test.** Open `zoom-pan-behavior.test.ts` and set expectations: Ctrl+wheel changes zoom and marks the args Handled; a non-Ctrl wheel leaves zoom unchanged AND `args.Handled === false` (so it bubbles to the ScrollViewer). Drive via `diagram._dispatchWheel(wheel(...))`. Remove any grab-pan assertions.

Add/replace with:

```ts
test('Ctrl+wheel zooms about the cursor and marks the event handled', () => {
    const d = new Diagram();
    d._testViewport(400, 300);
    d.CameraEnabled = true;
    const before = d.Zoom;
    const a = wheel(200, 150, -100, true);   // ctrl, wheel up
    d._dispatchWheel(a);
    assert.ok(d.Zoom > before);
    assert.equal(a.Handled, true);
});

test('plain wheel is ignored so it bubbles to the ScrollViewer', () => {
    const d = new Diagram();
    d._testViewport(400, 300);
    d.CameraEnabled = true;
    const before = d.Zoom;
    const a = wheel(200, 150, -100, false);   // no ctrl
    d._dispatchWheel(a);
    assert.equal(d.Zoom, before);
    assert.equal(a.Handled, false);
});
```

Ensure the `wheel(...)` helper sets `Handled: false` initially and includes `HostX`/`HostY`.

- [ ] **Step 2: Run test, verify it fails**

Run: `npx tsx --conditions=development --test --test-force-exit "src/framework/diagram/tests/zoom-pan-behavior.test.ts"`
Expected: FAIL (plain wheel currently pans + marks Handled).

- [ ] **Step 3: Rewrite `zoom-pan-behavior.ts`:**

```ts
import { Diagram } from '../diagram.js';
import { Point } from '../../../visual-engine/primitives.js';
import { hasModifier, ModifierKeys, WheelDeltaMode } from '../../../runtime/index.js';
import { zoomAtPoint } from '../camera.js';

// Wheel zoom sensitivity: multiplicative factor per normalized delta pixel.
const ZOOM_PER_PX = 1.0015;

function scaleFor(mode: WheelDeltaMode): number {
    return mode === WheelDeltaMode.Line ? 16 : mode === WheelDeltaMode.Page ? 400 : 1;
}

// The cursor as a VIEWPORT point: HostX/HostY minus the ScrollViewer's own
// arranged origin. Sum ArrangedRect from PART_Scroll (NOT PART_Camera) up to the
// root — the scroll offset lives inside the ScrollViewer on PART_Camera, so it
// must be excluded from the pivot (zoomAtPoint folds offset in itself).
function viewportPivot(diagram: Diagram, hostX: number, hostY: number): Point {
    let ox = 0, oy = 0;
    let cur = diagram.GetTemplateChild('PART_Scroll');
    while (cur !== undefined) { ox += cur.ArrangedRect.X; oy += cur.ArrangedRect.Y; cur = cur.GetVisualParent(); }
    return new Point(hostX - ox, hostY - oy);
}

// Installs camera gesture handling on a Diagram: Ctrl/⌘+wheel (and pinch, which
// platforms deliver as ctrl+wheel) zooms about the cursor. Plain / Shift wheel is
// left unhandled so the ScrollViewer scrolls it natively; scrollbars and
// drag-to-edge auto-scroll are the ScrollViewer's own. Returns a detach thunk.
export function attachZoomPan(diagram: Diagram): () => void {
    diagram._setCameraHandlers({
        OnWheel(args) {
            if (!hasModifier(args.Modifiers, ModifierKeys.Control)) return;   // bubble -> ScrollViewer scrolls
            const dy = args.DeltaY * scaleFor(args.DeltaMode);
            const factor = Math.pow(ZOOM_PER_PX, -dy);   // wheel up (negative) = zoom in
            diagram.SetCamera(zoomAtPoint(diagram.Camera, viewportPivot(diagram, args.HostX, args.HostY), factor));
            args.Handled = true;
        },
    });

    return (): void => diagram._setCameraHandlers(undefined);
}
```

- [ ] **Step 4: Run test, verify pass**

Run: `npx tsx --conditions=development --test --test-force-exit "src/framework/diagram/tests/zoom-pan-behavior.test.ts"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/framework/diagram/behaviors/zoom-pan-behavior.ts src/framework/diagram/tests/zoom-pan-behavior.test.ts
git commit -m "feat(diagram): Ctrl+wheel zoom-about-cursor via tunnel; native wheel scroll"
```

---

### Task 5: drop + connector-hover coordinates via `HostToContent`

**Files:**
- Modify: `src/framework/diagram/behaviors/canvas-drop-behavior.ts:44-67`
- Modify: `src/framework/diagram/behaviors/connector-interactions-behavior.ts` (`cursorToCanvas`, ~752-773)

**Interfaces:**
- Consumes: `Diagram.HostToContent` (Task 3).

- [ ] **Step 1: `canvas-drop-behavior.ts`** — replace `panelHost()` + `localPosition()` (lines 44-67) with a single delegation, and update the scroll-compensation comment:

```ts
    // Host -> canvas-local via the Diagram's shared coordinate helper: it sums
    // the ArrangedRect chain (which already bakes in the ScrollViewer's -offset)
    // and divides by the zoom (PART_Camera's LayoutTransform scale). See
    // Diagram.HostToContent.
    const localPosition = (args: DragEventArgs): Point => diagram.HostToContent(args.HostX, args.HostY);
```

Remove the now-obsolete `panelHost` closure and the stale "Scroll compensation" paragraph in the file header (lines 31-37) — replace with a one-line pointer to `Diagram.HostToContent`. Confirm `Point`/`Visual` imports stay only if still used (`Point` is used in `ItemDroppedArgs`; keep it).

- [ ] **Step 2: `connector-interactions-behavior.ts`** — replace the body of `cursorToCanvas` (the panel ArrangedRect walk, ~752-773) with:

```ts
    return diagram.HostToContent(args.HostX, args.HostY);
```

Keep the function signature and its callers. Remove the now-unused local walk + the double-count comment; if `panel`/`ItemsPanelInstance` is no longer referenced elsewhere in the function, drop that line too.

- [ ] **Step 3: Typecheck + run the affected suites**

Run: `npm run typecheck`
Then: `npx tsx --conditions=development --test --test-force-exit "src/framework/diagram/tests/*.test.ts"`
Expected: clean typecheck; diagram suite green (connector-interaction and drop tests unaffected at zoom 1, where `HostToContent` is identity over the old walk).

- [ ] **Step 4: Commit**

```bash
git add src/framework/diagram/behaviors/canvas-drop-behavior.ts src/framework/diagram/behaviors/connector-interactions-behavior.ts
git commit -m "feat(diagram): route drop + connector-hover coords through HostToContent (zoom-correct)"
```

---

### Task 6: `figure.ts` drag — zoom-correct via `HostToContent`

**Files:**
- Modify: `src/framework/diagram/figure.ts` (fields ~281-302; `OnPointerDown` ~685-702; `OnPointerMove` ~821-858; `moveSelfToCursor` ~900-928)
- Test: `src/framework/diagram/tests/` — add `figure-drag-zoom.test.ts`

**Interfaces:**
- Consumes: the enclosing `Selector` **is** the Diagram; duck-type it to `{ HostToContent(x,y): Point; PositionSnap?(r): Rect }`.
- Grab offset is stored in **content** space; the click-vs-drag threshold stays in **screen** space; scroll compensation is dropped (a live `HostToContent` read includes `−offset`).

- [ ] **Step 1: Write the failing test** (`figure-drag-zoom.test.ts`). Build a Diagram with a test viewport, stub `HostToContent` to divide by a controllable zoom (or set `d.SetCamera({zoom:2,...})` with a real panel), add a `Figure` at a known `Left/Top`, dispatch a synthetic PointerDown then PointerMove, and assert the figure moved by the **content** delta (half the screen delta at zoom 2). Also assert a sub-threshold screen wiggle does NOT move it. Model the dispatch on the existing figure/pointer tests in `src/framework/diagram/tests/` (reuse their pointer-args helper).

Concrete shape:

```ts
// zoom 2: a 100px screen drag must move Left by 50 content units.
figure.OnPointerDownForTest(pointer(hx0, hy0));      // press
figure.OnPointerMoveForTest(pointer(hx0 + 100, hy0)); // drag right 100px screen
assert.ok(Math.abs(figure.Left - (startLeft + 50)) < 1e-6);
```

If no public test seam exists for the protected handlers, dispatch through the routed-event helpers already used by the neighboring figure tests (grep `src/framework/diagram/tests` for how they invoke `OnPointerDown`/pointer capture) — mirror that mechanism rather than inventing one.

- [ ] **Step 2: Run test, verify it fails**

Run: `npx tsx --conditions=development --test --test-force-exit "src/framework/diagram/tests/figure-drag-zoom.test.ts"`
Expected: FAIL (current grab offset mixes screen + content → moves by 100 at zoom 2).

- [ ] **Step 3: `OnPointerDown`** — compute the grab offset in content space. Replace lines 689-690:

```ts
        this._grabOffsetX = args.HostX - this.Left;
        this._grabOffsetY = args.HostY - this.Top;
```

with (placed AFTER `const selector = ...` at ~711, reusing the resolved selector):

```ts
        const coord = selector as unknown as { HostToContent?(x: number, y: number): Point } | undefined;
        const cp = coord?.HostToContent?.(args.HostX, args.HostY);
        this._grabOffsetX = (cp?.X ?? args.HostX) - this.Left;
        this._grabOffsetY = (cp?.Y ?? args.HostY) - this.Top;
```

Delete the press-time scroll-offset snapshot (lines 701-702) and the `_pressScrollOffsetX/Y` fields (~declared near 296-299). Keep `_dragScrollViewer` (auto-scroll) and its snapshot at 694.

- [ ] **Step 4: `moveSelfToCursor`** — map through content space, drop the scroll-delta math. Replace the body (~900-928):

```ts
    private moveSelfToCursor(hostX: number, hostY: number): void {
        const selector = Selector.FromContainer<Selector>(
            this, (v: Visual): v is Selector => v instanceof Selector);
        const coord = selector as unknown as { HostToContent?(x: number, y: number): Point } | undefined;
        const cp = coord?.HostToContent?.(hostX, hostY) ?? new Point(hostX, hostY);
        let candidateLeft = cp.X - this._grabOffsetX;
        let candidateTop  = cp.Y - this._grabOffsetY;
        const ar = this.ArrangedRect;
        const w = ar?.Width  ?? 0;
        const h = ar?.Height ?? 0;
        const snap = (selector as unknown as { PositionSnap?: (r: Rect) => Rect } | undefined)?.PositionSnap;
        if (snap !== undefined) {
            const snapped = snap(new Rect(candidateLeft, candidateTop, w, h));
            candidateLeft = snapped.X;
            candidateTop  = snapped.Y;
        }
        this.Left = candidateLeft;
        this.Top  = candidateTop;
    }
```

Update its two call sites (~831 and ~856) to `this.moveSelfToCursor(args.HostX, args.HostY)` (drop the `sv` argument). The `OnPointerMove` cascade-converge loop keeps using `sv.effectiveHorizontalOffset()` to DETECT convergence and `host.Flush()`; only the `moveSelfToCursor` call loses the `sv` param. Ensure `Point` is imported in `figure.ts` (it is used already, confirm).

- [ ] **Step 5: Run the new test + the full diagram suite, verify pass**

Run: `npx tsx --conditions=development --test --test-force-exit "src/framework/diagram/tests/figure-drag-zoom.test.ts"`
Then: `npx tsx --conditions=development --test --test-force-exit "src/framework/diagram/tests/*.test.ts"`
Expected: new test PASS; no regression in existing figure/drag/scroll tests (they run at zoom 1, where the content mapping equals the old screen mapping).

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: clean (no unused `_pressScrollOffsetX/Y`).

- [ ] **Step 7: Commit**

```bash
git add src/framework/diagram/figure.ts src/framework/diagram/tests/figure-drag-zoom.test.ts
git commit -m "feat(diagram): zoom-correct figure drag via HostToContent"
```

---

### Task 7: full suite, typecheck, templates, bump + publish

**Files:**
- Modify: `Mural/package.json` (version 0.8.0 → 0.9.0)

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: green (prior full run baseline 4299 pass / 0 fail / 3 skipped; this rework changes diagram tests but should keep the suite green).

- [ ] **Step 2: Typecheck + templates**

Run: `npm run typecheck` then `npm run build:templates`
Expected: both clean.

- [ ] **Step 3: Bump version**

Edit `Mural/package.json`: `"version": "0.9.0"`.

- [ ] **Step 4: Commit the bump**

```bash
git add package.json
git commit -m "chore: bump 0.9.0 — LayoutTransform diagram camera + scrollbars"
```

- [ ] **Step 5: Publish to local Verdaccio** (for SP5)

Run: `npm publish` (registry is the local Verdaccio per project config — do NOT publish to npmjs; do NOT commit `.npmrc`).
Expected: `+ @pragmatic-tech-ai/mural@0.9.0`.

- [ ] **Step 6: Finish the branch** — use superpowers:finishing-a-development-branch (verify tests green, present merge options).

---

## Self-review notes

- **Spec coverage:** camera math (T1), template/scroll (T2), LayoutTransform camera + scroll-offset pan + HostToContent + tunnel wheel + Fit (T3), Ctrl+wheel-only gesture (T4), zoom-correct drop/connector (T5), zoom-correct figure drag (T6), publish (T7). Out-of-scope items (fit-centering, text-block adorner, rotated transforms) intentionally untouched.
- **Type consistency:** `Camera { zoom, offsetX, offsetY }` used identically across `camera.ts`, `diagram.ts`, tests. `HostToContent(hostX, hostY): Point` signature identical in producer (T3) and consumers (T5/T6). `CameraGestureHandlers { OnWheel }` matches the tunnel hook and the behavior.
- **Risk:** T6 (figure drag) is the intricate one; it is isolated behind `HostToContent` and covered by a dedicated zoom test plus the existing figure suite as a no-regression gate at zoom 1.
