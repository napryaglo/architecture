# Visual ClipToBounds Design

**Date:** 2026-08-17
**Status:** Approved (design)
**Repo:** `@pragmatic-lab/mural`

## Problem

Clip-to-bounds — "cut the content off at my outline" — lives entirely on `Border`
([border.ts:128-248](../../../src/basic/border.ts)). Any other `Visual` that wants
to clip its subtree to its bounds must either subclass `Border` or hand-roll the
same latch + arrange-time sync. `Border` mixes two concerns: *authoring the clip
geometry* (a rounded rect from its corner radii) and *the machinery of applying
it* (a `ClipToBounds` DP, an ownership latch so it never clobbers a hand-set
`Clip`, an arrange-time sync, and an `OnPropertyChanged` refresh because
`CornerRadius` is render-only). Only the first concern is Border-specific.

Separately, `Visual.Clip` is typed `unknown`
([visual.ts:318](../../../src/visual-engine/visual.ts)) on a since-void rationale
("keep the runtime tier off the `Geometry` class") — the sibling
`HitTestGeometry` DP on the same class is already typed `Geometry | undefined`
([visual.ts:382](../../../src/visual-engine/visual.ts)), and both render consumers
already assume the concrete geometry classes.

## Approach

Hoist the *machinery* to `Visual` behind a single virtual hook; subclasses
override only the hook to *author* the geometry. `Border` collapses to that one
override. `ScrollContentPresenter` / `ScrollViewer`, which set `Clip` directly
(clip-to-bounds off), stay untouched — the ownership latch guarantees it.

Rejected: a shared base class between the two, or leaving the machinery on
`Border` and having other Visuals delegate up to a Border instance — both keep
the two concerns entangled.

## Components

### `Visual` (visual-engine/visual.ts)

- **`ClipToBounds: boolean` DP** — default `false`, `MetaData.Arrange` (toggling
  re-arranges, which re-runs the sync). WPF parity: a plain Visual does not clip.
- **`protected buildClipGeometry(size: Size): Geometry`** — the delegation hook,
  called only with a positive `size` (the degenerate guard lives in the sync). Base
  implementation returns `new RectangleGeometry(new Rect(0, 0, size.Width, size.Height))`.
  Any Visual can now clip to its rectangular bounds; subclasses override to shape it.
- **`private _clipToBoundsApplied` latch + `private syncClipToBounds(size: Size)`** —
  if `ClipToBounds` is on: return early when `size.Width <= 0 || size.Height <= 0`
  (wait for a real arranged size, no change — matches today's Border); otherwise
  `this.Clip = this.buildClipGeometry(size)` and set the latch. If `ClipToBounds` is
  off and the latch is set, clear `Clip` and drop the latch. The latch means
  clip-to-bounds owns the `Clip` DP *only while the flag is on*, so a hand-set
  `Clip` (ScrollViewer) is never clobbered, and turning the flag off only clears a
  clip that clip-to-bounds itself applied. Centralizing the degenerate guard here
  keeps every `buildClipGeometry` override free of size checks.
- **`Arrange()` tail** — call `this.syncClipToBounds(this._renderSize)` after
  `_renderSize` is final (after the `ArrangeOverride` calls, near the
  `_isArrangeValid = true` at [visual.ts:1350](../../../src/visual-engine/visual.ts)).
  Setting the render-metadata `Clip` DP during arrange is already what Border does
  today, so it is proven safe.
- **Retype `Clip` DP `unknown` → `Geometry | undefined`** — DP registration
  ([visual.ts:318](../../../src/visual-engine/visual.ts)) and the getter/setter
  ([visual.ts:1128-1129](../../../src/visual-engine/visual.ts)). No import cycle:
  `geometry.ts` imports nothing from `visual.ts`, and `visual.ts` already imports
  the `Geometry` type. `buildClipGeometry` needs a value import of `RectangleGeometry`
  (and `Rect`, already imported) — cycle-free.

### `Border` (basic/border.ts)

Collapses to the geometry-authoring override:

- **Override `buildClipGeometry(size)`** — `resolveCorners(size)` → uniform
  corners return a rounded `RectangleGeometry(rect, tl, tl)`, asymmetric corners
  return a plain `RectangleGeometry(rect)`. This is today's exact behavior
  ([border.ts:230-248](../../../src/basic/border.ts)), minus the flag/latch checks.
- **Promote `CornerRadius` to `MetaData.Arrange | MetaData.Render`**
  ([border.ts:96-98](../../../src/basic/border.ts)) — a corner change re-arranges,
  so the clip refreshes through `Visual.syncClipToBounds` without any
  `OnPropertyChanged` hook. Keep the existing coerce factory.
- **Delete:** the `ClipToBounds` DP + its getter/setter (inherited from Visual
  now), `applyClipToBounds`, `_clipToBoundsApplied`, the `applyClipToBounds` call
  in `ArrangeOverride`, and the `CornerRadius` branch in `OnPropertyChanged` (the
  whole override goes if that branch was its only content).

### `ScrollContentPresenter` / `ScrollViewer` — unchanged

They set `content.Clip` / `_adornerLayer.Clip` directly with `ClipToBounds` off
([scroll-content-presenter.ts:236](../../../src/basic/scroll/scroll-content-presenter.ts)).
The latch never owns those DPs, so the hand-set clips survive every arrange.

## Data flow

```
ClipToBounds toggled on / size changes / CornerRadius changes (Arrange-metadata)
   → arrange pass runs
      → syncClipToBounds(renderSize)
         → buildClipGeometry(size)          [virtual: base rect, Border rounded rect]
         → this.Clip = geometry              [Geometry | undefined]
   → renderer emits <clipPath> wrapping the Visual's subtree
ClipToBounds toggled off
   → syncClipToBounds clears Clip (latch was set) and drops the latch
```

## Testing

- **Retarget** the existing `Border ClipToBounds` tests
  ([border.test.ts:116-170](../../../src/basic/tests/border.test.ts)) — they pass
  unchanged through Border's `buildClipGeometry` override (rounded clip on uniform
  radius, rectangular on asymmetric, cleared when toggled off).
- **New Visual-level tests** (in `src/visual-engine/tests/`):
  - a plain `Visual` with `ClipToBounds = true` gets a bounds `RectangleGeometry`
    `Clip` after `Arrange`;
  - toggling `ClipToBounds` off re-arranges and clears the `Clip`;
  - a hand-set `Clip` with `ClipToBounds` **false** survives an `Arrange` (latch
    invariant — the ScrollViewer case);
  - a degenerate arranged size (0×0) yields no clip.
- **Border reactivity:** a `CornerRadius` change now refreshes the clip via
  re-arrange (no `OnPropertyChanged`) — assert the `Clip` radius tracks the new
  `CornerRadius`.

## Constraints

- Additive on `Visual`; `Border` loses only members now inherited or unnecessary.
  No consumer of `Border.ClipToBounds` breaks (same DP name, now inherited).
- `Clip` retyped to `Geometry | undefined`; the two render consumers
  (`svg-renderer.applyClip` duck-types, DrawingContext `PushClip` uses `instanceof`)
  keep working unchanged.
- Every test file lives in a `tests/` subfolder next to its source.
- Enums over string-literal unions (no new ones introduced here).
- Publish only to local Verdaccio when releasing (not part of this spec's scope
  unless requested).
