import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initTestApp } from './test-app.js';
import { Rect, Size } from '../../runtime/index.js';
import { SvgDrawingContext } from '../../visual-engine/index.js';
import { TextBlock, TextWrapping } from '../text-block.js';
import { Run, Span, Bold, Italic, Underline, LineBreak } from '../documents/inlines.js';

function svgOf(tb: TextBlock, w = 400, h = 120): string
{
    tb.Measure(new Size(w, h));
    tb.Arrange(new Rect(0, 0, tb.DesiredSize.Width, tb.DesiredSize.Height));
    const dc = new SvgDrawingContext();
    tb.Render(dc);
    return dc.ToSvg(w, h);
}

function textCount(svg: string): number { return (svg.match(/<text /g) ?? []).length; }

describe('TextBlock inlines — styled display', () => {
    beforeEach(() => { initTestApp(); });

    test('empty Inlines → plain Text path unchanged', () => {
        const tb = new TextBlock('plain');
        const svg = svgOf(tb);
        assert.equal(textCount(svg), 1);
        assert.ok(svg.includes('plain'));
    });

    test('Run + Bold + Run renders three styled fragments, one bold', () => {
        const tb = new TextBlock();
        tb.Inlines.Add(new Run('Hello '));
        const b = new Bold(); b.Inlines.Add(new Run('World'));
        tb.Inlines.Add(b);
        tb.Inlines.Add(new Run('!'));

        const svg = svgOf(tb);
        // Three text runs (Hello / World / !) on one line.
        assert.ok(textCount(svg) >= 3, `expected >=3 <text>, got ${textCount(svg)}`);
        assert.match(svg, /font-weight="bold"[^>]*>World</);
        assert.ok(svg.includes('>Hello') && svg.includes('>!<'));
    });

    test('Italic + Underline map to font-style / text-decoration', () => {
        const tb = new TextBlock();
        const i = new Italic(); i.Inlines.Add(new Run('slanted'));
        const u = new Underline(); u.Inlines.Add(new Run('lined'));
        tb.Inlines.Add(i);
        tb.Inlines.Add(new Run(' '));
        tb.Inlines.Add(u);

        const svg = svgOf(tb);
        assert.match(svg, /font-style="italic"[^>]*>slanted</);
        assert.match(svg, /text-decoration="underline"[^>]*>lined</);
    });

    test('nested Bold(Underline) accumulates weight + decoration', () => {
        const tb = new TextBlock();
        const b = new Bold();
        const u = new Underline(); u.Inlines.Add(new Run('both'));
        b.Inlines.Add(u);
        tb.Inlines.Add(b);

        const svg = svgOf(tb);
        assert.match(svg, /<text[^>]*font-weight="bold"[^>]*text-decoration="underline"[^>]*>both</);
    });

    test('mixed font sizes share a baseline (bigger run drives line height)', () => {
        const tb = new TextBlock();
        const small = new Run('a');
        const big = new Span(); big.FontSize = 40; big.Inlines.Add(new Run('B'));
        tb.Inlines.Add(small);
        tb.Inlines.Add(big);
        tb.Measure(new Size(400, 200));
        // Line height should reflect the 40px run, not the default 14px.
        assert.ok(tb.DesiredSize.Height >= 40, `height ${tb.DesiredSize.Height} should be >= 40`);
    });

    test('LineBreak forces a second line', () => {
        const tb = new TextBlock();
        tb.Inlines.Add(new Run('line one'));
        tb.Inlines.Add(new LineBreak());
        tb.Inlines.Add(new Run('line two'));
        tb.Measure(new Size(400, 200));
        // Two lines ≈ 2× a single 14px line height.
        assert.ok(tb.DesiredSize.Height >= 28, `height ${tb.DesiredSize.Height} should span 2 lines`);
    });

    test('wrap breaks across runs at word boundaries', () => {
        const tb = new TextBlock();
        tb.TextWrapping = TextWrapping.Wrap;
        tb.Inlines.Add(new Run('aaaa bbbb '));
        const b = new Bold(); b.Inlines.Add(new Run('cccc dddd'));
        tb.Inlines.Add(b);
        const singleLine = (() => { tb.Measure(new Size(10000, 200)); return tb.DesiredSize.Height; })();
        tb.Measure(new Size(60, 200));   // narrow → must wrap
        assert.ok(tb.DesiredSize.Height > singleLine, 'narrow width wraps to more lines');
    });
});
