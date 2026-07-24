import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initTestApp } from './test-app.js';
import {
    Rect, Size, PointerEventArgs, PointerButton, NoModifiers, RelayCommand,
    type PointerEventInit,
} from '../../runtime/index.js';
import { HeadlessTarget, SvgDrawingContext } from '../../visual-engine/index.js';
import {
    RichTextBlock,
    FlowDocument,
    Paragraph,
    List,
    ListItem,
    ListMarkerStyle,
    Run,
    Bold,
    Hyperlink,
    InlineUIContainer,
    Border,
} from '../index.js';

function ptr(x: number, y: number): PointerEventInit
{
    return {
        HostX: x, HostY: y, Button: PointerButton.Primary, Buttons: 1,
        Modifiers: NoModifiers, PointerId: 0, Pressure: 0, PointerType: 'mouse',
    };
}
function down(rtb: RichTextBlock, x: number, y: number): void
{
    (rtb as unknown as { OnPointerDown(a: PointerEventArgs): void })
        .OnPointerDown(new PointerEventArgs('PointerDown', rtb, ptr(x, y)));
}
function up(rtb: RichTextBlock, x: number, y: number): void
{
    (rtb as unknown as { OnPointerUp(a: PointerEventArgs): void })
        .OnPointerUp(new PointerEventArgs('PointerUp', rtb, ptr(x, y)));
}

function para(...inlines: (Run | Bold | Hyperlink | InlineUIContainer)[]): Paragraph
{
    const p = new Paragraph();
    for (const i of inlines) p.AddChild(i);
    return p;
}
function textPara(t: string): Paragraph { return para(new Run(t)); }

function render(rtb: RichTextBlock, w = 400, h = 200): string
{
    rtb.Measure(new Size(w, h));
    rtb.Arrange(new Rect(0, 0, rtb.DesiredSize.Width, rtb.DesiredSize.Height));
    const dc = new SvgDrawingContext();
    rtb.Render(dc);
    return dc.ToSvg(w, h);
}

describe('RichTextBlock — paragraph rendering', () =>
{
    beforeEach(() => { initTestApp(); });

    test('stacked paragraphs both paint; a Bold run is bold', () =>
    {
        const rtb = new RichTextBlock();
        const doc = new FlowDocument();
        doc.AddChild(para(new Run('Intro '), (() => { const b = new Bold(); b.AddChild(new Run('weight')); return b; })()));
        doc.AddChild(textPara('Second'));
        rtb.Document = doc;

        const svg = render(rtb);
        assert.ok(svg.includes('>Intro'), 'first paragraph painted');
        assert.ok(svg.includes('>Second'), 'second paragraph painted');
        assert.match(svg, /font-weight="bold"[^>]*>weight</);
    });

    test('DesiredSize grows when the document gains paragraphs', () =>
    {
        const rtb = new RichTextBlock();
        const one = new FlowDocument();
        one.AddChild(textPara('only'));
        rtb.Document = one;
        rtb.Measure(new Size(400, 400));
        const h1 = rtb.DesiredSize.Height;

        const three = new FlowDocument();
        for (const t of ['a', 'b', 'c']) three.AddChild(textPara(t));
        rtb.Document = three;
        rtb.Measure(new Size(400, 400));
        assert.ok(rtb.DesiredSize.Height > h1, 'taller with more paragraphs');
    });
});

describe('RichTextBlock — lists', () =>
{
    beforeEach(() => { initTestApp(); });

    test('bullet markers render for a disc list', () =>
    {
        const rtb = new RichTextBlock();
        const doc = new FlowDocument();
        const list = new List();   // Disc default
        for (const t of ['first', 'second']) { const li = new ListItem(); li.AddChild(textPara(t)); list.AddChild(li); }
        doc.AddChild(list);
        rtb.Document = doc;

        const svg = render(rtb);
        assert.ok(svg.includes('•'), 'disc bullet drawn');
        assert.ok(svg.includes('first') && svg.includes('second'), 'item text drawn');
    });

    test('decimal markers render the ordinals', () =>
    {
        const rtb = new RichTextBlock();
        const doc = new FlowDocument();
        const list = new List();
        list.MarkerStyle = ListMarkerStyle.Decimal;
        for (const t of ['x', 'y', 'z']) { const li = new ListItem(); li.AddChild(textPara(t)); list.AddChild(li); }
        doc.AddChild(list);
        rtb.Document = doc;

        const svg = render(rtb);
        assert.ok(svg.includes('1.') && svg.includes('2.') && svg.includes('3.'), 'ordinals drawn');
    });
});

describe('RichTextBlock — embedded visuals + hyperlinks', () =>
{
    beforeEach(() => { initTestApp(); });

    test('InlineUIContainer child becomes a visual child, arranged inline', () =>
    {
        const rtb = new RichTextBlock();
        const doc = new FlowDocument();
        const box = new Border(); box.Width = 24; box.Height = 16;
        doc.AddChild(para(new Run('before '), new InlineUIContainer(box), new Run(' after')));
        rtb.Document = doc;

        const target = new HeadlessTarget(400, 120);
        target.Content = rtb as never;
        target.Flush();

        assert.ok(rtb.visualChildren.includes(box), 'embedded visual hosted');
        assert.equal(box.DesiredSize.Width, 24);
        assert.ok(box.ArrangedRect.X > 0, 'arranged after leading text');
    });

    test('clicking a hyperlink fires Click and runs Command', () =>
    {
        let clicked = 0, executed = 0;
        const rtb = new RichTextBlock();
        const doc = new FlowDocument();
        const link = new Hyperlink();
        link.AddChild(new Run('click me'));
        link.Click = () => { clicked++; };
        link.Command = new RelayCommand(() => { executed++; });
        doc.AddChild(para(link));
        rtb.Document = doc;

        const target = new HeadlessTarget(300, 80);
        target.Content = rtb as never;
        target.Flush();

        down(rtb, 6, 8);
        up(rtb, 6, 8);
        assert.equal(clicked, 1, 'Click fired');
        assert.equal(executed, 1, 'Command executed');
    });

    test('embedded visual detaches when the document is cleared', () =>
    {
        const rtb = new RichTextBlock();
        const doc = new FlowDocument();
        const box = new Border(); box.Width = 10; box.Height = 10;
        doc.AddChild(para(new InlineUIContainer(box)));
        rtb.Document = doc;
        const target = new HeadlessTarget(200, 60);
        target.Content = rtb as never;
        target.Flush();
        assert.ok(rtb.visualChildren.includes(box));

        rtb.Document = undefined;
        target.Flush();
        assert.ok(!rtb.visualChildren.includes(box), 'detached after document cleared');
    });

    test('re-hosting an embedded visual still parented to a torn-down RichTextBlock does not throw', () =>
    {
        const box = new Border(); box.Width = 12; box.Height = 12;

        // First host measures the box → its visual parent is rtb1.
        const rtb1 = new RichTextBlock();
        const doc1 = new FlowDocument();
        doc1.AddChild(para(new InlineUIContainer(box)));
        rtb1.Document = doc1;
        rtb1.Measure(new Size(200, 60));
        assert.ok(rtb1.visualChildren.includes(box), 'box hosted by the first RichTextBlock');

        // rtb1's view is discarded but never detached the box (a tab switch /
        // recycled container). A second RichTextBlock re-presents the same
        // embedded visual — it must claim it, not hit the single-parent guard.
        const rtb2 = new RichTextBlock();
        const doc2 = new FlowDocument();
        doc2.AddChild(para(new InlineUIContainer(box)));
        rtb2.Document = doc2;
        assert.doesNotThrow(() => rtb2.Measure(new Size(200, 60)));
        assert.ok(rtb2.visualChildren.includes(box), 'box re-hosted by the second RichTextBlock');
    });
});
