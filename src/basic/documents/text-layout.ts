import { Brush, FontFamily, FormattedText, type TextMetrics } from '../../visual-engine/index.js';
import { Point, Rect, Visual, type DrawingContext } from '../../runtime/index.js';
import { Inline, type LinkTarget, type RunProps } from './text-element.js';
import { Run, Span, LineBreak, InlineUIContainer } from './inlines.js';

// ─────────────────────────────────────────────────────────────────────
// Flatten + line layout for the inline content model. The mural analog of
// WPF's TextSource → TextFormatter → TextLine pipeline: the inline tree is
// flattened into an ordered stream of styled runs / breaks / embedded
// objects (each carrying its fully-resolved RunProps), then broken into
// lines of positioned fragments with per-run baseline stacking.

// ── Flatten ──────────────────────────────────────────────────────────

export type FlowItem =
    | { kind: 'text';   text: string; props: RunProps; source: Inline }
    | { kind: 'break' }
    | { kind: 'object'; visual: Visual; source: Inline };

// Flatten the inline tree into a flow stream. `base` is the hosting
// TextBlock's own resolved format; each Span overrides it for its subtree.
export function flattenInlines(inlines: readonly Inline[], base: RunProps): FlowItem[]
{
    const out: FlowItem[] = [];
    walk(inlines, base, out);
    return out;
}

// Fold one inline's own (set) character-format DPs onto the inherited
// context, returning a fresh context. Font DPs override; TextDecorations
// accumulate; `applyToContext` lets a Hyperlink add its link target +
// chrome. Shared by Run (a normalised editor run styles itself directly)
// and Span (styles its whole subtree) so both honour element-level format
// through ONE code path.
function foldInlineFormat(ctx: RunProps, el: Inline): RunProps
{
    const c: RunProps = { ...ctx };
    if (el.FontFamily !== undefined) c.family     = FontFamily.from(el.FontFamily).Source;
    if (el.FontSize   !== undefined) c.size       = el.FontSize;
    if (el.FontWeight !== undefined) c.weight     = el.FontWeight;
    if (el.FontStyle  !== undefined) c.style      = el.FontStyle;
    if (el.Foreground !== undefined) c.foreground = el.Foreground;
    c.decorations |= el.TextDecorations;
    el.applyToContext(c);   // Hyperlink: link target + underline
    return c;
}

function walk(inlines: readonly Inline[], ctx: RunProps, out: FlowItem[]): void
{
    for (const el of inlines)
    {
        if (el instanceof Run)
        {
            // A Run carries its own format DPs (the editor normalises each
            // styled span to a self-styled Run). Fold them so Bold / Italic /
            // Underline set on the Run actually paint.
            if (el.Text.length > 0) out.push({ kind: 'text', text: el.Text, props: foldInlineFormat(ctx, el), source: el });
        }
        else if (el instanceof LineBreak)
        {
            out.push({ kind: 'break' });
        }
        else if (el instanceof InlineUIContainer)
        {
            const child = el.Child;
            if (child !== undefined) out.push({ kind: 'object', visual: child, source: el });
        }
        else if (el instanceof Span)
        {
            walk(el.Inlines.ToArray(), foldInlineFormat(ctx, el), out);
        }
        // Unknown inline kinds are ignored (forward-compat).
    }
}

// ── Line layout ──────────────────────────────────────────────────────

export type MeasureText   = (text: string, props: RunProps) => TextMetrics;
export type MeasureObject = (v: Visual) => { width: number; height: number };

export interface TextFragment
{
    readonly kind: 'text';
    readonly text: string;
    readonly props: RunProps;
    readonly metrics: TextMetrics;
    x: number; y: number;
    readonly width: number;
    readonly ascent: number;
    readonly descent: number;
    readonly source: Inline;
    // Character offset within `source` (a Run) where this fragment's text
    // begins — lets the editor map a caret position (Run + local index) to
    // this fragment and back for caret geometry / hit-testing.
    readonly runOffset: number;
}

export interface ObjectFragment
{
    readonly kind: 'object';
    readonly visual: Visual;
    x: number; y: number;
    readonly width: number;
    readonly height: number;
    readonly ascent: number;
    readonly descent: number;
    readonly source: Inline;
}

export type Fragment = TextFragment | ObjectFragment;

export interface Line
{
    readonly frags: Fragment[];
    top: number;
    readonly baseline: number;
    readonly height: number;
    width: number;
    // Horizontal alignment offset, applied by the host at arrange/render
    // against the real slot width (fragments are laid out left-aligned).
    shift: number;
}

export interface LayoutResult
{
    readonly lines: Line[];
    readonly width: number;
    readonly height: number;
}

export interface LayoutOptions
{
    availableWidth: number;   // Infinity when unbounded / no-wrap
    wrap: boolean;
    letterSpacing: number;
    lineHeight: number;       // explicit; NaN or <= 0 → natural
    measureText: MeasureText;
    measureObject: MeasureObject;
}

// A single styled non-whitespace piece within a word (a word can span
// several pieces of differing props).
interface Piece { text: string; props: RunProps; metrics: TextMetrics; width: number; source: Inline; runOffset: number }

type Token =
    | { kind: 'word';   pieces: Piece[]; width: number }
    | { kind: 'space';  width: number }
    | { kind: 'object'; visual: Visual; width: number; height: number; source: Inline }
    | { kind: 'break' };

export function layoutInlines(items: FlowItem[], opt: LayoutOptions): LayoutResult
{
    const advance = (base: number, glyphs: number): number =>
        opt.letterSpacing === 0 ? base : base + opt.letterSpacing * glyphs;

    // ── Tokenize into wrap units ────────────────────────────────────
    const tokens: Token[] = [];
    let wordPieces: Piece[] = [];
    let wordWidth = 0;
    const flushWord = (): void =>
    {
        if (wordPieces.length > 0) { tokens.push({ kind: 'word', pieces: wordPieces, width: wordWidth }); }
        wordPieces = []; wordWidth = 0;
    };
    for (const item of items)
    {
        if (item.kind === 'break') { flushWord(); tokens.push({ kind: 'break' }); continue; }
        if (item.kind === 'object')
        {
            flushWord();
            const size = opt.measureObject(item.visual);
            tokens.push({ kind: 'object', visual: item.visual, width: size.width, height: size.height, source: item.source });
            continue;
        }
        // text — split into alternating non-ws / ws segments, tracking the
        // offset within the run so each word piece knows where it began.
        const segs = item.text.split(/(\s+)/);
        let segStart = 0;
        for (const seg of segs)
        {
            if (seg === '') continue;
            if (/^\s+$/.test(seg))
            {
                flushWord();
                const m = opt.measureText(' ', item.props);
                tokens.push({ kind: 'space', width: advance(m.Width, 1) });
            }
            else
            {
                const m = opt.measureText(seg, item.props);
                const w = advance(m.Width, [...seg].length);
                wordPieces.push({ text: seg, props: item.props, metrics: m, width: w, source: item.source, runOffset: segStart });
                wordWidth += w;
            }
            segStart += seg.length;
        }
    }
    flushWord();

    // ── Greedy line fill ────────────────────────────────────────────
    const lines: Line[] = [];
    let frags: Fragment[] = [];
    let curX = 0;
    let maxAscent = 0;
    let maxDescent = 0;
    let pendingSpace: number | undefined;
    let top = 0;
    let maxLineWidth = 0;

    const commit = (): void =>
    {
        if (frags.length === 0) { pendingSpace = undefined; return; }
        const natural = maxAscent + maxDescent;
        const height = (Number.isFinite(opt.lineHeight) && opt.lineHeight > 0)
            ? Math.max(opt.lineHeight, natural) : natural;
        const baseline = maxAscent + Math.max(0, (height - natural) / 2);
        for (const f of frags) f.y = top + baseline - f.ascent;
        const width = curX;
        lines.push({ frags, top, baseline, height, width, shift: 0 });
        maxLineWidth = Math.max(maxLineWidth, width);
        top += height;
        frags = []; curX = 0; maxAscent = 0; maxDescent = 0; pendingSpace = undefined;
    };

    const placePieces = (pieces: Piece[]): void =>
    {
        for (const p of pieces)
        {
            frags.push({
                kind: 'text', text: p.text, props: p.props, metrics: p.metrics,
                x: curX, y: 0, width: p.width, ascent: p.metrics.Ascent, descent: p.metrics.Descent,
                source: p.source, runOffset: p.runOffset,
            });
            curX += p.width;
            maxAscent = Math.max(maxAscent, p.metrics.Ascent);
            maxDescent = Math.max(maxDescent, p.metrics.Descent);
        }
    };

    for (const tok of tokens)
    {
        if (tok.kind === 'break') { commit(); continue; }
        if (tok.kind === 'space') { pendingSpace = tok.width; continue; }

        const atomWidth = tok.width;
        const spaceBefore = (frags.length > 0 && pendingSpace !== undefined) ? pendingSpace : 0;
        if (opt.wrap && frags.length > 0 && curX + spaceBefore + atomWidth > opt.availableWidth)
        {
            commit();   // wrap — the pending space is dropped at the break
        }
        else if (spaceBefore > 0)
        {
            curX += spaceBefore;
        }
        pendingSpace = undefined;

        if (tok.kind === 'word') { placePieces(tok.pieces); }
        else /* object */
        {
            frags.push({
                kind: 'object', visual: tok.visual, x: curX, y: 0,
                width: tok.width, height: tok.height, ascent: tok.height, descent: 0, source: tok.source,
            });
            curX += tok.width;
            maxAscent = Math.max(maxAscent, tok.height);
        }
    }
    commit();

    // Fragments are left-aligned; the host applies per-line `shift` at
    // arrange/render against the real slot width (matching the Text path).
    return { lines, width: maxLineWidth, height: top };
}

// ── Shared paint / arrange / hit-test over a laid-out LayoutResult ─────
// Extracted from TextBlock so every inline host (TextBlock today, each
// Paragraph of a RichText document tomorrow) paints, arranges embedded
// visuals, and hit-tests links through ONE implementation. Colour tokens
// are passed in (the layout layer stays theme-agnostic); `originX/Y` shift
// the whole result (a paragraph sits at its block position in the doc).

export interface RenderLayoutOptions
{
    originX: number;
    originY: number;
    letterSpacing: number;
    // Fallback fill for a run with no explicit Foreground: `link` when the
    // run sits inside a Hyperlink, else `ink`.
    ink:  Brush;
    link: Brush;
}

/** Paint every text fragment of `layout`; object fragments paint
 *  separately as the host's child visuals. */
export function renderLayout(dc: DrawingContext, layout: LayoutResult, o: RenderLayoutOptions): void
{
    for (const line of layout.lines)
    {
        for (const f of line.frags)
        {
            if (f.kind !== 'text') continue;
            const fg = f.props.foreground ?? (f.props.link !== undefined ? o.link : o.ink);
            const formatted = new FormattedText(
                f.text, f.props.family, f.props.size, fg,
                f.props.weight, f.props.style, f.metrics,
                o.letterSpacing, f.props.decorations,
            );
            dc.DrawText(formatted, new Point(o.originX + f.x + line.shift, o.originY + f.y));
        }
    }
}

/** Every embedded Visual referenced by object fragments, in flow order. */
export function collectObjectVisuals(layout: LayoutResult): Visual[]
{
    const out: Visual[] = [];
    for (const line of layout.lines)
        for (const f of line.frags)
            if (f.kind === 'object') out.push(f.visual);
    return out;
}

/** Arrange each embedded Visual at its computed slot, offset by origin. */
export function arrangeObjectVisuals(layout: LayoutResult, originX: number, originY: number): void
{
    for (const line of layout.lines)
        for (const f of line.frags)
            if (f.kind === 'object')
                f.visual.Arrange(new Rect(originX + f.x + line.shift, originY + f.y, f.width, f.height));
}

/** The link target under a point in the layout's own coordinate space
 *  (caller subtracts the layout origin first), or undefined. */
export function linkAtInLayout(layout: LayoutResult, lx: number, ly: number): LinkTarget | undefined
{
    for (const line of layout.lines)
    {
        for (const f of line.frags)
        {
            if (f.kind !== 'text' || f.props.link === undefined) continue;
            const x = f.x + line.shift;
            if (lx >= x && lx <= x + f.width && ly >= f.y && ly <= f.y + f.ascent + f.descent)
                return f.props.link;
        }
    }
    return undefined;
}
