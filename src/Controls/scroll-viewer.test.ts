import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    Color,
    Rect,
    Size,
    Visual,
    type DrawingContext,
} from '../runtime/index.js';
import { RectangleGeometry, SolidColorBrush } from '../visual-engine/index.js';
import {
    DataTemplate,
    ItemsControl,
    ScrollViewer,
    VirtualizingStackPanel,
} from './index.js';

// Fixed-size leaf that paints a colored rect — useful as ScrollViewer
// content for measuring extent.
class FixedRect extends Visual
{
    constructor(private box: Size, private color: Color = Color.Red) { super(); }
    protected override MeasureOverride(_a: Size): Size { return this.box; }
    protected override RenderOverride(dc: DrawingContext): void
    {
        dc.DrawRectangle(new SolidColorBrush(this.color), undefined, new Rect(0, 0, this.box.Width, this.box.Height));
    }
}

describe('ScrollViewer — clip-and-translate mode (plain content)', () => {
    test('without Content, ExtentWidth/Height are zero', () => {
        const sv = new ScrollViewer();
        sv.Measure(new Size(100, 100));
        assert.equal(sv.ExtentWidth, 0);
        assert.equal(sv.ExtentHeight, 0);
        assert.equal(sv.ViewportWidth, 100);
        assert.equal(sv.ViewportHeight, 100);
    });

    test('Content extent comes from the child\'s natural DesiredSize (measured with Infinity)', () => {
        const sv = new ScrollViewer();
        sv.Content = new FixedRect(new Size(500, 800));
        sv.Measure(new Size(100, 200));
        assert.equal(sv.ExtentWidth, 500);
        assert.equal(sv.ExtentHeight, 800);
        assert.equal(sv.ViewportWidth, 100);
        assert.equal(sv.ViewportHeight, 200);
        assert.equal(sv.ScrollableWidth, 400);
        assert.equal(sv.ScrollableHeight, 600);
    });

    test('Content is arranged at (-offset.X, -offset.Y) with full extent size', () => {
        const sv = new ScrollViewer();
        const content = new FixedRect(new Size(500, 800));
        sv.Content = content;
        sv.HorizontalOffset = 50;
        sv.VerticalOffset   = 100;
        sv.Measure(new Size(100, 200));
        sv.Arrange(new Rect(0, 0, 100, 200));
        assert.equal(content.ArrangedRect.X,      -50);
        assert.equal(content.ArrangedRect.Y,      -100);
        assert.equal(content.ArrangedRect.Width,   500);
        assert.equal(content.ArrangedRect.Height,  800);
    });

    test('Clip is set to the viewport rect in clip-and-translate mode', () => {
        const sv = new ScrollViewer();
        sv.Content = new FixedRect(new Size(500, 500));
        sv.Measure(new Size(100, 100));
        sv.Arrange(new Rect(0, 0, 100, 100));
        const clip = sv.Clip as RectangleGeometry;
        assert.ok(clip instanceof RectangleGeometry);
        assert.equal(clip.Rect.X,      0);
        assert.equal(clip.Rect.Y,      0);
        assert.equal(clip.Rect.Width,  100);
        assert.equal(clip.Rect.Height, 100);
    });

    test('out-of-range offsets clamp to ScrollableWidth/Height at Arrange time (raw value preserved)', () => {
        const sv = new ScrollViewer();
        const content = new FixedRect(new Size(200, 200));
        sv.Content = content;
        sv.VerticalOffset = 9999;     // way past scrollable
        sv.Measure(new Size(100, 100));
        sv.Arrange(new Rect(0, 0, 100, 100));
        // ScrollableHeight = 200 - 100 = 100. Effective offset is 100.
        assert.equal(content.ArrangedRect.Y, -100);
        // Raw user-set value preserved on the property.
        assert.equal(sv.VerticalOffset, 9999);
    });

    test('negative offsets clamp to 0', () => {
        const sv = new ScrollViewer();
        const content = new FixedRect(new Size(500, 500));
        sv.Content = content;
        sv.HorizontalOffset = -50;
        sv.Measure(new Size(100, 100));
        sv.Arrange(new Rect(0, 0, 100, 100));
        assert.equal(content.ArrangedRect.X, 0);
    });

    test('ScrollToTop / ScrollToBottom / ScrollToLeft / ScrollToRight', () => {
        const sv = new ScrollViewer();
        sv.Content = new FixedRect(new Size(400, 300));
        sv.Measure(new Size(100, 100));
        sv.ScrollToRight();
        assert.equal(sv.HorizontalOffset, 300);  // ScrollableWidth
        sv.ScrollToBottom();
        assert.equal(sv.VerticalOffset, 200);    // ScrollableHeight
        sv.ScrollToLeft();
        assert.equal(sv.HorizontalOffset, 0);
        sv.ScrollToTop();
        assert.equal(sv.VerticalOffset, 0);
    });

    test('Content is a logical AND visual child of the ScrollViewer', () => {
        const sv = new ScrollViewer();
        const content = new FixedRect(new Size(100, 100));
        sv.Content = content;
        assert.deepEqual(sv.visualChildren,  [content]);
        assert.deepEqual(sv.logicalChildren, [content]);
    });

    test('replacing Content detaches the previous instance and attaches the new one', () => {
        const sv = new ScrollViewer();
        const a = new FixedRect(new Size(100, 100));
        const b = new FixedRect(new Size(200, 200));
        sv.Content = a;
        sv.Content = b;
        assert.deepEqual(sv.visualChildren, [b]);
        // Detached `a` has no parent now.
        const aParent = (a as unknown as { visualParent: Visual | undefined }).visualParent;
        assert.equal(aParent, undefined);
    });
});

// Sets up a free-standing ItemsControl (no parent) plus a
// VirtualizingStackPanel that uses it as its items owner — without
// going through ic.ItemsPanel (which would visually parent the panel
// to ic). Lets us put the panel directly as ScrollViewer's Content.
function makeStandalonePanel(items: readonly unknown[], itemHeight = 20): VirtualizingStackPanel
{
    const ic = new ItemsControl();
    ic.ItemTemplate = new DataTemplate(_ => new FixedRect(new Size(10, itemHeight)));
    ic.Items        = items;
    const panel = new VirtualizingStackPanel();
    panel.ItemHeight = itemHeight;
    panel.SetItemsOwner(ic);
    return panel;
}

describe('ScrollViewer — delegate mode (IScrollInfo content, e.g., VirtualizingStackPanel)', () => {
    test('drives the panel\'s Viewport (position + size) and reads Extent back', () => {
        const sv    = new ScrollViewer();
        const panel = makeStandalonePanel(Array.from({ length: 100 }, (_, i) => i), 20);
        sv.Content = panel;

        sv.VerticalOffset = 60;
        sv.Measure(new Size(200, 80));

        // Panel's viewport is now (0, 60, 200, 80). ExtentHeight =
        // 100 items × 20 = 2000.
        assert.equal(sv.ExtentHeight, 2000);
        assert.equal(sv.ViewportHeight, 80);
        assert.equal(sv.ScrollableHeight, 1920);
        assert.equal(panel.HorizontalOffset, 0);
        assert.equal(panel.VerticalOffset, 60);
        assert.equal(panel.ViewportWidth, 200);
        assert.equal(panel.ViewportHeight, 80);

        // Only items intersecting [60, 140) are realized: items 3, 4, 5, 6.
        assert.deepEqual(panel.RealizedIndices, [3, 4, 5, 6]);
    });

    test('updating ScrollViewer.VerticalOffset re-realizes the panel\'s items', () => {
        const sv    = new ScrollViewer();
        const panel = makeStandalonePanel(Array.from({ length: 100 }, (_, i) => i), 20);
        sv.Content = panel;
        sv.Measure(new Size(200, 80));
        assert.deepEqual(panel.RealizedIndices, [0, 1, 2, 3]);

        sv.VerticalOffset = 500;
        sv.Measure(new Size(200, 80));
        // Viewport now at y=500, range [500, 580). Items 25..28
        // intersect; item 29 starts at y=580 exactly (the viewport's
        // exclusive top boundary), so it's not realized.
        assert.deepEqual(panel.RealizedIndices, [25, 26, 27, 28]);
    });

    test('no Clip is installed in delegate mode (panel handles its own clipping)', () => {
        const sv    = new ScrollViewer();
        const panel = makeStandalonePanel([1, 2, 3], 20);
        sv.Content = panel;
        sv.Measure(new Size(100, 50));
        sv.Arrange(new Rect(0, 0, 100, 50));
        assert.equal(sv.Clip, undefined);
    });
});
