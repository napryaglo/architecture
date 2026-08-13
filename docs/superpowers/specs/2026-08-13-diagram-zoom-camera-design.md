# Diagram Zoom & Camera — Design

**Date:** 2026-08-13
**Status:** Approved (brainstorm) — pending spec review → implementation plan
**Owner repo:** Mural (the `Diagram` control lives here); consumed by Plexus.

## Goal

Give the mural `Diagram` a zoomable, infinite-canvas camera: zoom (10–400%) and
pan over the diagram content, with constant-size selection handles, a full set of
zoom interactions, and the camera persisted per diagram.

## Architecture (one paragraph)

The diagram content is placed under a **camera** — a `RenderTransform`
(scale + translate) on a thin `CameraHost` decorator between the diagram's
(scroll-neutralized) `ScrollViewer` and its `ItemsPresenter`. Because the SVG
renderer emits the transform as a `<g transform="matrix(…)">` and hit-testing is
DOM-native via `getScreenCTM().inverse()`, rendering and hit-testing under zoom
are essentially free. Pan is the camera's translate (not scroll offsets); the
`ScrollViewer` is retained only for its structural roles (viewport clip, drop
bubble-path). Selection handles stay a constant on-screen size by hosting the
`AdornerDecorator` *outside* the camera and teaching the adorner layer to compose
ancestor render transforms when positioning adorners.

## Tech stack / existing facts this builds on

- `Transform` family (`ScaleTransform`, `TranslateTransform`, `TransformGroup`,
  `MatrixTransform`) already exists and drops into `Visual.RenderTransform`
  (`src/visual-engine/drawing/transform.ts`).
- The SVG renderer composes `RenderTransform` + `ArrangedRect` +
  `RenderTransformOrigin` into the outer `<g>` transform.
- Hit-testing is DOM-native: `html-target.ts` uses `document.elementsFromPoint`
  and `acceptsPoint()` → `getScreenCTM().inverse()` to map client coords into an
  element's local geometry space (`src/visual-engine/targets/html-target.ts`
  ~L67-83, L644-667). This already folds in *any* `<g transform>`, so a camera
  transform is transparent to hit-testing.
- **mural has no `LayoutTransform`** (verified: zero occurrences) — only
  post-layout `RenderTransform`. The camera model sidesteps this because it needs
  no scrollbar/extent tracking.
- The `Diagram` control (`src/framework/diagram/diagram.ts`) is an
  `ItemsControl`; its default template
  (`src/framework/diagram/diagram.template.mu`, `DefaultDiagram`) is
  `ScrollViewer PART_Scroll { AdornerDecorator { ItemsPresenter } }` over a
  `Canvas` items panel.
- The adorner layer (`src/visual-engine/adorner.ts`,
  `computeAdornedRectInLayerFrame`, L162-193) currently positions adorners by
  summing `ArrangedRect` offsets **only** — it ignores `RenderTransform`.

## Locked decisions

1. **Interaction set (Full):** Ctrl/⌘+wheel & trackpad-pinch zoom-at-cursor;
   plain wheel / two-finger pan; space-hold or middle-drag grab-pan;
   Ctrl `+`/`-`/`0` = zoom in / out / reset-to-100%; on-canvas `− / % / +` buttons;
   a `%` readout/dropdown with preset stops; **Zoom-to-Fit** and
   **Zoom-to-Selection**.
2. **Zoom range:** clamp to **10%–400%** for interactive zoom. Fit may compute a
   scale below the interactive min in order to frame very large diagrams, clamped
   to a hard floor (e.g. 2%).
3. **Pan model:** camera / infinite canvas. The `ScrollViewer` is kept as a
   clip/drop host with scrolling neutralized (scrollbars hidden, offsets pinned);
   pan is the camera translate. Fallback: replace the `ScrollViewer` with a plain
   clipping container if neutralization fights the camera.
4. **Adorners:** constant on-screen size — the adorner layer becomes
   transform-aware; the `AdornerDecorator` sits outside `CameraHost`.
5. **Persistence:** the camera (zoom + pan) is saved in the `.diagram` file's
   metadata slot (the mechanism added for viewpoints) and restored on open. A
   never-touched diagram opens at the **identity default** (Zoom 1, Pan 0 — content
   origin at the viewport origin); auto-Fit-on-first-open is out of scope for v1.

## Components

### mural

**M1 — Camera state on `Diagram`.**
New DPs on the `Diagram` control: `Zoom: number` (default 1), `PanX: number`,
`PanY: number` (default 0), each `MetaData.Render`. A read-only helper exposes
the composed camera `Matrix`. Setters clamp `Zoom` to the interactive range for
user-driven writes; Fit uses an internal setter allowing the wider range. The
control raises a `CameraChanged` routed event / notifies via the DP pipeline so
persistence and the `%` readout react.

**M2 — `CameraHost` decorator.**
A `Single`/`Decorator` whose `RenderTransform` is a `TransformGroup` of a
`ScaleTransform` (ScaleX = ScaleY = Zoom) and a `TranslateTransform`
(X = PanX, Y = PanY), bound to the owning `Diagram`'s camera DPs. It performs no
layout scaling (pure render transform) — it measures/arranges its child at
natural size. Zoom-at-cursor is expressed by adjusting PanX/PanY together with
Zoom so the pivot point stays fixed (see Data flow).

**M3 — Template rewrite (`diagram.template.mu`).**
`DefaultDiagram` becomes:
`ScrollViewer PART_Scroll (scrollbars hidden) { AdornerDecorator { CameraHost PART_Camera { ItemsPresenter } } }`.
The `AdornerDecorator` is outside `CameraHost` (constant-size adorners); the
`ItemsPresenter` (the `Canvas` of figures/connectors) is inside it. The zoom UI
overlay (M6) is added as a sibling within the `ScrollViewer` content, pinned
bottom-right, `IsHitTestVisible` where appropriate.

**M4 — Transform-aware adorner layer (`adorner.ts`).**
`computeAdornedRectInLayerFrame` composes each ancestor's `RenderTransform`
matrix (in addition to its `ArrangedRect` offset) when walking from the adorned
element up to the layer parent, producing the adorned rect in the layer's
(screen) frame. The adorner glyphs remain children of the unscaled layer, so they
render at a fixed pixel size while surrounding the scaled/panned figure.
**Backward-compatible:** with no ancestor transform the composed matrix is
identity, so existing adorner consumers (tree drag-ghost, text-block adorner,
alignment guides) are unchanged.

**M5 — `ZoomPanBehavior`.**
Attaches to the `Diagram`; translates input into camera DP writes:
- Ctrl/⌘+wheel and pinch → zoom-at-cursor (pivot under pointer).
- Plain wheel / two-finger → pan (translate).
- Space-hold or middle-button drag → grab-pan (cursor feedback).
- Keyboard Ctrl `+`/`-`/`0`.
It **takes wheel ownership** from the `ScrollViewer` (the SViewer's wheel-scroll
is disabled for the diagram). Detachable per mural's behavior contract.

**M6 — Zoom UI overlay + Fit.**
A small control cluster (`−  [100% ▾]  +  ⛶`) as a diagram overlay bound to the
camera DPs and to commands: zoom-in/out/reset, a preset-stop dropdown
(25/50/75/100/150/200/300/400), Fit, Fit-to-Selection. Pure helpers compute:
- `fitCamera(contentBounds, viewport, padding) → {zoom, panX, panY}` — union bbox
  of figures → framing transform.
- `fitToSelection(selectionBounds, …)` — same over the current selection bbox.

**M7 — Connector hit-band under zoom.**
On camera change, connectors set `HitTestStrokeWidth = base / zoom` so the
invisible click band stays a constant on-screen width.

### Plexus

**P1 — Bump mural**, recompile `.mu`.
**P2 — Persist the camera** in `.diagram` metadata: read on open → set the
`Diagram`'s camera DPs; write on camera-change (debounced) via the existing
metadata slot (mirror the viewpoints store helpers). Default (100% centered) when
absent.
**P3 — Surface/keyboard wiring** as needed (the overlay ships from mural; Plexus
only ensures focus/shortcut routing if required).

## Data flow

**Zoom-at-cursor:** given pointer `p` (client), current `{zoom, panX, panY}`, and
a zoom factor `f`: convert `p` to content space via the current camera inverse;
compute `zoom' = clamp(zoom * f)`; solve `panX'/panY'` so the same content point
maps back to `p` under `zoom'`. Pure function, unit-tested.

**Render:** camera DPs → `CameraHost.RenderTransform` matrix → SVG
`<g transform>` → scaled/panned content. Adorner layer composes that same matrix
(M4) → handles positioned in screen space, drawn at fixed size.

**Hit-test / drag:** unchanged — `elementsFromPoint` + `getScreenCTM().inverse()`
already account for the camera `<g transform>`. Behaviors that map pointer →
content coords must use the CTM-inverse path (audit item), not raw host coords.

**Persistence:** camera-change (debounced) → write `{zoom, panX, panY}` into
`.diagram` metadata; open → metadata → camera DPs.

## Testing

**Headless (unit):**
- Zoom-at-cursor pivot math: a content point under the cursor stays fixed across a
  zoom step; clamping at min/max.
- `fitCamera` / `fitToSelection`: bbox → framing with padding; giant-diagram floor.
- Transform-aware adorned-rect projection: a figure under a scale+translate
  transform projects to the expected screen rect; **identity transform is a
  no-op** (regression guard for existing adorner users).
- Camera round-trips through `.diagram` metadata (Plexus).

**Live-smoke (jsdom lacks `getScreenCTM`):**
- Hit-testing, selection, and drag correctness under zoom.
- ScrollViewer neutralization: no fight with drag-to-edge auto-scroll or
  scroll-into-view-on-selection; wheel ownership clean.
- Audit + fix any drag behavior using raw host coords instead of the CTM inverse.
- Connector waypoint drag and routing under zoom.

## Risks & fallbacks

- **Wheel-ownership handoff** from the `ScrollViewer` is the primary integration
  risk. Fallback: replace the SViewer with a plain clipping container that
  provides the viewport clip + drop bubble-path.
- **Drag behaviors assuming unzoomed coordinates** — contained; audited and fixed
  to route through the CTM inverse.
- **Adorner-layer change touches core mural** — mitigated by the identity-no-op
  property and the existing `adorner.test.ts`; all current consumers keep working.

## Decomposition

Two sub-projects, sequenced:
- **SP1 (mural):** M1–M7 — camera state, `CameraHost`, template, transform-aware
  adorner layer, `ZoomPanBehavior`, zoom UI + Fit, connector hit-band. Publish.
- **SP2 (Plexus):** P1–P3 — bump, persist camera in `.diagram` metadata, wiring.

## Out of scope (v1 / YAGNI)

- Auto-Fit on first open (default is the identity camera).
- Level-of-detail / render culling for very large diagrams (SVG scales fine).
- Minimap / overview navigator.
- Per-user zoom presets or a "zoom to page" concept.
- Animated/tweened zoom transitions (instantaneous is fine for v1).
