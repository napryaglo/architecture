import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Rect, Size } from '../../runtime/index.js';
import { SvgDrawingContext, TextDecorations, decorationsToCss, hasDecoration } from '../../visual-engine/index.js';
import { TextBlock } from '../text-block.js';

function svgOf(tb: TextBlock): string
{
    tb.Measure(new Size(400, 100));
    tb.Arrange(new Rect(0, 0, 400, 100));
    const dc = new SvgDrawingContext();
    tb.Render(dc);
    return dc.ToSvg(400, 100);
}

describe('TextDecorations — enum helpers', () => {
    test('decorationsToCss maps flags to CSS keywords', () => {
        assert.equal(decorationsToCss(TextDecorations.None), '');
        assert.equal(decorationsToCss(TextDecorations.Underline), 'underline');
        assert.equal(decorationsToCss(TextDecorations.Strikethrough), 'line-through');
        assert.equal(
            decorationsToCss(TextDecorations.Underline | TextDecorations.Strikethrough),
            'underline line-through');
    });

    test('hasDecoration tests membership in a combined set', () => {
        const set = TextDecorations.Underline | TextDecorations.Overline;
        assert.ok(hasDecoration(set, TextDecorations.Underline));
        assert.ok(hasDecoration(set, TextDecorations.Overline));
        assert.ok(!hasDecoration(set, TextDecorations.Strikethrough));
    });
});

describe('TextBlock — underline rendering', () => {
    test('no text-decoration emitted by default', () => {
        const tb = new TextBlock('Hello');
        assert.ok(!svgOf(tb).includes('text-decoration'));
    });

    test('Underline emits text-decoration="underline"', () => {
        const tb = new TextBlock('Hello');
        tb.TextDecorations = TextDecorations.Underline;
        assert.match(svgOf(tb), /text-decoration="underline"/);
    });

    test('combined underline + strikethrough emits both keywords', () => {
        const tb = new TextBlock('Hello');
        tb.TextDecorations = TextDecorations.Underline | TextDecorations.Strikethrough;
        assert.match(svgOf(tb), /text-decoration="underline line-through"/);
    });
});
