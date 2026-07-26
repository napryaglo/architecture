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

    test('single file → one Set keyed by the resolver, plus its imports', () => {
        const js = emitted(`resources Icons { include "icons/home.svg" }`);
        assert.match(js, /\.Set\("home", new PathGeometry\(\[\]\)\)/);
        assert.match(js, /import \{ PathGeometry \} from "@pragmatic-lab\/mural\/visual-engine"/);
    });

    test('`as <key>` overrides the resource key', () => {
        const js = emitted(`resources Icons { include "brand/logo.svg" as logo }`);
        assert.match(js, /\.Set\("logo", new PathGeometry\(\[\]\)\)/);
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
