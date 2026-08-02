import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { compile, EmitError } from '../compile.js';
import type { GlyphResolver } from '../compiler.js';

// The compiler's `glyphs` keyword is generic: it hands the injected
// resolver the font path + parsed entries (each `{ key, name? | codepoint? }`)
// and splices the result, the same way `include` works. These tests drive
// it with a STUB resolver — the font → geometry policy lives in the build
// host (font-glyph-geometry.ts) and is tested separately.

// What `` decodes to once the lexer applies the escape — computed,
// not embedded, so the source file carries no invisible PUA characters.
const BOLT = String.fromCodePoint(0xe1a7);

// Records what it was asked for, returns a trivial geometry per entry.
let lastCall: { font: string; entries: ReadonlyArray<{ key: string; name?: string; codepoint?: string }> } | undefined;
const stubResolver: GlyphResolver = (font, entries) => {
    lastCall = { font, entries };
    return {
        entries: entries.map(e => ({ key: e.key, valueJs: 'new PathGeometry([])' })),
        imports: [{ module: '@pragmatic-lab/mural/visual-engine', names: ['PathGeometry'] }],
    };
};

function emitted(src: string): string
{
    return compile(src, { glyphs: stubResolver }).js;
}

describe('glyphs — emit', () => {

    test('bare ident → resolver entry with name = key (glyph-name lookup)', () => {
        lastCall = undefined;
        const js = emitted(`resources Icons { glyphs "fonts/icons.ttf" { home search } }`);
        assert.equal(lastCall!.font, 'fonts/icons.ttf');
        assert.deepEqual(lastCall!.entries, [
            { key: 'home',   name: 'home' },
            { key: 'search', name: 'search' },
        ]);
        assert.match(js, /\.Set\("home", new PathGeometry\(\[\]\)\)/);
        assert.match(js, /\.Set\("search", new PathGeometry\(\[\]\)\)/);
        assert.match(js, /import \{ PathGeometry \} from "@pragmatic-lab\/mural\/visual-engine"/);
    });

    test('`key = "<cp>"` → resolver entry with codepoint (no name); \\u decoded', () => {
        lastCall = undefined;
        emitted(`resources Icons { glyphs "f.ttf" { bolt = "\\ue1a7" } }`);
        assert.deepEqual(lastCall!.entries, [{ key: 'bolt', codepoint: BOLT }]);
    });

    test('mixed name + codepoint entries in one block', () => {
        lastCall = undefined;
        emitted(`resources Icons { glyphs "f.ttf" { home  bolt = "\\ue1a7" } }`);
        assert.deepEqual(lastCall!.entries, [
            { key: 'home', name: 'home' },
            { key: 'bolt', codepoint: BOLT },
        ]);
    });

    test('emits one Set per entry', () => {
        const js = emitted(`resources Icons { glyphs "f.ttf" { star } }`);
        assert.match(js, /\.Set\("star", new PathGeometry/);
    });

    test('no resolver configured → a clear compile error', () => {
        assert.throws(
            () => compile(`resources Icons { glyphs "f.ttf" { home } }`),
            (e: unknown) => e instanceof EmitError && /'glyphs' needs a font resolver/.test((e as Error).message),
        );
    });
});
