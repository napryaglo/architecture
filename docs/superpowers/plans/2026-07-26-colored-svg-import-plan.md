# Colored SVG Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the `.mu` `include` directive import an SVG as faithful multi-color art (each shape keeps its own fill/stroke) via a leading `colored` keyword, reusing the existing `IconDefinition` + `Icon` control.

**Architecture:** A new build-time serializer `svgToIconJs` emits an `IconDefinition` construction expression preserving per-shape concrete color (parsed by the existing `parseSvgIcon`). A new leading `colored` keyword on `include` threads a boolean through parser → AST → compiler → the injected include-resolver, which dispatches `svgToIconJs` (colored) vs the unchanged `svgToGeometryJs` (monochrome). Consumed with the existing control as `Icon [ Source = @x, Recolor = false ]`. No new runtime classes.

**Tech Stack:** TypeScript, Node.js `node:test` runner (`tsx`), the Mural `.mu` compiler.

## Global Constraints

- No new runtime classes — reuse `IconDefinition` (basic) and the `Icon` control. Verbatim from spec: "No new runtime classes."
- Monochrome stays the default; every existing `include` must be byte-for-byte unchanged.
- Colored import is faithful: `Color` → literal `new Color(R,G,B,A)`; the `currentColor` sentinel (unspecified/`currentColor`) → `new Color(0, 0, 0, 255)` (black, the SVG default); `none`/undefined → `undefined`.
- Every test file lives in a `tests/` subfolder next to the code it exercises (Mural convention).
- Enums over string-literal unions (Mural convention) — not triggered by this feature, but do not introduce any string-literal union types.
- Run tests with the file-scoped runner, not the full suite (the full suite has a known unrelated hang). Command per task: `npx tsx --test <path-to-test-file>` from the `Mural/` directory.
- Commit after each task. Author `Eugene Napryaglo <evgen.napryaglo@gmail.com>`; end commit messages with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File Structure

- **`src/tooling/svg-geometry.ts`** (modify) — add `svgToIconJs` + `DrawingResourceJs` + `emitPaint`; module constants for the two target packages. Existing `svgToGeometryJs` untouched.
- **`src/tooling/tests/svg-geometry.test.ts`** (modify) — colored-serializer unit tests.
- **`src/compiler/ast.ts`** (modify) — `IncludeForm.colored: boolean`.
- **`src/compiler/parser.ts`** (modify) — `parseIncludeForm` reads leading `colored`.
- **`src/compiler/format.ts`** (modify) — `printInclude` emits `colored`.
- **`src/compiler/tests/format.test.ts`** (modify, or the parser test file) — round-trip of `include colored`.
- **`src/compiler/compiler.ts`** (modify) — `IncludeResolver` ctx type gains `colored`; `compileInclude` passes `form.colored`.
- **`src/compiler/tests/include.test.ts`** (modify) — stub resolver captures `ctx.colored`.
- **`src/tooling/include-resolver.ts`** (modify) — dispatch colored vs monochrome; per-module import merge.
- **`src/tooling/tests/include-resolver.test.ts`** (create) — end-to-end compile with the real FS resolver over temp `.svg` fixtures.
- **`src/basic/tests/icon.test.ts`** (modify) — render assertion for a colored `IconDefinition` with `Recolor=false`.

---

## Task 1: `svgToIconJs` serializer

**Files:**
- Modify: `src/tooling/svg-geometry.ts`
- Test: `src/tooling/tests/svg-geometry.test.ts`

**Interfaces:**
- Consumes: `parseSvgIcon(svgText)` → `IconDefinition` with `.ViewBoxWidth`, `.ViewBoxHeight`, `.Shapes: readonly { Geometry, Fill, Stroke, StrokeWidth }[]`; `IconPaint = Color | typeof CURRENT_COLOR | undefined`; `Color` has readonly `R/G/B/A`. The existing module-private `emitGeometry(g, used)` and `n(x)` helpers.
- Produces: `svgToIconJs(svgText: string): DrawingResourceJs` where `DrawingResourceJs = { valueJs: string; imports: ReadonlyArray<{ module: string; names: readonly string[] }> }`.

- [ ] **Step 1: Write the failing tests**

Append to `src/tooling/tests/svg-geometry.test.ts`:

```ts
import { svgToIconJs } from '../svg-geometry.js';

describe('svgToIconJs', () => {

    test('colored multi-shape SVG → an IconDefinition preserving each fill', () => {
        const svg = `<svg viewBox="0 0 24 24">
            <rect x="0" y="0" width="10" height="10" fill="#ff0000"/>
            <circle cx="18" cy="18" r="4" fill="rgb(0,128,0)"/>
        </svg>`;
        const { valueJs, imports } = svgToIconJs(svg);
        assert.match(valueJs, /^new IconDefinition\(24, 24, \[/);
        assert.match(valueJs, /Fill: new Color\(255, 0, 0, 255\)/);
        assert.match(valueJs, /Fill: new Color\(0, 128, 0, 255\)/);
        // IconDefinition imported from basic; Color + geometry from visual-engine.
        const basic = imports.find(i => i.module === '@pragmatic-lab/mural/basic');
        const ve    = imports.find(i => i.module === '@pragmatic-lab/mural/visual-engine');
        assert.deepEqual([...basic!.names], ['IconDefinition']);
        assert.ok(ve!.names.includes('Color'));
        assert.ok(ve!.names.includes('RectangleGeometry'));
        assert.ok(ve!.names.includes('EllipseGeometry'));
    });

    test('unspecified / currentColor fill → black; fill="none" → undefined', () => {
        const svg = `<svg viewBox="0 0 24 24">
            <path d="M0 0L1 1"/>
            <path d="M2 2L3 3" fill="none"/>
        </svg>`;
        const { valueJs } = svgToIconJs(svg);
        assert.match(valueJs, /Fill: new Color\(0, 0, 0, 255\)/);
        assert.match(valueJs, /Fill: undefined/);
    });

    test('emitted expression evaluates to a faithful IconDefinition', () => {
        const svg = `<svg viewBox="0 0 24 24"><rect x="1" y="1" width="8" height="8" fill="#0000ff"/></svg>`;
        const { valueJs } = svgToIconJs(svg);
        // Evaluate the bare-name expression against the real ctors.
        const factory = new Function(
            'IconDefinition', 'Color', 'RectangleGeometry', 'Rect',
            `return (${valueJs});`);
        const def = factory(IconDefinition, Color, RectangleGeometry, Rect);
        assert.equal(def.ViewBoxWidth, 24);
        assert.equal(def.Shapes.length, 1);
        assert.equal(def.Shapes[0].Fill.B, 255);
        assert.equal(def.Shapes[0].Fill.R, 0);
    });
});
```

Add the imports this test block needs at the top of the file:

```ts
import { IconDefinition } from '../../basic/index.js';
import { Color, Rect, RectangleGeometry } from '../../visual-engine/index.js';
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx tsx --test src/tooling/tests/svg-geometry.test.ts`
Expected: FAIL — `svgToIconJs is not a function` (export missing).

- [ ] **Step 3: Implement `svgToIconJs` + `emitPaint` + `DrawingResourceJs`**

In `src/tooling/svg-geometry.ts`, add the import for the paint model near the existing `parseSvgIcon` import:

```ts
import { CURRENT_COLOR, type IconPaint } from '../basic/icon.js';
```

Add module constants below the imports:

```ts
const BASIC          = '@pragmatic-lab/mural/basic';
const VISUAL_ENGINE  = '@pragmatic-lab/mural/visual-engine';
```

Add the new public type + entry point (leave `svgToGeometryJs` and `geometryToJs` unchanged):

```ts
export interface DrawingResourceJs
{
    /** JS expression constructing the IconDefinition (bare type names). */
    valueJs: string;
    /** Named imports the expression references, grouped by module. */
    imports: ReadonlyArray<{ module: string; names: readonly string[] }>;
}

// Serialize an SVG to an IconDefinition-construction expression that KEEPS
// each shape's concrete paint (the colored counterpart of svgToGeometryJs).
// currentColor / unspecified fills resolve to black — the SVG default —
// so the art paints without any theme wiring.
export function svgToIconJs(svgText: string): DrawingResourceJs
{
    const ve  = new Set<string>();   // visual-engine names (geometry + Color)
    const def = parseSvgIcon(svgText);
    const shapes = def.Shapes.map(s =>
    {
        const geom   = emitGeometry(s.Geometry, ve);
        const fill   = emitPaint(s.Fill,   ve);
        const stroke = emitPaint(s.Stroke, ve);
        return `{ Geometry: ${geom}, Fill: ${fill}, Stroke: ${stroke}, StrokeWidth: ${n(s.StrokeWidth)} }`;
    });
    const valueJs = `new IconDefinition(${n(def.ViewBoxWidth)}, ${n(def.ViewBoxHeight)}, [${shapes.join(', ')}])`;

    const imports: Array<{ module: string; names: readonly string[] }> = [
        { module: BASIC, names: ['IconDefinition'] },
    ];
    if (ve.size > 0) imports.push({ module: VISUAL_ENGINE, names: [...ve].sort() });
    return { valueJs, imports };
}

// IconPaint → JS expression. Color → literal new Color(...); the
// currentColor sentinel → black; none / undefined → the literal `undefined`.
function emitPaint(p: IconPaint, used: Set<string>): string
{
    if (p === undefined)      return 'undefined';
    used.add('Color');
    if (p === CURRENT_COLOR)  return 'new Color(0, 0, 0, 255)';
    return `new Color(${p.R}, ${p.G}, ${p.B}, ${p.A})`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx tsx --test src/tooling/tests/svg-geometry.test.ts`
Expected: PASS — all `svgToIconJs` tests plus the existing `svgToGeometryJs` tests (regression guard) green.

- [ ] **Step 5: Commit**

```bash
git add src/tooling/svg-geometry.ts src/tooling/tests/svg-geometry.test.ts
git commit -m "feat(tooling): svgToIconJs — colored SVG → IconDefinition serializer"
```

---

## Task 2: `colored` keyword — AST, parser, formatter

**Files:**
- Modify: `src/compiler/ast.ts:371-380`
- Modify: `src/compiler/parser.ts:323-335`
- Modify: `src/compiler/format.ts:560-564`
- Test: `src/compiler/tests/format.test.ts`

**Interfaces:**
- Consumes: parser helpers `this.expectIdent('include')`, `this.peek()`, `this.consume()`, `this.expect(TokenKind.String)`, `TokenKind.Ident`; formatter helpers `this.push(level, str)` and `q(path)`.
- Produces: `IncludeForm.colored: boolean` (always set by the parser; `false` for a bare `include`).

- [ ] **Step 1: Write the failing tests**

`format.test.ts` already imports `{ format }` from `../format.js`, `{ Parser }` from `../parser.js`, and defines `const isStringBody = (n) => DEFAULT_SLOT_INFO.get(n)?.kind === 'string';`. Parse with `new Parser(src, { isStringBody }).ParseDocument()`; format with `format(src)` (source string in, formatted string out). Add this block near the end of the file:

```ts
// Walk the parsed document to the first include-form node.
function findIncludeForm(src: string): { colored: boolean; key?: string; path: string } {
    const doc = new Parser(src, { isStringBody }).ParseDocument();
    const stack: unknown[] = [doc];
    while (stack.length) {
        const n = stack.pop();
        if (n && typeof n === 'object') {
            if ((n as { kind?: string }).kind === 'include-form') {
                return n as { colored: boolean; key?: string; path: string };
            }
            for (const k of Object.keys(n)) stack.push((n as Record<string, unknown>)[k]);
        }
    }
    throw new Error('no include-form found');
}

describe('include colored', () => {

    test('parser records colored=true for the leading keyword', () => {
        const form = findIncludeForm(`resources Icons { include colored "art/logo.svg" as logo }`);
        assert.equal(form.colored, true);
        assert.equal(form.key, 'logo');
        assert.equal(form.path, 'art/logo.svg');
    });

    test('bare include is colored=false', () => {
        const form = findIncludeForm(`resources Icons { include "icons/home.svg" }`);
        assert.equal(form.colored, false);
    });

    test('formatter round-trips the colored keyword', () => {
        const src = `resources Icons {\n    include colored "art/logo.svg" as logo\n}\n`;
        assert.match(format(src), /include colored "art\/logo\.svg" as logo/);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx tsx --test src/compiler/tests/format.test.ts`
Expected: FAIL — `form.colored` is `undefined` (field not on the AST / not parsed) and the formatter output lacks `colored`.

- [ ] **Step 3a: Add the AST field**

In `src/compiler/ast.ts`, extend `IncludeForm` (currently lines 371-380):

```ts
export interface IncludeForm
{
    kind: 'include-form';
    /** The path / glob exactly as written, relative to the .mu file. */
    path: string;
    /** Explicit resource key from `as <key>` (single-file only); else the
     *  key is derived from each matched file's basename. */
    key?: string;
    /** `include colored "…"` → true: import as a colored IconDefinition
     *  rather than a monochrome Geometry. */
    colored: boolean;
    span: SourceSpan;
}
```

- [ ] **Step 3b: Parse the leading keyword**

In `src/compiler/parser.ts`, replace `parseIncludeForm` (lines 323-335):

```ts
private parseIncludeForm(): IncludeForm
{
    const start = this.expectIdent('include').span.start;
    // Optional leading `colored` modifier: `include colored "…"`.
    let colored = false;
    if (this.peek().kind === TokenKind.Ident && this.peek().value === 'colored')
    {
        this.consume();
        colored = true;
    }
    const path  = this.expect(TokenKind.String).value;
    let key: string | undefined;
    if (this.peek().kind === TokenKind.Ident && this.peek().value === 'as')
    {
        this.consume();
        key = this.expect(TokenKind.Ident).value;
    }
    const end = this.lastEnd();
    return { kind: 'include-form', path, key, colored, span: this.span(start, end) };
}
```

- [ ] **Step 3c: Emit the keyword in the formatter**

In `src/compiler/format.ts`, replace `printInclude` (lines 560-564):

```ts
private printInclude(item: IncludeForm, level: number): void
{
    const mod = item.colored ? 'colored ' : '';
    const as  = item.key !== undefined ? ` as ${item.key}` : '';
    this.push(level, `include ${mod}${q(item.path)}${as}`);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx tsx --test src/compiler/tests/format.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/compiler/ast.ts src/compiler/parser.ts src/compiler/format.ts src/compiler/tests/format.test.ts
git commit -m "feat(compiler): 'include colored' keyword — AST, parser, formatter"
```

---

## Task 3: Thread `colored` to the include resolver

**Files:**
- Modify: `src/compiler/compiler.ts:242-245` (type) and `:1224` (call site)
- Test: `src/compiler/tests/include.test.ts`

**Interfaces:**
- Consumes: `IncludeForm.colored` (Task 2).
- Produces: `IncludeResolver` signature `(path: string, ctx: { key: string | undefined; colored: boolean }) => IncludeResolution`. Every resolver now receives `ctx.colored`.

- [ ] **Step 1: Write the failing test**

Add to `src/compiler/tests/include.test.ts`. Extend the stub so it records the flag, then assert both directions:

```ts
describe('include — colored flag threading', () => {

    test('bare include passes colored=false; `include colored` passes true', () => {
        const seen: boolean[] = [];
        const capturing: IncludeResolver = (_path, ctx) => {
            seen.push(ctx.colored);
            return { entries: [{ key: 'x', valueJs: 'new PathGeometry([])' }], imports: [] };
        };
        compile(`resources I { include "a.svg" }`,          { include: capturing });
        compile(`resources I { include colored "b.svg" }`,  { include: capturing });
        assert.deepEqual(seen, [false, true]);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --test src/compiler/tests/include.test.ts`
Expected: FAIL — the stub's `ctx.colored` is `undefined` (type error under `tsx` strictness, or the pushed values are `[undefined, undefined]`), because the compiler does not yet pass `colored`.

- [ ] **Step 3a: Widen the resolver type**

In `src/compiler/compiler.ts`, update the `IncludeResolver` type (lines 242-245):

```ts
export type IncludeResolver = (
    path: string,
    ctx: { key: string | undefined; colored: boolean },
) => IncludeResolution;
```

- [ ] **Step 3b: Pass the flag at the call site**

In `src/compiler/compiler.ts`, in `compileInclude` (line 1224), change:

```ts
res = this.include(form.path, { key: form.key });
```

to:

```ts
res = this.include(form.path, { key: form.key, colored: form.colored });
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx --test src/compiler/tests/include.test.ts`
Expected: PASS — including the pre-existing include tests (their stub omits `colored` in its return but reads only `ctx.key`, so it still type-checks and runs).

- [ ] **Step 5: Commit**

```bash
git add src/compiler/compiler.ts src/compiler/tests/include.test.ts
git commit -m "feat(compiler): thread include 'colored' flag to the resolver ctx"
```

---

## Task 4: Resolver dispatch + multi-module imports

**Files:**
- Modify: `src/tooling/include-resolver.ts`
- Test: `src/tooling/tests/include-resolver.test.ts` (create)

**Interfaces:**
- Consumes: `svgToIconJs` + `DrawingResourceJs` (Task 1); `svgToGeometryJs` (existing); `ctx.colored` (Task 3); `compile(src, { include })` from `../../compiler/compile.js`.
- Produces: `makeIncludeResolver(baseDir)` now emits `IconDefinition` entries + a `@pragmatic-lab/mural/basic` import for colored includes, and unchanged `Geometry` entries for monochrome includes; imports are merged per module across all matched files.

- [ ] **Step 1: Write the failing test**

Create `src/tooling/tests/include-resolver.test.ts`:

```ts
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compile } from '../../compiler/compile.js';
import { makeIncludeResolver } from '../include-resolver.js';

// End-to-end: the real filesystem resolver over on-disk .svg fixtures,
// driven through the compiler. Monochrome → Geometry; colored → IconDefinition.

function fixtureDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'mural-include-'));
    writeFileSync(join(dir, 'home.svg'),
        `<svg viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20"/></svg>`);
    writeFileSync(join(dir, 'logo.svg'),
        `<svg viewBox="0 0 24 24"><rect x="0" y="0" width="12" height="12" fill="#ff0000"/><circle cx="18" cy="18" r="4" fill="#0000ff"/></svg>`);
    return dir;
}

describe('makeIncludeResolver — colored vs monochrome', () => {

    test('monochrome include emits a Geometry from visual-engine (unchanged)', () => {
        const dir = fixtureDir();
        const js = compile(`resources I { include "home.svg" }`,
            { include: makeIncludeResolver(dir) }).js;
        assert.match(js, /\.Set\("home", new RectangleGeometry\(/);
        assert.match(js, /from "@pragmatic-lab\/mural\/visual-engine"/);
        assert.doesNotMatch(js, /IconDefinition/);
    });

    test('colored include emits an IconDefinition + basic import', () => {
        const dir = fixtureDir();
        const js = compile(`resources I { include colored "logo.svg" as logo }`,
            { include: makeIncludeResolver(dir) }).js;
        assert.match(js, /\.Set\("logo", new IconDefinition\(24, 24, \[/);
        assert.match(js, /Fill: new Color\(255, 0, 0, 255\)/);
        assert.match(js, /import \{ IconDefinition \} from "@pragmatic-lab\/mural\/basic"/);
        assert.match(js, /Color/);   // Color imported from visual-engine
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --test src/tooling/tests/include-resolver.test.ts`
Expected: FAIL — the colored case still emits a `GeometryGroup`/`Geometry` (no `IconDefinition`), because the resolver ignores `ctx.colored`.

- [ ] **Step 3: Implement the dispatch + per-module merge**

In `src/tooling/include-resolver.ts`, update the import and the resolver body. Change the import line:

```ts
import { svgToGeometryJs, svgToIconJs } from './svg-geometry.js';
```

Add a `BASIC` constant beside the existing `VISUAL_ENGINE`:

```ts
const VISUAL_ENGINE = '@pragmatic-lab/mural/visual-engine';
const BASIC         = '@pragmatic-lab/mural/basic';
```

Replace the resolver callback body (the `return (spec, ctx) => { … }` block) so it accepts `colored`, dispatches, and merges imports per module:

```ts
return (spec: string, ctx: { key: string | undefined; colored: boolean }): IncludeResolution =>
{
    const matches = resolveMatches(baseDir, spec);
    if (matches.length === 0)
    {
        throw new Error(`no files matched "${spec}" (relative to ${baseDir})`);
    }
    const entries: Array<{ key: string; valueJs: string }> = [];
    const byModule = new Map<string, Set<string>>();
    const addNames = (module: string, names: readonly string[]): void =>
    {
        let set = byModule.get(module);
        if (set === undefined) { set = new Set<string>(); byModule.set(module, set); }
        for (const nm of names) set.add(nm);
    };

    for (const m of matches)
    {
        const ext = extname(m.abs).toLowerCase();
        if (ext !== '.svg')
        {
            throw new Error(
                `unsupported include type '${ext}' for ${m.abs} — only .svg is handled today`);
        }
        const text = readFileSync(m.abs, 'utf8');
        if (ctx.colored)
        {
            const { valueJs, imports } = svgToIconJs(text);
            for (const imp of imports) addNames(imp.module, imp.names);
            entries.push({ key: ctx.key ?? m.key, valueJs });
        }
        else
        {
            const { valueJs, names } = svgToGeometryJs(text);
            addNames(VISUAL_ENGINE, names);
            entries.push({ key: ctx.key ?? m.key, valueJs });
        }
    }

    const imports = [...byModule.entries()]
        .filter(([, set]) => set.size > 0)
        .sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)
        .map(([module, set]) => ({ module, names: [...set].sort() }));
    return { entries, imports };
};
```

> `BASIC` is referenced indirectly (colored imports carry their own module strings from `svgToIconJs`), but keep the constant for symmetry / future non-colored basic emits. If your linter forbids the unused constant, drop it — the module string already arrives via `svgToIconJs`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx --test src/tooling/tests/include-resolver.test.ts`
Expected: PASS.

Also re-run the compiler include suite to confirm no regression:
Run: `npx tsx --test src/compiler/tests/include.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tooling/include-resolver.ts src/tooling/tests/include-resolver.test.ts
git commit -m "feat(tooling): include resolver dispatches colored SVGs to svgToIconJs"
```

---

## Task 5: Icon consumption render assertion

**Files:**
- Modify: `src/basic/tests/icon.test.ts`

**Interfaces:**
- Consumes: `parseSvgIcon` (to build a colored `IconDefinition`), the `Icon` control, `Recolor` DP, and a `DrawingContext` fill-capture spy (pattern from `shape-foreground-fill.test.ts`).
- Produces: nothing new — proves the existing control renders a colored def faithfully with `Recolor=false`.

- [ ] **Step 1: Write the failing test**

Add to `src/basic/tests/icon.test.ts`. Extend the imports at the top:

```ts
import { Icon, parseSvgIcon } from '../index.js';
import { Brush, Pen, SolidColorBrush } from '../../visual-engine/index.js';
import type { DrawingContext } from '../../runtime/index.js';
```

Add the capture + test inside the `describe('Icon control', …)` block:

```ts
class FillCapture implements DrawingContext
{
    public fills: Array<Brush | undefined> = [];
    DrawGeometry(b: Brush | undefined, _p: Pen | undefined, _g: unknown): void { this.fills.push(b); }
    DrawRectangle(): void { throw new Error('not used'); }
    DrawText():      void { throw new Error('not used'); }
    DrawImage():     void { throw new Error('not used'); }
    PushTransform(): void { /* no-op */ }
    PushClip():      void { /* no-op */ }
    Pop():           void { /* no-op */ }
}

test('Recolor=false paints each shape with its authored color', () => {
    const svg = `<svg viewBox="0 0 24 24">
        <rect x="0" y="0" width="12" height="12" fill="#ff0000"/>
        <rect x="12" y="12" width="12" height="12" fill="#0000ff"/>
    </svg>`;
    const icon = new Icon();
    icon.Source  = parseSvgIcon(svg);
    icon.Recolor = false;
    icon.Width = icon.Height = 24;
    icon.Measure(new Size(24, 24));
    icon.Arrange(new Rect(0, 0, 24, 24));

    const dc = new FillCapture();
    icon.Render(dc);

    const solids = dc.fills.filter((b): b is SolidColorBrush => b instanceof SolidColorBrush);
    assert.equal(solids.length, 2, 'two colored shapes painted');
    assert.equal(solids[0]!.Color.R, 255);
    assert.equal(solids[0]!.Color.B, 0);
    assert.equal(solids[1]!.Color.B, 255);
    assert.equal(solids[1]!.Color.R, 0);
});
```

Add `Rect` to the existing `visual-engine` import in the file (it already imports `Size`):

```ts
import { /* …existing… */ Rect, Size } from '../../visual-engine/index.js';
```

> If `SolidColorBrush.Color` is named differently in this codebase, read `src/visual-engine/drawing/brush.ts` and adjust the accessor. The parser already produces `SolidColorBrush`-painted shapes via the `Icon` render path with `Recolor=false`, so `instanceof SolidColorBrush` is the stable part of the assertion.

- [ ] **Step 2: Run the test to verify it fails (or reveals the accessor)**

Run: `npx tsx --test src/basic/tests/icon.test.ts`
Expected: FAIL first at the missing render behavior only if something is off; if `Icon` already renders correctly, this test should pass immediately — in that case it is a *characterization* test locking the behavior in. If it fails on the `.Color` accessor, fix the accessor name per the note and re-run.

- [ ] **Step 3: (No production code)**

`Icon` already renders concrete-color shapes ([icon.ts:190-198](../../../src/basic/icon.ts)). This task adds coverage only; there is no implementation step.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx --test src/basic/tests/icon.test.ts`
Expected: PASS — all `Icon` tests green.

- [ ] **Step 5: Commit**

```bash
git add src/basic/tests/icon.test.ts
git commit -m "test(basic): Icon renders colored IconDefinition faithfully (Recolor=false)"
```

---

## Final verification

- [ ] Run every touched test file together:

```bash
npx tsx --test \
  src/tooling/tests/svg-geometry.test.ts \
  src/tooling/tests/include-resolver.test.ts \
  src/compiler/tests/format.test.ts \
  src/compiler/tests/include.test.ts \
  src/basic/tests/icon.test.ts
```
Expected: all PASS, 0 failures.

- [ ] Run the typecheck:

```bash
npm run typecheck
```
Expected: no errors.

- [ ] Author a manual smoke `.mu` snippet (optional, not committed) to eyeball an end-to-end colored import compiling to `rd.Set("logo", new IconDefinition(...))` with both imports present.
