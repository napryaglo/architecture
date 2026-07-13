import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../compile.js';

// `$path << converter` — the binding-converter operator. Each converter is
// an imported ValueConverter symbol; a chain composes left-to-right.

function emitted(src: string): string
{
    return compile(src).js;
}

describe('binding converter operator `<<`', () => {

    test('single converter → trailing factory arg + the converter import', () => {
        const js = emitted(`
            import Foo from "./foo.mjs"
            import to_geometry from "./conv.mjs"
            resources T {
                DataTemplate x:key="t" [DataType=Foo] {
                    Border x:root [Background=$Name << to_geometry]
                }
            }
        `);
        assert.match(js, /DataContextBinding\([^,]+, "Name", to_geometry\)/);
        assert.match(js, /import \{ to_geometry \} from "\.\/conv\.mjs"/);
    });

    test('chain → composeConverters left-to-right + its import', () => {
        const js = emitted(`
            import Foo from "./foo.mjs"
            import normalize from "./n.mjs"
            import to_geometry from "./g.mjs"
            resources T {
                DataTemplate x:key="t" [DataType=Foo] {
                    Border x:root [Background=$Name << normalize << to_geometry]
                }
            }
        `);
        assert.match(js, /DataContextBinding\([^,]+, "Name", composeConverters\(\[normalize, to_geometry\]\)\)/);
        assert.match(js, /import \{[^}]*\bcomposeConverters\b[^}]*\} from "mural\/runtime"/);
    });

    test('ElementName binding carries the converter too', () => {
        const js = emitted(`
            import Foo from "./foo.mjs"
            import to_geometry from "./conv.mjs"
            resources T {
                DataTemplate x:key="t" [DataType=Foo] {
                    Border x:root {
                        TextBlock [Background=$pic.Source << to_geometry]
                        Border x:name="pic"
                    }
                }
            }
        `);
        assert.match(js, /ElementNameBinding\(\(\) => _\w+, "Source", to_geometry\)/);
    });

    test('a converter that was never imported is a compile error', () => {
        assert.throws(
            () => emitted(`
                import Foo from "./foo.mjs"
                resources T {
                    DataTemplate x:key="t" [DataType=Foo] {
                        Border x:root [Background=$Name << mystery_converter]
                    }
                }
            `),
            /unknown symbol 'mystery_converter'/,
        );
    });
});
