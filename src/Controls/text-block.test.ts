import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    Color,
    Point,
    PropertyValueSource,
    Rect,
    Size,
    type DrawingContext,
} from '../runtime/index.js';
import {
    Brush,
    FontStyle,
    FontWeight,
    FormattedText,
    HeadlessTarget,
    Pen,
    SolidColorBrush,
    SvgDrawingContext,
} from '../visual-engine/index.js';
import { Border, TextBlock } from './index.js';

// Captures DrawText calls so tests can assert exactly what TextBlock's
// RenderOverride emitted (the FormattedText payload and the origin).
interface CapturedText { text: FormattedText; origin: Point; }

class CapturingContext implements DrawingContext
{
    public texts: CapturedText[] = [];
    DrawRectangle(_b: Brush | undefined, _p: Pen | undefined, _r: Rect): void { /* unused */ }
    DrawGeometry(): void { throw new Error('not used'); }
    DrawText(text: FormattedText, origin: Point): void { this.texts.push({ text, origin }); }
    PushTransform(): void { /* no-op */ }
    Pop(): void { /* no-op */ }
}

describe('TextBlock defaults', () => {
    test('a fresh TextBlock has empty Text, system-ui font, size 14, normal weight/style, no Foreground', () => {
        const t = new TextBlock();
        assert.equal(t.Text, '');
        assert.equal(t.FontFamily, 'system-ui, sans-serif');
        assert.equal(t.FontSize, 14);
        assert.equal(t.FontWeight, FontWeight.Normal);
        assert.equal(t.FontStyle,  FontStyle.Normal);
        assert.equal(t.Foreground, undefined);
    });

    test('constructor accepts a Text and assigns it', () => {
        const t = new TextBlock('Hello');
        assert.equal(t.Text, 'Hello');
    });

    test('setting Text invalidates measure (Text is registered MetaData.Measure)', () => {
        const t = new TextBlock('A');
        t.Measure(new Size(500, 500));
        t.Arrange(new Rect(0, 0, 100, 30));
        assert.equal(t.IsMeasureValid, true);

        t.Text = 'AB';
        assert.equal(t.IsMeasureValid, false);
    });
});

describe('TextBlock measure (approximation)', () => {
    test('empty text returns Size.Zero', () => {
        const t = new TextBlock('');
        t.Measure(new Size(500, 500));
        assert.ok(t.DesiredSize.Equals(Size.Zero));
    });

    test('text width scales with character count × fontSize × 0.6', () => {
        const t = new TextBlock('Hello');
        t.FontSize = 20;
        t.Measure(new Size(500, 500));
        // 5 chars × 20 × 0.6 = 60
        assert.equal(t.DesiredSize.Width, 60);
    });

    test('text height = fontSize × 1.2 (line-height ratio)', () => {
        const t = new TextBlock('Anything');
        t.FontSize = 16;
        t.Measure(new Size(500, 500));
        // 16 × 1.2 = 19.2
        assert.equal(t.DesiredSize.Height, 16 * 1.2);
    });

    test('Unicode surrogate pairs count as one glyph (emoji)', () => {
        const t = new TextBlock('A😀B'); // "A😀B" — emoji is one code point
        t.FontSize = 10;
        t.Measure(new Size(500, 500));
        // 3 glyphs (not 4 UTF-16 units) × 10 × 0.6 = 18
        assert.equal(t.DesiredSize.Width, 18);
    });
});

describe('TextBlock render — emits DrawText with the right FormattedText', () => {
    test('skips DrawText when Text is empty', () => {
        const t = new TextBlock('');
        const dc = new CapturingContext();
        t.Render(dc);
        assert.equal(dc.texts.length, 0);
    });

    test('emits one DrawText with origin (0, 0) and the configured font properties', () => {
        const t = new TextBlock('Hello');
        t.FontFamily = 'Inter, sans-serif';
        t.FontSize = 20;
        t.FontWeight = FontWeight.Bold;
        t.FontStyle = FontStyle.Italic;
        t.Foreground = new SolidColorBrush(Color.Red);

        const dc = new CapturingContext();
        t.Render(dc);

        assert.equal(dc.texts.length, 1);
        const captured = dc.texts[0]!;
        assert.ok(captured.origin.Equals(Point.Zero));
        assert.equal(captured.text.Text, 'Hello');
        assert.equal(captured.text.FontFamily, 'Inter, sans-serif');
        assert.equal(captured.text.FontSize, 20);
        assert.equal(captured.text.FontWeight, FontWeight.Bold);
        assert.equal(captured.text.FontStyle, FontStyle.Italic);
        assert.equal(captured.text.Foreground, t.Foreground);
    });
});

describe('TextBlock inheritance — ancestor sets a font property, descendant picks it up', () => {
    test('FontSize set on an ancestor cascades to a TextBlock descendant', () => {
        const inner = new TextBlock('Hi');
        const outer = new Border(inner);
        // Set FontSize through cross-class explicit owner — outer is a
        // Border, not a TextBlock, but the inheritance machinery cascades
        // any MetaData.Inherits property through composite-key lookup.
        outer.set_property_value(TextBlock, 'FontSize', 24);

        assert.equal(inner.FontSize, 24);
        assert.equal(inner.GetValueSource('FontSize'), PropertyValueSource.InheritedValue);
    });

    test('a local override on the TextBlock shadows the inherited value', () => {
        const inner = new TextBlock('Hi');
        const outer = new Border(inner);
        outer.set_property_value(TextBlock, 'FontSize', 24);
        inner.FontSize = 11;
        assert.equal(inner.FontSize, 11);
    });
});

describe('TextBlock end-to-end through SvgDrawingContext', () => {
    test('emits an SVG <text> with x / y (baseline-shifted) / font-* / fill', () => {
        const t = new TextBlock('Hi');
        t.FontSize = 20;
        t.Foreground = new SolidColorBrush(Color.Red);

        const target = new HeadlessTarget(200, 100, t);
        const dc = new SvgDrawingContext();
        target.Render(dc);
        const out = dc.ToFragment();

        // TextBlock with Stretch default + no explicit size → fills the
        // target (200 × 100), so there's no translate wrapping.
        assert.equal(out.includes('<g transform'), false);
        // y = origin.Y (0) + baselineOffset (fontSize × 0.85 = 17).
        assert.ok(out.includes('y="17"'));
        assert.ok(out.includes('font-size="20"'));
        assert.ok(out.includes('font-family="system-ui, sans-serif"'));
        assert.ok(out.includes('fill="rgb(255,0,0)"'));
        // Bold/Italic are omitted when Normal (cleaner SVG).
        assert.equal(out.includes('font-weight'), false);
        assert.equal(out.includes('font-style'),  false);
        // The text content itself.
        assert.ok(out.includes('>Hi</text>'));
    });

    test('XML-escapes special characters in the text content and font family', () => {
        const t = new TextBlock('a < b & "c"');
        t.FontFamily = 'My "Special" Font';
        const target = new HeadlessTarget(200, 50, t);
        const dc = new SvgDrawingContext();
        target.Render(dc);
        const out = dc.ToFragment();
        // Text content escapes & and <  (> is also escaped for safety).
        assert.ok(out.includes('>a &lt; b &amp; "c"</text>'));
        // Attribute escapes & < and " (since attrs are wrapped in ").
        assert.ok(out.includes('font-family="My &quot;Special&quot; Font"'));
    });

    test('Bold / Italic produce explicit font-weight / font-style attributes', () => {
        const t = new TextBlock('Bold');
        t.FontWeight = FontWeight.Bold;
        t.FontStyle  = FontStyle.Italic;
        const target = new HeadlessTarget(200, 50, t);
        const dc = new SvgDrawingContext();
        target.Render(dc);
        const out = dc.ToFragment();
        assert.ok(out.includes('font-weight="bold"'));
        assert.ok(out.includes('font-style="italic"'));
    });

    test('TextBlock with no Foreground falls back to black fill in SVG', () => {
        const t = new TextBlock('plain');
        const target = new HeadlessTarget(200, 50, t);
        const dc = new SvgDrawingContext();
        target.Render(dc);
        assert.ok(dc.ToFragment().includes('fill="rgb(0,0,0)"'));
    });
});
