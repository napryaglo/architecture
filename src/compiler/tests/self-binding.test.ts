import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../compile.js';

// `$Self.(Owner.Prop)` — the RelativeSource-Self binding. Binds a property
// to the TARGET element's own (typically inherited attached) property,
// e.g. a Shape painting its Fill from the inherited TextBlock.Foreground.

function emitted(src: string): string
{
    return compile(src).js;
}

describe('self binding `$Self.(Owner.Prop)` — emit', () => {

    test('emits SelfBinding(target, Owner, "Prop") with Owner as a real import', () => {
        const js = emitted(`
            import Foo from "./foo.mjs"
            resources T {
                DataTemplate x:key="t" [DataType=Foo] {
                    Shape x:root [Fill=$Self.(TextBlock.Foreground)]
                }
            }
        `);
        assert.match(js, /SelfBinding\(_\w+, TextBlock, "Foreground"\)/);
        assert.match(js, /import \{[^}]*\bSelfBinding\b[^}]*\} from "@pragmatic-lab\/mural\/runtime"/);
        // Owner type comes in as a real class reference, not a string proxy.
        assert.match(js, /import \{[^}]*\bTextBlock\b/);
    });

    test('bare `$Self` keeps its existing meaning (not hijacked)', () => {
        const js = emitted(`
            import Foo from "./foo.mjs"
            resources T {
                DataTemplate x:key="t" [DataType=Foo] {
                    Shape x:root [Fill=$Self]
                }
            }
        `);
        assert.match(js, /DataContextBinding\(_\w+, "Self"\)/);
        assert.doesNotMatch(js, /SelfBinding\(/);
    });

    test('converter chain threads through as the trailing arg', () => {
        const js = emitted(`
            import Foo from "./foo.mjs"
            import tint from "./c.mjs"
            resources T {
                DataTemplate x:key="t" [DataType=Foo] {
                    Shape x:root [Fill=$Self.(TextBlock.Foreground) << tint]
                }
            }
        `);
        assert.match(js, /SelfBinding\(_\w+, TextBlock, "Foreground", tint\)/);
    });

    test('an unknown owner type is a compile error', () => {
        assert.throws(
            () => emitted(`
                import Foo from "./foo.mjs"
                resources T {
                    DataTemplate x:key="t" [DataType=Foo] {
                        Shape x:root [Fill=$Self.(Mystery.Ink)]
                    }
                }
            `),
            /unknown symbol 'Mystery'/,
        );
    });
});
