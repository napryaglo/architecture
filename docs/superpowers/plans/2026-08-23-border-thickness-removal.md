# BorderThickness Removal (uniform-Stroke Border + oriented Line edges) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove `Border.BorderThickness` entirely, make the `Stroke` pen the sole (uniform) border-width authority, and migrate one-sided edges to the existing oriented `Line` primitive — across Mural and its Plexus consumer.

**Architecture:** `Border` keeps Fill + CornerRadius + a uniform `Stroke` pen; its layout reserve is driven by `Stroke.Thickness` (was `BorderThickness`) so uniform migrations are pixel-identical. One-sided edges migrate to the EXISTING `Line` primitive in oriented mode (`Line [ Orientation = Horizontal|Vertical, Stroke = (@token, N) ]`) — its docstring already names this "the separator / rule use case"; no new primitive is built (DRY). Deleting the DP makes every un-migrated `.mu` a compile error, which guides the migration.

**Tech Stack:** TypeScript, Mural WPF-like toolkit (`@pragmatic-tech-ai/mural`), `.mu`/`.template.mu` markup, `.mu` compiler (symbol-table.ts), node:test (`npx tsx --conditions=development --test`), Plexus (Electron renderer, vitest, Verdaccio `http://localhost:4873`).

**Spec:** [docs/superpowers/specs/2026-08-23-border-thickness-removal-design.md](../specs/2026-08-23-border-thickness-removal-design.md)

## Global Constraints

- **Publish `@pragmatic-tech-ai/*` ONLY to Verdaccio `http://localhost:4873`, NEVER public npm, and ONLY in Phase D (Task 20).** Do not `npm publish` in earlier tasks.
- **Commit only when the plan step says to** (the human runs the repo; assume commits are allowed per-task but never push unless asked).
- **Every test file lives in a `tests/` subfolder** next to the code it exercises.
- **Real enums, never string-literal unions.** Reuse the existing `Orientation` enum (`basic/panels/orientation.ts`); do not invent a new one.
- **Render leaf shapes via self-paint (RenderOverride/buildGeometry)** as `Rectangle`/`Line` do; composed chrome renders through templates.
- Mural test runner: `npx tsx --conditions=development --test '<glob>'` from the Mural dir. Typecheck: `npm run typecheck`.
- Keep uniform-border migrations **pixel-identical**: fold the tuple width into the pen `Thickness` (explicit), never rely on the pen default.
- Do NOT mutate the real corpus at `C:/Users/Eugene/Projects/plexus_tests`.
- Commit messages end with: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## Phase A — (dropped: the edge primitive already exists)

No new `Separator` class is built. One-sided edges migrate to the existing `Line`
primitive in **oriented mode** (`Line [ Orientation = Horizontal|Vertical,
Stroke = (@token, N) ]`), which already stretches-and-fills, measures to the pen
thickness on the cross axis, and strokes a centered rule — its docstring names
this "the separator / rule use case". `Line` is already exported and compiler-
registered. **Optional:** if `src/basic/shapes/tests/line.test.ts` lacks an
oriented-mode measure+render assertion, add one there (thickness→cross-axis
desired size; a stroked `LineGeometry` at the pen colour/width). Not a blocker for
the rest of the plan.

---

## Phase B — Border uniform-Stroke rewrite (breaking)

### Task 1: Rewrite `Border` to the uniform-Stroke model; delete `BorderThickness`

**Files:**
- Modify: `src/basic/border.ts`
- Test: `src/basic/tests/border.test.ts` (rewrite)

**Interfaces:**
- Consumes: `Stroke` (inherited Visual pen DP), `Fill`, `CornerRadius`, `Padding`.
- Produces: `Border` with NO `BorderThickness` DP/accessors; `Stroke.Thickness` drives width, child inset, child clip, and `TopContentInset`. `effectiveBorderPen` and the non-uniform four-rect render path are deleted.

**Behavior contract (what the rewritten border.ts must satisfy):**
- `t = (this.Stroke?.Brush !== undefined) ? (this.Stroke.Thickness ?? 0) : 0`.
- `MeasureOverride`: `insetH = 2*t + Padding.Horizontal`, `insetV = 2*t + Padding.Vertical` (t per side); child measured in the shrunk slot; desired = child + insets. (Matches today with `BorderThickness=(t)`.)
- `ArrangeOverride`: child at `(t + Padding.Left, t + Padding.Top)`, size shrunk by `2*t + Padding` per axis.
- `RenderOverride`: `dc.DrawGeometry(Fill, undefined, buildPaintGeometry(size, 0))` for the fill; if `t > 0 && Stroke?.Brush`, `dc.DrawGeometry(undefined, this.Stroke, buildPaintGeometry(size, t/2))` for the outline (the pen's own thickness `t`). No four-rect branch.
- `buildChildClipGeometry`: inset each side by `t` (was `BorderThickness`), corners reduced by `t`.
- `buildPaintGeometry`: unchanged (already inset-parameterized).
- `TopContentInset`: `t + Padding.Top`.
- Delete `effectiveBorderPen`, the `bt`/uniform branching, and the `Thickness` import if now unused.

- [ ] **Step 1: Rewrite the test first** — replace `src/basic/tests/border.test.ts` assertions:

```ts
// Representative cases (keep the file's existing imports/harness):
// 1) uniform stroke reserves its thickness as child inset
test('child is inset by the Stroke thickness + Padding', () => {
    const b = new Border();
    b.Stroke = new Pen(new SolidColorBrush(Color.FromHex('#000000')), 2);
    b.Padding = new Thickness(4);
    const child = new Border(); child.Width = 10; child.Height = 10;
    b.SetChild(child);
    b.Measure(new Size(100, 100));
    // 10 + 2*(2+4) = 22
    assert.equal(b.DesiredSize.Width, 22);
    assert.equal(b.DesiredSize.Height, 22);
});

// 2) renders a stroked outline at the pen thickness
test('renders the outline with the Stroke pen thickness', () => {
    initTestApp();
    const b = new Border();
    b.Stroke = new Pen(new SolidColorBrush(Color.FromHex('#ff0000')), 3);
    b.Measure(new Size(50, 50)); b.Arrange(new Rect(0, 0, 50, 50));
    // render via SvgRenderer (as Task 1) and assert stroke + stroke-width="3"
});

// 3) no stroke brush → no outline, no inset
test('no Stroke brush → child flush (only Padding)', () => { /* inset uses Padding only */ });

// 4) TopContentInset = t + Padding.Top
```
Delete every test asserting per-side `BorderThickness`, the four-rect frame, or `effectiveBorderPen`.

- [ ] **Step 2: Run it, verify it fails** (compile error: `BorderThickness` gone / new assertions unmet).

Run: `npx tsx --conditions=development --test src/basic/tests/border.test.ts`

- [ ] **Step 3: Implement the rewrite** in `src/basic/border.ts` per the behavior contract above. Rewrite the file header comment to the uniform-pen model. Keep `CornerRadius` (uniform + asymmetric via `buildRoundedRectPath`) — a uniform stroke now traces asymmetric corners, so remove the "CornerRadius ignored for non-uniform" caveats.

- [ ] **Step 4: Run the test, verify it passes.**

- [ ] **Step 5: Commit**

```bash
git add src/basic/border.ts src/basic/tests/border.test.ts
git commit -m "refactor(basic)!: Border width comes from the Stroke pen; remove BorderThickness"
```

> After this task the full Mural build/compile will FAIL on un-migrated templates. That is expected and drives Phase C.

---

## Phase C — Mural template migration (compiler-guided)

**Method for every task below:** run the compile/test suite, read the
`BorderThickness`-unknown errors for the named file(s), apply the §Component 3
rules from the spec, re-run until that file compiles. Migration rules:
- `(0)` / no-brush → delete the attribute.
- Uniform `(N)` + `Stroke = Pen[Brush=B]` / `Stroke = B` → `Stroke = (B, N)`; delete `BorderThickness`.
- `when(C){ X.BorderThickness = (N); }` → `when(C){ X.Stroke = (B, N); }`.
- One-sided `(…,1,…)` → delete the border edge; add an oriented `Line` sibling in the layout at that edge (`Orientation = Horizontal` for a top/bottom rule, `Vertical` for a left/right rule; `Stroke = (oldBrush, width)`). Adjust the enclosing panel (e.g. wrap content + rule in a `StackPanel`/`Grid` row) so the rule lands where the edge was.
- After each file: `npx tsx --conditions=development --test` for any co-located `.test.ts`, and a compile smoke.

Each task ends by committing the migrated file(s) with message `refactor(<area>): migrate Border to Stroke pen / oriented Line`.

> **Task numbering:** Phase A was dropped, so the migration tasks below (labeled 4-24 from the original draft) follow the Border rewrite (Phase B, Task 1). Execute in listed order; the numbers are labels, not gaps.

### Task 4: `basic.resources.mu` + `src/resources`
**Files:** Modify `src/resources/basic.resources.mu` (and any sibling resource `.mu`). Includes the M3 filled-text-box bottom underline (`(0,0,0,1)` → an oriented `Line [ Orientation = Horizontal ]` whose focus trigger swaps `Stroke` to `(@Primary, 2)`), and uniform chip/surface borders.
- [ ] Migrate per rules; the focus/hover triggers that thickened the underline now swap the the edge `Line`.Stroke.
- [ ] Compile clean; run `src/basic` tests; commit.

### Task 5: `buttons` + `button-groups` (incl. the 3-sided tab redesign)
**Files:** `src/framework/buttons/buttons.template.mu`, `src/framework/button-groups/button-groups.template.mu`.
- [ ] Uniform button borders → pen. The segmented `(1,1,0,1)` group → one outer uniform `Border` around the group + oriented `Line`s (`Orientation = Vertical`) between segments; the `when(...) { PART_Border.BorderThickness = (1,1,0,1); }` state triggers become selection styling on the segment (fill/stroke), not a 3-sided border.
- [ ] Compile clean; run button tests; commit.

### Task 6: `tabs`
**Files:** `src/framework/tabs/tabs.template.mu`. The tab-strip bottom rule (`(0,0,0,1)`) → a horizontal oriented `Line` under the strip; selected-tab indicator handled by its existing mechanism (verify it wasn't the removed border).
- [ ] Migrate; compile clean; run tabs tests; commit.

### Task 7: `ribbon`
**Files:** `src/framework/ribbon/ribbon.template.mu`. Group separators (`(0,0,1,0)`) → Vertical oriented `Line`s; the `(0,0,0,1)` footer rule → `Line [Orientation=Horizontal]`.
- [ ] Migrate; compile clean; run ribbon tests; commit.

### Task 8: `shell`
**Files:** `src/framework/shell/shell.template.mu`. Panel dividers (`(0,0,0,1)`) → oriented `Line`s; uniform panel borders → pen.
- [ ] Migrate; compile clean; run shell tests; commit.

### Task 9: `navigation`
**Files:** `src/framework/navigation/navigation.template.mu`. Rail edges (`(0,0,1,0)`, `(0,1,0,0)`) → Vertical oriented `Line`s.
- [ ] Migrate; compile clean; run navigation tests; commit.

### Task 10: `surfaces`
**Files:** `src/framework/surfaces/surfaces.template.mu`. Docked-sheet edges (`(1,0,0,0)` and the `when(Anchor=Left){ …=(0,0,1,0) }` trigger) → an oriented `Line` on the docked edge whose orientation/position tracks the `Anchor` triggers.
- [ ] Migrate; compile clean; run surfaces tests; commit.

### Task 11: `status-bar`
**Files:** `src/framework/status-bar/status-bar.template.mu`. Top rule (`(0,1,0,0)`) → Vertical/`Line [Orientation=Horizontal]` as appropriate.
- [ ] Migrate; compile clean; run status-bar tests; commit.

### Task 12: `tool-bar`
**Files:** `src/framework/tool-bar/tool-bar.template.mu`. Left rules (`(1,0,0,0)`) → Vertical oriented `Line`s.
- [ ] Migrate; compile clean; run tool-bar tests; commit.

### Task 13: `notifications`
**Files:** `src/framework/notifications/notifications.template.mu`. Divider (`(0,0,0,1)`) → `Line [Orientation=Horizontal]`; uniform card borders → pen.
- [ ] Migrate; compile clean; run notifications tests; commit.

### Task 14: `formatting`
**Files:** `src/framework/formatting/formatting.template.mu` (highest count — many uniform `(1)` swatch/grid cells). Almost all uniform → pen; the few `(2)`/selection cases explicit.
- [ ] Migrate; compile clean; run formatting tests; commit.

### Task 15: `diagram`
**Files:** `src/framework/diagram/diagram.template.mu`. Remaining container/shape borders and the `when(IsSelected){ PART_Border.BorderThickness = (1); }` selection box (→ `PART_Border.Stroke = (@<selBrush>, 1)`, cleared otherwise). NOTE: the node-box templates were already migrated in Phase 1 (container/text/callout self-paint) — only non-figure Borders remain here.
- [ ] Migrate; compile clean; run the full `src/framework/diagram/tests` suite; commit.

### Task 16: Sweep remaining Mural files
**Files:** any remaining `.mu`/`.ts` flagged by a full-repo grep for `BorderThickness` (demos, misc controls). Includes non-template `.ts` that set `border.BorderThickness = …` in code → set the pen instead.
- [ ] `grep -rn "BorderThickness" src` returns only comments/none in Border; migrate stragglers; commit.

### Task 17: Compiler test fixtures
**Files:** `src/compiler/tests/compile.test.ts` (line ~745), `format.test.ts` (line ~61), `parser.test.ts` (line ~70). Replace `BorderThickness=(…)` fixtures with `Stroke`/oriented `Line` equivalents; keep coverage of tuple→Thickness lowering via `Padding`/`Margin`/`CornerRadius` (still tuple-typed).
- [ ] Update; run `src/compiler` tests; commit.

### Task 18: Full Mural green
- [ ] Run the entire Mural suite: `npx tsx --conditions=development --test 'src/**/*.test.ts'` — all pass.
- [ ] `npm run typecheck` — clean.
- [ ] `grep -rn "BorderThickness" src` — no references remain (except possibly a CHANGELOG note).
- [ ] Commit any final fixes.

---

## Phase D — Publish + Plexus migration

### Task 19: Bump Mural version
**Files:** `Mural/package.json`.
- [ ] Bump to `0.23.0` (breaking change in the 0.x line). Commit `chore(mural): 0.23.0 — Border Stroke-pen width + oriented-Line edges`.

### Task 20: Publish Mural to Verdaccio
- [ ] From `Mural/`: `npm run build` then `npm publish --registry http://localhost:4873`. (ONLY Verdaccio.)
- [ ] Verify the tarball published (`npm view @pragmatic-tech-ai/mural@0.23.0 --registry http://localhost:4873`).

### Task 21: Bump + reinstall Plexus dep
**Files:** `Plexus/package.json`.
- [ ] Set `@pragmatic-tech-ai/mural` to `^0.23.0`; reinstall against Verdaccio (`npm install --registry http://localhost:4873`).

### Task 22: Migrate Plexus `.mu` sources (7 files)
**Files:** `Plexus/src/renderer/src/modules/{agent-chat,architecture-projects/services,diagram,problems,project-explorer}/*.resources.mu`, `Plexus/src/renderer/src/services/{dock-tabs,document-tabs}/*.resources.mu`. Only 3 one-sided cases (`(0,0,0,1)`×2, `(0,0,0,2)`×1) → an oriented `Line`; the rest uniform → pen.
- [ ] Migrate per the same rules; recompile the `.mu` (build regenerates `.mu.js`).
- [ ] Commit `refactor(plexus): migrate Border to Stroke pen / oriented Line`.

### Task 23: Plexus green + build
- [ ] `npx vitest run` — all pass.
- [ ] `npm run build` — clean.
- [ ] Fix any typing/compile fallout; commit.

### Task 24: Live smoke
**Files:** reuse/extend an existing Playwright e2e (drive via `_electron`, introspect via `Symbol.for('mural:visual-backref')`).
- [ ] Launch Plexus; verify visually + via introspection: tab-strip underline, panel dividers, text-box focus underline (thickens), toolbar/ribbon separators, and diagram nodes (container/text/callout still self-paint and are stroke-editable — Phase 1 regression guard).
- [ ] Report results. Do not push; report status and await direction on committing/pushing across the three repos.

---

## Self-Review notes
- **Spec coverage:** Border rewrite (Task 1), edge primitive = existing oriented `Line` (Phase A dropped), all migration areas from the spec's affected-primitives list, compiler-fixture update, full-green gate, rollout. Covered.
- **Type consistency:** oriented `Line` reuses the existing `Orientation` enum; Border exposes no `BorderThickness` after the rewrite; `t` derivation identical in Measure/Arrange/Render/clip/TopContentInset.
- **Known ambiguity (implementer-resolved, constrained):** the neutral divider token name for each migrated edge — pinned by reading the old border brush at each site during migration.
