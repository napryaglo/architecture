import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../compile.js';

function emitted(src: string): string {
    return compile(src).js;
}

describe('forward x:name reference', () => {

    test('forward x:name ref compiles to ElementNameBinding via thunk', () => {
        // The named element 'nodes' appears AFTER its referrer. Pre-walk
        // populates templateNameVars before binding compile, so the
        // binding lowers as ElementNameBinding wrapping a thunk so the
        // unresolved var captures correctly. Compiler also emits a
        // `let _border…;` (or similar) above the factory body.
        const js = emitted(`
            import FooVM from "./foo-vm.mjs"
            resources Test {
                DataTemplate x:key="T" [DataType=FooVM] {
                    Border x:root {
                        TextBlock [Foreground=$nodes.Background]
                        Border x:name="nodes" [Background=#ff0000]
                    }
                }
            }
        `);
        assert.match(js, /ElementNameBinding\(\(\) => _border\d+, "Background"\)/);
        assert.doesNotMatch(js, /DataContextBinding\([^,]+, "nodes\.Background"\)/);
        // `let _border…;` declaration emitted before any element
        // construction in the factory body.
        assert.match(js, /\(_data\) => \{\s*let _border\d+;/);
        // The x:named element initializes by ASSIGNMENT (no `const`).
        assert.match(js, /\s_border\d+ = new Border\(\);/);
    });

    test('backward x:name ref still works (chrome before referrer)', () => {
        // Established behaviour — chrome declared first, referrer
        // later. Thunk-emitted but resolves to a defined Visual
        // immediately so no microtask retry needed.
        const js = emitted(`
            import FooVM from "./foo-vm.mjs"
            resources Test {
                DataTemplate x:key="T" [DataType=FooVM] {
                    Border x:root {
                        Border x:name="chrome" [Background=#ffaa00]
                        TextBlock [Foreground=$chrome.Background]
                    }
                }
            }
        `);
        assert.match(js, /ElementNameBinding\(\(\) => _border\d+, "Background"\)/);
        assert.doesNotMatch(js, /DataContextBinding\([^,]+, "chrome\.Background"\)/);
    });
});
