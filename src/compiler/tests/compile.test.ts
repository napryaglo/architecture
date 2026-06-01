import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { compile, EmitError } from '../compile.js';

// Pure source-to-source tests. Each one asserts on substrings of the
// emitted JS — robust against trivial format changes but precise about
// the bits that matter (imports, key emit lines).

function emitted(src: string): string
{
    return compile(src).js;
}

describe('compile — application skeleton', () => {
    test('empty Application emits the IIFE shape', () => {
        const js = emitted(`Application{ resources: {} }`);
        // export const app, with eager IIFE body.
        assert.match(js, /export const app = \(\(\) => \{/);
        assert.match(js, /const _app0 = new Application\(\);/);
        assert.match(js, /return _app0;/);
    });

    test('imports header sorts modules and symbols deterministically', () => {
        const js = emitted(`
            Application{
                resources: {
                    @primary = #4caf50
                    Border x:root[Padding=(16)]{}
                }
            }
        `);
        // Modules sorted alphabetically; within each module the symbols
        // sorted too.
        assert.match(
            js,
            /import \{ Border \} from "@visualisation-sub\/mural\/Controls";/,
        );
        assert.match(
            js,
            /import \{ Application, Color, Thickness \} from "@visualisation-sub\/mural\/runtime";/,
        );
        assert.match(
            js,
            /import \{ SolidColorBrush \} from "@visualisation-sub\/mural\/visual-engine";/,
        );
    });
});

describe('compile — resources slot', () => {
    test('KeyValueResource emits rd.Set(key, value)', () => {
        const js = emitted(`
            Application{
                resources: {
                    @primary = #4caf50
                }
            }
        `);
        assert.match(
            js,
            /_rd1\.Set\("primary", new SolidColorBrush\(Color\.FromHex\('#4caf50'\)\)\);/,
        );
    });

    test('namespaced primitive (@theme:primary) keys under the full string', () => {
        // The colon is a key-namespace separator, not a rename. The
        // dictionary key is the full `name:tail` so `@theme:primary`
        // resolves to the same entry it defined.
        const js = emitted(`
            Application{
                resources: {
                    @theme:primary = #000000
                }
            }
        `);
        assert.match(js, /\.Set\("theme:primary",/);
    });

    test('x:root assigns Resources.Root', () => {
        const js = emitted(`
            Application{
                resources: {
                    Border x:root{}
                }
            }
        `);
        assert.match(js, /_rd1\.Root = _border2;/);
    });
});

describe('compile — Style emission', () => {
    test('implicit style — keyed by TargetType', () => {
        const js = emitted(`
            Application{
                resources: {
                    style[targettype=Border]{ Padding = (12, 6); }
                }
            }
        `);
        // new Style(Border, [setter], undefined, [triggers], [multiTriggers]); then rd.Set(Border, _style)
        assert.match(js, /new Style\(Border, \[_setter\d+\], undefined, \[\], \[\]\);/);
        assert.match(js, /_rd1\.Set\(Border, _style\d+\);/);
        // Setter wraps the tuple as a 4-way Thickness.
        assert.match(
            js,
            /new Setter\(Border, "Padding", new Thickness\(12, 6, 12, 6\)\);/,
        );
    });

    test('keyed style — keyed by x:key string', () => {
        const js = emitted(`
            Application{
                resources: {
                    style x:key="DangerButton"[targettype=Border]{ Background = #ff0000; }
                }
            }
        `);
        assert.match(js, /_rd1\.Set\("DangerButton", _style\d+\);/);
    });

    test('trigger group emits PropertyTrigger with its setters', () => {
        const js = emitted(`
            Application{
                resources: {
                    style[targettype=Border]{
                        Background = #ffffff;
                        when( IsMouseOver ){
                            Background = #eeeeee;
                        }
                    }
                }
            }
        `);
        // PropertyTrigger(Border, "IsMouseOver", true, _sArrN) — the
        // setter list lives in a local var so OR-flattened triggers
        // can share the SAME array reference.
        assert.match(
            js,
            /new PropertyTrigger\(Border, "IsMouseOver", true, _sArr\d+\);/,
        );
        // Style construction picks up the trigger; the empty fifth arg
        // is the (empty) multi-trigger list.
        assert.match(js, /new Style\(Border, \[.*\], undefined, \[_trigger\d+\], \[\]\);/);
    });
});

describe('compile — element construction and slots', () => {
    test('Border child via the single-element slot', () => {
        const js = emitted(`
            Application{
                resources: {
                    Border x:root{
                        Border[Padding=(4)]{}
                    }
                }
            }
        `);
        // Outer Border calls SetChild with inner Border (Single.Child
        // is read-only; mutation goes through SetChild).
        assert.match(js, /_border\d+\.SetChild\(_border\d+\);/);
    });

    test('Canvas children via the list slot', () => {
        const js = emitted(`
            Application{
                resources: {
                    Canvas x:root{
                        Border[Canvas.Left=10]{}
                        Border[Canvas.Left=20]{}
                    }
                }
            }
        `);
        // Panel.AddChild for each child (Children is read-only —
        // mutation goes through AddChild; see compiler.ts comment).
        const matches = js.match(/\.AddChild\(_border\d+\)/g) ?? [];
        assert.equal(matches.length, 2);
    });

    test('attached property emits the explicit-owner overload', () => {
        const js = emitted(`
            Application{
                resources: {
                    Canvas x:root{
                        Border[Canvas.Left=10, Canvas.Top=20]{}
                    }
                }
            }
        `);
        assert.match(
            js,
            /\.set_property_value\(Canvas, "Left", 10\);/,
        );
        assert.match(
            js,
            /\.set_property_value\(Canvas, "Top", 20\);/,
        );
    });
});

describe('compile — value emission', () => {
    test('Thickness shape — 1, 2, 4 values', () => {
        const js = emitted(`
            Application{ resources: {
                Border x:root[Padding=(8), Margin=(4, 6), BorderThickness=(1, 2, 3, 4)]{}
            } }
        `);
        assert.match(js, /new Thickness\(8\)/);
        assert.match(js, /new Thickness\(4, 6, 4, 6\)/);
        assert.match(js, /new Thickness\(1, 2, 3, 4\)/);
    });

    test('Size literal emits new Size(w, h)', () => {
        const js = emitted(`
            Application{ resources: {
                Border x:root[Width=100]{}
                style[targettype=Border]{
                    MinSize = <120, 40>;
                }
            } }
        `);
        assert.match(js, /new Size\(120, 40\)/);
    });

    test('hex colour vs named colour', () => {
        const js = emitted(`
            Application{ resources: {
                @h = #0d47a1
                @n = #blue
            } }
        `);
        assert.match(js, /new SolidColorBrush\(Color\.FromHex\('#0d47a1'\)\)/);
        assert.match(js, /new SolidColorBrush\(Color\.Blue\)/);
    });

    test('@@key emits DynamicResource(targetVar, key) in direct-attribute context', () => {
        const js = emitted(`
            Application{ resources: {
                @theme = #4caf50
                Border x:root[Background=@@theme]{}
            } }
        `);
        assert.match(
            js,
            /\.set_property_value\("Background", DynamicResource\(_border\d+, "theme"\)\);/,
        );
    });

    test('@@key inside a Style setter wraps in a SetterFactory', () => {
        const js = emitted(`
            Application{ resources: {
                style[targettype=Border]{ Background = @@theme; }
            } }
        `);
        assert.match(
            js,
            /new SetterFactory\(\(_t\) => DynamicResource\(_t, "theme"\)\)/,
        );
    });

    test('@key emits an eager Application.current.Resources.Resolve()', () => {
        const js = emitted(`
            Application{ resources: {
                @primary = #4caf50
                Border x:root[Background=@primary]{}
            } }
        `);
        assert.match(
            js,
            /Application\.current\.Resources\.Resolve\("primary"\)/,
        );
    });

    test('PascalIdent in enum context — HorizontalAlignment=Center', () => {
        const js = emitted(`
            Application{ resources: {
                Border x:root[HorizontalAlignment=Center]{}
            } }
        `);
        assert.match(
            js,
            /\.set_property_value\("HorizontalAlignment", HorizontalAlignment\.Center\);/,
        );
        // The enum class also lands in the import header.
        assert.match(
            js,
            /import \{[^}]*HorizontalAlignment[^}]*\} from "@visualisation-sub\/mural\/runtime";/,
        );
    });
});

describe('compile — deferred & errored features', () => {
    test('$Path binding emits DataContextBinding bound to the target var', () => {
        const js = emitted(`
            Application{ resources: { Border x:root[Background=$Name]{} } }
        `);
        assert.match(
            js,
            /\.set_property_value\("Background", DataContextBinding\(_border\d+, "Name"\)\);/,
        );
    });

    test('macros are deferred', () => {
        assert.throws(
            () => emitted(`def card[#x]{ Border{} }`),
            /no top-level element/,    // ignored as a top form; doc has no element
        );
    });

    test('positional attrs outside macros are an error', () => {
        assert.throws(
            () => emitted(`Application{ resources: { Border x:root["stray"]{} } }`),
            /positional/,
        );
    });

    test('Application body slot other than resources is rejected', () => {
        assert.throws(
            () => emitted(`Application{ Border x:root{} }`),
            /only the 'resources:' slot/,
        );
    });

    test('resource without x:key or x:root errors loudly', () => {
        assert.throws(
            () => emitted(`Application{ resources: { Border{} } }`),
            /x:key or x:root/,
        );
    });

    test('unknown symbol surfaces a typed error', () => {
        assert.throws(
            () => emitted(`Application{ resources: { NonexistentControl x:root{} } }`),
            EmitError,
        );
    });
});

describe('compile — result metadata', () => {
    beforeEach(() => { /* nothing — kept for symmetry with other suites */ });

    test('isApplication=true and exportName="app" for Application root', () => {
        const r = compile(`Application{ resources: {} }`);
        assert.equal(r.isApplication, true);
        assert.equal(r.exportName,    'app');
    });

    test('imports map exposes the modules and symbols', () => {
        const r = compile(`Application{ resources: { Border x:root{} } }`);
        assert.ok(r.imports.has('@visualisation-sub/mural/runtime'));
        assert.ok(r.imports.has('@visualisation-sub/mural/Controls'));
        assert.equal(r.imports.get('@visualisation-sub/mural/Controls')!.has('Border'), true);
    });
});
