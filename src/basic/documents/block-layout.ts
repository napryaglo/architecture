import { Brush, FontFamily, FormattedText, TextAlignment, type TextMetrics } from '../../visual-engine/index.js';
import { Point, Rect, Visual, type DrawingContext } from '../../runtime/index.js';
import { type Inline, type LinkTarget, type RunProps, type TextElement } from './text-element.js';
import { Block } from './block.js';
import { Paragraph } from './paragraph.js';
import { List, ListMarkerStyle } from './list.js';
import { Table, type TableRow } from './table.js';
import { Span, InlineUIContainer } from './inlines.js';
import {
    arrangeObjectVisuals,
    collectObjectVisuals,
    flattenInlines,
    layoutInlines,
    linkAtInLayout,
    renderLayout,
    type LayoutResult,
    type MeasureObject,
    type MeasureText,
} from './text-layout.js';

// ─────────────────────────────────────────────────────────────────────
// Block layout — the paragraph-stacking tier above text-layout.ts. Where
// text-layout flattens ONE inline tree into lines, this stacks a list of
// Blocks vertically (margins, per-block alignment) and lays lists out with
// a marker column + indented item content. Pure functions, mirroring the
// text-layout style: a host (RichTextBlock / RichTextBox) drives them and
// walks the resulting boxes to paint, arrange embedded visuals, and
// hit-test links. All box coordinates are ABSOLUTE within the document
// (relative to the document's top-left) so the walkers only add the
// document's on-screen origin.

// ── Character-format resolution ───────────────────────────────────────
// Fold a TextElement's set font DPs onto an inherited context. Blocks,
// list items, and the document all inherit-or-override this way; the
// resolved context seeds the paragraph's inline flatten.
export function resolveContext(el: TextElement, base: RunProps): RunProps
{
    const c: RunProps = { ...base };
    const fam = el.FontFamily;
    if (fam        !== undefined) c.family     = FontFamily.from(fam).Source;
    if (el.FontSize   !== undefined) c.size    = el.FontSize;
    if (el.FontWeight !== undefined) c.weight  = el.FontWeight;
    if (el.FontStyle  !== undefined) c.style   = el.FontStyle;
    if (el.Foreground !== undefined) c.foreground = el.Foreground;
    return c;
}

// ── List markers ──────────────────────────────────────────────────────
/** The string drawn for a list item at 1-based `ordinal` (already offset
 *  by StartIndex). '' for None / unknown styles. */
export function markerText(style: ListMarkerStyle, ordinal: number): string
{
    switch (style)
    {
        case ListMarkerStyle.None:       return '';
        case ListMarkerStyle.Disc:       return '•';   // •
        case ListMarkerStyle.Circle:     return '◦';   // ◦
        case ListMarkerStyle.Square:     return '▪';   // ▪
        case ListMarkerStyle.Decimal:    return `${ordinal}.`;
        case ListMarkerStyle.LowerLatin: return `${toLatin(ordinal)}.`;
        case ListMarkerStyle.UpperLatin: return `${toLatin(ordinal).toUpperCase()}.`;
        case ListMarkerStyle.LowerRoman: return `${toRoman(ordinal)}.`;
        case ListMarkerStyle.UpperRoman: return `${toRoman(ordinal).toUpperCase()}.`;
        default:                         return '';
    }
}

// Bijective base-26: 1→a, 26→z, 27→aa … Out-of-range falls back to digits.
function toLatin(n: number): string
{
    if (n <= 0) return String(n);
    let s = '';
    let k = n;
    while (k > 0) { const r = (k - 1) % 26; s = String.fromCharCode(97 + r) + s; k = Math.floor((k - 1) / 26); }
    return s;
}

// Classic Roman numerals 1..3999; anything outside falls back to digits.
function toRoman(n: number): string
{
    if (n <= 0 || n > 3999) return String(n);
    const table: [number, string][] = [
        [1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'],
        [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'],
        [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i'],
    ];
    let k = n;
    let s = '';
    for (const [v, sym] of table) { while (k >= v) { s += sym; k -= v; } }
    return s;
}

// ── Box model ─────────────────────────────────────────────────────────
interface BoxCommon { x: number; top: number; bottom: number; right: number }

export interface ParagraphBox extends BoxCommon
{
    readonly kind: 'para';
    readonly layout: LayoutResult;
    readonly source: Paragraph;
}

export interface MarkerBox
{
    readonly text: string;
    readonly props: RunProps;
    readonly metrics: TextMetrics;
    readonly x: number;   // draw origin (top-left)
    readonly y: number;
}

export interface ListItemBox
{
    readonly marker: MarkerBox | undefined;
    readonly boxes: BlockBox[];
}

export interface ListBox extends BoxCommon
{
    readonly kind: 'list';
    readonly items: ListItemBox[];
    readonly source: List;
}

// One grid cell's laid-out content. x/top/right/bottom are the cell's OUTER
// box (padding + content, between gridlines) in absolute document coords;
// `boxes` are the cell's blocks, already laid out at the padded content slot.
export interface CellBox
{
    readonly x: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly boxes: BlockBox[];
}

export interface RowBox
{
    readonly top: number;
    readonly bottom: number;
    readonly cells: CellBox[];
    readonly isHeader: boolean;
    readonly source: TableRow;
}

export interface TableBox extends BoxCommon
{
    readonly kind: 'table';
    readonly rows: RowBox[];
    readonly source: Table;
    // Gridline geometry, resolved once at layout so render is a pure walk.
    readonly borderThickness: number;
    readonly borderBrush: Brush | undefined;
    readonly headerBackground: Brush | undefined;
    // X of each vertical gridline (left edge of the line rect) and Y of each
    // horizontal gridline — document-absolute, origin added at render.
    readonly gridX: number[];
    readonly gridY: number[];
}

export type BlockBox = ParagraphBox | ListBox | TableBox;

export interface BlockLayoutResult
{
    readonly boxes: BlockBox[];
    readonly width: number;
    readonly height: number;
}

export interface BlockLayoutEnv
{
    letterSpacing: number;
    measureText: MeasureText;
    measureObject: MeasureObject;
}

export interface BlockLayoutOptions
{
    x?: number;               // left of the content column (default 0)
    availableWidth: number;   // Infinity when unbounded
    base: RunProps;           // document-resolved root format
    env: BlockLayoutEnv;
}

// ── Entry point ───────────────────────────────────────────────────────
export function layoutBlocks(blocks: readonly Block[], opt: BlockLayoutOptions): BlockLayoutResult
{
    const x = opt.x ?? 0;
    const r = layoutBlockList(blocks, x, 0, opt.availableWidth, opt.base, opt.env);
    return { boxes: r.boxes, width: r.right - x, height: r.bottom };
}

function layoutBlockList(
    blocks: readonly Block[], x: number, y0: number, availableWidth: number,
    base: RunProps, env: BlockLayoutEnv,
): { boxes: BlockBox[]; bottom: number; right: number }
{
    const boxes: BlockBox[] = [];
    let y = y0;
    let right = x;
    for (const block of blocks)
    {
        const m = block.Margin;
        y += m.Top;
        const bx = x + m.Left;
        const bw = Number.isFinite(availableWidth)
            ? Math.max(0, availableWidth - m.Left - m.Right)
            : Number.POSITIVE_INFINITY;
        const box = layoutOneBlock(block, bx, y, bw, base, env);
        if (box === undefined) { y -= m.Top; continue; }   // unknown block kind
        boxes.push(box);
        y = box.bottom + m.Bottom;
        right = Math.max(right, box.right);
    }
    return { boxes, bottom: y, right };
}

function layoutOneBlock(
    block: Block, bx: number, y: number, bw: number, base: RunProps, env: BlockLayoutEnv,
): BlockBox | undefined
{
    if (block instanceof Paragraph) return layoutParagraph(block, bx, y, bw, base, env);
    if (block instanceof List)      return layoutList(block, bx, y, bw, base, env);
    if (block instanceof Table)     return layoutTable(block, bx, y, bw, base, env);
    return undefined;   // Section / BlockUIContainer / … not yet supported
}

// Minimum content width a column keeps when a table is shrunk to fit — below
// this, cell text has no room to lay out at all.
const MIN_COL_CONTENT = 12;

function layoutParagraph(
    para: Paragraph, bx: number, y: number, bw: number, base: RunProps, env: BlockLayoutEnv,
): ParagraphBox
{
    const ctx = resolveContext(para, base);
    const items = flattenInlines(para.Inlines.ToArray(), ctx);
    const wrap = Number.isFinite(bw);
    const layout = layoutInlines(items, {
        availableWidth: wrap ? bw : Number.POSITIVE_INFINITY,
        wrap,
        letterSpacing: env.letterSpacing,
        lineHeight: para.LineHeight,
        measureText: env.measureText,
        measureObject: env.measureObject,
        align: para.TextAlignment,
    });

    // Per-line horizontal alignment against the block's content width.
    // Justify is handled inside layoutInlines (frag gaps widened); Center /
    // Right shift the whole line here. Left / Justify → factor 0 (no shift).
    const factor = para.TextAlignment === TextAlignment.Center ? 0.5
                 : para.TextAlignment === TextAlignment.Right  ? 1 : 0;
    const slotW = wrap ? bw : layout.width;
    for (const line of layout.lines)
        line.shift = factor === 0 ? 0 : Math.max(0, (slotW - line.width) * factor);

    // An empty paragraph still occupies one line (so a blank line after
    // Enter is visible and the caret has somewhere to sit).
    let height = layout.height;
    if (layout.lines.length === 0)
    {
        const m = env.measureText(' ', ctx);
        height = (Number.isFinite(para.LineHeight) && para.LineHeight > 0) ? para.LineHeight : m.Height;
    }

    return { kind: 'para', x: bx, top: y, bottom: y + height, right: bx + layout.width, layout, source: para };
}

function layoutList(
    list: List, bx: number, y: number, bw: number, base: RunProps, env: BlockLayoutEnv,
): ListBox
{
    const listCtx = resolveContext(list, base);
    const style   = list.MarkerStyle;
    const start   = list.StartIndex;
    const offset  = list.MarkerOffset;
    const items   = list.ListItems.ToArray();

    // Resolve every marker up front to size a common content indent so item
    // text aligns even when ordered markers vary in width (1. … 10.).
    const markers = items.map((_, i) =>
    {
        const s = markerText(style, start + i);
        return { s, metrics: s === '' ? undefined : env.measureText(s, listCtx) };
    });
    const maxMarkerW = markers.reduce((mx, mk) => Math.max(mx, mk.metrics ? mk.metrics.Width : 0), 0);
    const indent   = maxMarkerW > 0 ? maxMarkerW + offset : offset;
    const contentX = bx + indent;
    const contentW = Number.isFinite(bw) ? Math.max(0, bw - indent) : Number.POSITIVE_INFINITY;

    let iy = y;
    let right = contentX;
    const itemBoxes: ListItemBox[] = [];
    for (let i = 0; i < items.length; i++)
    {
        const itemCtx = resolveContext(items[i]!, listCtx);
        const sub = layoutBlockList(items[i]!.Blocks.ToArray(), contentX, iy, contentW, itemCtx, env);

        let marker: MarkerBox | undefined;
        const mk = markers[i]!;
        if (mk.metrics !== undefined)
        {
            const baseline = firstBaseline(sub.boxes) ?? (iy + mk.metrics.Ascent);
            // Right-align the marker within its column (right edge at contentX - offset).
            marker = {
                text: mk.s, props: listCtx, metrics: mk.metrics,
                x: contentX - offset - mk.metrics.Width,
                y: baseline - mk.metrics.Ascent,
            };
        }
        itemBoxes.push({ marker, boxes: sub.boxes });

        // An empty item still occupies one marker line.
        const markerBottom = mk.metrics !== undefined && marker !== undefined
            ? marker.y + mk.metrics.Ascent + mk.metrics.Descent : iy;
        iy = Math.max(sub.bottom, markerBottom);
        right = Math.max(right, sub.right);
    }

    return { kind: 'list', x: bx, top: y, bottom: iy, right, items: itemBoxes, source: list };
}

// ── Table ─────────────────────────────────────────────────────────────
// Two-pass grid layout. Pass 1 measures each column's natural (unbounded)
// content width; if the natural table overflows a finite width the columns
// shrink proportionally (content then wraps). Pass 2 lays every cell out at
// its final column width, sizes each row to its tallest cell, and records
// the gridline positions so render is a pure walk.
function layoutTable(
    table: Table, bx: number, y: number, bw: number, base: RunProps, env: BlockLayoutEnv,
): TableBox
{
    const tableCtx = resolveContext(table, base);
    const pad      = table.CellPadding;
    const border   = table.BorderThickness;
    const rows     = table.Rows.ToArray();
    const numCols  = rows.reduce((mx, r) => Math.max(mx, r.Cells.Count), 0);

    // An empty table (no columns) collapses to a zero-height band.
    if (numCols === 0)
        return { kind: 'table', x: bx, top: y, bottom: y, right: bx, rows: [], source: table,
                 borderThickness: border, borderBrush: table.BorderBrush,
                 headerBackground: table.HeaderBackground, gridX: [], gridY: [] };

    const padX = pad.Left + pad.Right;

    // Pass 1 — natural content width per column, measured unbounded.
    const natural = new Array<number>(numCols).fill(0);
    for (const row of rows)
    {
        const cells = row.Cells.ToArray();
        for (let ci = 0; ci < cells.length; ci++)
        {
            const cellCtx = resolveContext(cells[ci]!, tableCtx);
            const r = layoutBlockList(cells[ci]!.Blocks.ToArray(), 0, 0, Number.POSITIVE_INFINITY, cellCtx, env);
            natural[ci] = Math.max(natural[ci]!, r.right);
        }
    }

    // Column OUTER widths (content + horizontal padding). Shrink to fit a
    // finite width; keep natural widths when the table fits or width is free.
    const naturalOuter = natural.map((w) => w + padX);
    const bordersTotal = border * (numCols + 1);
    const naturalTableW = naturalOuter.reduce((a, b) => a + b, 0) + bordersTotal;
    const minOuter = padX + MIN_COL_CONTENT;

    let outer: number[];
    if (table.LastColumnFills && Number.isFinite(bw))
    {
        // Auto columns + star last: non-last columns keep their natural width;
        // the last column absorbs the remaining width (grows to fill, or shrinks
        // + wraps when tight — never below its min, so it can't vanish; if the
        // others already overflow, the table overflows rather than squashing).
        const nonLast      = naturalOuter.slice(0, numCols - 1);
        const usedByOthers = nonLast.reduce((a, b) => a + b, 0);
        const lastOuter    = Math.max(minOuter, bw - bordersTotal - usedByOthers);
        outer = [...nonLast, lastOuter];
    }
    else if (!Number.isFinite(bw) || naturalTableW <= bw)
        outer = naturalOuter;
    else
    {
        const avail = Math.max(0, bw - bordersTotal);
        const sum   = naturalOuter.reduce((a, b) => a + b, 0) || 1;
        const scale = avail / sum;
        outer = naturalOuter.map((w) => Math.max(minOuter, w * scale));
    }
    const contentW = outer.map((w) => Math.max(0, w - padX));

    // Column OUTER left edges (the cell box starts just right of a gridline).
    const colX: number[] = [];
    let cx = bx + border;
    for (let ci = 0; ci < numCols; ci++) { colX.push(cx); cx += outer[ci]! + border; }
    const tableRight = cx;

    // Pass 2 — lay each cell at its column content width; size rows to tallest.
    const rowBoxes: RowBox[] = [];
    let ry = y + border;
    for (const row of rows)
    {
        const cells = row.Cells.ToArray();
        const laid: BlockBox[][] = [];
        let contentH = 0;
        for (let ci = 0; ci < numCols; ci++)
        {
            const cell = cells[ci];
            const contentX   = colX[ci]! + pad.Left;
            const contentTop = ry + pad.Top;
            const sub = cell !== undefined
                ? layoutBlockList(cell.Blocks.ToArray(), contentX, contentTop, contentW[ci]!, resolveContext(cell, tableCtx), env)
                : { boxes: [] as BlockBox[], bottom: contentTop, right: contentX };
            laid.push(sub.boxes);
            contentH = Math.max(contentH, sub.bottom - contentTop);
        }
        const rowH = contentH + pad.Top + pad.Bottom;
        const cellBoxes: CellBox[] = colX.map((x, ci) => ({
            x, top: ry, right: x + outer[ci]!, bottom: ry + rowH, boxes: laid[ci]!,
        }));
        rowBoxes.push({ top: ry, bottom: ry + rowH, cells: cellBoxes, isHeader: row.IsHeader, source: row });
        ry += rowH + border;
    }
    const tableBottom = ry;

    // Gridlines: a vertical line at every column boundary (left of col 0 … right
    // of the last), a horizontal line at every row boundary (top … bottom).
    const gridX = [bx, ...colX.map((x, ci) => x + outer[ci]!)];
    const gridY = [y, ...rowBoxes.map((r) => r.bottom)];

    return {
        kind: 'table', x: bx, top: y, bottom: tableBottom, right: tableRight, rows: rowBoxes, source: table,
        borderThickness: border, borderBrush: table.BorderBrush, headerBackground: table.HeaderBackground,
        gridX, gridY,
    };
}

// Absolute y of the first text line's baseline anywhere under `boxes`, used
// to baseline-align a list marker with its item's first line.
function firstBaseline(boxes: readonly BlockBox[]): number | undefined
{
    for (const b of boxes)
    {
        if (b.kind === 'para')
        {
            const line = b.layout.lines[0];
            if (line !== undefined) return b.top + line.top + line.baseline;
        }
        else if (b.kind === 'list')
        {
            for (const it of b.items)
            {
                const inner = firstBaseline(it.boxes);
                if (inner !== undefined) return inner;
            }
        }
        else
        {
            for (const row of b.rows) for (const cell of row.cells)
            {
                const inner = firstBaseline(cell.boxes);
                if (inner !== undefined) return inner;
            }
        }
    }
    return undefined;
}

// Every embedded Visual in the block tree (InlineUIContainer children),
// walked structurally from the model — used to attach child visuals to the
// host BEFORE layout measures them, so they carry the host target like
// TextBlock's embedded visuals do.
export function collectEmbeddedVisuals(blocks: readonly Block[]): Visual[]
{
    const out: Visual[] = [];
    collectBlocksEmbedded(blocks, out);
    return out;
}

function collectBlocksEmbedded(blocks: readonly Block[], out: Visual[]): void
{
    for (const b of blocks)
    {
        if (b instanceof Paragraph) collectInlinesEmbedded(b.Inlines.ToArray(), out);
        else if (b instanceof List) for (const it of b.ListItems.ToArray()) collectBlocksEmbedded(it.Blocks.ToArray(), out);
        else if (b instanceof Table) for (const row of b.Rows.ToArray()) for (const cell of row.Cells.ToArray()) collectBlocksEmbedded(cell.Blocks.ToArray(), out);
    }
}

function collectInlinesEmbedded(inlines: readonly Inline[], out: Visual[]): void
{
    for (const el of inlines)
    {
        if (el instanceof InlineUIContainer) { if (el.Child !== undefined) out.push(el.Child); }
        else if (el instanceof Span) collectInlinesEmbedded(el.Inlines.ToArray(), out);
    }
}

// ── Walkers the host drives ───────────────────────────────────────────
function walkBoxes(boxes: readonly BlockBox[], fn: (b: BlockBox) => void): void
{
    for (const b of boxes)
    {
        fn(b);
        if (b.kind === 'list') for (const it of b.items) walkBoxes(it.boxes, fn);
        else if (b.kind === 'table') for (const row of b.rows) for (const cell of row.cells) walkBoxes(cell.boxes, fn);
    }
}

export interface RenderBlocksOptions { letterSpacing: number; ink: Brush; link: Brush }

/** Paint the whole document at (originX, originY). Paragraph text goes
 *  through the shared renderLayout; list markers are drawn here; embedded
 *  visuals paint separately as the host's child visuals. */
export function renderBlocks(
    dc: DrawingContext, result: BlockLayoutResult, originX: number, originY: number, opt: RenderBlocksOptions,
): void
{
    walkBoxes(result.boxes, (box) =>
    {
        if (box.kind === 'para')
        {
            renderLayout(dc, box.layout, {
                originX: originX + box.x, originY: originY + box.top,
                letterSpacing: opt.letterSpacing, ink: opt.ink, link: opt.link,
            });
            return;
        }
        if (box.kind === 'table') { renderTableChrome(dc, box, originX, originY); return; }
        for (const item of box.items)
        {
            const m = item.marker;
            if (m === undefined) continue;
            const fg = m.props.foreground ?? opt.ink;
            const ft = new FormattedText(
                m.text, m.props.family, m.props.size, fg,
                m.props.weight, m.props.style, m.metrics,
                opt.letterSpacing, m.props.decorations,
            );
            dc.DrawText(ft, new Point(originX + m.x, originY + m.y));
        }
    });
}

/** Paint a table's header fills and gridlines. Called on the table box before
 *  the walk descends into its cells, so text lands on top. */
function renderTableChrome(dc: DrawingContext, box: TableBox, originX: number, originY: number): void
{
    const b = box.borderThickness;

    // Header row fills first — behind gridlines and cell text.
    if (box.headerBackground !== undefined)
        for (const row of box.rows)
            if (row.isHeader)
                dc.DrawRectangle(box.headerBackground, undefined,
                    new Rect(originX + box.x, originY + row.top, box.right - box.x, row.bottom - row.top));

    const brush = box.borderBrush;
    if (brush === undefined || b <= 0) return;

    const top = originY + box.top, height = box.bottom - box.top;
    const left = originX + box.x, width = box.right - box.x;
    for (const gx of box.gridX) dc.DrawRectangle(brush, undefined, new Rect(originX + gx, top, b, height));
    for (const gy of box.gridY) dc.DrawRectangle(brush, undefined, new Rect(left, originY + gy, width, b));
}

/** Every embedded Visual across all paragraphs, in document order. */
export function collectBlockObjects(result: BlockLayoutResult): Visual[]
{
    const out: Visual[] = [];
    walkBoxes(result.boxes, (b) => { if (b.kind === 'para') out.push(...collectObjectVisuals(b.layout)); });
    return out;
}

/** Arrange every embedded Visual at its document slot. */
export function arrangeBlockObjects(result: BlockLayoutResult, originX: number, originY: number): void
{
    walkBoxes(result.boxes, (b) =>
    {
        if (b.kind === 'para') arrangeObjectVisuals(b.layout, originX + b.x, originY + b.top);
    });
}

/** Link target under a document-local point, or undefined. */
export function linkAtInBlocks(result: BlockLayoutResult, lx: number, ly: number): LinkTarget | undefined
{
    let found: LinkTarget | undefined;
    walkBoxes(result.boxes, (b) =>
    {
        if (found !== undefined || b.kind !== 'para') return;
        const l = linkAtInLayout(b.layout, lx - b.x, ly - b.top);
        if (l !== undefined) found = l;
    });
    return found;
}
