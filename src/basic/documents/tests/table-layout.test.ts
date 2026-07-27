import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { layoutBlocks, renderBlocks, type BlockLayoutEnv, type TableBox, type ParagraphBox } from '../block-layout.js';
import { FontStyle, FontWeight, TextAlignment, TextDecorations, type Brush, type Rect, type TextMetrics } from '../../../visual-engine/index.js';
import { Table, TableRow, TableCell } from '../table.js';
import { Paragraph } from '../paragraph.js';
import { Run } from '../inlines.js';
import type { RunProps } from '../text-element.js';
import type { DrawingContext } from '../../../visual-engine/index.js';

// Flat metrics: every glyph 10 wide, line box 12 tall (ascent 10, descent 2).
const measureText = (t: string): TextMetrics =>
    ({ Width: [...t].length * 10, Height: 12, Ascent: 10, Descent: 2 } as TextMetrics);

const ENV: BlockLayoutEnv = {
    letterSpacing: 0,
    measureText,
    measureObject: () => ({ width: 0, height: 0 }),
};

const BASE: RunProps = {
    family: 'stub', size: 10, weight: FontWeight.Normal, style: FontStyle.Normal,
    foreground: undefined, decorations: TextDecorations.None, link: undefined,
};

// Build a cell holding one paragraph of `text`, optionally aligned.
function cell(text: string, align: TextAlignment = TextAlignment.Left): TableCell
{
    const c = new TableCell();
    const p = new Paragraph();
    p.TextAlignment = align;
    p.AddChild(new Run(text));
    c.AddChild(p);
    return c;
}

function row(cells: TableCell[], header = false): TableRow
{
    const r = new TableRow();
    r.IsHeader = header;
    for (const c of cells) r.AddChild(c);
    return r;
}

// A 2×2 table: header "File" / "Taxonomy", body "a.todl" / "app".
function sampleTable(): Table
{
    const t = new Table();               // default padding (8,4,8,4), border 1
    t.AddChild(row([cell('File'), cell('Taxonomy')], true));
    t.AddChild(row([cell('a.todl'), cell('app')]));
    return t;
}

describe('layoutTable — grid geometry', () => {
    test('columns take the widest cell content + padding; rows stack by tallest cell', () => {
        const r = layoutBlocks([sampleTable()], { availableWidth: Number.POSITIVE_INFINITY, base: BASE, env: ENV });
        const table = r.boxes[0] as TableBox;
        assert.equal(table.kind, 'table');
        assert.equal(table.rows.length, 2);
        assert.equal(table.rows[0]!.cells.length, 2);

        // Col 0: max("File"=40, "a.todl"=60) + padX(16) = 76. Col 1: max(80,30)+16 = 96.
        const c0 = table.rows[0]!.cells[0]!;
        const c1 = table.rows[0]!.cells[1]!;
        assert.equal(c0.right - c0.x, 76);
        assert.equal(c1.right - c1.x, 96);

        // Row height = one line(12) + padTop(4) + padBottom(4) = 20. Rows stack
        // with a 1px gridline between (top border 1 → first row starts at y+1).
        assert.equal(table.rows[0]!.top, 1);
        assert.equal(table.rows[0]!.bottom, 21);
        assert.equal(table.rows[1]!.top, 22);
        assert.equal(table.rows[1]!.bottom, 42);

        // width = border + col0 + border + col1 + border = 1+76+1+96+1 = 175.
        assert.equal(r.width, 175);
        assert.equal(r.height, 43);   // 1 + 20 + 1 + 20 + 1

        // A vertical gridline per column boundary, a horizontal per row boundary.
        assert.equal(table.gridX.length, 3);
        assert.equal(table.gridY.length, 3);
        assert.deepEqual(table.gridX, [0, 77, 174]);
        assert.deepEqual(table.gridY, [0, 21, 42]);
    });

    test('a constrained width shrinks columns proportionally to fit', () => {
        const r = layoutBlocks([sampleTable()], { availableWidth: 100, base: BASE, env: ENV });
        const table = r.boxes[0] as TableBox;
        // Natural table width 175 > 100, so columns scale down.
        const w0 = table.rows[0]!.cells[0]!;
        const w1 = table.rows[0]!.cells[1]!;
        assert.ok(w0.right - w0.x < 76, 'col 0 shrank');
        assert.ok(w1.right - w1.x < 96, 'col 1 shrank');
        // The whole table fits the available width (within sub-pixel rounding).
        assert.ok(Math.abs(table.right - 100) < 0.1, `table right ${table.right} ≈ 100`);
    });

    test('LastColumnFills: non-last columns stay natural; the last absorbs the remaining width', () => {
        const t = sampleTable();
        t.LastColumnFills = true;
        // 300 is wider than the natural table (175), so the last column grows.
        const r = layoutBlocks([t], { availableWidth: 300, base: BASE, env: ENV });
        const table = r.boxes[0] as TableBox;
        const c0 = table.rows[0]!.cells[0]!;
        const c1 = table.rows[0]!.cells[1]!;
        // Col 0 keeps its natural 76; col 1 fills the rest (300 − borders(3) − 76).
        assert.equal(c0.right - c0.x, 76, 'first column stays natural');
        assert.equal(c1.right - c1.x, 221, 'last column fills remaining width');
        assert.ok(Math.abs(table.right - 300) < 0.1, `table spans the box (${table.right} ≈ 300)`);
    });

    test('a cell aligns its own content within the column via Paragraph.TextAlignment', () => {
        // Body col 1 ("app"=30) is right-aligned inside col 1 whose width is driven
        // by the header ("Taxonomy"). Content width 80, content 30 → shift 50.
        const t = new Table();
        t.AddChild(row([cell('File'), cell('Taxonomy')], true));
        t.AddChild(row([cell('a.todl'), cell('app', TextAlignment.Right)]));
        const r = layoutBlocks([t], { availableWidth: Number.POSITIVE_INFINITY, base: BASE, env: ENV });
        const table = r.boxes[0] as TableBox;
        const para = table.rows[1]!.cells[1]!.boxes[0] as ParagraphBox;
        assert.equal(para.layout.lines[0]!.shift, 50);
    });
});

// Minimal recording DrawingContext — captures only DrawRectangle; every other
// method is an inert no-op (text goes through DrawText, which we ignore).
function recordingDc(): { dc: DrawingContext; rects: { brush: Brush | undefined; rect: Rect }[] }
{
    const rects: { brush: Brush | undefined; rect: Rect }[] = [];
    const dc = {
        DrawRectangle: (brush: Brush | undefined, _pen: unknown, rect: Rect) => { rects.push({ brush, rect }); },
        DrawRoundedRectangle: () => {}, DrawGeometry: () => {}, DrawText: () => {},
        DrawImage: () => {}, PushTransform: () => {}, PushClip: () => {}, Pop: () => {},
    } as unknown as DrawingContext;
    return { dc, rects };
}

describe('renderBlocks — table chrome', () => {
    test('draws one header fill plus every gridline', () => {
        const brush = {} as Brush;        // identity-only stand-ins
        const header = {} as Brush;
        const t = sampleTable();
        t.BorderBrush = brush;
        t.HeaderBackground = header;

        const r = layoutBlocks([t], { availableWidth: Number.POSITIVE_INFINITY, base: BASE, env: ENV });
        const { dc, rects } = recordingDc();
        renderBlocks(dc, r, 0, 0, { letterSpacing: 0, ink: {} as Brush, link: {} as Brush });

        // 3 vertical + 3 horizontal gridlines + 1 header fill = 7 rectangles.
        assert.equal(rects.length, 7);
        assert.equal(rects.filter((x) => x.brush === header).length, 1);
        assert.equal(rects.filter((x) => x.brush === brush).length, 6);
    });

    test('no BorderBrush ⇒ no gridlines drawn', () => {
        const r = layoutBlocks([sampleTable()], { availableWidth: Number.POSITIVE_INFINITY, base: BASE, env: ENV });
        const { dc, rects } = recordingDc();
        renderBlocks(dc, r, 0, 0, { letterSpacing: 0, ink: {} as Brush, link: {} as Brush });
        assert.equal(rects.length, 0);
    });
});
