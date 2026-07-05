import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Rect, Size, Element, Visual } from '../../runtime/index.js';
import { Orientation } from '../panels/orientation.js';
import { WrapPanel } from '../panels/wrap-panel.js';

class FixedSizeLeaf extends Element
{
    constructor(private box: Size) { super(); }
    protected override MeasureOverride(_a: Size): Size { return this.box; }
}

function leaves(sizes: Array<[number, number]>): FixedSizeLeaf[]
{
    return sizes.map(([w, h]) => new FixedSizeLeaf(new Size(w, h)));
}

describe('WrapPanel — DP defaults', () => {
    test('Orientation defaults to Horizontal (matches WPF)', () => {
        const p = new WrapPanel();
        assert.equal(p.Orientation, Orientation.Horizontal);
    });
});

describe('WrapPanel — Horizontal flow', () => {
    test('Children fit on one line: row primary = sum, row cross = max', () => {
        const p = new WrapPanel();
        for (const c of leaves([[10, 20], [15, 30], [25, 10]])) p.AddChild(c);
        p.Measure(new Size(100, Number.POSITIVE_INFINITY));
        // Row 0: 10 + 15 + 25 = 50 wide; tallest is 30.
        assert.deepEqual(
            [p.DesiredSize.Width, p.DesiredSize.Height],
            [50, 30],
        );
    });

    test('Wraps when next child would exceed the available width', () => {
        const p = new WrapPanel();
        for (const c of leaves([[40, 10], [40, 20], [40, 30]])) p.AddChild(c);
        // Available width = 80 — first two fit (40+40=80), third wraps.
        p.Measure(new Size(80, Number.POSITIVE_INFINITY));
        // Total primary = max line primary = 80 (line 1). Total cross =
        // 20 (max of line 1) + 30 (line 2) = 50.
        assert.deepEqual(
            [p.DesiredSize.Width, p.DesiredSize.Height],
            [80, 50],
        );
    });

    test('Arrange positions children with line origin (running primary, running cross)', () => {
        const p = new WrapPanel();
        const all = leaves([[40, 10], [40, 20], [40, 30]]);
        for (const c of all) p.AddChild(c);
        p.Measure(new Size(80, Number.POSITIVE_INFINITY));
        p.Arrange(new Rect(0, 0, 80, 50));

        // Line 1: child[0] at (0, 0), child[1] at (40, 0). Cross extent 20.
        assert.deepEqual([all[0]!.ArrangedRect.X, all[0]!.ArrangedRect.Y], [0, 0]);
        assert.deepEqual([all[1]!.ArrangedRect.X, all[1]!.ArrangedRect.Y], [40, 0]);
        // Line 2: child[2] at (0, 20).
        assert.deepEqual([all[2]!.ArrangedRect.X, all[2]!.ArrangedRect.Y], [0, 20]);
    });

    test('Each child gets the line cross extent so backgrounds paint full line height', () => {
        const p = new WrapPanel();
        // Mixed-height row.
        const all = leaves([[40, 10], [40, 30]]);
        for (const c of all) p.AddChild(c);
        p.Measure(new Size(100, Number.POSITIVE_INFINITY));
        p.Arrange(new Rect(0, 0, 100, 30));

        // Both children get height=30 (the line cross extent) even
        // though child[0]'s DesiredSize is only 10.
        assert.equal(all[0]!.ArrangedRect.Height, 30);
        assert.equal(all[1]!.ArrangedRect.Height, 30);
    });

    test('Single child wider than availableSize gets its own line (no clip)', () => {
        const p = new WrapPanel();
        for (const c of leaves([[200, 10]])) p.AddChild(c);
        // Available 80 < child 200 — still gets a line, panel reports
        // its actual primary extent of 200.
        p.Measure(new Size(80, Number.POSITIVE_INFINITY));
        assert.deepEqual(
            [p.DesiredSize.Width, p.DesiredSize.Height],
            [200, 10],
        );
    });

    test('Empty panel reports Size(0, 0)', () => {
        const p = new WrapPanel();
        p.Measure(new Size(100, 100));
        assert.deepEqual([p.DesiredSize.Width, p.DesiredSize.Height], [0, 0]);
    });
});

describe('WrapPanel — Vertical flow', () => {
    test('Wraps when next child would exceed the available height', () => {
        const p = new WrapPanel();
        p.Orientation = Orientation.Vertical;
        for (const c of leaves([[10, 40], [20, 40], [30, 40]])) p.AddChild(c);
        // Available height = 80 — first two fit (40+40=80), third wraps
        // to the next column.
        p.Measure(new Size(Number.POSITIVE_INFINITY, 80));
        // Total primary (cross-axis Width) = 20 (col 1 max) + 30 (col 2)
        // = 50; total cross (Height) = max column primary = 80.
        assert.deepEqual(
            [p.DesiredSize.Width, p.DesiredSize.Height],
            [50, 80],
        );
    });

    test('Arrange positions children down then across', () => {
        const p = new WrapPanel();
        p.Orientation = Orientation.Vertical;
        const all = leaves([[10, 40], [20, 40], [30, 40]]);
        for (const c of all) p.AddChild(c);
        p.Measure(new Size(Number.POSITIVE_INFINITY, 80));
        p.Arrange(new Rect(0, 0, 50, 80));

        // Column 1: child[0] at (0, 0), child[1] at (0, 40). Width 20.
        assert.deepEqual([all[0]!.ArrangedRect.X, all[0]!.ArrangedRect.Y], [0,  0]);
        assert.deepEqual([all[1]!.ArrangedRect.X, all[1]!.ArrangedRect.Y], [0, 40]);
        // Column 2 begins at X = column-1 width = 20.
        assert.deepEqual([all[2]!.ArrangedRect.X, all[2]!.ArrangedRect.Y], [20, 0]);
    });
});

describe('WrapPanel — invalidation', () => {
    test('Setting Orientation invalidates measure', () => {
        const p = new WrapPanel();
        for (const c of leaves([[20, 10], [20, 10]])) p.AddChild(c);
        p.Measure(new Size(100, Number.POSITIVE_INFINITY));
        // Initial: horizontal, both fit on one row → 40×10.
        assert.deepEqual([p.DesiredSize.Width, p.DesiredSize.Height], [40, 10]);

        p.Orientation = Orientation.Vertical;
        p.Measure(new Size(Number.POSITIVE_INFINITY, 100));
        // Vertical, both fit on one column → 20×20.
        assert.deepEqual([p.DesiredSize.Width, p.DesiredSize.Height], [20, 20]);
    });
});
