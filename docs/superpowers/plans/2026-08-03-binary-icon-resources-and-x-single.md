# Binary (PNG) Icon Resources + `x:single` (SP1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let mural's build-time `include` turn a raster image (PNG/JPEG/…) into a usable `ImageBrush` resource, emitted once as a module-level singleton that `ResourceDictionary.Clone()` references; and add an `x:single` include modifier that marks any include's resource as a singleton.

**Architecture:** Extend the SVG-only `include-resolver` with a raster branch that base64-embeds the image into `new ImageBrush(new BitmapImage("data:…"))` and flags the entry `singleton`. Extend the compiler so singleton include entries are hoisted to a module-scope `const` (spliced in before the class) and referenced from `Clone()` instead of reconstructed. Add an `x:single` leading modifier to the `include` grammar that forces the same hoist.

**Tech Stack:** TypeScript, mural compiler (`src/compiler/`) + build tooling (`src/tooling/`), `node:test` + `node:assert/strict`, published via Verdaccio.

## Global Constraints

- Every test file lives in a `tests/` subfolder next to its source (`src/tooling/tests/…`, `src/compiler/tests/…`).
- Real TypeScript `enum`s over string-literal unions; markup-facing enums also go in `ENUM_MEMBERS` + `DEFAULT_SYMBOLS` (N/A here — no new enums).
- Commit messages end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`; author with a heredoc, never backticks.
- Run from the Mural repo root: `c:\Users\Eugene\Projects\architecture-agent\Mural`. Prefix Bash commands with `cd /c/Users/Eugene/Projects/architecture-agent/Mural &&` when the cwd may have reset.
- Mural test command: `npm test` (node:test). Typecheck: `npm run typecheck` (or `npx tsc --noEmit` — confirm the script name in package.json before first use).
- The emitted `ImageBrush`/`BitmapImage` come from `@pragmatic-tech-ai/mural/visual-engine` (constant `VISUAL_ENGINE` already in `include-resolver.ts`).
- Deterministic emit: stable key + declaration order (no `Date.now()`/`Math.random()`).
- Mural `main` currently has two unrelated uncommitted changes (`src/compiler/format.ts`, `src/basic/tests/rich-text-box-editor.test.ts`) that are NOT part of this work — do not stage or revert them; commit only files this plan names.

---

## File Structure

- **Modify** `src/tooling/include-resolver.ts` — add the raster branch (extension→mime, base64 data-URI, `ImageBrush(BitmapImage(...))` valueJs, `singleton: true`).
- **Modify** `src/compiler/compiler.ts` — `IncludeResolution` entry gains `singleton?`; `compileResourcesBlock` gains a module-const buffer + splice; `compileInclude` hoists singleton entries; honor `form.single`.
- **Modify** `src/compiler/ast.ts` — `IncludeForm` gains `single: boolean`.
- **Modify** `src/compiler/parser.ts` — `parseIncludeForm` reads a leading `x:single` modifier.
- **Tests**: `src/tooling/tests/include-resolver.test.ts` (raster → ImageBrush), `src/compiler/tests/include.test.ts` (singleton hoist + `x:single`), and a parser test for `IncludeForm.single` (in `src/compiler/tests/` — colocate with existing include/parse tests).
- **Modify** `Plexus/package.json` — bump `@pragmatic-tech-ai/mural` to the newly published version (Task 5).

---

## Task 1: Raster `include` → `ImageBrush` resource

**Files:**
- Modify: `src/tooling/include-resolver.ts`
- Test: `src/tooling/tests/include-resolver.test.ts`

**Interfaces:**
- Produces: `makeIncludeResolver(dir)` now handles raster extensions, returning an entry whose `valueJs` is `new ImageBrush(new BitmapImage("data:<mime>;base64,<b64>"))` and importing `ImageBrush`, `BitmapImage` from `@pragmatic-tech-ai/mural/visual-engine`.

- [ ] **Step 1: Write the failing test**

Add to `src/tooling/tests/include-resolver.test.ts`. First extend `fixtureDir()` to also write a real 1×1 PNG, then add the test:

```ts
// at top-level, near fixtureDir — a real 1×1 transparent PNG
const PNG_1x1 = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64');

// inside fixtureDir(), before `return dir;`
//   writeFileSync(join(dir, 'dot.png'), PNG_1x1);

describe('makeIncludeResolver — raster', () => {
    test('a .png include emits an ImageBrush(BitmapImage(dataURI)) + visual-engine import', () => {
        const dir = fixtureDir();
        const js = compile(`resources I { include "dot.png" as Dot }`,
            { include: makeIncludeResolver(dir) }).js;
        assert.match(js, /\.Set\("Dot", new ImageBrush\(new BitmapImage\("data:image\/png;base64,/);
        assert.match(js, /import \{[^}]*\bBitmapImage\b[^}]*\bImageBrush\b[^}]*\} from "@pragmatic-tech-ai\/mural\/visual-engine"|import \{[^}]*\bImageBrush\b[^}]*\bBitmapImage\b[^}]*\} from "@pragmatic-tech-ai\/mural\/visual-engine"/);
    });

    test('an unsupported extension still throws a clear error', () => {
        const dir = fixtureDir();
        writeFileSync(join(dir, 'note.txt'), 'hi');
        assert.throws(
            () => compile(`resources I { include "note.txt" }`, { include: makeIncludeResolver(dir) }),
            /unsupported include type '\.txt'/);
    });
});
```

Also add `writeFileSync(join(dir, 'dot.png'), PNG_1x1);` inside `fixtureDir()` before its `return dir;`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /c/Users/Eugene/Projects/architecture-agent/Mural && npm test -- --test-name-pattern="raster"`
Expected: FAIL — the resolver currently throws `unsupported include type '.png'`.

- [ ] **Step 3: Implement the raster branch**

In `src/tooling/include-resolver.ts`, add a mime map near the top (after `VISUAL_ENGINE`):

```ts
const RASTER_MIME: Readonly<Record<string, string>> = {
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif':  'image/gif',
};
```

Replace the `if (ext !== '.svg') { throw … }` block and the SVG read/emit that follows it with an extension dispatch. The whole per-match body becomes:

```ts
const ext = extname(m.abs).toLowerCase();
if (ext === '.svg')
{
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
    continue;
}
const mime = RASTER_MIME[ext];
if (mime !== undefined)
{
    const bytes   = readFileSync(m.abs);              // Buffer (no encoding)
    const dataUri = `data:${mime};base64,${bytes.toString('base64')}`;
    addNames(VISUAL_ENGINE, ['BitmapImage', 'ImageBrush']);
    entries.push({
        key:       ctx.key ?? m.key,
        valueJs:   `new ImageBrush(new BitmapImage(${JSON.stringify(dataUri)}))`,
        singleton: true,
    });
    continue;
}
throw new Error(
    `unsupported include type '${ext}' for ${m.abs} — only .svg and raster ` +
    `images (${Object.keys(RASTER_MIME).join(', ')}) are handled`);
```

The enclosing `for (const m of matches)` loop must use `continue` (it currently falls through). If the loop body is not already a `for` with `continue`-friendly structure, wrap the above as the loop body. `entries` is the existing local `Array<{ key: string; valueJs: string }>` — widen its declared type to `Array<{ key: string; valueJs: string; singleton?: boolean }>` so `singleton` type-checks (Task 2 makes `IncludeResolution` match).

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /c/Users/Eugene/Projects/architecture-agent/Mural && npm test -- --test-name-pattern="raster|colored vs monochrome"`
Expected: PASS (raster tests + the unchanged SVG tests).

- [ ] **Step 5: Commit**

```bash
cd /c/Users/Eugene/Projects/architecture-agent/Mural
git add src/tooling/include-resolver.ts src/tooling/tests/include-resolver.test.ts
git commit -m "$(cat <<'EOF'
feat(tooling): include a raster image as an ImageBrush resource

The include resolver now accepts .png/.jpg/.jpeg/.webp/.gif, base64-embedding
the bytes into new ImageBrush(new BitmapImage("data:...")) and flagging the
entry singleton. SVG handling is unchanged; truly unknown extensions still throw.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Hoist singleton include entries to a module-scope const

**Files:**
- Modify: `src/compiler/compiler.ts`
- Test: `src/compiler/tests/include.test.ts`

**Interfaces:**
- Consumes: `IncludeResolution.entries[i].singleton?: boolean` (Task 1 sets it for raster).
- Produces: singleton entries emit `const _singleN = <valueJs>;` at module scope (before the class) and `t.Set("Key", _singleN)` in `Clone()`; non-singleton entries keep the existing inline `const _incN = …; t.Set(…)` in `Clone()`.

- [ ] **Step 1: Write the failing test**

Add to `src/compiler/tests/include.test.ts`:

```ts
// A resolver that returns a singleton entry (mimics the raster branch) and a
// normal one (mimics the geometry branch).
const singletonResolver: IncludeResolver = (path) => {
    if (path.endsWith('.png'))
        return { entries: [{ key: 'Dot', valueJs: 'new ImageBrush(0)', singleton: true }],
                 imports: [{ module: '@pragmatic-tech-ai/mural/visual-engine', names: ['ImageBrush'] }] };
    return { entries: [{ key: 'home', valueJs: 'new RectangleGeometry(0)' }],
             imports: [{ module: '@pragmatic-tech-ai/mural/visual-engine', names: ['RectangleGeometry'] }] };
};

test('a singleton include hoists to a module-scope const referenced by Clone', () => {
    const js = compile(`resources I { include "dot.png" as Dot }`, { include: singletonResolver }).js;
    // Constructed once, at module scope (before the class), not inside Clone.
    const ctorCount = (js.match(/new ImageBrush\(0\)/g) ?? []).length;
    assert.equal(ctorCount, 1);
    assert.match(js, /^const _single\d+ = new ImageBrush\(0\);$/m);
    const classAt = js.indexOf('export class I');
    const constAt = js.search(/const _single\d+ = new ImageBrush\(0\);/);
    assert.ok(constAt >= 0 && constAt < classAt, 'singleton const precedes the class');
    // Clone references the const, does not reconstruct.
    assert.match(js, /\.Set\("Dot", _single\d+\)/);
});

test('a non-singleton include still builds a fresh copy inside Clone', () => {
    const js = compile(`resources I { include "home.svg" }`, { include: singletonResolver }).js;
    assert.match(js, /const _inc\d+ = new RectangleGeometry\(0\);/);
    assert.match(js, /\.Set\("home", _inc\d+\)/);
    assert.doesNotMatch(js, /const _single\d+ = new RectangleGeometry/);
});
```

Ensure `IncludeResolver` is imported at the top of the test file (it already is — `import type { IncludeResolver } from '../compiler.js';`).

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /c/Users/Eugene/Projects/architecture-agent/Mural && npm test -- --test-name-pattern="singleton include|non-singleton include"`
Expected: FAIL — no `_single` const is emitted; `new ImageBrush(0)` appears inline in `Clone`.

- [ ] **Step 3a: Extend the `IncludeResolution` type**

In `src/compiler/compiler.ts`, change the `IncludeResolution.entries` element type to allow the flag:

```ts
    /** Resource entries to `Set` into the dictionary, in order. */
    entries:  ReadonlyArray<{ key: string; valueJs: string; singleton?: boolean }>;
```

- [ ] **Step 3b: Add the module-const buffer + splice to `compileResourcesBlock`**

Add a class field near the other emit state (e.g. beside `localResourceVars`):

```ts
    // While emitting a `resources` block, singleton entries push their
    // `const _singleN = …;` declaration here; compileResourcesBlock splices them
    // in at module scope (before the class) after the block is emitted. null when
    // not inside a singleton-collecting block (singleton entries then fall back to
    // the inline copy-per-Clone path).
    private singletonConsts: string[] | null = null;
```

In `compileResourcesBlock`, capture the insertion point and set up the buffer at the very start (right before the first `this.line('')`), and splice after the class body is emitted (right before `return { … }`):

```ts
    private compileResourcesBlock(block: ResourcesBlock): ResourcesBlockMeta
    {
        this.ensureImport('ResourceDictionary');
        for (const imp of block.imports) this.ensureExplicitImport(imp.alias, imp.source);
        const accessors = this.gatherNamedResources(block.body);
        const name = block.name;
        const gateVar = `_gate_${name}`;

        // Singleton declarations for this block go to module scope (before the
        // class). Capture the insertion index now; splice after the class emits.
        const singleAt      = this.lines.length;
        const savedSingle   = this.singletonConsts;
        this.singletonConsts = [];

        this.line('');
        // …ALL existing class emission (gate, class, ctor, Clone, accessors)…

        // just before `return { … }`:
        const consts = this.singletonConsts;
        this.singletonConsts = savedSingle;
        if (consts.length > 0) this.lines.splice(singleAt, 0, ...consts);

        return { name, imports: block.imports.map(i => i.alias), /* …unchanged… */ };
    }
```

(Keep the rest of the method exactly as-is between the `this.line('')` and the `return`.)

- [ ] **Step 3c: Hoist singleton entries in `compileInclude`**

In `compileInclude`, replace the per-entry emit loop body (the `const entryVar = this.fresh('inc'); …` block) with a singleton-aware version:

```ts
        for (const entry of res.entries)
        {
            const isSingle = (entry.singleton === true || form.single === true)
                && this.singletonConsts !== null;
            if (isSingle)
            {
                const singleVar = this.fresh('single');
                this.singletonConsts!.push(`const ${singleVar} = ${entry.valueJs};`);
                this.line(`${rdVar}.Set(${JSON.stringify(entry.key)}, ${singleVar});`);
                this.localResourceVars?.set(entry.key, singleVar);
            }
            else
            {
                const entryVar = this.fresh('inc');
                this.line(`const ${entryVar} = ${entry.valueJs};`);
                this.line(`${rdVar}.Set(${JSON.stringify(entry.key)}, ${entryVar});`);
                this.localResourceVars?.set(entry.key, entryVar);
            }
        }
```

(`form.single` is `false` until Task 3 adds it to the AST; reference it now as `form.single === true` — Task 3's AST field makes it type-check. If the typechecker errors here before Task 3, temporarily use `(form as { single?: boolean }).single === true` and drop the cast in Task 3. Prefer doing Task 3's AST field first if executing out of order.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /c/Users/Eugene/Projects/architecture-agent/Mural && npm test -- --test-name-pattern="singleton include|non-singleton include"`
Expected: PASS.

- [ ] **Step 5: Run the full suite + typecheck, then commit**

Run: `cd /c/Users/Eugene/Projects/architecture-agent/Mural && npm test && npm run typecheck`
Expected: green. (If a pre-existing test asserted `include` throws on a non-`.svg` extension, update it to the new message from Task 1.)

```bash
cd /c/Users/Eugene/Projects/architecture-agent/Mural
git add src/compiler/compiler.ts src/compiler/tests/include.test.ts
git commit -m "$(cat <<'EOF'
feat(compiler): hoist singleton include resources to a module const

A resolver entry flagged `singleton` (raster images) is emitted once as a
module-scope const and referenced from Clone(), so every ResourceDictionary
clone shares one instance instead of reconstructing the resource. Non-singleton
entries keep their fresh-per-Clone behavior.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `x:single` modifier on `include`

**Files:**
- Modify: `src/compiler/ast.ts`
- Modify: `src/compiler/parser.ts`
- Test: `src/compiler/tests/include.test.ts` (emit) + a parser assertion

**Interfaces:**
- Consumes: Task 2's `form.single === true` branch in `compileInclude`.
- Produces: `IncludeForm.single: boolean`; `parseIncludeForm` accepts a leading `x:single` (a `ScopeExt` token named `single`), composable with `colored`.

- [ ] **Step 1: Write the failing test**

Add to `src/compiler/tests/include.test.ts` (reuse `singletonResolver`):

```ts
test('x:single forces a hoist even for an otherwise-copied (vector) include', () => {
    const js = compile(`resources I { include x:single "home.svg" }`, { include: singletonResolver }).js;
    assert.match(js, /^const _single\d+ = new RectangleGeometry\(0\);$/m);
    assert.match(js, /\.Set\("home", _single\d+\)/);
    assert.doesNotMatch(js, /const _inc\d+ = new RectangleGeometry/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /c/Users/Eugene/Projects/architecture-agent/Mural && npm test -- --test-name-pattern="x:single forces"`
Expected: FAIL — `x:single` is unparsed (a parse error) or ignored, so the vector stays inline.

- [ ] **Step 3a: Add `single` to the `IncludeForm` AST**

In `src/compiler/ast.ts`, find the `IncludeForm` interface (`kind: 'include-form'`) and add:

```ts
    /** `x:single` — force this include's resource(s) to be module-scope singletons. */
    single: boolean;
```

- [ ] **Step 3b: Parse a leading `x:single` in `parseIncludeForm`**

In `src/compiler/parser.ts`, `parseIncludeForm`, read leading modifiers (`colored` ident and/or `x:single` scope-ext) in a loop before the string, and thread `single` into the returned node:

```ts
    private parseIncludeForm(): IncludeForm
    {
        const start = this.expectIdent('include').span.start;
        // Optional leading modifiers, any order: `colored`, `x:single`.
        let colored = false;
        let single  = false;
        for (;;)
        {
            const t = this.peek();
            if (t.kind === TokenKind.Ident && t.value === 'colored') { this.consume(); colored = true; continue; }
            if (t.kind === TokenKind.ScopeExt && t.value === 'single') { this.consume(); single = true; continue; }
            break;
        }
        const path = this.expect(TokenKind.String).value;
        let key: string | undefined;
        if (this.peek().kind === TokenKind.Ident && this.peek().value === 'as')
        {
            this.consume();
            key = this.expect(TokenKind.Ident).value;
        }
        const end = this.lastEnd();
        return { kind: 'include-form', path, key, colored, single, span: this.span(start, end) };
    }
```

- [ ] **Step 3c: Drop the temporary cast in `compileInclude` (if used)**

If Task 2 used `(form as { single?: boolean }).single`, change it back to `form.single === true` now that the AST field exists.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /c/Users/Eugene/Projects/architecture-agent/Mural && npm test -- --test-name-pattern="x:single forces"`
Expected: PASS.

- [ ] **Step 5: Add a parser assertion, run full suite, commit**

Add a focused parse test where include parsing is exercised (same file or the parser test file that already imports `parse`). If `include.test.ts` only compiles, add there via `compile` (already covered by Step 1). Then:

Run: `cd /c/Users/Eugene/Projects/architecture-agent/Mural && npm test && npm run typecheck`
Expected: green.

```bash
cd /c/Users/Eugene/Projects/architecture-agent/Mural
git add src/compiler/ast.ts src/compiler/parser.ts src/compiler/compiler.ts src/compiler/tests/include.test.ts
git commit -m "$(cat <<'EOF'
feat(compiler): x:single modifier on include forces a singleton resource

`include x:single "…"` marks the included resource(s) as module-scope
singletons, the same hoist raster images get implicitly. Composable with
`colored`.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Publish mural + bump Plexus

**Files:**
- Modify: `Mural/package.json` (version), `Plexus/package.json` (dependency)

**Interfaces:**
- Consumes: Tasks 1–3 merged and green.
- Produces: a published `@pragmatic-tech-ai/mural` version Plexus can consume; SP2 (Plexus consumers) builds on it.

- [ ] **Step 1: Full green gate**

Run: `cd /c/Users/Eugene/Projects/architecture-agent/Mural && npm test && npm run typecheck && npm run build`
Expected: all green (build produces `dist/`). Fix anything red before publishing.

- [ ] **Step 2: Bump the mural version**

```bash
cd /c/Users/Eugene/Projects/architecture-agent/Mural
npm version minor --no-git-tag-version
```
(Confirm the new version string, e.g. from `node -p "require('./package.json').version"`.)

- [ ] **Step 3: Publish to Verdaccio**

```bash
cd /c/Users/Eugene/Projects/architecture-agent/Mural
npm publish --registry http://localhost:4873
```
Expected: publish succeeds. If it fails on auth/registry, stop and report — do not retry against the public registry.

- [ ] **Step 4: Bump Plexus's dependency + verify**

In `Plexus/package.json`, set `@pragmatic-tech-ai/mural` to the new version (match the existing `^`/exact style already there). Then:

```bash
cd /c/Users/Eugene/Projects/architecture-agent/Plexus
npm install
npm run compile:mu && npm run typecheck && npx vitest run
```
Expected: Plexus still compiles + green (no consumer changes yet — SP1 is additive).

- [ ] **Step 5: Commit**

```bash
cd /c/Users/Eugene/Projects/architecture-agent/Mural
git add package.json
git commit -m "$(cat <<'EOF'
chore(release): publish mural with raster include + x:single singletons

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
cd /c/Users/Eugene/Projects/architecture-agent/Plexus
git add package.json package-lock.json
git commit -m "$(cat <<'EOF'
chore(deps): bump @pragmatic-tech-ai/mural for raster include support

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Deferred (not in this plan)

- **`x:single` on hand-authored block resources** (e.g. `SolidColorBrush x:key="Accent" x:single [ … ]`). The grammar already captures it (`parseLeadingXAttrs` reads any `x:` attr), but hoisting a block resource is harder than an include: element construction is **multi-statement** (`new …; set_property_value(…); …`), so it needs an emission-redirection mechanism to move all those `this.line` writes to module scope, plus a self-contained guard (error when the value references another non-singleton local resource). Not required for PNG icons; specify separately if wanted.
- **SP2 — Plexus consumers**: app-chrome PNG entries, the library runtime loader building an `ImageBrush` from bundle bytes, the meta-model presentation generator emitting `Border`+`ImageBrush` bodies, and render-by-extension selection. Its own spec, after this ships.

## Self-Review

**1. Spec coverage.**
- Raster `include` → `ImageBrush` (spec §1) → Task 1. ✓
- Extensions `.png/.jpg/.jpeg/.webp/.gif`, no size guard (spec §1) → Task 1 `RASTER_MIME`, no guard. ✓
- Binary implicitly singleton, packed into the single module, `Clone()` references it (spec §3) → Task 2 (`singleton` flag from Task 1 → module-const + reference). ✓
- Singleton survives `merge` (spec test) → holds by construction (the module const is the value `merge`'s `Clone().Entries()` copies); covered structurally by Task 2's single-construction assertion. A dedicated merge test is nice-to-have; add if the reviewer wants runtime-identity coverage (needs evaluating the emitted module, heavier than the regex tests here).
- `x:single` general directive (spec §2) → Task 3 delivers it on `include`; the block-resource generalization is explicitly **Deferred** above (multi-statement hoist + guard). This narrows spec §2's scope — flagged to the user, not silently dropped.
- Self-contained guard / context-dependence error (spec §2, error handling) → only relevant to the deferred block-resource path; the include path is always self-contained (a literal data-URI / geometry). No guard needed in this plan.
- Publish + Plexus bump (spec "Ship") → Task 4. ✓
- Consumer contract / rendering (spec §4) → SP2, out of scope. ✓

**2. Placeholder scan.** No TBD/TODO; every code step has concrete code. The one conditional ("if a pre-existing test asserted the old throw, update it") is a real, bounded instruction, not a placeholder. The `form.single` forward-reference in Task 2 is called out with an explicit temporary-cast fallback and resolved in Task 3.

**3. Type consistency.** `singleton?: boolean` (resolver entry + `IncludeResolution`), `single: boolean` (`IncludeForm`), `singletonConsts: string[] | null`, `RASTER_MIME`, `VISUAL_ENGINE`, `_single`/`_inc` var prefixes, and the `.Set("Key", _singleN)` reference shape are used identically across Tasks 1–3.
