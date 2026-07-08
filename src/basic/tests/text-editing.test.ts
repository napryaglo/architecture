import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { FontWeight, FontStyle, TextDecorations } from '../../visual-engine/index.js';
import { FlowDocument, Paragraph, Run, Bold, List, ListItem } from '../index.js';
import { TextPointer, ParagraphLength, ParagraphRuns } from '../documents/text-pointer.js';
import { DocumentParagraphs, ParagraphText, MoveByChar, MoveByWord } from '../documents/text-navigation.js';
import {
    NormalizeParagraph,
    InsertText,
    DeleteRange,
    DeleteBack,
    DeleteForward,
    SplitParagraph,
    ToggleFormat,
    FormatKind,
    IndentParagraph,
    OutdentParagraph,
} from '../documents/text-editing.js';

function para(text = ''): Paragraph { const p = new Paragraph(); if (text) p.AddChild(new Run(text)); return p; }
function boldPara(text: string): Paragraph { const p = new Paragraph(); const b = new Bold(); b.AddChild(new Run(text)); p.AddChild(b); return p; }
function twoRunPara(a: string, b: string): Paragraph { const p = new Paragraph(); p.AddChild(new Run(a)); p.AddChild(new Run(b)); return p; }
function doc(...paras: Paragraph[]): FlowDocument { const d = new FlowDocument(); for (const p of paras) d.AddChild(p); return d; }
function listDoc(...items: string[]): { d: FlowDocument; list: List } { const d = new FlowDocument(); const list = new List(); for (const t of items) { const li = new ListItem(); li.AddChild(para(t)); list.AddChild(li); } d.AddChild(list); return { d, list }; }
function tp(p: Paragraph, o: number): TextPointer { return new TextPointer(p, o); }

describe('editing — normalize', () =>
{
    test('a Bold span flattens to a bold Run', () =>
    {
        const p = boldPara('hi');
        NormalizeParagraph(p);
        const runs = p.Inlines.ToArray();
        assert.equal(runs.length, 1);
        assert.ok(runs[0] instanceof Run);
        assert.equal((runs[0] as Run).FontWeight, FontWeight.Bold);
        assert.equal(ParagraphText(p), 'hi');
    });

    test('normalize is idempotent on flat paragraphs', () =>
    {
        const p = para('plain');
        NormalizeParagraph(p); NormalizeParagraph(p);
        assert.equal(p.Inlines.Count, 1);
    });
});

describe('editing — insert', () =>
{
    test('inserts mid-run and advances the caret', () =>
    {
        const p = para('Helo');
        const d = doc(p);
        const c = InsertText(d, tp(p, 3), 'l');
        assert.equal(ParagraphText(p), 'Hello');
        assert.equal(c.Offset, 4);
    });

    test('seeds a Run in an empty paragraph', () =>
    {
        const p = para('');
        const d = doc(p);
        const c = InsertText(d, tp(p, 0), 'hi');
        assert.equal(ParagraphText(p), 'hi');
        assert.equal(c.Offset, 2);
    });

    test('typing inside bold text stays bold', () =>
    {
        const p = boldPara('ac');
        const d = doc(p);
        InsertText(d, tp(p, 1), 'b');
        assert.equal(ParagraphText(p), 'abc');
        assert.ok(ParagraphRuns(p).every((s) => s.run.FontWeight === FontWeight.Bold));
    });
});

describe('editing — delete', () =>
{
    test('DeleteRange within a paragraph spans runs', () =>
    {
        const p = twoRunPara('abc', 'def');
        const d = doc(p);
        const c = DeleteRange(d, tp(p, 2), tp(p, 4));   // remove 'c','d'
        assert.equal(ParagraphText(p), 'abef');
        assert.equal(c.Offset, 2);
    });

    test('Backspace mid-text removes the previous char', () =>
    {
        const p = para('hello');
        const d = doc(p);
        const c = DeleteBack(d, tp(p, 5));
        assert.equal(ParagraphText(p), 'hell');
        assert.equal(c.Offset, 4);
    });

    test('Backspace at paragraph start merges with the previous', () =>
    {
        const a = para('foo'), b = para('bar');
        const d = doc(a, b);
        const c = DeleteBack(d, tp(b, 0));
        assert.equal(DocumentParagraphs(d).length, 1);
        assert.equal(ParagraphText(a), 'foobar');
        assert.equal(c.Paragraph, a);
        assert.equal(c.Offset, 3);
    });

    test('Delete at paragraph end pulls the next up', () =>
    {
        const a = para('foo'), b = para('bar');
        const d = doc(a, b);
        DeleteForward(d, tp(a, 3));
        assert.equal(DocumentParagraphs(d).length, 1);
        assert.equal(ParagraphText(a), 'foobar');
    });
});

describe('editing — split (Enter)', () =>
{
    test('splits one paragraph into two, caret at the new start', () =>
    {
        const p = para('hello');
        const d = doc(p);
        const c = SplitParagraph(d, tp(p, 2));
        const ps = DocumentParagraphs(d);
        assert.equal(ps.length, 2);
        assert.equal(ParagraphText(ps[0]!), 'he');
        assert.equal(ParagraphText(ps[1]!), 'llo');
        assert.equal(c.Paragraph, ps[1]);
        assert.equal(c.Offset, 0);
    });

    test('split preserves run styling on both sides', () =>
    {
        const p = boldPara('hello');
        const d = doc(p);
        SplitParagraph(d, tp(p, 2));
        for (const q of DocumentParagraphs(d))
            assert.ok(ParagraphRuns(q).every((s) => s.run.FontWeight === FontWeight.Bold));
    });

    test('Enter in a list makes a new sibling item', () =>
    {
        const { d, list } = listDoc('abc');
        const p = list.ListItems.Get(0)!.Blocks.Get(0) as Paragraph;
        const c = SplitParagraph(d, tp(p, 3));
        assert.equal(list.ListItems.Count, 2);
        assert.equal(ParagraphText(list.ListItems.Get(1)!.Blocks.Get(0) as Paragraph), '');
        assert.equal(c.Offset, 0);
    });

    test('Enter in an empty list item exits the list', () =>
    {
        const { d, list } = listDoc('');
        const p = list.ListItems.Get(0)!.Blocks.Get(0) as Paragraph;
        SplitParagraph(d, tp(p, 0));
        // Item left the list; list emptied and removed; paragraph now top-level.
        assert.equal(d.Blocks.Count, 1);
        assert.ok(d.Blocks.Get(0) instanceof Paragraph);
    });
});

describe('editing — formatting toggles', () =>
{
    test('bolds a whole selection, then un-bolds it', () =>
    {
        const p = para('hello');
        const d = doc(p);
        ToggleFormat(d, tp(p, 0), tp(p, 5), FormatKind.Bold);
        assert.ok(ParagraphRuns(p).every((s) => s.run.FontWeight === FontWeight.Bold));
        ToggleFormat(d, tp(p, 0), tp(p, 5), FormatKind.Bold);
        assert.ok(ParagraphRuns(p).every((s) => s.run.FontWeight !== FontWeight.Bold));
    });

    test('bolds a sub-range by splitting runs', () =>
    {
        const p = para('hello');
        const d = doc(p);
        ToggleFormat(d, tp(p, 1), tp(p, 3), FormatKind.Bold);   // "el"
        const runs = ParagraphRuns(p);
        const bold = runs.filter((s) => s.run.FontWeight === FontWeight.Bold).map((s) => s.run.Text).join('');
        assert.equal(bold, 'el');
        assert.equal(ParagraphText(p), 'hello');
    });

    test('italic + underline toggles are independent', () =>
    {
        const p = para('word');
        const d = doc(p);
        ToggleFormat(d, tp(p, 0), tp(p, 4), FormatKind.Italic);
        ToggleFormat(d, tp(p, 0), tp(p, 4), FormatKind.Underline);
        for (const s of ParagraphRuns(p))
        {
            assert.equal(s.run.FontStyle, FontStyle.Italic);
            assert.ok((s.run.TextDecorations & TextDecorations.Underline) !== 0);
        }
    });
});

describe('editing — list indent / outdent', () =>
{
    test('Tab nests an item under its previous sibling', () =>
    {
        const { d, list } = listDoc('A', 'B');
        const pB = list.ListItems.Get(1)!.Blocks.Get(0) as Paragraph;
        IndentParagraph(d, tp(pB, 0));
        assert.equal(list.ListItems.Count, 1, 'B left the top list');
        const nested = list.ListItems.Get(0)!.Blocks.Get(1) as List;
        assert.ok(nested instanceof List);
        assert.equal(ParagraphText(nested.ListItems.Get(0)!.Blocks.Get(0) as Paragraph), 'B');
    });

    test('Shift+Tab returns a nested item to the parent list', () =>
    {
        const { d, list } = listDoc('A', 'B');
        const pB = list.ListItems.Get(1)!.Blocks.Get(0) as Paragraph;
        IndentParagraph(d, tp(pB, 0));
        OutdentParagraph(d, tp(pB, 0));
        assert.equal(list.ListItems.Count, 2, 'B is back at the top level');
        assert.equal(ParagraphText(list.ListItems.Get(1)!.Blocks.Get(0) as Paragraph), 'B');
    });

    test('outdenting a top-level item drops it out of the list', () =>
    {
        const { d, list } = listDoc('only');
        const p = list.ListItems.Get(0)!.Blocks.Get(0) as Paragraph;
        OutdentParagraph(d, tp(p, 0));
        assert.equal(d.Blocks.Count, 1);
        assert.ok(d.Blocks.Get(0) instanceof Paragraph);
        assert.equal(ParagraphText(d.Blocks.Get(0) as Paragraph), 'only');
    });
});

describe('editing — caret navigation', () =>
{
    test('MoveByChar crosses paragraph boundaries', () =>
    {
        const a = para('ab'), b = para('cd');
        const d = doc(a, b);
        const fwd = MoveByChar(d, tp(a, 2), 1);   // end of a → start of b
        assert.equal(fwd.Paragraph, b);
        assert.equal(fwd.Offset, 0);
        const back = MoveByChar(d, tp(b, 0), -1);  // start of b → end of a
        assert.equal(back.Paragraph, a);
        assert.equal(back.Offset, 2);
    });

    test('MoveByWord jumps over word runs', () =>
    {
        const p = para('foo bar baz');
        const d = doc(p);
        const w1 = MoveByWord(d, tp(p, 0), 1);
        assert.equal(w1.Offset, 3);   // end of "foo"
        const w0 = MoveByWord(d, tp(p, 11), -1);
        assert.equal(w0.Offset, 8);   // start of "baz"
    });
});
