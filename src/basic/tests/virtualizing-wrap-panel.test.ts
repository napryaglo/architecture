import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    Rect,
    Size,
    Element,
    Visual,
    type DrawingContext,
} from '../../runtime/index.js';
import { DataTemplate, VirtualizingWrapPanel } from '../index.js';
import { ItemsControl } from '@pragmatic-tech-ai/mural/framework';

// Leaf container that just consumes its slot — gives the panel something
// concrete to Measure/Arrange so RealizedIndices and ArrangedRects mean
// what we expect them to.
class Leaf extends Element
{
    constructor(public readonly source: unknown) { super(); }
    protected override MeasureOverride(_a: Size): Size { return new Size(100, 100); }
    protected override RenderOverride(_dc: DrawingContext): void { }
}

function makeIC(
    itemCount: number,
    opts: {
        viewport:           Rect;
        itemWidth?:         number;
        itemHeight?:        number;
        horizontalSpacing?: number;
        verticalSpacing?:   number;
    },
): { ic: ItemsControl; panel: VirtualizingWrapPanel }
{
    const panel = new VirtualizingWrapPanel();
    if (opts.itemWidth         !== undefined) panel.ItemWidth         = opts.itemWidth;
    if (opts.itemHeight        !== undefined) panel.ItemHeight        = opts.itemHeight;
    if (opts.horizontalSpacing !== undefined) panel.HorizontalSpacing = opts.horizontalSpacing;
    if (opts.verticalSpacing   !== undefined) panel.VerticalSpacing   = opts.verticalSpacing;
    panel.Viewport = opts.viewport;
    const ic = new ItemsControl();
    ic.ItemsPanel   = () => panel;
    ic.ItemTemplate = new DataTemplate(data => new Leaf(data));
    ic.Items        = Array.from({ length: itemCount }, (_, i) => `item-${i}`);
    return { ic, panel };
}

describe('VirtualizingWrapPanel — spacing defaults preserve uniform-cell behavior', () => {
    test('HorizontalSpacing / VerticalSpacing default to 0', () => {
        const panel = new VirtualizingWrapPanel();
        assert.equal(panel.HorizontalSpacing, 0);
        assert.equal(panel.VerticalSpacing,   0);
    });

    test('zero spacing → column count, extent, and positions match the no-spacing math', () => {
        // 3 columns × 100 = 300 fits in a 300-wide viewport.
        const { ic, panel } = makeIC(9, {
            viewport: new Rect(0, 0, 300, 300),
            itemWidth:  100,
            itemHeight: 100,
        });
        ic.Measure(new Size(300, 300));
        ic.Arrange(new Rect(0, 0, 300, 300));
        assert.equal(panel.Columns, 3);
        assert.equal(panel.ExtentWidth,  300);                            // 3 × 100
        assert.equal(panel.ExtentHeight, 300);                            // 3 rows × 100
        // First three items in row 0 at x = 0, 100, 200.
        const r0 = ic.Generator.ContainerFromIndex(0)!.ArrangedRect;
        const r1 = ic.Generator.ContainerFromIndex(1)!.ArrangedRect;
        const r2 = ic.Generator.ContainerFromIndex(2)!.ArrangedRect;
        assert.equal(r0.X, 0);   assert.equal(r0.Y, 0);
        assert.equal(r1.X, 100); assert.equal(r1.Y, 0);
        assert.equal(r2.X, 200); assert.equal(r2.Y, 0);
    });
});

describe('VirtualizingWrapPanel — HorizontalSpacing', () => {
    test('column count drops when HorizontalSpacing eats into the viewport', () => {
        // Without spacing: floor(300 / 100) = 3 columns.
        // With hSp=60: 3 cells need 3·100 + 2·60 = 420, doesn\'t fit in 300.
        //              2 cells need 2·100 + 60 = 260, fits. So 2 columns.
        const { ic, panel } = makeIC(9, {
            viewport: new Rect(0, 0, 300, 600),
            itemWidth:         100,
            itemHeight:        100,
            horizontalSpacing: 60,
        });
        ic.Measure(new Size(300, 600));
        assert.equal(panel.Columns, 2);
    });

    test('cells are positioned with HorizontalSpacing between them, not inside them', () => {
        // 3 cells × 100 + 2 gaps × 10 = 320 → exactly fits a 320-wide viewport.
        const { ic, panel } = makeIC(6, {
            viewport: new Rect(0, 0, 320, 200),
            itemWidth:         100,
            itemHeight:        100,
            horizontalSpacing: 10,
        });
        ic.Measure(new Size(320, 200));
        ic.Arrange(new Rect(0, 0, 320, 200));
        assert.equal(panel.Columns, 3);
        const r0 = ic.Generator.ContainerFromIndex(0)!.ArrangedRect;
        const r1 = ic.Generator.ContainerFromIndex(1)!.ArrangedRect;
        const r2 = ic.Generator.ContainerFromIndex(2)!.ArrangedRect;
        // Stride = 100 + 10 = 110. Cells start at 0, 110, 220.
        assert.equal(r0.X, 0);
        assert.equal(r1.X, 110);
        assert.equal(r2.X, 220);
        // Cell size stays at ItemWidth — spacing is BETWEEN cells, not added on.
        assert.equal(r0.Width, 100);
        assert.equal(r1.Width, 100);
        assert.equal(r2.Width, 100);
    });

    test('ExtentWidth reflects column×stride − spacing (gap eaten on last column)', () => {
        // 4 columns × 100 + 3 gaps × 10 = 430.
        const { ic, panel } = makeIC(16, {
            viewport: new Rect(0, 0, 430, 400),
            itemWidth:         100,
            itemHeight:        100,
            horizontalSpacing: 10,
        });
        ic.Measure(new Size(430, 400));
        assert.equal(panel.Columns, 4);
        assert.equal(panel.ExtentWidth, 430);
    });
});

describe('VirtualizingWrapPanel — VerticalSpacing', () => {
    test('rows are positioned with VerticalSpacing between them', () => {
        // 3 columns, 2 rows. Row stride = 100 + 20 = 120.
        const { ic } = makeIC(6, {
            viewport: new Rect(0, 0, 300, 300),
            itemWidth:       100,
            itemHeight:      100,
            verticalSpacing: 20,
        });
        ic.Measure(new Size(300, 300));
        ic.Arrange(new Rect(0, 0, 300, 300));
        const row0 = ic.Generator.ContainerFromIndex(0)!.ArrangedRect;
        const row1 = ic.Generator.ContainerFromIndex(3)!.ArrangedRect;
        assert.equal(row0.Y, 0);
        assert.equal(row1.Y, 120);
        assert.equal(row0.Height, 100);
        assert.equal(row1.Height, 100);
    });

    test('ExtentHeight reflects row×stride − spacing', () => {
        // 3 columns, 3 rows. 3·100 + 2·20 = 340.
        const { ic, panel } = makeIC(9, {
            viewport: new Rect(0, 0, 300, 340),
            itemWidth:       100,
            itemHeight:      100,
            verticalSpacing: 20,
        });
        ic.Measure(new Size(300, 340));
        assert.equal(panel.ExtentHeight, 340);
    });

    test('viewport-to-row mapping uses (ItemHeight + VerticalSpacing) as the stride', () => {
        // 5 rows × stride 120 = extent 580. Viewport 0..240 covers rows
        // 0 (y=0..100) and 1 (y=120..220) — but the gap 100..120 is
        // empty, and y=200 is inside row 1, y=220 is the row-1 bottom.
        // (vpStart + vpLen − 1) = 239 → floor(239/120) = 1 → lastRow=1.
        const { ic, panel } = makeIC(15, {
            viewport: new Rect(0, 0, 300, 240),
            itemWidth:       100,
            itemHeight:      100,
            verticalSpacing: 20,
        });
        ic.Measure(new Size(300, 240));
        // 3 columns × 2 rows = items 0..5 realized.
        assert.deepEqual(panel.RealizedIndices, [0, 1, 2, 3, 4, 5]);
    });

    test('viewport whose start lands INSIDE a row-gap still realizes the rows on either side', () => {
        // VerticalSpacing=20, ItemHeight=100. Row 0 paints y=0..100; gap
        // y=100..120; row 1 paints y=120..220. A viewport starting at
        // y=110 (inside the gap) and 50 tall covers y=110..160 — which
        // overlaps the second half of the gap and the first part of row 1.
        // Row 1 must realize so the painted area at y=120..160 has content.
        // floor(110/120)=0 → firstRow=0; floor(159/120)=1 → lastRow=1.
        const { ic, panel } = makeIC(15, {
            viewport: new Rect(0, 110, 300, 50),
            itemWidth:       100,
            itemHeight:      100,
            verticalSpacing: 20,
        });
        ic.Measure(new Size(300, 50));
        // Rows 0 and 1 both realized (3 items per row × 2 rows = 6).
        assert.deepEqual(panel.RealizedIndices, [0, 1, 2, 3, 4, 5]);
    });
});

describe('VirtualizingWrapPanel — combined spacing', () => {
    test('both spacings apply together; positions and extents combine correctly', () => {
        // 3 cols × stride 110 − 10 = 320 wide.
        // 2 rows × stride 130 − 30 = 230 tall.
        const { ic, panel } = makeIC(6, {
            viewport: new Rect(0, 0, 320, 230),
            itemWidth:         100,
            itemHeight:        100,
            horizontalSpacing: 10,
            verticalSpacing:   30,
        });
        ic.Measure(new Size(320, 230));
        ic.Arrange(new Rect(0, 0, 320, 230));
        assert.equal(panel.Columns,      3);
        assert.equal(panel.ExtentWidth,  320);
        assert.equal(panel.ExtentHeight, 230);
        // Item 4 is row 1, col 1 → (1*110, 1*130) = (110, 130).
        const r4 = ic.Generator.ContainerFromIndex(4)!.ArrangedRect;
        assert.equal(r4.X, 110);
        assert.equal(r4.Y, 130);
    });
});
