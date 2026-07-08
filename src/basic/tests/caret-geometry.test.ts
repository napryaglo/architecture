import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { FontWeight, FontStyle, type TextMetrics } from '../../visual-engine/index.js';
import { FlowDocument, Paragraph, Run } from '../index.js';
import { layoutBlocks, type BlockLayoutEnv } from '../documents/block-layout.js';
import { CaretRectFor, PointerAtPoint, SelectionRects } from '../documents/caret-geometry.js';
import { TextPointer } from '../documents/text-pointer.js';
import type { RunProps } from '../documents/text-element.js';

const measure: BlockLayoutEnv['measureText'] = (text, props): TextMetrics =>
{
    const w = [...text].length * props.size * 0.6;
    return { Width: w, Height: props.size, Ascent: props.size * 0.8, Descent: props.size * 0.2 };
};
const env: BlockLayoutEnv = { letterSpacing: 0, measureText: measure, measureObject: (v) => { const d = v.DesiredSize; return { width: d.Width, height: d.Height }; } };
function base(): RunProps { return { family: 'ui', size: 10, weight: FontWeight.Normal, style: FontStyle.Normal, foreground: undefined, decorations: 0, link: undefined }; }

function layoutHello(): { doc: FlowDocument; p: Paragraph; result: ReturnType<typeof layoutBlocks> }
{
    const doc = new FlowDocument();
    const p = new Paragraph();
    p.AddChild(new Run('hello'));   // 5 glyphs × 10 × 0.6 = 6 px each
    doc.AddChild(p);
    const result = layoutBlocks(doc.Blocks.ToArray(), { availableWidth: 400, base: base(), env });
    return { doc, p, result };
}

describe('caret geometry', () =>
{
    test('CaretRectFor maps offsets to x by prefix width', () =>
    {
        const { p, result } = layoutHello();
        assert.equal(CaretRectFor(result, new TextPointer(p, 0), measure)!.x, 0);
        assert.equal(CaretRectFor(result, new TextPointer(p, 3), measure)!.x, 18);
        assert.equal(CaretRectFor(result, new TextPointer(p, 5), measure)!.x, 30);
        assert.equal(CaretRectFor(result, new TextPointer(p, 2), measure)!.height, 10);
    });

    test('PointerAtPoint round-trips a caret x back to its offset', () =>
    {
        const { p, result } = layoutHello();
        assert.equal(PointerAtPoint(result, 18, 5, measure)!.Offset, 3);
        assert.equal(PointerAtPoint(result, 0, 5, measure)!.Offset, 0);
        assert.equal(PointerAtPoint(result, 100, 5, measure)!.Offset, 5);   // past end clamps
        assert.equal(PointerAtPoint(result, 18, 5, measure)!.Paragraph, p);
    });

    test('SelectionRects covers the selected columns', () =>
    {
        const { doc, p, result } = layoutHello();
        const rects = SelectionRects(result, doc, new TextPointer(p, 1), new TextPointer(p, 4), measure);
        assert.equal(rects.length, 1);
        assert.equal(rects[0]!.X, 6);
        assert.equal(rects[0]!.Width, 18);   // "ell" = 3 × 6
    });

    test('empty paragraph still yields a caret with height', () =>
    {
        const doc = new FlowDocument();
        const p = new Paragraph();
        doc.AddChild(p);
        const result = layoutBlocks(doc.Blocks.ToArray(), { availableWidth: 400, base: base(), env });
        const c = CaretRectFor(result, new TextPointer(p, 0), measure);
        assert.ok(c !== undefined && c.height > 0);
    });
});
