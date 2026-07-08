import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { compile, instantiate } from '../compile.js';
import * as runtime from '../../runtime/index.js';
import * as controls from '../../basic/index.js';
import * as engine from '../../visual-engine/index.js';
import { Application, Rect, Size } from '../../runtime/index.js';
import { SvgDrawingContext } from '../../visual-engine/index.js';
import { TextBlock, Run, Bold } from '../../basic/index.js';

const CTX: Record<string, unknown> = { ...runtime, ...controls, ...engine };

// TextBlock is an inline flow-content host: a quoted string is a Run, a
// bare identifier is a nested inline element. Text MUST be quoted (mural's
// disambiguator in place of XAML's `<>` tags); `TextBlock [Text="…"]`
// (attribute) still uses the plain Text fast path.
describe('compile — mixed inline content', () => {
    test('quoted text + Bold lowers to Run + Bold in Inlines', () => {
        const js = compile(`
            Application{ resources: {
                TextBlock x:root {
                    "Hello "
                    Bold { "World" }
                    "!"
                }
            } }
        `).js;
        assert.equal((js.match(/new Run\(/g) ?? []).length, 3, 'three Runs');
        assert.match(js, /new Run\("Hello "\)/);
        assert.match(js, /new Run\("World"\)/);
        assert.match(js, /new Bold\(\)/);
        assert.match(js, /\.AddChild\(/);       // Bold's Run + TextBlock's inlines
        assert.match(js, /import\b[^\n]*\bRun\b/);
    });

    test('Italic / Underline / Hyperlink / InlineUIContainer / LineBreak compile', () => {
        const js = compile(`
            Application{ resources: {
                TextBlock x:root {
                    Italic { "i" }
                    Underline { "u" }
                    Hyperlink [ NavigateUri = "https://x" ] { "link" }
                    LineBreak
                    InlineUIContainer { Border [ Width = 12, Height = 12 ] }
                }
            } }
        `).js;
        assert.match(js, /new Italic\(\)/);
        assert.match(js, /new Underline\(\)/);
        assert.match(js, /new Hyperlink\(\)/);
        assert.match(js, /new LineBreak\(\)/);
        assert.match(js, /new InlineUIContainer\(\)/);
        assert.match(js, /\.Child = _border\d+/);
    });

    test('unquoted identifier stays an element (bare text is a compile error via unknown symbol)', () => {
        assert.throws(() => compile(`
            Application{ resources: { TextBlock x:root { Hello } } }
        `), /unknown symbol 'Hello'/);
    });

    test('quoted text on a non-inline host is a compile error', () => {
        assert.throws(() => compile(`
            Application{ resources: { StackPanel x:root { "loose" } } }
        `), /text content is only allowed inside an inline host/);
    });
});

describe('instantiate — mixed inline content renders styled', () => {
    beforeEach(() => { Application.current = null; });

    test('compiled TextBlock builds Inlines and renders bold fragment', () => {
        const app = instantiate(`
            Application{ resources: {
                TextBlock x:root { "Hello " Bold { "World" } }
            } }
        `, CTX) as Application;
        const tb = app.Resources.Root as TextBlock;
        assert.ok(tb instanceof TextBlock);
        assert.equal(tb.Inlines.Count, 2);
        assert.ok(tb.Inlines.Get(0) instanceof Run);
        assert.ok(tb.Inlines.Get(1) instanceof Bold);

        tb.Measure(new Size(400, 100));
        tb.Arrange(new Rect(0, 0, tb.DesiredSize.Width, tb.DesiredSize.Height));
        const dc = new SvgDrawingContext();
        tb.Render(dc);
        const svg = dc.ToSvg(400, 100);
        assert.match(svg, /font-weight="bold"[^>]*>World</);
        assert.ok(svg.includes('>Hello'));
    });
});
