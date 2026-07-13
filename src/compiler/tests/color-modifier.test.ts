import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../compile.js';

// `<< Modifier(args)` on a color value — the color-modifier surface over
// the `<<` converter pipe. A static base (color literal, @resource) folds
// or threads through DynamicResource; the modifier names resolve to
// auto-imported converter factories.

function emitted(src: string): string
{
    return compile(src).js;
}

const wrap = (line: string): string => `
    import Foo from "./foo.mjs"
    resources T {
        DataTemplate x:key="t" [DataType=Foo] {
            Border x:root [${line}]
        }
    }
`;

describe('color modifier `<<`', () => {
    test('color literal + single modifier → folded to a constant', () => {
        const js = emitted(wrap('Background=#0d47a1 << Lighten(0.5)'));
        assert.match(js, /Lighten\(0\.5\)\.convert\(new SolidColorBrush\(Color\.FromHex\('#0d47a1'\)\)\)/);
        // The modifier is auto-imported from the runtime barrel.
        assert.match(js, /import \{[^}]*\bLighten\b[^}]*\} from "@pragmatic-lab/mural\/runtime"/);
    });

    test('a chain composes left-to-right, then folds', () => {
        const js = emitted(wrap('Background=#0d47a1 << Darken(0.2) << Alpha(0.5)'));
        assert.match(js, /composeConverters\(\[Darken\(0\.2\), Alpha\(0\.5\)\]\)\.convert\(/);
    });

    test('Mix carries a color argument (compiled as a brush)', () => {
        const js = emitted(wrap('Background=#222222 << Mix(#ff0000, 0.25)'));
        assert.match(js, /Mix\(new SolidColorBrush\(Color\.FromHex\('#ff0000'\)\), 0\.25\)\.convert\(/);
    });

    test('named color base folds too', () => {
        const js = emitted(wrap('Background=#blue << Lighten(0.3)'));
        assert.match(js, /Lighten\(0\.3\)\.convert\(new SolidColorBrush\(Color\.Blue\)\)/);
    });

    test('@resource base stays reactive via DynamicResource + converter', () => {
        const js = emitted(wrap('Background=@Primary << Darken(0.2)'));
        assert.match(js, /DynamicResource\([^,]+, "Primary", Darken\(0\.2\)\)/);
    });

    test('an unknown modifier is a compile error', () => {
        assert.throws(
            () => emitted(wrap('Background=#0d47a1 << Nope(0.5)')),
            /unknown symbol 'Nope'/,
        );
    });
});
