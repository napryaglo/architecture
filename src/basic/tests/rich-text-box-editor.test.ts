import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initTestApp } from './test-app.js';
import {
    Key, NoModifiers, PointerButton, toModifierKeys,
    PointerEventArgs, type KeyEventInit, type ModifierKeys, type PointerEventInit,
} from '../../runtime/index.js';
import { InputManager } from '../../framework/index.js';
import { HeadlessTarget, SvgDrawingContext, FontWeight } from '../../visual-engine/index.js';
import { RichTextBox, FlowDocument, Paragraph, Run, List, ListItem } from '../index.js';
import { TextPointer, ParagraphRuns } from '../documents/text-pointer.js';
import { DocumentParagraphs, ParagraphText } from '../documents/text-navigation.js';
import type { ClipboardSink } from '../text-box.js';

function key(k: Key, mods: Partial<ModifierKeys> = {}): KeyEventInit
{
    return { Key: k, KeyText: k, Code: k, Modifiers: toModifierKeys({ shift: mods.Shift, control: mods.Control, alt: mods.Alt, meta: mods.Meta }), IsRepeat: false };
}
function ptr(x: number, y: number): PointerEventInit
{
    return { HostX: x, HostY: y, Button: PointerButton.Primary, Buttons: 1, Modifiers: NoModifiers, PointerId: 0, Pressure: 0, PointerType: 'mouse' };
}
function down(rtb: RichTextBox, x: number, y: number): void
{
    (rtb as unknown as { OnPointerDown(a: PointerEventArgs): void }).OnPointerDown(new PointerEventArgs('PointerDown', rtb, ptr(x, y)));
}
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

function fixture(build: (doc: FlowDocument) => void): { rtb: RichTextBox; im: InputManager; target: HeadlessTarget; doc: FlowDocument }
{
    const rtb = new RichTextBox();
    const doc = new FlowDocument();
    build(doc);
    rtb.Document = doc;
    const target = new HeadlessTarget(400, 300);
    target.Content = rtb;
    target.Flush();
    rtb.Focus();
    return { rtb, im: target.InputManager, target, doc };
}

function firstText(doc: FlowDocument): string { return ParagraphText(DocumentParagraphs(doc)[0]!); }
function paras(doc: FlowDocument): Paragraph[] { return DocumentParagraphs(doc); }
function emptyDoc(doc: FlowDocument): void { doc.AddChild(new Paragraph()); }
function textDoc(t: string): (doc: FlowDocument) => void { return (doc) => { const p = new Paragraph(); p.AddChild(new Run(t)); doc.AddChild(p); }; }

describe('RichTextBox editor — typing + structure', () =>
{
    beforeEach(() => { initTestApp(); });

    test('text input inserts at the caret', () =>
    {
        const { im, doc } = fixture(emptyDoc);
        im.InjectTextInput({ Text: 'Hi' });
        assert.equal(firstText(doc), 'Hi');
    });

    test('Enter splits the paragraph at the caret', () =>
    {
        const { im, doc } = fixture(textDoc('abcd'));
        im.InjectKeyDown(key(Key.Right));
        im.InjectKeyDown(key(Key.Right));
        im.InjectKeyDown(key(Key.Return));
        const ps = paras(doc);
        assert.equal(ps.length, 2);
        assert.equal(ParagraphText(ps[0]!), 'ab');
        assert.equal(ParagraphText(ps[1]!), 'cd');
    });

    test('Backspace at paragraph start merges with the previous', () =>
    {
        const { rtb, im, doc } = fixture((d) => { for (const t of ['foo', 'bar']) { const p = new Paragraph(); p.AddChild(new Run(t)); d.AddChild(p); } });
        rtb.SetCaret(new TextPointer(paras(doc)[1]!, 0));
        im.InjectKeyDown(key(Key.Back));
        assert.equal(paras(doc).length, 1);
        assert.equal(firstText(doc), 'foobar');
    });

    test('selecting all then typing replaces the content', () =>
    {
        const { im, doc } = fixture(textDoc('hello'));
        im.InjectKeyDown(key(Key.A, { Control: true }));
        im.InjectTextInput({ Text: 'X' });
        assert.equal(firstText(doc), 'X');
    });
});

describe('RichTextBox editor — formatting + clipboard + lists', () =>
{
    beforeEach(() => { initTestApp(); });

    test('Ctrl+B bolds the selection', () =>
    {
        const { im, doc } = fixture(textDoc('hello'));
        im.InjectKeyDown(key(Key.A, { Control: true }));
        im.InjectKeyDown(key(Key.B, { Control: true }));
        assert.ok(ParagraphRuns(paras(doc)[0]!).every((s) => s.run.FontWeight === FontWeight.Bold));
    });

    test('Ctrl+B actually PAINTS the selection bold (self-styled Run reaches the flatten)', () =>
    {
        const { rtb, im } = fixture(textDoc('hello'));
        im.InjectKeyDown(key(Key.A, { Control: true }));
        im.InjectKeyDown(key(Key.B, { Control: true }));
        rtb.Measure({ Width: 200, Height: 60 } as never);
        const dc = new SvgDrawingContext();
        rtb.Render(dc);
        // The bolded run must render with font-weight="bold" — the model
        // toggle only matters if the flatten honours the Run's own DPs.
        assert.match(dc.ToSvg(200, 60), /font-weight="bold"[^>]*>hello</);
    });

    test('copy + paste round-trips through the clipboard', async () =>
    {
        const stub: ClipboardSink & { buf: string } = { buf: '', async Read() { return this.buf; }, async Write(t) { this.buf = t; } };
        RichTextBox.Clipboard = stub;
        const { im, doc } = fixture(textDoc('hello'));
        im.InjectKeyDown(key(Key.A, { Control: true }));
        im.InjectKeyDown(key(Key.C, { Control: true }));
        await tick();
        assert.equal(stub.buf, 'hello');
        im.InjectKeyDown(key(Key.End, { Control: true }));   // collapse to end
        im.InjectKeyDown(key(Key.V, { Control: true }));
        await tick();
        assert.equal(firstText(doc), 'hellohello');
    });

    test('Tab nests a list item under its previous sibling', () =>
    {
        const { rtb, im, doc } = fixture((d) => {
            const list = new List();
            for (const t of ['A', 'B']) { const li = new ListItem(); const p = new Paragraph(); p.AddChild(new Run(t)); li.AddChild(p); list.AddChild(li); }
            d.AddChild(list);
        });
        const list = doc.Blocks.Get(0) as List;
        rtb.SetCaret(new TextPointer(list.ListItems.Get(1)!.Blocks.Get(0) as Paragraph, 0));
        im.InjectKeyDown(key(Key.Tab));
        assert.equal(list.ListItems.Count, 1, 'B left the top level');
        assert.ok(list.ListItems.Get(0)!.Blocks.Get(1) instanceof List);
    });
});

describe('RichTextBox editor — mouse + caret paint', () =>
{
    beforeEach(() => { initTestApp(); });

    test('clicking past the text end places the caret at the end', () =>
    {
        const { rtb, im, doc } = fixture(textDoc('hello'));
        down(rtb, 1000, 5);            // far right → clamps to end (offset 5)
        im.InjectTextInput({ Text: 'Z' });
        assert.equal(firstText(doc), 'helloZ');
    });

    test('drag selection extends via pointer capture even when the pointer leaves the editor', () =>
    {
        const { rtb, im } = fixture(textDoc('hello world'));
        im.InjectPointerDown(rtb, ptr(0, 6));          // press at the start
        im.InjectPointerMove(null, ptr(1000, 6));      // drag far outside (hit === null)
        im.InjectPointerUp(null, ptr(1000, 6));
        assert.equal(rtb.SelectedText(), 'hello world', 'captured move extended the selection');
    });

    test('in-bounds drag (hit === editor) extends a partial selection', () =>
    {
        const { rtb, im } = fixture(textDoc('hello world'));
        im.InjectPointerDown(rtb, ptr(0, 6));          // press at the start (offset 0)
        im.InjectPointerMove(rtb, ptr(40, 6));         // drag a moderate distance, still over the editor
        im.InjectPointerUp(rtb, ptr(40, 6));
        const sel = rtb.SelectedText();
        assert.ok(sel.length > 0 && sel.length < 'hello world'.length, `partial selection, got "${sel}"`);
        assert.ok('hello world'.startsWith(sel), 'selection is a prefix from the start');
    });

    test('a focused editor paints a caret', () =>
    {
        const { rtb } = fixture(textDoc('hi'));
        rtb.Measure(rtb.DesiredSize.IsEmpty ? { Width: 200, Height: 60 } as never : rtb.DesiredSize);
        const dc = new SvgDrawingContext();
        rtb.Render(dc);
        // The caret is the only 1-DIP-wide rect drawn.
        assert.match(dc.ToSvg(200, 60), /width="1"/);
    });

    test('selecting text paints a VISIBLE highlight rectangle wider than the caret', () =>
    {
        const { rtb } = fixture(textDoc('hello world'));
        rtb.SelectAll();
        const dc = new SvgDrawingContext();
        rtb.Render(dc);
        const svg = dc.ToSvg(400, 300);
        // Find the wide selection rect and assert its fill is actually
        // visible — a transparent fill (alpha 0) reads as "no selection".
        const rects = svg.match(/<rect[^>]*\/?>/g) ?? [];
        const sel = rects.find((r) => {
            const w = Number((/width="([\d.]+)"/.exec(r) ?? [])[1]);
            return w > 10;
        });
        assert.ok(sel !== undefined, 'a selection highlight rect was drawn');
        // Fill must not be transparent: reject rgba(...,0) / fill="none".
        assert.doesNotMatch(sel!, /rgba\([^)]*,\s*0\s*\)/, 'selection fill is not fully transparent');
        assert.doesNotMatch(sel!, /fill="none"/, 'selection fill is set');
    });
});
