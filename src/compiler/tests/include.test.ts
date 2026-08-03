import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { compile, EmitError } from '../compile.js';
import type { IncludeResolver } from '../compiler.js';

// The compiler's `include` keyword is generic: it calls an injected
// resolver and splices the result. These tests drive it with a STUB
// resolver (no filesystem) — the SVG→geometry policy lives in the build
// host and is tested separately.

// A stub that mimics the build resolver's contract: a `*` glob yields two
// basename-keyed entries; a single path yields one (honoring an `as` key).
const stubResolver: IncludeResolver = (path, ctx) => {
    if (path.includes('*'))
    {
        return {
            entries: [
                { key: 'home',   valueJs: 'new PathGeometry([])' },
                { key: 'search', valueJs: 'new GeometryGroup([])' },
            ],
            imports: [{ module: '@pragmatic-lab/mural/visual-engine', names: ['PathGeometry', 'GeometryGroup'] }],
        };
    }
    return {
        entries: [{ key: ctx.key ?? 'home', valueJs: 'new PathGeometry([])' }],
        imports: [{ module: '@pragmatic-lab/mural/visual-engine', names: ['PathGeometry'] }],
    };
};

function emitted(src: string): string
{
    return compile(src, { include: stubResolver }).js;
}

describe('include — emit', () => {

    test('single file → a local const + one Set keyed by the resolver, plus its imports', () => {
        const js = emitted(`resources Icons { include "icons/home.svg" }`);
        // The value is bound to a local const (so `@home` can inline it) then Set.
        assert.match(js, /const (\w+) = new PathGeometry\(\[\]\);/);
        assert.match(js, /\.Set\("home", \w+\)/);
        assert.match(js, /import \{ PathGeometry \} from "@pragmatic-lab\/mural\/visual-engine"/);
    });

    test('`as <key>` overrides the resource key', () => {
        const js = emitted(`resources Icons { include "brand/logo.svg" as logo }`);
        assert.match(js, /const \w+ = new PathGeometry\(\[\]\);/);
        assert.match(js, /\.Set\("logo", \w+\)/);
    });

    test('`@key` referencing an included resource INLINES it (no DynamicResource)', () => {
        const js = emitted(`resources Icons {
            include "icons/home.svg" as glyph
            Shape x:key="row" [ Geometry = @glyph ]
        }`);
        // The include binds `glyph` to a local var…
        const m = js.match(/\.Set\("glyph", (\w+)\)/);
        assert.ok(m, 'include binds glyph to a local var');
        const v = m![1];
        // …and `@glyph` resolves to that same var, baked in — NOT a runtime
        // DynamicResource that would fail to resolve outside this dictionary
        // (e.g. once an entity template using it renders in a drawer).
        assert.match(js, new RegExp(`GeometryKey, ${v}\\)`));
        assert.doesNotMatch(js, /DynamicResource\(\w+, "glyph"\)/);
    });

    test('glob → one Set per matched file, keyed by basename', () => {
        const js = emitted(`resources Icons { include "icons/*.svg" }`);
        assert.match(js, /\.Set\("home", /);
        assert.match(js, /\.Set\("search", /);
        // Both imported names land in one merged import line.
        assert.match(js, /import \{ GeometryGroup, PathGeometry \} from "@pragmatic-lab\/mural\/visual-engine"/);
    });

    test('include coexists with hand-authored entries in the same block', () => {
        const js = emitted(`resources Icons {
            include "icons/home.svg"
            @accent = #ff0000
        }`);
        assert.match(js, /\.Set\("home", /);
        assert.match(js, /\.Set\("accent", /);
    });
});

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

// A resolver that returns a singleton entry (mimics the raster branch) and a
// normal one (mimics the geometry branch).
const singletonResolver: IncludeResolver = (path) => {
    if (path.endsWith('.png'))
        return { entries: [{ key: 'Dot', valueJs: 'new ImageBrush(0)', singleton: true }],
                 imports: [{ module: '@pragmatic-lab/mural/visual-engine', names: ['ImageBrush'] }] };
    return { entries: [{ key: 'home', valueJs: 'new RectangleGeometry(0)' }],
             imports: [{ module: '@pragmatic-lab/mural/visual-engine', names: ['RectangleGeometry'] }] };
};

describe('include — singleton hoist', () => {

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
});

describe('include — errors', () => {

    test('without a resolver, include is a compile error', () => {
        assert.throws(
            () => compile(`resources Icons { include "icons/home.svg" }`),
            (e: unknown) => e instanceof EmitError && /include.*resolver/i.test((e as Error).message),
        );
    });

    test('`as` on a glob (multiple matches) is rejected', () => {
        assert.throws(
            () => emitted(`resources Icons { include "icons/*.svg" as everything }`),
            (e: unknown) => e instanceof EmitError && /single resource|matched 2/i.test((e as Error).message),
        );
    });
});
