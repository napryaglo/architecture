import { Rect } from '../../runtime/index.js';
import { FlowDocument } from './flow-document.js';
import { Paragraph } from './paragraph.js';
import { Run } from './inlines.js';
import { TextPointer, ParagraphRuns, ParagraphLength } from './text-pointer.js';
import { OrderPointers, DocumentParagraphs } from './text-navigation.js';
import { type MeasureText, type Line, type TextFragment } from './text-layout.js';
import { type BlockLayoutResult, type BlockBox, type ParagraphBox } from './block-layout.js';

// ─────────────────────────────────────────────────────────────────────
// Caret geometry — maps a TextPointer to its on-screen caret rectangle,
// a document-local point back to a TextPointer (mouse hit-test), and a
// selection range to highlight rectangles. Works in PARAGRAPH-OFFSET space
// directly: each laid-out text fragment covers a paragraph-offset span
// [runStart(source)+runOffset, +text.length], so a target offset maps to a
// fragment and a within-fragment prefix width (measured on demand). All
// results are in document-local coordinates (the host adds its origin).

export interface CaretRect { x: number; y: number; height: number }

// Find the laid-out box for a paragraph anywhere in the document tree.
function findParagraphBox(boxes: readonly BlockBox[], p: Paragraph): ParagraphBox | undefined
{
    for (const b of boxes)
    {
        if (b.kind === 'para') { if (b.source === p) return b; }
        else for (const it of b.items) { const f = findParagraphBox(it.boxes, p); if (f !== undefined) return f; }
    }
    return undefined;
}

// A fragment's start offset in its paragraph's character space.
function fragParagraphStart(p: Paragraph, f: TextFragment): number
{
    const run = f.source as Run;
    for (const slot of ParagraphRuns(p)) if (slot.run === run) return slot.start + f.runOffset;
    return f.runOffset;
}

// Absolute x for a paragraph offset that falls on `line`, or undefined if
// the offset isn't covered by this line.
function xForOffsetOnLine(box: ParagraphBox, line: Line, p: Paragraph, offset: number, measure: MeasureText): number | undefined
{
    const texts = line.frags.filter((f): f is TextFragment => f.kind === 'text');
    if (texts.length === 0) return undefined;

    let firstStart = Infinity, lastEnd = -Infinity, lastFrag: TextFragment | undefined;
    for (const f of texts)
    {
        const fs = fragParagraphStart(p, f);
        const fe = fs + f.text.length;
        firstStart = Math.min(firstStart, fs);
        if (fe >= lastEnd) { lastEnd = fe; lastFrag = f; }
        if (offset >= fs && offset <= fe)
        {
            const prefix = f.text.slice(0, offset - fs);
            const pw = prefix.length === 0 ? 0 : measure(prefix, f.props).Width;
            return box.x + f.x + line.shift + pw;
        }
    }
    // Offset in a gap (e.g. trailing whitespace) but within this line's span.
    if (offset >= firstStart && offset <= lastEnd && lastFrag !== undefined)
        return box.x + lastFrag.x + line.shift + lastFrag.width;
    return undefined;
}

/** The caret rectangle for a pointer, in document-local coords. */
export function CaretRectFor(result: BlockLayoutResult, ptr: TextPointer, measure: MeasureText): CaretRect | undefined
{
    const box = findParagraphBox(result.boxes, ptr.Paragraph);
    if (box === undefined) return undefined;
    const offset = Math.max(0, Math.min(ptr.Offset, ParagraphLength(ptr.Paragraph)));

    for (const line of box.layout.lines)
    {
        const x = xForOffsetOnLine(box, line, ptr.Paragraph, offset, measure);
        if (x !== undefined) return { x, y: box.top + line.top, height: line.height };
    }
    // Empty paragraph (no lines) — caret at the box origin.
    return { x: box.x, y: box.top, height: Math.max(1, box.bottom - box.top) };
}

/** Hit-test a document-local point to the nearest TextPointer. */
export function PointerAtPoint(result: BlockLayoutResult, x: number, y: number, measure: MeasureText): TextPointer | undefined
{
    // Nearest paragraph box by vertical position.
    const boxes: ParagraphBox[] = [];
    const gather = (bs: readonly BlockBox[]): void =>
    {
        for (const b of bs)
        {
            if (b.kind === 'para') boxes.push(b);
            else for (const it of b.items) gather(it.boxes);
        }
    };
    gather(result.boxes);
    if (boxes.length === 0) return undefined;

    let box = boxes[0]!;
    for (const b of boxes)
    {
        if (y >= b.top && y < b.bottom) { box = b; break; }
        if (y >= b.bottom) box = b;   // past this one — remember as best-so-far
    }

    const p = box.source;
    const lines = box.layout.lines;
    if (lines.length === 0) return new TextPointer(p, 0);

    // Nearest line by y.
    let line = lines[0]!;
    for (const l of lines) { if (y >= box.top + l.top) line = l; }

    const texts = line.frags.filter((f): f is TextFragment => f.kind === 'text');
    if (texts.length === 0) return new TextPointer(p, 0);

    // Before the first / after the last fragment on the line.
    const first = texts[0]!, last = texts[texts.length - 1]!;
    if (x <= box.x + first.x + line.shift) return new TextPointer(p, fragParagraphStart(p, first));
    if (x >= box.x + last.x + line.shift + last.width) return new TextPointer(p, fragParagraphStart(p, last) + last.text.length);

    for (const f of texts)
    {
        const left = box.x + f.x + line.shift;
        if (x < left || x > left + f.width) continue;
        // Walk chars to find the nearest boundary.
        const fs = fragParagraphStart(p, f);
        let best = 0, bestDx = Infinity;
        for (let i = 0; i <= f.text.length; i++)
        {
            const w = i === 0 ? 0 : measure(f.text.slice(0, i), f.props).Width;
            const dx = Math.abs(x - (left + w));
            if (dx < bestDx) { bestDx = dx; best = i; }
        }
        return new TextPointer(p, fs + best);
    }
    return new TextPointer(p, fragParagraphStart(p, last) + last.text.length);
}

/** Highlight rectangles for a selection range, in document-local coords. */
export function SelectionRects(result: BlockLayoutResult, doc: FlowDocument, a: TextPointer, b: TextPointer, measure: MeasureText): Rect[]
{
    const [lo, hi] = OrderPointers(doc, a, b);
    if (lo.Equals(hi)) return [];

    const all = DocumentParagraphs(doc);
    const loI = all.indexOf(lo.Paragraph);
    const hiI = all.indexOf(hi.Paragraph);
    const rects: Rect[] = [];

    for (let i = loI; i <= hiI; i++)
    {
        const p = all[i]!;
        const box = findParagraphBox(result.boxes, p);
        if (box === undefined) continue;
        const selStart = i === loI ? lo.Offset : 0;
        const selEnd   = i === hiI ? hi.Offset : ParagraphLength(p);

        for (const line of box.layout.lines)
        {
            const texts = line.frags.filter((f): f is TextFragment => f.kind === 'text');
            if (texts.length === 0) continue;
            let lineStart = Infinity, lineEnd = -Infinity;
            for (const f of texts) { const fs = fragParagraphStart(p, f); lineStart = Math.min(lineStart, fs); lineEnd = Math.max(lineEnd, fs + f.text.length); }

            const s = Math.max(selStart, lineStart);
            const e = Math.min(selEnd, lineEnd);
            if (e <= s) continue;

            const xs = xForOffsetOnLine(box, line, p, s, measure);
            const xe = xForOffsetOnLine(box, line, p, e, measure);
            if (xs === undefined || xe === undefined) continue;
            rects.push(new Rect(xs, box.top + line.top, Math.max(1, xe - xs), line.height));
        }
    }
    return rects;
}
