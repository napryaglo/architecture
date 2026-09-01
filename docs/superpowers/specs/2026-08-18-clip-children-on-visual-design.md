# Visual ClipChildren Design

**Date:** 2026-08-18
**Status:** Approved (design)
**Repo:** `@pragmatic-tech-ai/mural`

## Problem

A shaped, bordered container often needs to clip its **content to the inside of
its border** — a thick or rounded `Border`, or `HeartPresenter`'s heart with a
magenta stroke, wants child content trimmed to the region *inside* the painted
outline, while the outline itself keeps painting.

The existing clip machinery can't express this:

- **`Visual.Clip`** and **`ClipToBounds` + `buildClipGeometry(size)`**
  ([visual.ts](../../../src/visual-engine/visual.ts), the
  [ClipToBounds design](2026-08-17-visual-clip-to-bounds-design.md)) clip the
  **whole subtree** — the visual's own paint *and* its children, uniformly.
  Clipping to inside the border would also clip the border stroke away.
- A `Border` with a thick/rounded border can only `ClipToBounds` to its **outer**
  rounded rect ([border.ts:195](../../../src/basic/border.ts)); content still
  slides under the border stroke.

`HeartPresenter` ([heart-presenter.ts](../../../src/basic/heart-presenter.ts))
solved this locally with a `ClipChildren` DP that clips the *content visual*
(not itself) to the heart inset by the pen, translating the geometry into the
child's local space to survive alignment. That behaviour is generally useful and
should live on `Visual`, available to every shaped container — starting with
`Border`.

## Approach

Mirror the ClipToBounds hoist: put the **machinery** on `Visual` behind one
virtual hook that subclasses override to **author** the inset geometry. A new
`ClipChildren` DP drives a *children-only* clip — distinct from `Clip` /
`ClipToBounds`, which stay whole-subtree.

Apply the clip as a **children group** in the renderers, not by writing each
child's `Clip` DP (the local `HeartPresenter` approach). The children group sits
at the visual's origin, so:

- the clip geometry stays in the **visual's own local space** — the per-child
  translation `HeartPresenter` needed disappears;
- the visual's own paint is a sibling of the group and is never clipped;
- no child's public `Clip` DP is clobbered.

`HeartPresenter` then collapses to a single hook override. `Border` gains the
same hook (inset by `BorderThickness`), opt-in via `ClipChildren`.

Rejected: **per-child `Clip` writes** (the current `HeartPresenter` mechanism) —
clobbers consumer-set child clips, needs per-child translation, and emits N clip
defs; the children group is cleaner and the user chose it. Rejected: **folding
`ClipToBounds` + `ClipChildren` into one `ClipMode` enum** — churns a stable,
widely-used API for no gain here.

## Components

### `Visual` (visual-engine/visual.ts)

- **`ClipChildren: boolean` DP** — default `false`, `MetaData.Arrange` (toggling
  re-arranges, re-running the sync). A plain Visual does not clip its children.
- **`protected buildChildClipGeometry(size: Size): Geometry | undefined`** — the
  authoring hook, called only with a positive `size` (the degenerate guard lives
  in the sync, matching `buildClipGeometry`). Base implementation returns
  `this.buildClipGeometry(size)` — i.e. a plain Visual with `ClipChildren` clips
  its children to its bounds shape (a rect; a rounded rect for a `Border`).
  Subclasses override to inset.
- **`ChildClip: Geometry | undefined` DP** — `MetaData.None`, set internally by the
  sync (never authored directly), in the visual's local space. The render consumers
  read it, exactly as they read `Clip` / `HitTestGeometry`. Public getter, internal
  setter.
- **`private _childClipApplied` latch + `private syncChildClip(size: Size)`** —
  parallels `syncClipToBounds`: if `ClipChildren` is on, return early on a
  degenerate `size`; otherwise `this.ChildClip = this.buildChildClipGeometry(size)`
  and set the latch. If off and the latch is set, clear `ChildClip` and drop the
  latch. (`ChildClip` is a dedicated slot, so no consumer value is ever at risk —
  the latch is for symmetry and clean teardown.)
- **`Arrange()` tail** — call `this.syncChildClip(this._renderSize)` alongside the
  existing `syncClipToBounds`, after `_renderSize` is final.

### `SvgRenderer` (visual-engine/drawing/svg-renderer.ts)

- **`RenderableVisual` interface** gains `readonly ChildClip: unknown`.
- **Children group.** When `visual.ChildClip` is set, children recurse into a
  lazily-created `<g class="mural-children" clip-path="url(#…)">` inserted under the
  outer `<g>` **after** the `mural-own` group (so children still paint on top and the
  own paint is unclipped). When `ChildClip` is unset, children recurse directly into
  the outer `<g>` as today. The walk ([svg-renderer.ts:486](../../../src/visual-engine/drawing/svg-renderer.ts))
  passes the group (or outer) as each child's parent.
- **Clip def.** Generalize the existing `applyClip`
  ([svg-renderer.ts:655](../../../src/visual-engine/drawing/svg-renderer.ts)) — already
  handles `RectangleGeometry`, `EllipseGeometry`, and now `PathGeometry` — into a
  reusable "build a `<clipPath>` for this geometry and reference it on this element",
  applied to the children group. The geometry is in the visual's local space, so no
  transform composition is needed.
- **Lifecycle.** Track the group in the per-visual `info` record. On toggle
  (`ChildClip` appears/disappears, respond on arrange-dirty **and** render-dirty like
  `applyClip`), create/remove the group and move existing child `<g>`s between the
  group and the outer `<g>`. The orphan sweep must treat the group as owned, not
  reap it.

### `headless-target` (visual-engine/targets/headless-target.ts)

- The headless walk already pushes the visual's `Clip` before `RenderOverride` +
  children and pops after ([headless-target.ts:98-109](../../../src/visual-engine/targets/headless-target.ts)).
  Add: after own paint, before recursing children, push `ChildClip` (if set); pop
  after children. This keeps headless hit-testing / geometry parity with the DOM
  renderer without a group concept.

### `Border` (basic/border.ts)

- **`protected override buildChildClipGeometry(size)`** — the **inner** rounded rect:
  `resolveCorners(size)` shrunk by `BorderThickness` on each edge (radii reduced by the
  same, floored at 0). Reuses the existing `resolveCorners`
  ([border.ts:208](../../../src/basic/border.ts)). Opt-in: default `ClipChildren`
  stays `false`, so existing Borders are visually unchanged; setting `ClipChildren=true`
  clips content to inside the border. (`BorderThickness` is already `MetaData.Arrange`,
  so the geometry rebuilds on change.)

### `HeartPresenter` (basic/heart-presenter.ts)

- **Remove** the local `ClipChildren` DP (now inherited), `clipContent`, the
  `child.Clip` writes, and `buildHeart`'s `(dx, dy)` translation params.
- **`protected override buildChildClipGeometry(size)`** → `buildHeart(size, pen)`
  (inset by the full pen — the stroke's inner edge). The children group is in the
  visual's space, so no translation.
- The heart chrome (own paint via `RenderOverride`) and `HitTestGeometry` (outer heart)
  are unchanged. The demo's `ClipChildren=true` still works via the inherited DP.

## Data flow

```
Arrange(finalRect)
  → ArrangeOverride (subclass arranges its children)
  → syncClipToBounds(renderSize)   // existing: whole-subtree Clip
  → syncChildClip(renderSize)      // NEW: ChildClip = ClipChildren ? buildChildClipGeometry : undefined
Render walk (SvgRenderer / headless)
  → own paint (unclipped by ChildClip)
  → if ChildClip set: children under a clipped group (SVG) / inside a pushed clip (headless)
  → else: children as today
```

## Hit-testing

The `mural-children` group is not a `mural-visual`, so the back-ref walk
([svg-renderer.ts:299](../../../src/visual-engine/drawing/svg-renderer.ts)) that
recovers a Visual from a painted node skips it unchanged. SVG `clip-path` also clips
**pointer events**, so content clipped away is not hittable — matching the paint.
Per-visual `HitTestGeometry` is unaffected.

## Edge cases

- **Degenerate size** — `syncChildClip` returns early on `size ≤ 0`, so
  `buildChildClipGeometry` overrides never see a zero box.
- **No children** — group is never created; nothing to clip.
- **Runtime toggle** — flipping `ClipChildren` re-arranges (rebuilds `ChildClip`),
  and the renderer moves children into/out of the group.
- **`ClipChildren` + `ClipToBounds` together** — independent: the outer `Clip`
  (whole subtree) composes with the children group clip (children only). Both apply.
- **Render-only inset inputs** — `Border.BorderThickness` is `MetaData.Arrange`, so
  its `ChildClip` rebuilds on change. `HeartPresenter.Stroke` is `MetaData.Render`; a
  thickness change without a re-arrange would leave `ChildClip` stale, so
  `HeartPresenter` overrides `OnPropertyChanged` to `InvalidateArrange()` on a `Stroke`
  edge — the same render-only-input refresh pattern `Border` already uses for
  `CornerRadius`.

## Testing

- **Visual (unit, node:test):** `ClipChildren` off ⇒ `ChildClip` undefined; on ⇒
  `ChildClip` = `buildChildClipGeometry`; the latch clears on toggle-off; degenerate
  size no-ops.
- **Border (unit):** `buildChildClipGeometry` returns a rounded rect inset by
  `BorderThickness` (bounds inset; radii reduced).
- **HeartPresenter (unit):** `buildChildClipGeometry` = heart inset by the full pen,
  strictly inside the drawn (half-pen) heart — the existing offset test, retargeted at
  the hook. `HitTestGeometry` unchanged.
- **SvgRenderer (jsdom):** with `ChildClip` set, children live under a
  `<g class="mural-children" clip-path>` whose `<clipPath>` carries the right shape
  (rect / ellipse / path); own paint stays a direct, unclipped child; toggling
  `ClipChildren` moves children between the group and the outer `<g>` and doesn't leak
  orphan defs.
- **headless-target (unit):** `ChildClip` is pushed around children and popped, not
  around own paint.

## Risks

- **DOM restructure.** Any code assuming children are direct kids of the outer `<g>`
  (overlay layer, z-order, orphan sweep, existing renderer tests) must be audited and
  updated. Highest-risk item; front-load it in the plan.
- **Incremental correctness** on `ClipChildren` toggle (moving live child `<g>`s).
- **Two renderers** must stay in parity (group vs push/pop) — covered by the tests above.

## Migration

- No API removed; `ClipChildren` defaults `false` everywhere, so all existing visuals
  are unchanged until they opt in.
- `HeartPresenter`'s local `ClipChildren` DP is replaced by the inherited one — same
  name, same author-facing markup, so the demo and any consumer are source-compatible.
