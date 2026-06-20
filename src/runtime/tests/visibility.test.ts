import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    Panel,
    Rect,
    Size,
    Visibility,
    Element,
    Visual,
    type DrawingContext,
} from '../index.js';

// Concrete leaf Visual with a fixed DesiredSize and a render counter so a
// test can assert how Visibility gates Measure / Arrange / Render.
class FixedSizeLeaf extends Element
{
    public renders = 0;

    constructor(private readonly desired: Size)
    {
        super();
    }

    protected override MeasureOverride(_a: Size): Size { return this.desired; }
    protected override RenderOverride(_dc: DrawingContext): void { this.renders++; }
}

// Panel that simply measures every child against the available size and
// reports the largest dimension along each axis as its desired size — a
// stand-in for any real container's per-axis sum / max policy.
class MaxPanel extends Panel
{
    protected override MeasureOverride(available: Size): Size
    {
        let w = 0, h = 0;
        for (const child of this.Children)
        {
            child.Measure(available);
            w = Math.max(w, child.DesiredSize.Width);
            h = Math.max(h, child.DesiredSize.Height);
        }
        return new Size(w, h);
    }
}

describe('Visual.Visibility', () => {

    test('defaults to Visible', () => {
        const v = new FixedSizeLeaf(new Size(10, 10));
        assert.equal(v.Visibility, Visibility.Visible);
    });

    test('Collapsed forces DesiredSize to Zero', () => {
        const v = new FixedSizeLeaf(new Size(40, 20));
        v.Measure(new Size(100, 100));
        assert.equal(v.DesiredSize.Width,  40, 'baseline measure honors MeasureOverride');
        assert.equal(v.DesiredSize.Height, 20);

        v.Visibility = Visibility.Collapsed;
        v.Measure(new Size(100, 100));
        assert.equal(v.DesiredSize.Width,  0,
            'Collapsed bypasses MeasureOverride and reports Size.Zero');
        assert.equal(v.DesiredSize.Height, 0);
    });

    test('Hidden preserves the layout slot (DesiredSize unchanged)', () => {
        const v = new FixedSizeLeaf(new Size(40, 20));
        v.Visibility = Visibility.Hidden;
        v.Measure(new Size(100, 100));
        assert.equal(v.DesiredSize.Width,  40, 'Hidden still measures normally');
        assert.equal(v.DesiredSize.Height, 20);
    });

    test('a Collapsed child contributes nothing to its parent\'s desired size', () => {
        const panel = new MaxPanel();
        const a = new FixedSizeLeaf(new Size(30, 30));
        const b = new FixedSizeLeaf(new Size(50, 50));
        panel.AddChild(a);
        panel.AddChild(b);
        panel.Measure(new Size(200, 200));
        assert.equal(panel.DesiredSize.Width,  50, 'baseline: max of 30 and 50');
        assert.equal(panel.DesiredSize.Height, 50);

        b.Visibility = Visibility.Collapsed;
        panel.Measure(new Size(200, 200));
        assert.equal(panel.DesiredSize.Width,  30,
            'with B collapsed, only A contributes');
        assert.equal(panel.DesiredSize.Height, 30);
    });

    test('Collapsed Arrange pins the rect to a degenerate point at slot origin', () => {
        const v = new FixedSizeLeaf(new Size(40, 20));
        v.Visibility = Visibility.Collapsed;
        v.Measure(new Size(100, 100));
        v.Arrange(new Rect(10, 20, 100, 100));
        assert.equal(v.ArrangedRect.X,      10);
        assert.equal(v.ArrangedRect.Y,      20);
        assert.equal(v.ArrangedRect.Width,  0);
        assert.equal(v.ArrangedRect.Height, 0);
    });

    test('Render() is suppressed for Hidden and Collapsed, restored for Visible', () => {
        const v = new FixedSizeLeaf(new Size(40, 20));
        const dc = {} as DrawingContext;

        v.Render(dc);
        assert.equal(v.renders, 1, 'baseline: Visible renders');

        v.Visibility = Visibility.Hidden;
        v.Render(dc);
        assert.equal(v.renders, 1, 'Hidden skips RenderOverride');

        v.Visibility = Visibility.Collapsed;
        v.Render(dc);
        assert.equal(v.renders, 1, 'Collapsed skips RenderOverride');

        v.Visibility = Visibility.Visible;
        v.Render(dc);
        assert.equal(v.renders, 2, 'flipping back to Visible re-enables RenderOverride');
    });

    test('a Visibility change invalidates measure so the parent re-lays out', () => {
        const panel = new MaxPanel();
        const a = new FixedSizeLeaf(new Size(30, 30));
        panel.AddChild(a);
        panel.Measure(new Size(200, 200));
        assert.equal(panel.DesiredSize.Width, 30);

        // Flip Collapsed → the parent should re-measure and see the new
        // zero contribution on the next Measure call (which the framework
        // schedules via OnMeasureInvalidated).
        a.Visibility = Visibility.Collapsed;
        panel.Measure(new Size(200, 200));
        assert.equal(panel.DesiredSize.Width,  0,
            'collapsing the only child drops the parent\'s desired width to 0');
    });
});
