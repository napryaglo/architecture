import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    Color,
    Rect,
    Size,
    Thickness,
    Visual,
    type DrawingContext,
} from '../../runtime/index.js';
import { Brush, Pen, SolidColorBrush } from '../../visual-engine/index.js';
import { Border } from '../index.js';

// Tiny Visual stand-in for Border's child slot — reports a configurable
// DesiredSize so Border's measure math is testable in isolation.
class FixedSize extends Visual
{
    constructor(private readonly desired: Size) { super(); }
    protected override MeasureOverride(_availableSize: Size): Size { return this.desired; }
    public last_arrange_rect: Rect | undefined;
    protected override ArrangeOverride(finalSize: Size): Size
    {
        // Capture the rect this child was arranged in so tests can assert
        // Border positioned it correctly. ArrangeOverride only sees finalSize;
        // the rect's origin lives in ArrangedRect (set by Visual.Arrange).
        this.last_arrange_rect = (this as unknown as { _arrangedRect: Rect })._arrangedRect;
        return finalSize;
    }
}

// Captures draw calls so we can assert what Border's RenderOverride
// emitted. The DC is the visual-engine-augmented interface — augmented
// methods (DrawRectangle, etc.) are visible because Brush / Pen / etc.
// import this file's module graph.
interface CapturedRect
{
    brush: Brush | undefined;
    pen: Pen | undefined;
    rect: Rect;
}

class CapturingContext implements DrawingContext
{
    public rects: CapturedRect[] = [];
    DrawRectangle(brush: Brush | undefined, pen: Pen | undefined, rect: Rect): void
    {
        this.rects.push({ brush, pen, rect });
    }
    DrawGeometry(): void { throw new Error('not used'); }
    DrawText(): void     { throw new Error('not used'); }
    PushTransform(): void { /* no-op for tests */ }
    PushClip(): void      { /* no-op for tests */ }
    Pop(): void           { /* no-op for tests */ }
}

describe('Border defaults', () => {
    test('a fresh Border has zero insets, no child, no fill, no stroke', () => {
        const b = new Border();
        assert.equal(b.child, undefined);
        assert.equal(b.Background, undefined);
        assert.equal(b.BorderBrush, undefined);
        assert.ok(b.BorderThickness.Equals(Thickness.Zero));
        assert.ok(b.Padding.Equals(Thickness.Zero));
        assert.equal(b.CornerRadius, 0);
    });

    test('an empty Border measures to Size.Zero with zero insets', () => {
        const b = new Border();
        b.Measure(new Size(500, 500));
        assert.ok(b.DesiredSize.Equals(Size.Zero));
    });

    test('constructor accepts a child Visual and sets it', () => {
        const child = new FixedSize(new Size(50, 30));
        const b = new Border(child);
        assert.equal(b.child, child);
    });
});

describe('Border layout — insets reduce child available size and inflate desired', () => {
    test('Padding alone shrinks child available, grows Border desired', () => {
        const child = new FixedSize(new Size(100, 50));
        const b = new Border(child);
        b.Padding = new Thickness(10, 20, 30, 40); // L T R B

        b.Measure(new Size(500, 500));

        // Child was measured with (500 - 40, 500 - 60) — Border consumed
        // 40 horizontally (10 + 30) and 60 vertically (20 + 40).
        // Child's desired stays 100×50 (FixedSize ignores availableSize).
        // Border's desired = child's desired + insets = (140, 110).
        assert.ok(b.DesiredSize.Equals(new Size(140, 110)));
    });

    test('BorderThickness adds on top of Padding', () => {
        const child = new FixedSize(new Size(100, 50));
        const b = new Border(child);
        b.BorderThickness = new Thickness(2);  // uniform 2
        b.Padding         = new Thickness(5);  // uniform 5

        b.Measure(new Size(500, 500));

        // Each side eats (2 + 5) = 7. Horizontal = 14, vertical = 14.
        assert.ok(b.DesiredSize.Equals(new Size(114, 64)));
    });

    test('an empty Border still reports inset-only desired size', () => {
        const b = new Border();
        b.Padding = new Thickness(10);  // uniform 10
        b.Measure(new Size(500, 500));
        assert.ok(b.DesiredSize.Equals(new Size(20, 20)));
    });

    test('insets larger than availableSize clamp child available to 0 (no negative)', () => {
        const child = new FixedSize(new Size(100, 50));
        const b = new Border(child);
        b.Padding = new Thickness(1000);  // huge

        b.Measure(new Size(50, 50));
        // Child available clamped to (0, 0); FixedSize ignores availableSize
        // so it still reports 100×50. Border desired = child + insets.
        assert.ok(b.DesiredSize.Equals(new Size(100 + 2000, 50 + 2000)));
    });
});

describe('Border layout — Arrange positions child after insets', () => {
    test('child is arranged inside (BorderThickness + Padding) on each side', () => {
        const child = new FixedSize(new Size(100, 50));
        const b = new Border(child);
        b.BorderThickness = new Thickness(2);
        b.Padding         = new Thickness(10, 20, 30, 40);

        b.Measure(new Size(500, 500));
        b.Arrange(new Rect(0, 0, 200, 200));

        // Child rect: offset (2+10, 2+20) = (12, 22)
        // Size: 200 - (2+10) - (2+30) = 156 wide; 200 - (2+20) - (2+40) = 136 tall
        assert.ok(child.last_arrange_rect!.Equals(new Rect(12, 22, 156, 136)));
    });

    test('with no insets, child fills the Border rect at origin', () => {
        const child = new FixedSize(new Size(50, 30));
        const b = new Border(child);
        b.Measure(new Size(200, 200));
        b.Arrange(new Rect(5, 7, 200, 200));
        assert.ok(child.last_arrange_rect!.Equals(new Rect(0, 0, 200, 200)));
    });

    test('insets larger than finalSize clamp child rect size to 0', () => {
        const child = new FixedSize(new Size(50, 30));
        const b = new Border(child);
        b.Padding = new Thickness(1000);
        b.Measure(new Size(2200, 2200));
        b.Arrange(new Rect(0, 0, 100, 100));
        // Child still arranged at the inset origin, but size clamped.
        assert.ok(child.last_arrange_rect!.Equals(new Rect(1000, 1000, 0, 0)));
    });
});

describe('Border render — Background fill and stroke', () => {
    test('no Background and no BorderBrush emits no draw calls', () => {
        const b = new Border();
        b.Measure(new Size(100, 100));
        b.Arrange(new Rect(0, 0, 100, 100));
        const dc = new CapturingContext();
        b.Render(dc);
        assert.deepEqual(dc.rects, []);
    });

    test('Background-only paints a single fill rect covering the full RenderSize', () => {
        const b = new Border();
        b.Background = new SolidColorBrush(Color.Red);
        b.Measure(new Size(100, 100));
        b.Arrange(new Rect(0, 0, 100, 100));

        const dc = new CapturingContext();
        b.Render(dc);

        assert.equal(dc.rects.length, 1);
        const r = dc.rects[0]!;
        assert.equal(r.brush, b.Background);
        assert.equal(r.pen, undefined);
        assert.ok(r.rect.Equals(new Rect(0, 0, 100, 100)));
    });

    test('BorderBrush + non-zero BorderThickness emits a stroke rect inset by half-thickness', () => {
        const b = new Border();
        b.BorderBrush = new SolidColorBrush(Color.Black);
        b.BorderThickness = new Thickness(4);
        b.Measure(new Size(100, 100));
        b.Arrange(new Rect(0, 0, 100, 100));

        const dc = new CapturingContext();
        b.Render(dc);

        // Background absent → one draw call (stroke only).
        assert.equal(dc.rects.length, 1);
        const r = dc.rects[0]!;
        assert.equal(r.brush, undefined);
        assert.equal(r.pen!.Brush, b.BorderBrush);
        assert.equal(r.pen!.Thickness, 4);
        // Stroke centered on path → inset by 2 (half of 4) on each side.
        assert.ok(r.rect.Equals(new Rect(2, 2, 96, 96)));
    });

    test('Background + Border emits two draws in fill-then-stroke order', () => {
        const b = new Border();
        b.Background     = new SolidColorBrush(Color.White);
        b.BorderBrush    = new SolidColorBrush(Color.Black);
        b.BorderThickness = new Thickness(1);

        b.Measure(new Size(50, 50));
        b.Arrange(new Rect(0, 0, 50, 50));

        const dc = new CapturingContext();
        b.Render(dc);

        assert.equal(dc.rects.length, 2);
        // Order matters: background under stroke.
        assert.equal(dc.rects[0]!.brush, b.Background);
        assert.equal(dc.rects[0]!.pen, undefined);
        assert.equal(dc.rects[1]!.brush, undefined);
        assert.equal(dc.rects[1]!.pen!.Brush, b.BorderBrush);
    });

    test('BorderBrush set but BorderThickness zero emits no stroke', () => {
        const b = new Border();
        b.BorderBrush = new SolidColorBrush(Color.Black);
        // BorderThickness defaults to Zero.
        b.Measure(new Size(100, 100));
        b.Arrange(new Rect(0, 0, 100, 100));

        const dc = new CapturingContext();
        b.Render(dc);
        assert.deepEqual(dc.rects, []);
    });
});

describe('Border invalidation — property changes route through Visual.OnPropertyChanged', () => {
    test('changing Padding invalidates measure and arrange', () => {
        const b = new Border();
        b.Measure(new Size(100, 100));
        b.Arrange(new Rect(0, 0, 100, 100));
        assert.equal(b.IsMeasureValid, true);
        assert.equal(b.IsArrangeValid, true);

        b.Padding = new Thickness(5);
        assert.equal(b.IsMeasureValid, false);
        assert.equal(b.IsArrangeValid, false);
    });

    test('changing Background leaves measure and arrange valid (Render-only)', () => {
        const b = new Border();
        b.Measure(new Size(100, 100));
        b.Arrange(new Rect(0, 0, 100, 100));

        b.Background = new SolidColorBrush(Color.Red);
        assert.equal(b.IsMeasureValid, true);
        assert.equal(b.IsArrangeValid, true);
    });
});

// Thickness has its own focused suite — it underpins Padding,
// BorderThickness, and (later) Margin, so its constructor overloads
// and derived getters need pinning.
describe('Thickness value type', () => {
    test('single-arg constructor sets all four sides equal', () => {
        const t = new Thickness(7);
        assert.equal(t.Left, 7);
        assert.equal(t.Top, 7);
        assert.equal(t.Right, 7);
        assert.equal(t.Bottom, 7);
    });

    test('two-arg constructor sets horizontal and vertical pairs', () => {
        const t = new Thickness(5, 10);
        assert.equal(t.Left, 5);
        assert.equal(t.Right, 5);
        assert.equal(t.Top, 10);
        assert.equal(t.Bottom, 10);
    });

    test('four-arg constructor sets each side independently', () => {
        const t = new Thickness(1, 2, 3, 4);
        assert.equal(t.Left, 1);
        assert.equal(t.Top, 2);
        assert.equal(t.Right, 3);
        assert.equal(t.Bottom, 4);
    });

    test('Horizontal and Vertical sum opposite sides', () => {
        const t = new Thickness(1, 2, 3, 4);
        assert.equal(t.Horizontal, 1 + 3);
        assert.equal(t.Vertical,   2 + 4);
    });

    test('IsZero is true only when every side is 0', () => {
        assert.equal(Thickness.Zero.IsZero, true);
        assert.equal(new Thickness(0).IsZero, true);
        assert.equal(new Thickness(0, 0, 0, 1).IsZero, false);
    });

    test('Equals compares structurally', () => {
        const a = new Thickness(1, 2, 3, 4);
        const b = new Thickness(1, 2, 3, 4);
        const c = new Thickness(1, 2, 3, 5);
        assert.equal(a.Equals(b), true);
        assert.equal(a.Equals(c), false);
    });
});

