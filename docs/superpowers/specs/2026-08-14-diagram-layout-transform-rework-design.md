# SP4 — Diagram zoom rework onto LayoutTransform + real scrollbars

**Status:** design approved (2026-08-14)
**Depends on:** SP3 (`Visual.LayoutTransform` / `EffectiveLayoutMatrix`, mural 0.8.0)
**Downstream:** SP5 (Plexus persistence: zoom + scroll offset)

## Goal

Replace the diagram's SP1 render-transform "camera" (a `RenderTransform` scale
**+** translate on `PART_Camera`, with the `ScrollViewer` neutralized) with a
desktop-standard model: **zoom is a `LayoutTransform` scale on `PART_Camera`, and
pan is the `ScrollViewer`'s scroll offset.** This restores native scrollbars,
wheel-scroll, and drag-to-edge auto-scroll, and — because a `LayoutTransform`
grows the measured footprint — the `ScrollViewer` sizes its scrollbars to the
zoomed content with no custom `IScrollInfo`.

Additionally (per scope decision), make the diagram's **interactive coordinate
handling zoom-correct at all zoom levels** — node drag, drop placement, and
connector-port hover — which the SP1 camera never did (they are correct only at
100% today).

## Background: why this works (verified against the code)

- **Tunnel wheel phase exists.** `Visual.OnPreviewPointerWheel` runs root→target
  before the bubble phase; setting `args.Handled = true` there suppresses the
  bubble phase entirely (`routed-event.ts` `dispatchPointer`). The `ScrollViewer`
  scrolls in the **bubble** `OnPointerWheel` and only when its scroll axes are
  enabled (`scroll-viewer.ts`). So Ctrl+wheel zoom must be a **tunnel** override
  that marks Handled; plain/Shift wheel falls through to the ScrollViewer.
- **Offset survives a same-tick zoom.** `ScrollViewer.HorizontalOffset/
  VerticalOffset` store the raw value; the SCP clamps via
  `effective{Horizontal,Vertical}Offset()` against the freshly-measured extent at
  ArrangeOverride. So "set `Zoom` (grows the LayoutTransform footprint → grows
  the extent), then set a larger offset in the same tick" is safe — the offset is
  clamped to the NEW extent at the next layout pass.
- **Element hit-testing is already transform-correct.** Picking goes through the
  browser's SVG CTM (`html-target.ts` `HitTest` → `elementsFromPoint` /
  `getScreenCTM`), which includes the emitted `EffectiveLayoutMatrix`
  (`svg-renderer.ts` `buildTransformAttr`). Clicks and selection land correctly
  at any zoom with no change.
- **Constant-size adorners already compose LayoutTransform.** SP3 taught the
  adorner layer's ancestor walk (`adorner.ts` `computeAdornedRectInLayerFrame`)
  to compose `EffectiveLayoutMatrix`. The template keeps `AdornerDecorator`
  wrapping `PART_Camera`, so selection handles stay a constant on-screen size and
  scroll with the content.
- **The only broken paths are the explicit host→content walks.** `canvas-drop-
  behavior` (`localPosition`), `connector-interactions-behavior` (`cursorToCanvas`),
  and `figure.ts` drag sum `ArrangedRect` offsets only. Their comments already
  note the SCP bakes the scroll offset (`−offX,−offY`) into that chain — so
  **scroll is handled by the existing walk; the one missing factor is the uniform
  camera scale.** Because `PART_Camera`'s `LayoutTransform` is a pure uniform
  `Scale(Zoom)`, the correct content point is exactly:

  ```
  content = (HostX − Σ ArrangedRect.X) / Zoom
  ```

  i.e. take the existing offset-only result and divide by `Zoom`. No general
  matrix inversion, no mural-core coordinate API needed.

## Coordinate model

Content space (item `Left`/`Top`) lives inside `PART_Camera`'s pre-transform
local frame. `PART_Camera.LayoutTransform = Scale(Zoom)` scales local→footprint.
The `ScrollViewer` translates the footprint by `−offset`. So a content point `c`
maps to a viewport (host) point:

```
viewport = c * Zoom − offset
```

and inversely `c = (viewport + offset) / Zoom`. Since the `ArrangedRect` chain
from the items panel to the root already equals `−offset` (SCP arranges content
at `−effectiveOffset`), `HostToContent` = `(Host − Σ ArrangedRect) / Zoom`.

## Component changes

### 1. `camera.ts` — value type + math switch to offset space

- `Camera` interface becomes `{ zoom, offsetX, offsetY }` (was `panX/panY`).
  `offset` is the ScrollViewer scroll offset (≥ 0), not a post-scale translate.
- `cameraMatrix(c)` → `Scale(zoom).Multiply(Translate(−offsetX, −offsetY))`
  (semantics: `viewport = content*zoom − offset`). Retained for tests/parity.
- `zoomAtPoint(c, pivot, factor)` — pivot is a **viewport** point:
  ```
  zoom = clampZoom(c.zoom * factor)
  cx = (pivot.X + c.offsetX) / c.zoom;  cy = (pivot.Y + c.offsetY) / c.zoom
  return { zoom, offsetX: cx*zoom − pivot.X, offsetY: cy*zoom − pivot.Y }
  ```
  Keeps the content point under `pivot` fixed. Result offset may be negative;
  the ScrollX/Y setters lower-clamp to 0 (upper clamp deferred to arrange).
- `fitBounds(content, viewport, padding)` — top-left framing (no centering,
  which a scroll offset cannot express): `zoom` unchanged (min of avail/size,
  floored at `CAMERA_FIT_FLOOR`); `offsetX = max(0, content.X*zoom − padding)`,
  `offsetY = max(0, content.Y*zoom − padding)`.
- `clampZoom`, `CAMERA_MIN/MAX/FIT_FLOOR` unchanged.

### 2. `diagram.ts` — LayoutTransform camera, scroll-offset pan, coordinate helper

- **Remove** `PanXKey`/`PanYKey` DPs + `PanX`/`PanY` accessors; remove
  `_camTranslate`, `TransformGroup`, `TranslateTransform` usage.
- **Keep** `ZoomKey` DP + all zoom command DPs + `CameraEnabledKey`.
- `_syncCameraTransform()` now ensures `PART_Camera.LayoutTransform` is a
  `ScaleTransform` and sets `ScaleX = ScaleY = Zoom` (scale only).
- New `get ScrollHost(): ScrollViewer | undefined` → `GetTemplateChild('PART_Scroll')`.
- New `ScrollX`/`ScrollY` accessors proxying `ScrollHost.HorizontalOffset/
  VerticalOffset`, lower-clamped to 0 on set.
- `Camera` / `SetCamera` operate on `{ zoom, offsetX, offsetY }` (offset via
  ScrollX/Y). `_applyFit` sets `Zoom` (bypassing `clampZoom`) + ScrollX/Y.
- `ZoomIn/ZoomOut` zoom about the viewport center; `ResetZoom` →
  `{ zoom:1, offsetX:0, offsetY:0 }`; `Fit`/`FitToSelection` via `fitBounds`.
  `_centerPivot`/`_viewportSize` unchanged (read `PART_Scroll` viewport).
- **New `HostToContent(hostX, hostY): Point`** — sum `ArrangedRect.X/Y` from
  `ItemsPanelInstance` up to root, then divide by `Zoom`. Single source of truth
  for host→content, used by the drop, connector, and figure-drag paths.
- **Wheel routing:** replace the bubble `OnPointerWheel` camera hook with a
  **tunnel** `OnPreviewPointerWheel` hook that forwards to the camera handler.
  Keep the `_dispatchWheel` test seam pointing at the same handler.
- `OnPropertyChanged`: `Zoom` → `_syncCameraTransform()` + `_applyCameraToConnectors()`.
  Remove the `PanX`/`PanY` branch.
- Remove the `OnGrab*` camera-handler calls in the preview-pointer overrides
  (grab-pan is dropped).

### 3. `zoom-pan-behavior.ts` — Ctrl+wheel zoom only

- `CameraGestureHandlers` shrinks to `{ OnWheel(args) }`.
- `OnWheel`: if **not** Ctrl, return (let it bubble → ScrollViewer scrolls);
  if Ctrl, zoom about the cursor and set `args.Handled = true`.
- Pivot: a **viewport** point = sum `ArrangedRect` from `PART_Scroll` up to root
  subtracted from `HostX/HostY` (excludes the scroll offset, which lives inside
  the ScrollViewer on `PART_Camera`). Replaces the old `PART_Camera`-based
  `cameraPivot` (which now would wrongly fold in the scroll offset).
- Remove plain-wheel pan and all middle-drag grab-pan (`OnGrab*`).

### 4. `diagram.template.mu` — enable scroll, drop the render transform

- `PART_Scroll`: `HorizontalScrollEnabled = true`, `VerticalScrollEnabled = true`
  (remove the SP1 neutralization). `IsAutoHideScrollBars = false` (always-visible
  desktop scrollbars).
- `PART_Camera`: plain `Border` (transparent) — no markup transform; the
  `LayoutTransform` is applied in code. `AdornerDecorator` still wraps
  `PART_Camera` inside `PART_Scroll`. Update the SP1 comment.

### 5. Interaction zoom-correctness (drop / connector / figure drag)

- `canvas-drop-behavior.localPosition` → `diagram.HostToContent(HostX, HostY)`.
- `connector-interactions-behavior.cursorToCanvas` → `diagram.HostToContent(...)`.
- `figure.ts` drag: keep the click-vs-drag threshold in **screen** space
  (`HostX − pressHostX` vs `CLICK_THRESHOLD_PX`), but map the **position write**
  through content space: grab offset = `HostToContent(press) − {Left,Top}`; on
  move `Left/Top = HostToContent(cursor) − grabOffset`. Group-partner and
  rigid-connector deltas use the content-space delta. The existing manual
  scroll-compensation (`_pressScrollOffset*`, `_dragScrollViewer`) becomes
  redundant (a live `HostToContent` read already includes `−offset`) and is
  removed.
- `connector.applyCameraZoom(zoom)` (hit-band width `= HitWidth / zoom`) is
  unchanged — still keyed off `Zoom`.

## API surface changes (all internal to mural + its own Plexus consumer)

- `Camera` type: `panX/panY` → `offsetX/offsetY`.
- `Diagram`: remove `PanX/PanY`; add `ScrollHost`, `ScrollX/ScrollY`,
  `HostToContent`; `Camera`/`SetCamera` shape change.
- These are consumed only by SP5 (Plexus persistence), which is updated to
  persist `{ zoom, offsetX, offsetY }` and to subscribe to `Zoom` + the
  ScrollViewer offset for debounced persist. No external consumers.

## Testing

Framework-importing tests run with `npm test` (or
`npx tsx --conditions=development --test --test-force-exit "src/**/*.test.ts"`).
Pure value tests (`camera.ts`) need no conditions flag.

- **camera.test.ts** (rewrite for offset space): `zoomAtPoint` keeps the pivot's
  content point fixed; `fitBounds` frames top-left with padding & floor;
  `cameraMatrix` maps `content → content*zoom − offset`.
- **diagram-camera.test.ts**: `Zoom` write sets `PART_Camera.LayoutTransform`
  scale; `ScrollX/Y` proxy the ScrollViewer offset (lower-clamped); `Fit`
  produces expected `{zoom, offset}` for a known content bounds + test viewport;
  `HostToContent` = `(host − Σ ArrangedRect)/Zoom` (assert at zoom 1 and 2 with a
  faked ArrangedRect chain / `_testViewportSize`).
- **zoom-pan-behavior.test.ts** (update): Ctrl+wheel zooms about the cursor and
  marks Handled; non-Ctrl wheel is ignored (not Handled) so it bubbles.
- **Scroll extent** (extend existing scroll-viewer proof from SP3): a diagram
  whose `PART_Camera` has `LayoutTransform = Scale(2)` reports a doubled
  `ExtentWidth` in its `PART_Scroll`.
- **Figure drag** (new/updated): with a stubbed `HostToContent`/`Zoom`, a press
  + move at zoom 2 moves `Left/Top` by the content-space delta (half the screen
  delta), and the click-vs-drag threshold still fires on a small screen wiggle.
- Full suite green + `npm run typecheck` + `npm run build:templates`; bump mural
  minor (0.8.0 → 0.9.0) and publish to local Verdaccio for SP5.

## Out of scope

- **Fit centering** of content smaller than the viewport — a scroll offset can't
  express it; content sits top-left (desktop-standard). Revisit only if asked.
- **Rotated/skewed LayoutTransform** on the camera — the `÷Zoom` coordinate math
  assumes a pure uniform scale. A general `Visual.TransformToVisual` core API is
  a possible future refactor, not needed here.
- **Text-block move/rotate zoom-correctness** (`text-block-adorner.ts`) — a
  separate delta-based path; not touched by this rework (unchanged from today).

## SP5 preview (Plexus)

Persist `{ zoom, offsetX, offsetY }` (replacing `zoom, panX, panY`); hydrate on
open by setting `Diagram.Zoom` + ScrollViewer offset; debounced persist
subscribes to `Zoom` + offset changes. Toolbar/keyboard commands unchanged.
