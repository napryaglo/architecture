# Border + ContentControl Fill/Stroke Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `Fill` + `Stroke` the library-wide chrome standard: drop `BorderBrush`/`BorderPen` from `Border` and `ContentControl`; both use the inherited `Fill` (background) and `Stroke` (border pen).

**Architecture:** `Border` keeps `BorderThickness` as the width + layout authority; it paints an *effective pen* = `Stroke`'s brush + style at `BorderThickness`'s width (so `Stroke.Thickness` is ignored), and the non-uniform four-rect frame paints with `Stroke.Brush`. `ContentControl` drops its `BorderBrush` DP and forwards the inherited `Stroke` to its template's inner Border. All ~180 consumer sites migrate; the removal is breaking, so the whole change lands on one branch with a final whole-project green gate.

**Tech Stack:** TypeScript, Mural visual framework. Tests: `node:test` + `node:assert/strict` via `npm test`; markup compiled by `npm run build:templates`.

## Global Constraints

- **`Stroke.Thickness` is ignored on `Border`.** Width (uniform and per-side) and the child layout inset come from `BorderThickness`. The painted pen's width is `BorderThickness.Top` (uniform).
- **Effective-pen recipe** (uniform paint): `new Pen(Stroke.Brush, BorderThickness.Top)` with `DashStyle`/`LineCap`/`LineJoin`/`MiterLimit` copied from `Stroke`.
- **Non-uniform frame** paints four rects with `Stroke.Brush` (was `BorderBrush`).
- **Markup Pen recipe:** a Brush value migrates `BorderBrush = <brush>` → `Stroke = Pen [ Brush = <brush> ]`; a binding to a former-`BorderBrush` (now-`Stroke`) source migrates `BorderBrush = $$BorderBrush` → `Stroke = $$Stroke` (no `Pen [...]` wrapper); `BorderPen = <pen>` → `Stroke = <pen>`; trigger `X.BorderBrush = <brush>` → `X.Stroke = Pen [ Brush = <brush> ]`. Inline `Pen [...]` as a value is verified to compile + instantiate (spike 2026-08-19).
- **NOT migrated (domain DPs, leave verbatim):** `Table.BorderBrush` (gridlines), `PaginatedCanvas.PageBorderBrush` (page edge). Their `.ts`/`.mu` references stay.
- **Ordering:** the DP removal breaks every unmigrated reference at compile time, so per-task verification uses targeted `npx tsx --test <file>` runs (compile in isolation); the definitive gate is the FINAL task (`tsc -p tsconfig.build.json` + full `npm test`).
- Every test file lives in a `tests/` subfolder next to its source. Enums over string-literal unions (none introduced). No `node:fs`/`node:path` in framework/renderer code.
- Commit messages end with: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Branch `feat/border-fill-stroke` (already created; spec committed there). Do not merge/push unless the user asks.

## File Structure

- `src/basic/border.ts` — **modified.** Remove `BorderBrush`/`BorderPen` DPs + accessors, `syncStroke`, `OnPropertyChanged`; rewrite `RenderOverride` to paint the effective pen. Keep layout/clip/corner code.
- `src/basic/tests/border.test.ts`, `src/basic/tests/border-render.ts` — **modified.** New API + assertions.
- `src/framework/base/content-control.ts` — **modified.** Remove `BorderBrush` DP + accessors; keep `BorderThickness`.
- `src/framework/base/base.template.mu`, `src/framework/shell/shell.template.mu` — **modified.** `BorderBrush = $$BorderBrush` → `Stroke = $$Stroke`.
- `src/basic/**` and `src/framework/**` TS consumers — **modified.** Instance `.BorderBrush`/`.BorderPen` → `.Stroke`.
- 20 `*.template.mu` / `*.resources.mu` — **modified.** Markup recipes.
- 4 other test files — **modified.** New API.

---

### Task 1: Core `Border` rewrite + its tests

**Files:**
- Modify: `src/basic/border.ts`
- Test: `src/basic/tests/border.test.ts`, `src/basic/tests/border-render.ts`

**Interfaces:**
- Consumes: inherited `Visual.Fill` (Brush), `Visual.Stroke` (Pen); `Pen`, `Rect`, `Size`, `Thickness`.
- Produces: `Border` with no `BorderBrush`/`BorderPen`; `Fill` + `Stroke` + `BorderThickness` + `CornerRadius` + `Padding`. A uniform border's painted pen has `Brush === Stroke.Brush`, `Thickness === BorderThickness.Top`.

- [ ] **Step 1: Decouple the test from the basic barrel, then rewrite it to the new API.**

In `src/basic/tests/border.test.ts` change the Border import so this task compiles in isolation (the `../index.js` barrel re-exports still-unmigrated basic consumers):

```ts
import { Border } from '../border.js';
```

Rewrite every `BorderBrush`/`BorderPen` usage to `Stroke` + `Pen`. The width now comes from `BorderThickness`, so keep the existing `BorderThickness` in each stroke test and set the brush via a Pen. Concretely:

- Defaults test (line ~82): replace `assert.equal(b.BorderBrush, undefined);` with `assert.equal(b.Stroke, undefined);`.
- `no Fill and no BorderBrush emits no draw calls`: rename to `no Fill and no Stroke …`; body unchanged (no `Stroke` set).
- `BorderBrush + non-zero BorderThickness strokes …`:
  ```ts
  const brush = new SolidColorBrush(Color.Black);
  b.Stroke = new Pen(brush);          // thickness ignored — BorderThickness rules
  b.BorderThickness = new Thickness(4);
  // ...render...
  assert.equal(g.pen!.Brush, brush);
  assert.equal(g.pen!.Thickness, 4);  // from BorderThickness, not the Pen
  assert.ok(rectOf(g).rect.Equals(new Rect(2, 2, 96, 96)));
  ```
- `Fill + Border emits ONE geometry …`: `b.Stroke = new Pen(brush); b.BorderThickness = new Thickness(1);` then `assert.equal(dc.geometries[0]!.pen!.Brush, brush);`.
- `BorderBrush set but BorderThickness zero emits no stroke` → `Stroke set but BorderThickness zero emits no stroke`: `b.Stroke = new Pen(new SolidColorBrush(Color.Black));` (BorderThickness defaults Zero) → no draws.
- Per-side tests (asymmetric): set `b.Stroke = new Pen(brush)` (capture `brush`), `b.BorderThickness = new Thickness(1,2,3,4)` etc.; assert each `r.brush === brush` (the frame uses `Stroke.Brush`).
- CornerRadius stroke tests: same substitution (`Stroke = new Pen(brush)` + `BorderThickness`); assertions on `g.pen!.Thickness` stay keyed to `BorderThickness`.
- Add a new test pinning the ignored-thickness contract:
  ```ts
  test('Stroke.Thickness is ignored — BorderThickness rules the painted width', () => {
      const b = new Border();
      const pen = new Pen(new SolidColorBrush(Color.Black), 99); // 99 must NOT win
      b.Stroke = pen;
      b.BorderThickness = new Thickness(4);
      b.Measure(new Size(100, 100));
      b.Arrange(new Rect(0, 0, 100, 100));
      const dc = new CapturingContext();
      b.Render(dc);
      assert.equal(dc.geometries[0]!.pen!.Thickness, 4);
  });
  ```
- Add a test pinning pen-style carry-through:
  ```ts
  test('Stroke dash/cap/join carry onto the effective pen', () => {
      const b = new Border();
      const pen = new Pen(new SolidColorBrush(Color.Black));
      pen.DashStyle = DashStyle.Dash; pen.LineJoin = LineJoin.Round;
      b.Stroke = pen; b.BorderThickness = new Thickness(2);
      b.Measure(new Size(40, 40)); b.Arrange(new Rect(0, 0, 40, 40));
      const dc = new CapturingContext();
      b.Render(dc);
      const eff = dc.geometries[0]!.pen!;
      assert.equal(eff.DashStyle, DashStyle.Dash);
      assert.equal(eff.LineJoin, LineJoin.Round);
  });
  ```
  Add `DashStyle`, `LineJoin` to the `visual-engine` import line.

In `src/basic/tests/border-render.ts` replace `border.BorderBrush = new SolidColorBrush(Color.Black);` with `border.Stroke = new Pen(new SolidColorBrush(Color.Black)); border.BorderThickness = new Thickness(1);` (import `Pen` if absent) and any `BorderThickness` it already sets stays.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --conditions=development --test src/basic/tests/border.test.ts`
Expected: FAIL to compile — `border.ts` still has `BorderBrush`/`BorderPen` and the base paint doesn't yet honour the effective-pen contract (the new ignored-thickness test fails).

- [ ] **Step 3: Rewrite `border.ts`.**

Remove the imports no longer needed only if they become unused; keep `Pen`, `Rect`, `Size`, `Thickness`, geometry imports. Delete these members: `BorderBrushKey`, `BorderPenKey`, the `BorderBrush` get/set, the `BorderPen` get/set, `OnPropertyChanged`, `syncStroke`. Drop `type PropertyDescriptor` from the runtime import if now unused.

Replace `RenderOverride` (currently `super.RenderOverride(dc)` + four-rect frame) with:

```ts
protected override RenderOverride(dc: DrawingContext): void
{
    const size = this.RenderSize;
    if (size.Width <= 0 || size.Height <= 0) return;

    const bt = this.BorderThickness;
    const uniform = bt.Left === bt.Top && bt.Top === bt.Right && bt.Right === bt.Bottom;
    const stroke = this.Stroke;
    const fill = this.Fill;

    if (uniform)
    {
        // Effective pen: Stroke's brush + style at the BorderThickness width
        // (Stroke.Thickness is ignored). Suppressed when there is no stroke
        // brush or the width is zero.
        const eff = (stroke?.Brush !== undefined && bt.Top > 0)
            ? effectiveBorderPen(stroke, bt.Top)
            : undefined;
        if (fill === undefined && eff === undefined) return;
        const inset = eff !== undefined ? bt.Top / 2 : 0;
        dc.DrawGeometry(fill, eff, this.buildPaintGeometry(size, inset));
        return;
    }

    // Non-uniform: fill (no stroke) then the four-rect frame with Stroke.Brush.
    if (fill !== undefined)
    {
        dc.DrawGeometry(fill, undefined, this.buildPaintGeometry(size, 0));
    }
    const brush = stroke?.Brush;
    if (brush === undefined) return;
    const innerY = bt.Top;
    const innerH = Math.max(0, size.Height - bt.Top - bt.Bottom);
    if (bt.Top > 0)
    {
        dc.DrawRectangle(brush, undefined, new Rect(0, 0, size.Width, bt.Top));
    }
    if (bt.Bottom > 0)
    {
        dc.DrawRectangle(brush, undefined, new Rect(0, size.Height - bt.Bottom, size.Width, bt.Bottom));
    }
    if (bt.Left > 0)
    {
        dc.DrawRectangle(brush, undefined, new Rect(0, innerY, bt.Left, innerH));
    }
    if (bt.Right > 0)
    {
        dc.DrawRectangle(brush, undefined, new Rect(size.Width - bt.Right, innerY, bt.Right, innerH));
    }
}
```

Add the module-level helper (after the class, next to `buildRoundedRectPath`):

```ts
// The pen a Border actually paints with: Stroke supplies the brush and the
// style knobs (dash / cap / join / miter); the WIDTH comes from
// BorderThickness (Stroke.Thickness is ignored on Border).
function effectiveBorderPen(stroke: Pen, width: number): Pen
{
    const p = new Pen(stroke.Brush, width);
    p.DashStyle  = stroke.DashStyle;
    p.LineCap    = stroke.LineCap;
    p.LineJoin   = stroke.LineJoin;
    p.MiterLimit = stroke.MiterLimit;
    return p;
}
```

Update the class doc comment: `Fill` = background; `Stroke` = border pen (brush + style; **thickness ignored** — `BorderThickness` rules width); `BorderThickness` = uniform/per-side width + child inset. Note that `buildChildClipGeometry` override is load-bearing: the base keys the inner clip off `this.Stroke?.Thickness`, which for a `Border` is now the user pen, so `Border` must (and does) override it to use `BorderThickness`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx tsx --conditions=development --test src/basic/tests/border.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/basic/border.ts src/basic/tests/border.test.ts src/basic/tests/border-render.ts
git commit -m "feat(border): drop BorderBrush/BorderPen; paint Fill + effective Stroke pen"
```

---

### Task 2: `ContentControl` + its default template

**Files:**
- Modify: `src/framework/base/content-control.ts`, `src/framework/base/base.template.mu`, `src/framework/shell/shell.template.mu`
- Test: whichever suite exercises ContentControl chrome (`src/framework/tests/content-control.test.ts` if it asserts BorderBrush; otherwise none new).

**Interfaces:**
- Consumes: inherited `Visual.Stroke`; keeps `ContentControl.BorderThickness`.
- Produces: `ContentControl` with no `BorderBrush`; consumers set `.Stroke` (Pen).

- [ ] **Step 1: Remove the `BorderBrush` DP from `content-control.ts`.**

Delete `BorderBrushKey` (line ~43) and the `BorderBrush` get/set (lines ~67-68). Update the class comment that mentions `Fill / BorderBrush / BorderThickness` to `Fill / Stroke / BorderThickness`. Keep `BorderThicknessKey` + accessors. Remove now-unused `Brush` import if nothing else uses it.

- [ ] **Step 2: Retarget the template bindings.**

In `src/framework/base/base.template.mu` (`DefaultContentControlTemplate`, line ~27): change the inner Border's `BorderBrush = $$BorderBrush,` to `Stroke = $$Stroke,`. Update the surrounding comment (`Fill / BorderBrush / BorderThickness` → `Fill / Stroke / BorderThickness`).

In `src/framework/shell/shell.template.mu` (line ~469): confirm the template's `TargetType` derives from `ContentControl` (so `$$Stroke` resolves). Change `BorderBrush = $$BorderBrush,` → `Stroke = $$Stroke,`. If that control declares its OWN `BorderBrush` DP (grep its `.ts`), migrate that DP too the same way as ContentControl; otherwise the ContentControl-inherited `Stroke` covers it.

- [ ] **Step 3: Rebuild templates + typecheck the two files' area**

Run: `npm run build:templates`
Expected: compiles with no "Property 'BorderBrush' not registered" error for these templates.

Run: `npx tsc -p tsconfig.build.json --noEmit 2>&1 | grep -E "content-control|base.template|shell" || echo "clean for these files"`
Expected: no errors referencing these files (other unmigrated files may still error — ignore those until the final gate).

- [ ] **Step 4: Commit**

```bash
git add src/framework/base/content-control.ts src/framework/base/base.template.mu src/framework/shell/shell.template.mu
git commit -m "feat(content-control): drop BorderBrush; forward inherited Stroke to inner Border"
```

---

### Task 3: TypeScript consumer sweep (Border/ContentControl instance writes & reads)

**Files (Border/ContentControl instances only — NOT Table/PaginatedCanvas):**
- `src/basic/selection-bounds-adorner.ts` (writes `.BorderBrush`)
- `src/basic/spin-edit.ts` (comments only — update prose to `Stroke`)
- `src/framework/diagram/behaviors/text-block-adorner.ts` (writes)
- `src/framework/formatting/color-picker.ts` (reads + writes on Border instances)
- `src/framework/pickers/date-picker.ts` (write)
- `src/framework/list/combo-box.ts` (comment), `src/framework/diagram/behaviors/connector-interactions-behavior.ts` (comment), `src/runtime/binding/multi-template-binding.ts` (comment), `src/visual-engine/drawing/solid-color-brush-animation.ts` (comment)

**Recipe (apply per site):**
- Write: `x.BorderBrush = brush;` → `x.Stroke = new Pen(brush);` (import `Pen` from `../visual-engine/index.js` / the file's existing visual-engine import). If the site also sets `x.BorderThickness`, leave it.
- Read: `const b = x.BorderBrush;` → `const b = x.Stroke?.Brush;`.
- Comment-only references to `BorderBrush` (spin-edit, combo-box, connector-interactions, multi-template-binding, solid-color-brush-animation): update the prose to `Stroke` so docs match; no code change.
- **Do NOT touch** `table.BorderBrush` reads in `block-layout.ts` (Table's own DP) or anything in `table.ts`/`paginated-canvas.ts`.

- [ ] **Step 1: Migrate each file per the recipe.** For `color-picker.ts`, note the paired read/write (`restBrush = sw.BorderBrush` … `sw.BorderBrush = restBrush`) becomes `restBrush = sw.Stroke?.Brush` … `sw.Stroke = restBrush !== undefined ? new Pen(restBrush) : undefined`.

- [ ] **Step 2: Verify the touched areas' tests compile + pass**

Run the suites that import these files, e.g.:
`npx tsx --conditions=development --test src/framework/formatting/tests/*.test.ts src/basic/tests/selection-bounds-adorner.test.ts`
Expected: PASS (or, if a suite pulls an unmigrated sibling via a barrel, defer its verification to the final gate and note it).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor: migrate TS Border/ContentControl consumers to Stroke pen"
```

---

### Task 4: Markup sweep — `.mu` templates & resources

**Files (20):** `src/resources/basic.resources.mu` and the `*.template.mu` under `src/framework/{base,button-groups,buttons,diagram,formatting,list,markers,menu,navigation,notifications,pickers,ribbon,search-bar,shell,status-bar,surfaces,tabs,toggles,tool-bar}`. (`base.template.mu` + `shell.template.mu` binding lines were already handled in Task 2 — apply only the remaining recipes here.)

**Recipes (per occurrence; classify by the value form):**
1. Brush value — `@Resource`, `#hex`, or a data `$brushBinding`:
   `BorderBrush = @Outline` → `Stroke = Pen [ Brush = @Outline ]`. Keep any sibling `BorderThickness` attribute on the same element.
2. `BorderPen = <pen>` (`$Stroke`, `@Pen`) → `Stroke = <pen>`. (`diagram.template.mu:75,105`: `BorderPen = $Stroke` → `Stroke = $Stroke`.)
3. Trigger write `X.BorderBrush = @Y` → `X.Stroke = Pen [ Brush = @Y ]` (22 sites, e.g. `basic.resources.mu:199-200,246,376-377`). Where a single element has several state triggers swapping only the brush, you MAY declare per-state `Pen x:key="…" [ Brush = @Y ]` resources in that file and write `X.Stroke = @StatePen` for readability — choose per file.
4. Binding to a former-`BorderBrush` (now-`Stroke`) source `$$BorderBrush`/`$BorderBrush` → `Stroke = $$Stroke` — already covered for the two known sites in Task 2; if the grep in Step 1 finds more, apply the same passthrough (no `Pen [...]` wrapper).

**Worked example (`menu.template.mu:47`):**
```
// before
Border [ ...
         BorderBrush     = @OutlineVariant,
         BorderThickness = (1),
         ... ]
// after
Border [ ...
         Stroke          = Pen [ Brush = @OutlineVariant ],
         BorderThickness = (1),
         ... ]
```

- [ ] **Step 1: Enumerate remaining sites.**

Run: `grep -rEn "BorderBrush|BorderPen" src --include=*.mu` (from Mural root). Confirm each is one of recipes 1-4. (Comments — lines whose match is after `//` — are updated for accuracy but carry no compile weight.)

- [ ] **Step 2: Apply the recipes file-by-file.** Prefer editing rather than a blanket sed, because recipe 1 (Pen-wrap) and recipe 4 (passthrough) differ by value form. For a file that is purely recipe-1 Brush values, a scoped sed is acceptable:
`sed -i -E 's/BorderBrush(\s*)=(\s*)(@[A-Za-z0-9_]+|#[0-9A-Fa-f]+)/Stroke\1=\2Pen [ Brush = \3 ]/g' <file>` — then eyeball the diff for any `$$`/`$` value the regex shouldn't have wrapped.

- [ ] **Step 3: Rebuild templates**

Run: `npm run build:templates`
Expected: compiles with no "Property 'BorderBrush' not registered on class 'Border'" (or ContentControl) errors.

- [ ] **Step 4: Verify no stray `.mu` references remain**

Run: `grep -rEn "BorderBrush|BorderPen" src --include=*.mu | grep -v "//"`
Expected: empty.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(mu): migrate Border/ContentControl chrome to Fill + Stroke pen"
```

---

### Task 5: Remaining test-file consumers

**Files:** `src/basic/tests/items-presenter.test.ts`, `src/compiler/tests/format.test.ts`, `src/visual-engine/tests/svg-renderer.test.ts`. (`src/basic/documents/tests/table-layout.test.ts` uses `t.BorderBrush` where `t` is a **Table** — leave it.)

- [ ] **Step 1: Migrate each per the TS/markup recipe.**
- `items-presenter.test.ts`: instance writes `.BorderBrush` → `.Stroke = new Pen(brush)`; assertions reading `BorderBrush` → `Stroke?.Brush`.
- `svg-renderer.test.ts`: same; if it builds a Border and asserts the rendered stroke, update to set `Stroke = new Pen(brush)` + `BorderThickness`, and assert the emitted pen brush/width.
- `format.test.ts` (compiler round-trip): if it asserts formatting of `BorderBrush = …` markup, update the expected text to the migrated `Stroke = Pen [ Brush = … ]` form.
- Confirm `table-layout.test.ts` is untouched (Table's own DP).

- [ ] **Step 2: Run each migrated suite**

`npx tsx --conditions=development --test src/basic/tests/items-presenter.test.ts src/compiler/tests/format.test.ts src/visual-engine/tests/svg-renderer.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test: migrate remaining Border chrome assertions to Fill + Stroke"
```

---

### Task 6: Whole-project green gate

**Files:** none (verification + any residual fixes).

- [ ] **Step 1: Typecheck the whole build**

Run: `npx tsc -p tsconfig.build.json --noEmit`
Expected: clean. Any remaining error is an unmigrated `Border`/`ContentControl` `BorderBrush`/`BorderPen` reference — migrate it per the recipes (excluding Table/PaginatedCanvas). Re-run until clean.

- [ ] **Step 2: Rebuild templates + demos typecheck**

Run: `npm run build:templates && npm run typecheck:demos`
Expected: clean.

- [ ] **Step 3: Full suite**

Run: `npm test`
Expected: PASS. Investigate any failure (a render test that assumed the old synthesized `Stroke`, or a `.mu` that still sets `BorderBrush`).

- [ ] **Step 4: Confirm the API is gone framework-wide**

Run: `grep -rEn "BorderBrush|BorderPen" src | grep -vE "Table|PaginatedCanvas|PageBorderBrush|//|HeaderBackground"`
Expected: empty (only the intentional Table/PaginatedCanvas domain DPs and comments remain).

- [ ] **Step 5: Commit any residual fixes**

```bash
git add -A
git commit -m "chore: finish Border/ContentControl Fill/Stroke migration (green)"
```

---

### Task 7: Publish + migrate Plexus

**Files:** `package.json` (Mural version), Plexus `package.json` + `.mu`/`.ts` consumers.

- [ ] **Step 1: Bump + publish Mural**

```bash
npm version patch --no-git-tag-version   # 0.9.8 -> 0.9.9
git add package.json package-lock.json
git commit -m "chore(mural): bump to 0.9.9 (Fill/Stroke chrome standard)"
npm publish
npm view @pragmatic-tech-ai/mural version --registry http://localhost:4873/   # expect 0.9.9
```

- [ ] **Step 2: Bump Plexus + migrate its consumers**

In Plexus: `npm install @pragmatic-tech-ai/mural@0.9.9 --save`. Then apply the same recipes to Plexus's `BorderBrush`/`BorderPen` sites:
`grep -rEn "BorderBrush|BorderPen" src --include=*.mu --include=*.ts --include=*.mts` (from Plexus root), migrate each (Brush → `Stroke = Pen [ Brush = … ]`; trigger writes → `.Stroke = Pen [...]`; TS writes → `new Pen(brush)`), then `npm run compile:mu`.

- [ ] **Step 3: Verify Plexus**

Run (in Plexus): `npm run typecheck && npm test`
Expected: typecheck clean; full suite green. Fix any residual per the recipes.

- [ ] **Step 4: Commit Plexus**

```bash
git add -A
git commit -m "chore: bump mural 0.9.9; migrate Border/ContentControl chrome to Fill + Stroke"
```

- [ ] **Step 5: Finish the Mural branch**

Announce and invoke `superpowers:finishing-a-development-branch` for `feat/border-fill-stroke` (base `main`). Do not merge/push unless the user chooses to.

---

## Self-Review

**Spec coverage:**
- Remove `BorderBrush`/`BorderPen` from `Border`; effective-pen paint; non-uniform frame via `Stroke.Brush` → Task 1. ✓
- `BorderThickness` = width + inset authority, `Stroke.Thickness` ignored → Task 1 (effective pen + explicit test). ✓
- `ContentControl` drops `BorderBrush`, forwards inherited `Stroke`; template `Stroke = $$Stroke` → Task 2. ✓
- Uniform markup sweep + binding-passthrough + triggers → Task 4 (recipes 1-4). ✓
- TS + test consumers → Tasks 3, 5. ✓
- Table/PaginatedCanvas left alone → Global Constraints + Tasks 3/5 notes. ✓
- Ordering / final green gate → Task 6. ✓
- Publish 0.9.9 + Plexus → Task 7. ✓

**Placeholder scan:** Recipes give exact before→after; Task 1 gives full code; the `.mu` sweep gives a worked example + a scoped sed with an eyeball step. No TBD/TODO. ✓

**Type consistency:** `effectiveBorderPen(stroke: Pen, width: number): Pen` used only in Task 1. `Stroke` is `Pen | undefined`; reads guard `stroke?.Brush`. `x.Stroke = new Pen(brush)` matches the `Pen(brush?, thickness?)` ctor. `Stroke?.Brush` for reads is `Brush | undefined`, matching old `BorderBrush`. ✓
