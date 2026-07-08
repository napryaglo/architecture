import { FlowDocument } from './flow-document.js';
import { Block } from './block.js';
import { Paragraph } from './paragraph.js';
import { List } from './list.js';
import { TextPointer, ParagraphRuns, ParagraphLength } from './text-pointer.js';

// ─────────────────────────────────────────────────────────────────────
// Document navigation — document-order traversal of the block tree and the
// caret movements that cross paragraph boundaries. Pure model queries over
// a FlowDocument; the geometry-dependent moves (up/down a visual line) live
// in the RichTextBox, which has the layout.

/** Every Paragraph in document order, descending into Lists / ListItems. */
export function DocumentParagraphs(doc: FlowDocument): Paragraph[]
{
    const out: Paragraph[] = [];
    collect(doc.Blocks.ToArray(), out);
    return out;
}

function collect(blocks: readonly Block[], out: Paragraph[]): void
{
    for (const b of blocks)
    {
        if (b instanceof Paragraph) out.push(b);
        else if (b instanceof List) for (const it of b.ListItems.ToArray()) collect(it.Blocks.ToArray(), out);
    }
}

/** The Paragraph after `p` in document order, or undefined at the end. */
export function NextParagraph(doc: FlowDocument, p: Paragraph): Paragraph | undefined
{
    const all = DocumentParagraphs(doc);
    const i = all.indexOf(p);
    return i >= 0 && i + 1 < all.length ? all[i + 1] : undefined;
}

/** The Paragraph before `p` in document order, or undefined at the start. */
export function PrevParagraph(doc: FlowDocument, p: Paragraph): Paragraph | undefined
{
    const all = DocumentParagraphs(doc);
    const i = all.indexOf(p);
    return i > 0 ? all[i - 1] : undefined;
}

/** The paragraph's plain text (its Runs concatenated in order). */
export function ParagraphText(p: Paragraph): string
{
    let s = '';
    for (const slot of ParagraphRuns(p)) s += slot.run.Text;
    return s;
}

// ── Pointer ordering ──────────────────────────────────────────────────
/** Compare two pointers in document order: <0, 0, or >0. */
export function ComparePointers(doc: FlowDocument, a: TextPointer, b: TextPointer): number
{
    if (a.Paragraph === b.Paragraph) return a.Offset - b.Offset;
    const all = DocumentParagraphs(doc);
    return all.indexOf(a.Paragraph) - all.indexOf(b.Paragraph);
}

/** Return the two pointers as [low, high] in document order. */
export function OrderPointers(doc: FlowDocument, a: TextPointer, b: TextPointer): [TextPointer, TextPointer]
{
    return ComparePointers(doc, a, b) <= 0 ? [a, b] : [b, a];
}

// ── Caret movement ────────────────────────────────────────────────────
/** Move one character in `dir` (+1 forward / -1 back), crossing paragraph
 *  boundaries in document order. Returns a clamped pointer. */
export function MoveByChar(doc: FlowDocument, ptr: TextPointer, dir: 1 | -1): TextPointer
{
    if (dir === 1)
    {
        const len = ParagraphLength(ptr.Paragraph);
        if (ptr.Offset < len) return new TextPointer(ptr.Paragraph, ptr.Offset + 1);
        const next = NextParagraph(doc, ptr.Paragraph);
        return next !== undefined ? new TextPointer(next, 0) : ptr.Clone();
    }
    if (ptr.Offset > 0) return new TextPointer(ptr.Paragraph, ptr.Offset - 1);
    const prev = PrevParagraph(doc, ptr.Paragraph);
    return prev !== undefined ? new TextPointer(prev, ParagraphLength(prev)) : ptr.Clone();
}

const WORD = /\w/;

/** Move by a word in `dir`, crossing paragraph boundaries. Word = a run of
 *  `\w` characters; skips intervening non-word chars first (WPF/browser
 *  Ctrl+Arrow behaviour). */
export function MoveByWord(doc: FlowDocument, ptr: TextPointer, dir: 1 | -1): TextPointer
{
    const text = ParagraphText(ptr.Paragraph);
    if (dir === 1)
    {
        let i = ptr.Offset;
        if (i >= text.length)
        {
            const next = NextParagraph(doc, ptr.Paragraph);
            return next !== undefined ? new TextPointer(next, 0) : ptr.Clone();
        }
        while (i < text.length && !WORD.test(text[i]!)) i++;   // skip separators
        while (i < text.length && WORD.test(text[i]!)) i++;    // skip the word
        return new TextPointer(ptr.Paragraph, i);
    }
    let i = ptr.Offset;
    if (i <= 0)
    {
        const prev = PrevParagraph(doc, ptr.Paragraph);
        return prev !== undefined ? new TextPointer(prev, ParagraphLength(prev)) : ptr.Clone();
    }
    while (i > 0 && !WORD.test(text[i - 1]!)) i--;   // skip separators
    while (i > 0 && WORD.test(text[i - 1]!)) i--;    // skip the word
    return new TextPointer(ptr.Paragraph, i);
}

/** Logical Home / End within the paragraph. */
export function ParagraphStart(p: Paragraph): TextPointer { return new TextPointer(p, 0); }
export function ParagraphEnd(p: Paragraph): TextPointer { return new TextPointer(p, ParagraphLength(p)); }

/** Document extremes. */
export function DocumentStart(doc: FlowDocument): TextPointer | undefined
{
    const all = DocumentParagraphs(doc);
    return all.length > 0 ? new TextPointer(all[0]!, 0) : undefined;
}
export function DocumentEnd(doc: FlowDocument): TextPointer | undefined
{
    const all = DocumentParagraphs(doc);
    return all.length > 0 ? ParagraphEnd(all[all.length - 1]!) : undefined;
}
