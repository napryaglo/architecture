import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Rect, Size, Visual } from '../../runtime/index.js';
import { Dock, DockPanel } from '../panels/dock-panel.js';

class FixedSizeLeaf extends Visual
{
    constructor(private box: Size) { super(); }

    protected override MeasureOverride(_a: Size): Size { return this.box; }
}

describe('DockPanel', () => {
    test('attached Dock defaults to Left', () => {
        const leaf = new FixedSizeLeaf(new Size(10, 10));
        assert.equal(DockPanel.GetDock(leaf), Dock.Left);
    });

    test('Set/GetDock round-trip', () => {
        const leaf = new FixedSizeLeaf(new Size(10, 10));
        DockPanel.SetDock(leaf, Dock.Bottom);
        assert.equal(DockPanel.GetDock(leaf), Dock.Bottom);
    });

    test('LastChildFill defaults to true', () => {
        const panel = new DockPanel();
        assert.equal(panel.LastChildFill, true);
    });

    test('single Top child + filling last peels height from the top', () => {
        const top  = new FixedSizeLeaf(new Size(0, 30));
        DockPanel.SetDock(top, Dock.Top);
        const fill = new FixedSizeLeaf(new Size(0, 0));

        const panel = new DockPanel();
        panel.AddChild(top);
        panel.AddChild(fill);
        panel.Measure(new Size(200, 100));
        panel.Arrange(new Rect(0, 0, 200, 100));

        assert.deepEqual([top.ArrangedRect.X, top.ArrangedRect.Y,
                          top.ArrangedRect.Width, top.ArrangedRect.Height],
                         [0, 0, 200, 30]);
        assert.deepEqual([fill.ArrangedRect.X, fill.ArrangedRect.Y,
                          fill.ArrangedRect.Width, fill.ArrangedRect.Height],
                         [0, 30, 200, 70]);
    });

    test('Left / Right / Top / Bottom + fill — classic four-edge frame', () => {
        const left   = new FixedSizeLeaf(new Size(20, 0));
        DockPanel.SetDock(left, Dock.Left);
        const right  = new FixedSizeLeaf(new Size(30, 0));
        DockPanel.SetDock(right, Dock.Right);
        const top    = new FixedSizeLeaf(new Size(0, 10));
        DockPanel.SetDock(top, Dock.Top);
        const bottom = new FixedSizeLeaf(new Size(0, 15));
        DockPanel.SetDock(bottom, Dock.Bottom);
        const center = new FixedSizeLeaf(new Size(0, 0));

        const panel = new DockPanel();
        panel.AddChild(left);
        panel.AddChild(right);
        panel.AddChild(top);
        panel.AddChild(bottom);
        panel.AddChild(center);
        panel.Measure(new Size(200, 100));
        panel.Arrange(new Rect(0, 0, 200, 100));

        // Left strip — full panel height, starts at x=0.
        assert.deepEqual([left.ArrangedRect.X, left.ArrangedRect.Y,
                          left.ArrangedRect.Width, left.ArrangedRect.Height],
                         [0, 0, 20, 100]);
        // Right strip — peeled AFTER Left so accumulatedLeft already 20;
        // its rect is offset from the right edge.
        assert.deepEqual([right.ArrangedRect.X, right.ArrangedRect.Y,
                          right.ArrangedRect.Width, right.ArrangedRect.Height],
                         [170, 0, 30, 100]);
        // Top — sits in the middle channel (x in [20, 170)), full panel height
        // is now (100), peels 10 off the top.
        assert.deepEqual([top.ArrangedRect.X, top.ArrangedRect.Y,
                          top.ArrangedRect.Width, top.ArrangedRect.Height],
                         [20, 0, 150, 10]);
        // Bottom — same middle channel, anchored at the bottom edge.
        assert.deepEqual([bottom.ArrangedRect.X, bottom.ArrangedRect.Y,
                          bottom.ArrangedRect.Width, bottom.ArrangedRect.Height],
                         [20, 85, 150, 15]);
        // Center fill — whatever remains: x in [20, 170), y in [10, 85).
        assert.deepEqual([center.ArrangedRect.X, center.ArrangedRect.Y,
                          center.ArrangedRect.Width, center.ArrangedRect.Height],
                         [20, 10, 150, 75]);
    });

    test('LastChildFill=false makes last child obey its own Dock', () => {
        const left = new FixedSizeLeaf(new Size(20, 50));
        DockPanel.SetDock(left, Dock.Left);
        const right = new FixedSizeLeaf(new Size(30, 50));
        DockPanel.SetDock(right, Dock.Right);

        const panel = new DockPanel();
        panel.LastChildFill = false;
        panel.AddChild(left);
        panel.AddChild(right);
        panel.Measure(new Size(200, 100));
        panel.Arrange(new Rect(0, 0, 200, 100));

        // Right is peeled with its own width (30) — does NOT fill the gap.
        assert.equal(right.ArrangedRect.Width, 30);
        assert.equal(right.ArrangedRect.X, 170);
    });

    test('MeasureOverride sums docked sizes + tracks rolling cross-axis max', () => {
        // Top child contributes 80 wide × 20 tall (cross-axis max for the row
        // it sits in: just itself). Then Left child contributes 30 × 50, while
        // the rolling top accumulator already ate 20 vertically.
        const top  = new FixedSizeLeaf(new Size(80, 20));
        DockPanel.SetDock(top, Dock.Top);
        const left = new FixedSizeLeaf(new Size(30, 50));
        DockPanel.SetDock(left, Dock.Left);
        const fill = new FixedSizeLeaf(new Size(40, 40));

        const panel = new DockPanel();
        panel.AddChild(top);
        panel.AddChild(left);
        panel.AddChild(fill);
        panel.Measure(new Size(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY));

        // parentWidth = max(top.W=80, left.W+fill.W=70) = 80
        // parentHeight = max(left.H=50+top.H=20, fill.H+top.H=60) = 70
        assert.equal(panel.DesiredSize.Width,  80);
        assert.equal(panel.DesiredSize.Height, 70);
    });

    test('empty DockPanel has zero size', () => {
        const panel = new DockPanel();
        panel.Measure(new Size(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY));
        assert.equal(panel.DesiredSize.Width,  0);
        assert.equal(panel.DesiredSize.Height, 0);
    });

    test('children with no explicit Dock dock to the Left', () => {
        const a = new FixedSizeLeaf(new Size(20, 30));
        const b = new FixedSizeLeaf(new Size(20, 30));

        const panel = new DockPanel();
        panel.LastChildFill = false;
        panel.AddChild(a);
        panel.AddChild(b);
        panel.Measure(new Size(200, 100));
        panel.Arrange(new Rect(0, 0, 200, 100));

        assert.equal(a.ArrangedRect.X, 0);
        assert.equal(b.ArrangedRect.X, 20);
    });

    test('DockPanel.Dock is stored on the child under DockPanel namespace', () => {
        const leaf = new FixedSizeLeaf(new Size(10, 10));
        DockPanel.SetDock(leaf, Dock.Right);
        assert.equal(leaf._get_property_value_by_name(DockPanel, 'Dock'), Dock.Right);
    });
});
