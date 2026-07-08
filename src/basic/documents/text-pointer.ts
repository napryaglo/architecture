import { type InlineCollection } from './inline-collection.js';
import { type Inline } from './text-element.js';
import { Run, Span } from './inlines.js';
import { Paragraph } from './paragraph.js';

// ─────────────────────────────────────────────────────────────────────
// TextPointer — a caret position in the block model, the WPF TextPointer
// analog. A position lives INSIDE a Paragraph (the only text-bearing
// block) at a character `Offset` in that paragraph's linear content. It is
// tree-anchored: it names the actual Paragraph node, so a pointer stays
// valid across edits to OTHER paragraphs and survives re-layout (unlike a
// flat global index). Navigation across paragraphs walks the block tree in
// document order (text-navigation.ts); editing mutates the model at a
// pointer (text-editing.ts); geometry maps a pointer to a caret rect
// (caret-geometry.ts).
//
// Content model for the offset space: only Runs contribute characters
// (Spans are transparent — their Runs are flattened in order). Offset 0 is
// before the first character; Offset === Length is after the last. Non-text
// inlines (LineBreak / InlineUIContainer) are out of scope for this first
// editing pass and are skipped by the content walk.
export class TextPointer
{
    constructor(public Paragraph: Paragraph, public Offset: number) {}

    public Clone(): TextPointer { return new TextPointer(this.Paragraph, this.Offset); }

    public Equals(other: TextPointer): boolean
    {
        return this.Paragraph === other.Paragraph && this.Offset === other.Offset;
    }

    /** Clamp Offset into [0, paragraph length]. */
    public Clamped(): TextPointer
    {
        const len = ParagraphLength(this.Paragraph);
        const o = this.Offset < 0 ? 0 : this.Offset > len ? len : this.Offset;
        return new TextPointer(this.Paragraph, o);
    }
}

// A Run in a paragraph's content, with its cumulative start offset.
export interface RunSlot { run: Run; start: number }

// Anything that owns an InlineCollection (Paragraph or Span) — the
// container a Run sits in, needed to insert/split siblings.
export interface InlineContainer { Inlines: InlineCollection }

/** Ordered editable Runs within a paragraph (descending through Spans),
 *  each tagged with its start offset in the paragraph's character space. */
export function ParagraphRuns(p: Paragraph): RunSlot[]
{
    const out: RunSlot[] = [];
    let start = 0;
    const walk = (inlines: readonly Inline[]): void =>
    {
        for (const el of inlines)
        {
            if (el instanceof Run)
            {
                out.push({ run: el, start });
                start += el.Text.length;
            }
            else if (el instanceof Span)
            {
                walk(el.Inlines.ToArray());
            }
            // LineBreak / InlineUIContainer: skipped (out of first-cut scope)
        }
    };
    walk(p.Inlines.ToArray());
    return out;
}

/** Total caret positions in a paragraph (sum of Run text lengths). */
export function ParagraphLength(p: Paragraph): number
{
    let n = 0;
    for (const s of ParagraphRuns(p)) n += s.run.Text.length;
    return n;
}

// Where an offset resolves to for editing: the Run and the index within
// that run's text. `after` marks a boundary hit that landed at the END of
// the returned run (offset sits between two runs) — callers deciding which
// run to extend can use it. Undefined when the paragraph has no runs.
export interface ResolvedOffset { slot: RunSlot; index: number; atRunEnd: boolean }

/** Resolve a paragraph offset to a Run + local index. At a run boundary
 *  the offset is attributed to the END of the earlier run (so typing
 *  extends the run to the left, inheriting its style) — except offset 0,
 *  which is the start of the first run. */
export function ResolveOffset(p: Paragraph, offset: number): ResolvedOffset | undefined
{
    const runs = ParagraphRuns(p);
    if (runs.length === 0) return undefined;

    for (let i = 0; i < runs.length; i++)
    {
        const s = runs[i]!;
        const end = s.start + s.run.Text.length;
        // Inside this run (exclusive of the trailing boundary, which the
        // next iteration's `offset === s.start` would claim as its start —
        // but we prefer left-attribution, so accept the boundary here).
        if (offset >= s.start && offset <= end)
        {
            // Prefer left-attribution at an internal boundary: if we're
            // exactly at this run's start and there's a previous run, the
            // previous iteration already returned it. So reaching here at
            // offset === s.start with i > 0 shouldn't happen; guard anyway.
            const index = offset - s.start;
            const atRunEnd = index === s.run.Text.length;
            // If at the end of this run AND a next run starts here, keep
            // this (left) run — that's the desired extend-left behaviour.
            return { slot: s, index, atRunEnd };
        }
    }
    // Past the end — clamp to the last run's end.
    const last = runs[runs.length - 1]!;
    return { slot: last, index: last.run.Text.length, atRunEnd: true };
}

/** The InlineCollection a Run sits in, plus its index there — for
 *  inserting/splitting siblings. Undefined if the run is unparented. */
export function RunContainer(run: Run): { host: InlineContainer; index: number } | undefined
{
    const parent = run.Parent as unknown as InlineContainer | undefined;
    if (parent === undefined || parent.Inlines === undefined) return undefined;
    const index = parent.Inlines.IndexOf(run);
    if (index < 0) return undefined;
    return { host: parent, index };
}
