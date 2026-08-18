# Border + ContentControl Fill/Stroke Migration Design

**Date:** 2026-08-19
**Status:** Approved (design)
**Repo:** `@pragmatic-lab/mural` (+ downstream `@pragmatic-lab/plexus` rollout)

## Problem

`Border` carries its own border-stroke properties — `BorderBrush` (Brush) and
`BorderPen` (Pen escape hatch) — which synthesize `Visual`'s base `Stroke` pen
via a `syncStroke()` / `OnPropertyChanged` machine. `ContentControl` (the base
for Button/Card/Chip/…) mirrors this with its own `BorderBrush` DP that
TemplateBinds to the inner Border in its default template. This duplicates the
`Fill` + `Stroke` model that `Shape` (and the base `Visual` paint path)
already use. The background fill already migrated to the inherited `Fill` DP
(the `Background`→`Fill` rename); this finishes the job for the stroke side.

Goal: **`Fill` + `Stroke` become the library-wide standard for chrome.**
`Border` and `ContentControl` drop `BorderBrush` / `BorderPen` and use the
**inherited** `Fill` (background) and `Stroke` (border pen) DPs directly. After
this change no framework class exposes a `BorderBrush`/`BorderPen` DP for
Border-outline chrome.

**Out of scope (domain DPs, not Border chrome — left untouched):**
`Table.BorderBrush` (per-cell gridline brush, drawn by Table's own layout, not
a pen outline) and `PaginatedCanvas.PageBorderBrush` (page-edge stroke). These
are independent of `Border`/`ContentControl` and semantically not a
Fill-or-Stroke on this element.

## Constraint that shapes the design

`BorderThickness` is load-bearing and stays. It is a `Thickness` (per-side),
and its **non-uniform** form paints a bespoke four-rect frame used by real
components — single-edge underlines/dividers (`(0,0,0,1)` in navigation,
notifications, dock-tabs, document-tabs) and connected button-group borders
(`(1,1,0,1)`). A single scalar-thickness `Stroke` pen cannot express these, so
`BorderThickness` and the four-rect path must remain.

## Decision: BorderThickness is the width authority

For a **uniform** border, the painted stroke width **and** the child layout
inset both come from `BorderThickness` (unchanged from today). `Stroke`
supplies only the **Brush** and the pen-style knobs (`DashStyle`, `LineCap`,
`LineJoin`, `MiterLimit`); **`Stroke.Thickness` is ignored** on `Border`.

Consequences (accepted):
- A uniform site carries a slightly redundant pair — `Stroke = Pen [ Brush =
  @X ]` plus `BorderThickness = 1` — but this keeps churn off the ~180
  existing `BorderThickness` sites.
- A brush-only hover trigger (`X.BorderBrush = @Y`) becomes a full-Pen swap
  (`X.Stroke = Pen [ Brush = @Y ]`).

Rejected alternative: making `Stroke.Thickness` the width source and dropping
`BorderThickness` on uniform sites. Cleaner per-site markup, but it churns the
~180 `BorderThickness` sites and still needs `BorderThickness` for the
non-uniform frame — a split authority that is harder to reason about than "one
DP owns width."

## Components

### `Border` (`src/basic/border.ts`)

**Removed:** `BorderBrushKey` / `BorderBrush`, `BorderPenKey` / `BorderPen`,
`syncStroke()`, and the `OnPropertyChanged` override (its only job was calling
`syncStroke`). `Border` no longer writes the base `Stroke` DP — the consumer
owns `Stroke`.

**Kept unchanged:** `BorderThicknessKey`, `CornerRadiusKey`, `PaddingKey`,
`MeasureOverride`, `ArrangeOverride`, `buildClipGeometry`,
`buildChildClipGeometry`, `resolveCorners`, `buildPaintGeometry`,
`ContentChild`, `TopContentInset`, `buildRoundedRectPath`.

**Inherited (used, not redeclared):** `Fill` (background brush), `Stroke`
(border pen) — both already on `Visual`.

**`RenderOverride(dc)` — Border owns it end to end (does NOT delegate the
stroke to `super`, because the base would paint the raw `Stroke` at
`Stroke.Thickness`):**

- Compute `uniform = bt.Left === bt.Top && bt.Top === bt.Right && bt.Right
  === bt.Bottom` where `bt = this.BorderThickness`.
- **Fill:** paint the background over the *un-stroked* paint geometry. Uniform:
  the fill sits under the stroke, so paint fill over `buildPaintGeometry(size,
  bt.Top/2)` together with the effective pen in one `DrawGeometry`. Non-uniform:
  paint fill alone over `buildPaintGeometry(size, 0)`, then the frame on top.
  (Matches today's visual result: today `super.RenderOverride` filled +
  stroked the uniform case, and filled-only the non-uniform case.)
- **Uniform stroke:** build the effective pen only when `stroke?.Brush !==
  undefined && bt.Top > 0`:
  ```
  const eff = new Pen(stroke.Brush, bt.Top);
  eff.DashStyle  = stroke.DashStyle;
  eff.LineCap    = stroke.LineCap;
  eff.LineJoin   = stroke.LineJoin;
  eff.MiterLimit = stroke.MiterLimit;
  dc.DrawGeometry(this.Fill, eff, this.buildPaintGeometry(size, bt.Top / 2));
  ```
  When there is no effective pen, paint fill only: `dc.DrawGeometry(this.Fill,
  undefined, this.buildPaintGeometry(size, 0))` (skip entirely if `Fill` is
  also undefined and `size` is degenerate, matching the base no-op guard).
- **Non-uniform frame:** paint `dc.DrawGeometry(this.Fill, undefined,
  buildPaintGeometry(size, 0))` for the background, then the four filled
  rectangles exactly as today but with `this.Stroke?.Brush` as the brush
  (replacing `this.BorderBrush`). Top/Bottom span full width; Left/Right sit
  between them; `CornerRadius` ignored for this case.
- Degenerate-size guard (`size.Width <= 0 || size.Height <= 0`) returns early,
  as the base does.

`Pen` shape (for reference): `constructor(brush?, thickness?)`; `DashStyle`,
`LineCap`, `LineJoin`, `MiterLimit` are settable properties (defaults Solid /
Flat / Miter / 10).

### `Border` doc comment

Update the class header: `Fill` = background, `Stroke` = the border pen (brush
+ style; thickness ignored — `BorderThickness` rules width), `BorderThickness`
= uniform/per-side width + child inset. Drop the `BorderBrush` / `BorderPen`
prose.

### `ContentControl` (`src/framework/base/content-control.ts`)

**Removed:** `BorderBrushKey` / `BorderBrush` DP + accessors.

**Kept:** `BorderThicknessKey` / `BorderThickness` (still forwards to the inner
Border, which keeps `BorderThickness`).

**Inherited (used, not redeclared):** `Fill`, `Stroke` — both on `Visual`.
`ContentControl.Stroke` is the Pen a consumer sets; the default template
forwards it to the inner Border unchanged.

**Default template (`src/framework/base/base.template.mu`,
`DefaultContentControlTemplate`):** the inner Border's chrome bindings change
from `Fill = $$Fill, BorderBrush = $$BorderBrush, BorderThickness =
$$BorderThickness` to `Fill = $$Fill, Stroke = $$Stroke, BorderThickness =
$$BorderThickness`. `Stroke` is a direct Pen passthrough (`$$Stroke`), NOT a
`Pen [...]` wrapper — the source `ContentControl.Stroke` is already a Pen.

## Data flow

```
author sets:  Fill (Brush)  Stroke (Pen: brush+style)  BorderThickness  CornerRadius  Padding
measure/arrange ── inset child by BorderThickness + Padding (unchanged)
render ─► Border.RenderOverride
           uniform      → Fill + effectivePen(Stroke.brush/style, width=BorderThickness.Top)
                          over buildPaintGeometry(size, BorderThickness.Top/2)
           non-uniform  → Fill over buildPaintGeometry(size, 0),
                          then 4 rects painted with Stroke.Brush
clip     ─► buildClipGeometry (outer), buildChildClipGeometry (inner, BorderThickness)  (unchanged)
```

## Consumer migration (Mural, this change)

Because `BorderBrush`/`BorderPen` are gone on **both** `Border` and
`ContentControl`, the sweep is uniform — no per-occurrence "is this a Border or
a ContentControl?" classification. Recipes:

**Markup (`.mu`), ~108 `BorderBrush` + the `BorderPen` sites:**
- Value is a **Brush** (`@Resource`, `#hex`, or a data `$brushBinding`):
  `BorderBrush = @X` → `Stroke = Pen [ Brush = @X ]`. Any sibling
  `BorderThickness` stays.
- Value is a **binding to a former-`BorderBrush` source that is now a Pen**
  (`$$BorderBrush` / `$BorderBrush` — the source control's DP was renamed
  `BorderBrush`→`Stroke`): `BorderBrush = $$BorderBrush` → `Stroke = $$Stroke`
  (direct Pen passthrough, NO `Pen [...]` wrapper). This is the
  `ContentControl` default template case.
- `BorderPen = <pen>` (`$Binding` or `@Resource`) → `Stroke = <pen>`.
- `when`-trigger write `X.BorderBrush = @Y` → `X.Stroke = Pen [ Brush = @Y ]`.
  Where several triggers swap the same border's brush across states, the plan
  MAY hoist per-state `Pen` resources instead of repeating inline `Pen [...]`,
  chosen per file for readability.
- After editing any `.mu`, regenerate compiled artifacts where the project
  precompiles them (Mural's `build:templates`; Plexus's `compile:mu`).

Inline `Pen [ Brush = @X, Thickness = 1 ]` as a property value is verified to
compile and instantiate a real `Pen` (spike, 2026-08-19). `$$` TemplateBindings
resolve normally inside a template body.

**TypeScript, ~14 non-test files + 5 test files:**
- Border/ContentControl instance writes: `x.BorderBrush = brush` →
  `x.Stroke = new Pen(brush)`; `x.BorderPen = pen` → `x.Stroke = pen`.
- Instance reads: `const b = x.BorderBrush` → `const b = x.Stroke?.Brush`.
- `ContentControl.BorderBrushKey` references (metadata overrides, bindings) →
  `Visual.StrokeKey`.
- Test assertions that read `BorderBrush`/`BorderPen` or the synthesized
  `Stroke` update to the new contract (a uniform border's painted pen has
  `Brush === Stroke.Brush` and `Thickness === BorderThickness.Top`).

**Explicitly NOT migrated:** `Table.BorderBrush` (gridlines),
`PaginatedCanvas.PageBorderBrush` (page edge) — independent domain DPs. Any
`.ts`/`.mu` reference to *those* stays as-is. `Table.HeaderBackground` likewise
(already handled by the earlier Fill rename).

## Ordering (breaking removal)

Removing the DPs breaks every unmigrated reference's compile at once, so the
whole change lands as one coordinated branch and the definitive green gate is
the FINAL task (`tsc -p tsconfig.build.json` + full `npm test`). Per-task
verification uses targeted single-file test runs for the area touched (`npx
tsx --test <file>`), which compile in isolation. The core `Border` /
`ContentControl` change and their own tests come first; consumer batches
(grouped by area to minimise cross-references to still-unmigrated siblings)
follow; the final task proves whole-project green.

## Rollout

1. Land the `Border` change + all Mural consumer sites; full Mural suite green;
   `tsc` clean.
2. `npm version patch` → `0.9.9`, publish to Verdaccio, commit.
3. Plexus: bump `^0.9.9`, migrate its ~15 `BorderBrush`/`BorderPen` sites
   (same recipe; `npm run compile:mu` after `.mu` edits), full Plexus suite
   green, commit.

Pushes happen only when the user asks.

## Testing

- **Uniform border paints the effective pen:** a `Border` with `Stroke = Pen [
  Brush = red ]` and `BorderThickness = 4` emits one `DrawGeometry` whose pen
  has `Brush === red` and `Thickness === 4`, over a geometry inset by 2.
- **Stroke.Thickness ignored:** the same border with `Stroke` thickness set to
  99 still paints at width 4 (from `BorderThickness`).
- **Pen style carried:** `DashStyle`/`LineCap`/`LineJoin`/`MiterLimit` from
  `Stroke` appear on the effective pen.
- **Stroke suppressed:** no `Stroke` brush, or `BorderThickness.Top === 0` →
  fill-only, no stroke pen.
- **Non-uniform frame uses Stroke.Brush:** `BorderThickness = (0,0,0,1)`,
  `Stroke = Pen [ Brush = blue ]` → the base fill has no stroke and a single
  bottom `DrawRectangle` with `blue`.
- **Fill unchanged:** `Fill` still paints the background under both paths.
- **Layout unchanged:** child inset still equals `BorderThickness + Padding`.
- **Regression:** existing `border.test.ts` updates to the new API and stays
  green; the full Mural suite stays green.

## Scope & constraints

- One plan: the `Border` change is small; the bulk is a mechanical consumer
  sweep. Tasks split by boundary (core Border + tests, then consumer batches by
  area) so each ends green.
- Every test file lives in a `tests/` subfolder next to its source.
- Enums over string-literal unions (none introduced).
- No `node:fs`/`node:path` in framework/renderer code.
- Removing `BorderBrush`/`BorderPen` is a breaking public-API change; it is the
  point of the task. Downstream (Plexus) is migrated in the same rollout.
