# BorderThickness Removal (uniform-Stroke Border + oriented Line for edges) — Design

**Status:** Draft for review
**Date:** 2026-08-23
**Repos:** Mural (primary), Plexus (consumer migration)

## Motivation

`Border` today carries a `Thickness`-typed `BorderThickness` DP that is the
authority for the border's painted width (per-side) AND the child layout inset,
while the `Stroke` pen supplies only the brush + dash/cap/join style — its
`Thickness` is deliberately **ignored** ([border.ts:45](../../../src/basic/border.ts#L45)).
This split is the root cause of a class of bugs: a self-painting node that hands
its box to a template `Border` cannot be styled by the Format Shape **Stroke**
editor, because the pen's width never reaches the paint. Phase 1 (already landed)
fixed the diagram nodes by having the `Figure` self-paint its box from the pen.
This spec finishes the job framework-wide: **remove `BorderThickness` entirely**,
make the `Stroke` pen the single width authority, and introduce a dedicated
`Separator` primitive for the one-sided edges (dividers, underlines, rules) that
a uniform pen cannot express.

Outcome: `Border` = `Fill` + `CornerRadius` + a uniform `Stroke` pen. Every
"outline" in the framework is styled the same way a `Shape`/`Figure` is styled —
one pen, brush + thickness together.

## Scope (measured)

- **Mural:** 48 `.mu`/`.ts` files, 301 `BorderThickness` occurrences.
- **Plexus:** 7 `.mu` source files (the `.mu.js` are regenerated).
- Occurrence taxonomy (Mural + Plexus):
  - **Uniform** `(N)` / `(N,N,N,N)` — ~92. Fold `N` into the `Stroke` pen.
  - **Zero** `(0)` — ~71. Delete (no visible border).
  - **One-sided** `(0,0,0,1)`, `(0,0,1,0)`, `(1,0,0,0)`, `(0,1,0,0)`,
    `(0,0,0,2)` — ~40. Replace with a `Separator` in the layout.
  - **Three-sided** `(1,1,0,1)` — 3 (button-groups/tabs). Redesign per-template
    (outer uniform border + internal separators).
  - **State triggers** `when(...) { X.BorderThickness = (N); }` — a handful.
    Rewrite to mutate `X.Stroke`.

## Component 1 — `Border` becomes uniform-Stroke

**API change (breaking):** delete `Border.BorderThicknessKey` and its
accessors. `Stroke.Thickness` is now **honored** as the border width. `Fill`,
`CornerRadius`, `Padding` unchanged.

**Layout preservation (critical).** Today `BorderThickness` reserves the full
per-side width in Measure/Arrange and the stroke paints *inside* that reserve
(inset by `BorderThickness.Top/2`), so content begins at the inner edge of the
stroke. To keep every uniform migration a 1:1 visual match, the new Border keeps
**reserve semantics** but drives them from the pen:

- Let `t = (Stroke?.Brush !== undefined) ? (Stroke.Thickness ?? 0) : 0`.
- `MeasureOverride` / `ArrangeOverride` inset the child by `t + Padding` on each
  side (replacing `BorderThickness + Padding`). Uniform `(1)` → `Stroke`
  thickness `1` → identical inset.
- `buildPaintGeometry(size, inset)` unchanged; `RenderOverride` paints inset by
  `t/2` (stroke centered within the reserved band, fully inside the layout rect —
  exactly as today).
- `buildChildClipGeometry` insets each side by `t` (was `BorderThickness`).
- `TopContentInset` = `t + Padding.Top` (was `BorderThickness.Top + Padding.Top`)
  — keeps chip / `RichTextBlock` inline-baseline math correct.

**Render simplification.** Delete the entire non-uniform four-rect branch and
`effectiveBorderPen`. `RenderOverride` becomes: fill `buildPaintGeometry(size,0)`;
if `Stroke.Brush` present and `t > 0`, stroke `buildPaintGeometry(size, t/2)`
with the `Stroke` pen (its own thickness). `CornerRadius` (uniform and
per-corner asymmetric via `buildRoundedRectPath`) is retained unchanged — a
uniform stroke traces asymmetric corners fine, removing today's "asymmetric
corners render sharp" limitation as a bonus.

**Docs.** Rewrite the border.ts header comment to describe the uniform-pen model;
drop all "Stroke.Thickness is ignored" / non-uniform language.

## Component 2 — Edge primitive: reuse the existing `Line`

**No new primitive is needed.** The existing `Line` shape
([basic/shapes/line.ts](../../../src/basic/shapes/line.ts)) already implements the
separator/rule use case in its **oriented mode**: with `Orientation = Horizontal`
or `Vertical` set, `Line` ignores its endpoint DPs, stretches to fill the slot the
parent hands it (main-axis desired size `0` → default `Stretch` fills it),
measures to `Stroke.Thickness` on the cross axis, and strokes a single centered
line with its `Stroke` pen (brush + thickness). Its own docstring names this "the
separator / rule use case". It is already exported from the basic barrel and
registered in the compiler symbol table (`['Line', ...]`).

So one-sided `BorderThickness` edges migrate to:

```
Line [ Orientation = Horizontal, Stroke = (@OutlineVariant, 1) ]   // a bottom/top rule
Line [ Orientation = Vertical,   Stroke = (@OutlineVariant, 1) ]   // a left/right rule
```

placed in the surrounding layout where the edge was. Reusing `Line` avoids a
redundant class (DRY), inherits its existing tests, and needs zero compiler work.
(An oriented `Line` has no default stroke, so each migrated site sets the
`Stroke` explicitly — which it must anyway, to carry the old border's brush +
width.) A dedicated `Separator` alias was considered and rejected: it would only
duplicate `Line`'s oriented mode.

## Component 3 — Migration

The compiler is the checklist: once the DP is deleted, every remaining
`BorderThickness=` on a `Border` is an unknown-property **compile error**. Work
until Mural + Plexus compile clean and tests pass.

Per-occurrence rules:

1. **Zero / default** (`(0)`, or `BorderThickness` with no `Stroke` brush) →
   delete the attribute.
2. **Uniform** `(N)` with `Stroke = Pen [ Brush = B ]` (or `Stroke = B`) →
   `Stroke = (B, N)` (thickness explicit), delete `BorderThickness`. Preserves
   layout + paint.
3. **State trigger** `when(C) { X.BorderThickness = (N); }` → replace the whole
   pen: `when(C) { X.Stroke = (B, N); }` using that border's brush token. A
   toggle from 0→1 (e.g. diagram selection box, [diagram.template.mu:246](../../../src/framework/diagram/diagram.template.mu#L246))
   sets/clears the `Stroke` pen.
4. **One-sided** `(0,0,0,1)` etc → restructure the template so the edge is a
   sibling oriented `Line` in the surrounding layout (e.g. a bottom rule under a
   region becomes a `Line [ Orientation = Horizontal ]` at the bottom of a
   `StackPanel`/`Grid` row). The `Border` loses its outline (fill/content only).
   Each of the ~40 is a small, local template edit; the M3 filled-text-box
   underline (bottom rule that thickens on focus) becomes a `Line` whose `Stroke`
   the focus trigger swaps to `(@Primary, 2)`.
5. **Three-sided** `(1,1,0,1)` (button-groups / segmented tabs) → redesign that
   template: one outer uniform `Border` around the group, oriented `Line`s
   between segments, instead of per-segment three-sided borders. 3 occurrences,
   co-located, handled as one task.

Affected framework primitives (each its own migration task): buttons, button-
groups, tabs, ribbon, shell, navigation, surfaces, status-bar, tool-bar,
notifications, formatting, diagram, `basic.resources.mu`. Plexus: agent-chat,
chooser, diagram, problems, project-explorer, dock-tabs, document-tabs resources.

## Testing

- **border.test.ts** — rewrite for the uniform-Stroke model: pen thickness drives
  width + inset + child clip; delete non-uniform four-rect assertions; add
  asymmetric-corner + uniform-stroke render assertion (now supported).
- **Edge primitive** — no new tests: oriented `Line` is already covered by
  `line.test.ts`. If that suite lacks an oriented-mode render/measure assertion,
  add one there.
- **Compiler tests** — update compile/parser/format fixtures that use
  `BorderThickness` ([compile.test.ts:745](../../../src/compiler/tests/compile.test.ts#L745),
  [format.test.ts:61](../../../src/compiler/tests/format.test.ts#L61),
  [parser.test.ts:70](../../../src/compiler/tests/parser.test.ts#L70)); add a
  `Separator` element fixture.
- Full Mural suite + typecheck green; then Plexus suite + build green.

## Rollout (phased)

Because Border's public API changes (a removed DP), this is a breaking bump.

- **Phase A — (dropped).** The edge primitive is the existing `Line` (oriented
  mode); no new class, template, or compiler work. Optionally add an oriented-mode
  assertion to `line.test.ts`.
- **Phase B — Border rewrite.** Uniform-Stroke Measure/Arrange/Render/clip +
  `TopContentInset`; delete the DP and `effectiveBorderPen`; rewrite
  border.test.ts. Mural now fails to compile the un-migrated templates (expected).
- **Phase C — Mural migration.** Walk the compile errors primitive-by-primitive
  (§Component 3) until Mural compiles + all tests + typecheck pass.
- **Phase D — Publish + Plexus.** Bump Mural (breaking minor per the repo's 0.x
  convention, i.e. 0.23.0), publish to Verdaccio; bump Plexus dep, migrate the 7
  Plexus `.mu` files, rebuild, run Plexus tests + build; live-smoke the shell
  (tabs, dividers, text-box underline, diagram nodes) via Playwright.

## Risks / decisions

- **1px spacing drift.** The reserve-preservation design keeps uniform cases 1:1,
  so no drift is expected; the live smoke confirms shell chrome visually.
- **One-sided → oriented-`Line` restructuring** is the labor-heavy part (~40
  local template edits) and the main regression surface; each is small and
  compiler-guarded, and covered by the live smoke.
- **Not doing** a `BorderEdges` flags enum (the rejected alternative) — the user
  chose the dedicated-edge-element + uniform-Border split; the edge element turned
  out to already exist as `Line`, so no new primitive is built.
