import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    Color,
    Rect,
    Single,
    Size,
    Element,
    Visual,
    type DrawingContext,
} from '../../runtime/index.js';
import {
    HeadlessTarget,
    SolidColorBrush,
    SvgDrawingContext,
} from '../index.js';

// Leaf Visual that paints a fixed-size colored rectangle at (0,0) in
// its OWN coordinate space. Used in tests that verify HeadlessTarget
// pushes the right translate so a child rendered "at (0,0)" lands at
// the parent's arranged offset.
class PaintRect extends Element
{
    constructor(private readonly box: Size, private readonly color: Color) { super(); }

    protected override MeasureOverride(_availableSize: Size): Size
    {
        return this.box;
    }

    protected override RenderOverride(dc: DrawingContext): void
    {
        dc.DrawRectangle(
            new SolidColorBrush(this.color),
            undefined,
            new Rect(0, 0, this.box.Width, this.box.Height),
        );
    }
}

// Single subclass that arranges its child at a caller-specified offset
// (rather than the default (0,0) of Single's stock behavior). Lets a
// test set up "child not at origin" cheaply.
class OffsetSingle extends Single
{
    constructor(child: Visual, private readonly offsetX: number, private readonly offsetY: number)
    {
        super();
        this.SetChild(child);
    }

    protected override MeasureOverride(availableSize: Size): Size
    {
        if (this.child === undefined) return Size.Zero;
        this.child.Measure(availableSize);
        return this.child.DesiredSize;
    }

    protected override ArrangeOverride(finalSize: Size): Size
    {
        if (this.child !== undefined)
        {
            this.child.Arrange(new Rect(
                this.offsetX,
                this.offsetY,
                this.child.DesiredSize.Width,
                this.child.DesiredSize.Height,
            ));
        }
        return finalSize;
    }
}

// Pins HeadlessTarget.Render — the pass-driver for host-less rendering.
// In particular: that nested Visuals with non-origin ArrangedRects get
// wrapped in a translate transform on the DC so they render in their
// own local (0,0) coordinate space. Closes the TODO that 12.2 unblocked.
describe('HeadlessTarget.Render', () => {
    test('with undefined Content and no Background emits nothing', () => {
        const t = new HeadlessTarget(100, 100);
        const dc = new SvgDrawingContext();
        t.Render(dc);
        assert.equal(dc.ToFragment(), '');
    });

    test('with Background set paints a full-surface fill before Content', () => {
        const t = new HeadlessTarget(50, 30);
        t.Background = new SolidColorBrush(Color.White);
        const dc = new SvgDrawingContext();
        t.Render(dc);
        const out = dc.ToFragment();
        // Width/Height from the target's surface; full-opaque white.
        assert.ok(out.includes('width="50"'));
        assert.ok(out.includes('height="30"'));
        assert.ok(out.includes('fill="rgb(255,255,255)"'));
    });

    test('a non-nested Content renders without any <g transform> wrapper', () => {
        const leaf = new PaintRect(new Size(100, 100), Color.Red);
        const t = new HeadlessTarget(100, 100, leaf);
        const dc = new SvgDrawingContext();
        t.Render(dc);
        const out = dc.ToFragment();
        assert.ok(out.includes('fill="rgb(255,0,0)"'));
        assert.equal(out.includes('<g transform'), false);
    });

    test('a child arranged at (X, Y) gets a translate transform pushed/popped around its draw', () => {
        const leaf = new PaintRect(new Size(10, 10), Color.Red);
        const wrapper = new OffsetSingle(leaf, 5, 7);
        const t = new HeadlessTarget(100, 100, wrapper);
        const dc = new SvgDrawingContext();
        t.Render(dc);
        const out = dc.ToFragment();
        // Matrix row-vector form: (M11, M12, M21, M22, OffsetX, OffsetY).
        // Pure translate (5, 7) → (1, 0, 0, 1, 5, 7).
        assert.ok(out.includes('<g transform="matrix(1,0,0,1,5,7)">'));
        assert.ok(out.includes('</g>'));
        // The leaf's own rect is drawn at (0, 0) in its local space.
        assert.ok(out.includes('<rect x="0" y="0" width="10" height="10" fill="rgb(255,0,0)"'));
    });

    test('a child arranged at (0, 0) skips push/pop entirely', () => {
        const leaf = new PaintRect(new Size(10, 10), Color.Red);
        const wrapper = new OffsetSingle(leaf, 0, 0);
        const t = new HeadlessTarget(100, 100, wrapper);
        const dc = new SvgDrawingContext();
        t.Render(dc);
        const out = dc.ToFragment();
        assert.equal(out.includes('<g transform'), false);
        assert.ok(out.includes('fill="rgb(255,0,0)"'));
    });

    test('nested offsets stack — grandchild gets its own translate inside parent\'s', () => {
        const leaf       = new PaintRect(new Size(5, 5), Color.Blue);
        const inner_wrap = new OffsetSingle(leaf,       3, 4);
        const outer_wrap = new OffsetSingle(inner_wrap, 10, 20);
        const t = new HeadlessTarget(100, 100, outer_wrap);
        const dc = new SvgDrawingContext();
        t.Render(dc);
        const out = dc.ToFragment();
        // Outer translate appears first, inner inside it.
        const outer_idx = out.indexOf('<g transform="matrix(1,0,0,1,10,20)">');
        const inner_idx = out.indexOf('<g transform="matrix(1,0,0,1,3,4)">');
        const leaf_idx  = out.indexOf('fill="rgb(0,0,255)"');
        assert.ok(outer_idx >= 0);
        assert.ok(inner_idx >  outer_idx);
        assert.ok(leaf_idx  >  inner_idx);
    });

    // -----------------------------------------------------------------
    // Auto sizing — target dimensions resolved from Content.DesiredSize
    // -----------------------------------------------------------------

    test('auto on both axes: surface adopts Content.DesiredSize', () => {
        const leaf = new PaintRect(new Size(40, 25), Color.Red);
        const t = new HeadlessTarget(undefined, undefined, leaf);
        const dc = new SvgDrawingContext();
        t.Render(dc);
        assert.equal(t.ActualWidth,  40);
        assert.equal(t.ActualHeight, 25);
        // Width / Height stay NaN — user input is preserved so a later
        // Content swap re-resolves the size.
        assert.ok(Number.isNaN(t.Width));
        assert.ok(Number.isNaN(t.Height));
        // Leaf renders at (0, 0) — no translate because Arrange placed
        // it at the surface origin.
        const out = dc.ToFragment();
        assert.ok(out.includes('<rect x="0" y="0" width="40" height="25" fill="rgb(255,0,0)"'));
    });

    test('auto width only: height stays fixed, width grows to content', () => {
        const leaf = new PaintRect(new Size(80, 12), Color.Red);
        const t = new HeadlessTarget(undefined, 200, leaf);
        const dc = new SvgDrawingContext();
        t.Render(dc);
        assert.equal(t.ActualWidth,  80);
        assert.equal(t.ActualHeight, 200);
    });

    test('auto height only: width stays fixed, height grows to content', () => {
        const leaf = new PaintRect(new Size(80, 12), Color.Red);
        const t = new HeadlessTarget(300, undefined, leaf);
        const dc = new SvgDrawingContext();
        t.Render(dc);
        assert.equal(t.ActualWidth,  300);
        assert.equal(t.ActualHeight, 12);
    });

    test('auto with no content collapses to 0x0; Background draws nothing visible', () => {
        const t = new HeadlessTarget();
        t.Background = new SolidColorBrush(Color.White);
        const dc = new SvgDrawingContext();
        t.Render(dc);
        assert.equal(t.ActualWidth,  0);
        assert.equal(t.ActualHeight, 0);
        // Background still emits a rect, but at 0x0 — semantics decided
        // by the renderer, we just confirm the surface chose 0.
        assert.ok(dc.ToFragment().includes('width="0"'));
        assert.ok(dc.ToFragment().includes('height="0"'));
    });

    test('auto re-resolves on Content swap (Width stays NaN across renders)', () => {
        const small = new PaintRect(new Size(10, 10), Color.Red);
        const big   = new PaintRect(new Size(50, 80), Color.Blue);
        const t = new HeadlessTarget(undefined, undefined, small);

        t.Render(new SvgDrawingContext());
        assert.equal(t.ActualWidth,  10);
        assert.equal(t.ActualHeight, 10);

        t.Content = big;
        t.Render(new SvgDrawingContext());
        // Second render must re-resolve from the new content, not reuse
        // the first render's 10x10. Verifies that Width / Height aren't
        // silently mutated to lock in the first resolved size.
        assert.equal(t.ActualWidth,  50);
        assert.equal(t.ActualHeight, 80);
    });

    test('fixed mode: ActualWidth / ActualHeight mirror Width / Height', () => {
        const leaf = new PaintRect(new Size(10, 10), Color.Red);
        const t = new HeadlessTarget(120, 60, leaf);
        t.Render(new SvgDrawingContext());
        assert.equal(t.ActualWidth,  120);
        assert.equal(t.ActualHeight, 60);
    });
});
