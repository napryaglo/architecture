import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { FontWeight, FontStyle, Thickness, type TextMetrics } from '../../visual-engine/index.js';
import {
    FlowDocument,
    Paragraph,
    List,
    ListItem,
    ListMarkerStyle,
    Run,
    Bold,
} from '../index.js';
import {
    layoutBlocks,
    markerText,
    type BlockLayoutEnv,
    type ListBox,
    type ParagraphBox,
} from '../documents/block-layout.js';
import type { RunProps } from '../documents/text-element.js';

// Deterministic measurer: width = glyphs × size × 0.6; ascent/descent fixed
// ratios. No fonts, no canvas — pure arithmetic so line/box math is exact.
const GLYPH = 0.6;
const env: BlockLayoutEnv = {
    letterSpacing: 0,
    measureText: (text, props): TextMetrics =>
    {
        const w = [...text].length * props.size * GLYPH;
        return { Width: w, Height: props.size, Ascent: props.size * 0.8, Descent: props.size * 0.2 };
    },
    measureObject: (v) => { const d = v.DesiredSize; return { width: d.Width, height: d.Height }; },
};

function base(): RunProps
{
    return { family: 'system-ui', size: 10, weight: FontWeight.Normal, style: FontStyle.Normal, foreground: undefined, decorations: 0, link: undefined };
}

function para(text: string): Paragraph { const p = new Paragraph(); p.AddChild(new Run(text)); return p; }

describe('block-layout — paragraph stacking', () =>
{
    test('paragraphs stack vertically; height sums line heights', () =>
    {
        const doc = new FlowDocument();
        doc.AddChild(para('one'));   // 3 glyphs × 10 × 0.6 = 18 wide, 10 tall
        doc.AddChild(para('two'));

        const r = layoutBlocks(doc.Blocks.ToArray(), { availableWidth: 400, base: base(), env });
        assert.equal(r.boxes.length, 2);
        const [a, b] = r.boxes as ParagraphBox[];
        assert.equal(a.top, 0);
        assert.equal(a.bottom, 10);
        assert.equal(b.top, 10);           // stacked directly below
        assert.equal(r.height, 20);
        assert.equal(a.right, 18);
    });

    test('block Margin adds vertical space and left indent', () =>
    {
        const doc = new FlowDocument();
        const p = para('x');
        p.Margin = new Thickness(5, 4, 0, 6);
        doc.AddChild(p);

        const r = layoutBlocks(doc.Blocks.ToArray(), { availableWidth: 400, base: base(), env });
        const box = r.boxes[0] as ParagraphBox;
        assert.equal(box.top, 4);          // margin.Top
        assert.equal(box.x, 5);            // margin.Left
        assert.equal(r.height, 4 + 10 + 6);
    });
});

describe('block-layout — lists', () =>
{
    test('disc bullets indent content past the marker column', () =>
    {
        const doc = new FlowDocument();
        const list = new List();               // MarkerStyle.Disc default
        for (const t of ['a', 'b']) { const li = new ListItem(); li.AddChild(para(t)); list.AddChild(li); }
        doc.AddChild(list);

        const r = layoutBlocks(doc.Blocks.ToArray(), { availableWidth: 400, base: base(), env });
        const lb = r.boxes[0] as ListBox;
        assert.equal(lb.kind, 'list');
        assert.equal(lb.items.length, 2);
        // Each item's paragraph is indented right of the list origin.
        const p0 = lb.items[0]!.boxes[0] as ParagraphBox;
        assert.ok(p0.x > lb.x, 'content indented past marker');
        // Both items carry a marker; second stacks below the first.
        assert.ok(lb.items[0]!.marker && lb.items[1]!.marker);
        assert.ok((lb.items[1]!.boxes[0] as ParagraphBox).top > p0.top);
    });

    test('ordered markers format per style and share a content indent', () =>
    {
        const doc = new FlowDocument();
        const list = new List();
        list.MarkerStyle = ListMarkerStyle.Decimal;
        for (let i = 0; i < 3; i++) { const li = new ListItem(); li.AddChild(para('item')); list.AddChild(li); }
        doc.AddChild(list);

        const r = layoutBlocks(doc.Blocks.ToArray(), { availableWidth: 400, base: base(), env });
        const lb = r.boxes[0] as ListBox;
        assert.equal(lb.items[0]!.marker!.text, '1.');
        assert.equal(lb.items[2]!.marker!.text, '3.');
        // All three items align to the same content x.
        const xs = lb.items.map((it) => (it.boxes[0] as ParagraphBox).x);
        assert.ok(xs.every((x) => x === xs[0]));
    });

    test('nested list indents deeper than its parent', () =>
    {
        const doc = new FlowDocument();
        const outer = new List();
        const outerItem = new ListItem();
        outerItem.AddChild(para('top'));
        const inner = new List();
        const innerItem = new ListItem();
        innerItem.AddChild(para('sub'));
        inner.AddChild(innerItem);
        outerItem.AddChild(inner);
        outer.AddChild(outerItem);
        doc.AddChild(outer);

        const r = layoutBlocks(doc.Blocks.ToArray(), { availableWidth: 400, base: base(), env });
        const lb = r.boxes[0] as ListBox;
        const innerBox = lb.items[0]!.boxes[1] as ListBox;   // second block of the item is the nested list
        assert.equal(innerBox.kind, 'list');
        const innerPara = innerBox.items[0]!.boxes[0] as ParagraphBox;
        const outerPara = lb.items[0]!.boxes[0] as ParagraphBox;
        assert.ok(innerPara.x > outerPara.x, 'nested content indented further');
    });

    test('a Bold run inside a list item resolves bold weight', () =>
    {
        const doc = new FlowDocument();
        const list = new List();
        const li = new ListItem();
        const p = new Paragraph();
        const b = new Bold();
        b.AddChild(new Run('hi'));
        p.AddChild(b);
        li.AddChild(p);
        list.AddChild(li);
        doc.AddChild(list);

        const r = layoutBlocks(doc.Blocks.ToArray(), { availableWidth: 400, base: base(), env });
        const lb = r.boxes[0] as ListBox;
        const pb = lb.items[0]!.boxes[0] as ParagraphBox;
        const frag = pb.layout.lines[0]!.frags[0]!;
        assert.equal(frag.kind, 'text');
        if (frag.kind === 'text') assert.equal(frag.props.weight, FontWeight.Bold);
    });
});

describe('block-layout — markerText', () =>
{
    test('unordered styles map to bullet glyphs', () =>
    {
        assert.equal(markerText(ListMarkerStyle.Disc, 1), '•');
        assert.equal(markerText(ListMarkerStyle.Circle, 5), '◦');
        assert.equal(markerText(ListMarkerStyle.Square, 9), '▪');
        assert.equal(markerText(ListMarkerStyle.None, 1), '');
    });

    test('ordered styles format the ordinal', () =>
    {
        assert.equal(markerText(ListMarkerStyle.Decimal, 42), '42.');
        assert.equal(markerText(ListMarkerStyle.LowerLatin, 1), 'a.');
        assert.equal(markerText(ListMarkerStyle.LowerLatin, 27), 'aa.');
        assert.equal(markerText(ListMarkerStyle.UpperLatin, 2), 'B.');
        assert.equal(markerText(ListMarkerStyle.LowerRoman, 4), 'iv.');
        assert.equal(markerText(ListMarkerStyle.UpperRoman, 2026), 'MMXXVI.');
    });
});
