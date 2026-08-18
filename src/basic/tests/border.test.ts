import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    Color,
    CornerRadius,
    Rect,
    Size,
    Thickness,
    Element,
    Visual,
    type DrawingContext,
} from '../../runtime/index.js';
import { Brush, Pen, RectangleGeometry, SolidColorBrush, type Geometry } from '../../visual-engine/index.js';
import { Border } from '../index.js';

// Tiny Visual stand-in for Border's child slot — reports a configurable
// DesiredSize so Border's measure math is testable in isolation.
class FixedSize extends Element
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
    radiusX?: number;
    radiusY?: number;
}

interface CapturedGeometry
{
    brush: Brush | undefined;
    pen: Pen | undefined;
    geometry: Geometry;
}

class CapturingContext implements DrawingContext
{
    public rects: CapturedRect[] = [];
    public geometries: CapturedGeometry[] = [];
    DrawRectangle(brush: Brush | undefined, pen: Pen | undefined, rect: Rect): void
    {
        this.rects.push({ brush, pen, rect });
    }
    DrawRoundedRectangle(
        brush: Brush | undefined,
        pen: Pen | undefined,
        rect: Rect,
        radiusX: number,
        radiusY: number,
    ): void
    {
        this.rects.push({ brush, pen, rect, radiusX, radiusY });
    }
    DrawGeometry(brush: Brush | undefined, pen: Pen | undefined, geometry: Geometry): void
    {
        this.geometries.push({ brush, pen, geometry });
    }
    DrawText(): void     { throw new Error('not used'); }
    PushTransform(): void { /* no-op for tests */ }
    PushClip(): void      { /* no-op for tests */ }
    Pop(): void           { /* no-op for tests */ }
}

describe('Border defaults', () => {
    test('a fresh Border has zero insets, no child, no fill, no stroke', () => {
        const b = new Border();
        assert.equal(b.child, undefined);
        assert.equal(b.Fill, undefined);
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

describe('Border baseline probe (ContentChild / TopContentInset)', () => {
    test('exposes the single child and the inset above it for baseline composition', () => {
        const child = new FixedSize(new Size(30, 12));
        const b = new Border(child);
        b.BorderThickness = new Thickness(1, 2, 1, 2);   // top 2
        b.Padding = new Thickness(5, 3, 5, 4);           // top 3
        assert.equal(b.ContentChild, child);
        assert.equal(b.TopContentInset, 5);              // 2 + 3
    });
});

describe('Border ClipToBounds', () => {
    const arranged = (b: Border, w: number, h: number): void => {
        b.Measure(new Size(500, 500));
        b.Arrange(new Rect(0, 0, w, h));
    };

    test('off by default → Border sets no clip', () => {
        const b = new Border(new FixedSize(new Size(40, 20)));
        arranged(b, 40, 20);
        assert.equal(b.Clip, undefined);
    });

    test('on → a rounded RectangleGeometry matching the render size + uniform radius', () => {
        const b = new Border(new FixedSize(new Size(40, 20)));
        b.CornerRadius = 6;
        b.ClipToBounds = true;
        arranged(b, 40, 20);
        const clip = b.Clip as RectangleGeometry;
        assert.ok(clip instanceof RectangleGeometry);
        assert.equal(clip.Rect.Width, 40);
        assert.equal(clip.Rect.Height, 20);
        assert.equal(clip.RadiusX, 6);
        assert.equal(clip.RadiusY, 6);
    });

    test('asymmetric CornerRadius clips to a plain rectangle (no per-corner clip path)', () => {
        const b = new Border(new FixedSize(new Size(40, 20)));
        b.CornerRadius = new CornerRadius(8, 0, 0, 8);
        b.ClipToBounds = true;
        arranged(b, 40, 20);
        const clip = b.Clip as RectangleGeometry;
        assert.ok(clip instanceof RectangleGeometry);
        assert.equal(clip.RadiusX, 0);
        assert.equal(clip.RadiusY, 0);
    });

    test('toggling ClipToBounds off clears the clip it applied', () => {
        const b = new Border(new FixedSize(new Size(40, 20)));
        b.CornerRadius = 6;
        b.ClipToBounds = true;
        arranged(b, 40, 20);
        assert.ok(b.Clip !== undefined);
        b.ClipToBounds = false;
        b.Arrange(new Rect(0, 0, 40, 20));   // ClipToBounds is Arrange-metadata → re-arranges
        assert.equal(b.Clip, undefined);
    });

    test('a CornerRadius change refreshes the clip radius on re-arrange', () => {
        const b = new Border(new FixedSize(new Size(40, 20)));
        b.CornerRadius = 6;
        b.ClipToBounds = true;
        arranged(b, 40, 20);
        b.CornerRadius = 10;                 // Arrange-metadata → invalidates arrange
        b.Arrange(new Rect(0, 0, 40, 20));   // re-arrange refreshes the clip
        assert.equal((b.Clip as RectangleGeometry).RadiusX, 10);
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

describe('Border render — Fill fill and stroke', () => {
    test('no Fill and no BorderBrush emits no draw calls', () => {
        const b = new Border();
        b.Measure(new Size(100, 100));
        b.Arrange(new Rect(0, 0, 100, 100));
        const dc = new CapturingContext();
        b.Render(dc);
        assert.deepEqual(dc.rects, []);
    });

    test('Fill-only paints a single fill rect covering the full RenderSize', () => {
        const b = new Border();
        b.Fill = new SolidColorBrush(Color.Red);
        b.Measure(new Size(100, 100));
        b.Arrange(new Rect(0, 0, 100, 100));

        const dc = new CapturingContext();
        b.Render(dc);

        assert.equal(dc.rects.length, 1);
        const r = dc.rects[0]!;
        assert.equal(r.brush, b.Fill);
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

        // Fill absent → one draw call (stroke only).
        assert.equal(dc.rects.length, 1);
        const r = dc.rects[0]!;
        assert.equal(r.brush, undefined);
        assert.equal(r.pen!.Brush, b.BorderBrush);
        assert.equal(r.pen!.Thickness, 4);
        // Stroke centered on path → inset by 2 (half of 4) on each side.
        assert.ok(r.rect.Equals(new Rect(2, 2, 96, 96)));
    });

    test('Fill + Border emits two draws in fill-then-stroke order', () => {
        const b = new Border();
        b.Fill     = new SolidColorBrush(Color.White);
        b.BorderBrush    = new SolidColorBrush(Color.Black);
        b.BorderThickness = new Thickness(1);

        b.Measure(new Size(50, 50));
        b.Arrange(new Rect(0, 0, 50, 50));

        const dc = new CapturingContext();
        b.Render(dc);

        assert.equal(dc.rects.length, 2);
        // Order matters: background under stroke.
        assert.equal(dc.rects[0]!.brush, b.Fill);
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

describe('Border render — per-side BorderThickness', () => {
    test('asymmetric BorderThickness emits one filled rect per non-zero side', () => {
        const b = new Border();
        b.BorderBrush     = new SolidColorBrush(Color.Black);
        b.BorderThickness = new Thickness(1, 2, 3, 4); // L=1, T=2, R=3, B=4
        b.Measure(new Size(100, 100));
        b.Arrange(new Rect(0, 0, 100, 100));

        const dc = new CapturingContext();
        b.Render(dc);

        // 4 sides — 4 fills. None should carry a pen.
        assert.equal(dc.rects.length, 4);
        for (const r of dc.rects)
        {
            assert.equal(r.brush, b.BorderBrush);
            assert.equal(r.pen, undefined);
        }
        // Side order: Top, Bottom, Left, Right.
        assert.ok(dc.rects[0]!.rect.Equals(new Rect(0, 0, 100, 2)),
            'Top spans full width × 2');
        assert.ok(dc.rects[1]!.rect.Equals(new Rect(0, 96, 100, 4)),
            'Bottom spans full width × 4 at the bottom');
        assert.ok(dc.rects[2]!.rect.Equals(new Rect(0, 2, 1, 94)),
            'Left fits between Top and Bottom × 1 wide');
        assert.ok(dc.rects[3]!.rect.Equals(new Rect(97, 2, 3, 94)),
            'Right fits between Top and Bottom × 3 wide');
    });

    test('zero side is skipped (only 3 rects when one side is 0)', () => {
        const b = new Border();
        b.BorderBrush     = new SolidColorBrush(Color.Black);
        b.BorderThickness = new Thickness(2, 2, 0, 2); // no Right
        b.Measure(new Size(50, 50));
        b.Arrange(new Rect(0, 0, 50, 50));

        const dc = new CapturingContext();
        b.Render(dc);

        // Top + Bottom + Left = 3 rects. Right (0) is skipped.
        assert.equal(dc.rects.length, 3);
    });

    test('asymmetric thickness with Fill paints Fill full, then sides on top', () => {
        const b = new Border();
        b.Fill      = new SolidColorBrush(Color.White);
        b.BorderBrush     = new SolidColorBrush(Color.Black);
        b.BorderThickness = new Thickness(2, 4, 6, 8);
        b.Measure(new Size(100, 100));
        b.Arrange(new Rect(0, 0, 100, 100));

        const dc = new CapturingContext();
        b.Render(dc);

        // 1 background + 4 side rects = 5 emits.
        assert.equal(dc.rects.length, 5);
        // Fill first.
        assert.equal(dc.rects[0]!.brush, b.Fill);
        assert.ok(dc.rects[0]!.rect.Equals(new Rect(0, 0, 100, 100)));
        // Sides follow.
        for (let i = 1; i < 5; i++)
        {
            assert.equal(dc.rects[i]!.brush, b.BorderBrush);
        }
    });

    test('uniform thickness still uses the single stroked-rect path', () => {
        const b = new Border();
        b.BorderBrush     = new SolidColorBrush(Color.Black);
        b.BorderThickness = new Thickness(3); // uniform
        b.Measure(new Size(100, 100));
        b.Arrange(new Rect(0, 0, 100, 100));

        const dc = new CapturingContext();
        b.Render(dc);

        // One stroke, not four fills.
        assert.equal(dc.rects.length, 1);
        assert.equal(dc.rects[0]!.brush, undefined);
        assert.equal(dc.rects[0]!.pen!.Thickness, 3);
    });
});

describe('Border render — CornerRadius', () => {
    test('CornerRadius=0 uses DrawRectangle (no radii on captured payload)', () => {
        const b = new Border();
        b.Fill = new SolidColorBrush(Color.Red);
        b.Measure(new Size(100, 100));
        b.Arrange(new Rect(0, 0, 100, 100));

        const dc = new CapturingContext();
        b.Render(dc);

        assert.equal(dc.rects.length, 1);
        assert.equal(dc.rects[0]!.radiusX, undefined,
            'no radius field — DrawRectangle path was taken');
    });

    test('CornerRadius>0 routes Fill through DrawRoundedRectangle', () => {
        const b = new Border();
        b.Fill = new SolidColorBrush(Color.Red);
        b.CornerRadius = 12;
        b.Measure(new Size(100, 100));
        b.Arrange(new Rect(0, 0, 100, 100));

        const dc = new CapturingContext();
        b.Render(dc);

        assert.equal(dc.rects.length, 1);
        const r = dc.rects[0]!;
        assert.equal(r.brush, b.Fill);
        assert.equal(r.pen, undefined);
        assert.equal(r.radiusX, 12);
        assert.equal(r.radiusY, 12);
        assert.ok(r.rect.Equals(new Rect(0, 0, 100, 100)));
    });

    test('CornerRadius>0 with stroke insets the corner by half the thickness', () => {
        const b = new Border();
        b.BorderBrush     = new SolidColorBrush(Color.Black);
        b.BorderThickness = new Thickness(4);
        b.CornerRadius    = 12;
        b.Measure(new Size(100, 100));
        b.Arrange(new Rect(0, 0, 100, 100));

        const dc = new CapturingContext();
        b.Render(dc);

        assert.equal(dc.rects.length, 1);
        const r = dc.rects[0]!;
        // Stroke-only call: no fill, pen with thickness=4.
        assert.equal(r.brush, undefined);
        assert.equal(r.pen!.Thickness, 4);
        // Inner radius = outer 12 - half-stroke 2 = 10.
        assert.equal(r.radiusX, 10);
        assert.equal(r.radiusY, 10);
        // Inner rect inset by 2 on each side.
        assert.ok(r.rect.Equals(new Rect(2, 2, 96, 96)));
    });

    test('CornerRadius smaller than half-stroke clamps inner radius to 0', () => {
        const b = new Border();
        b.BorderBrush     = new SolidColorBrush(Color.Black);
        b.BorderThickness = new Thickness(20);  // half = 10
        b.CornerRadius    = 4;                  // less than half-stroke
        b.Measure(new Size(100, 100));
        b.Arrange(new Rect(0, 0, 100, 100));

        const dc = new CapturingContext();
        b.Render(dc);

        assert.equal(dc.rects[0]!.radiusX, 0,
            'inner radius clamped to zero — corner becomes sharp');
    });

    test('CornerRadius with both Fill and Stroke emits two rounded calls', () => {
        const b = new Border();
        b.Fill      = new SolidColorBrush(Color.White);
        b.BorderBrush     = new SolidColorBrush(Color.Black);
        b.BorderThickness = new Thickness(2);
        b.CornerRadius    = 8;
        b.Measure(new Size(50, 50));
        b.Arrange(new Rect(0, 0, 50, 50));

        const dc = new CapturingContext();
        b.Render(dc);

        assert.equal(dc.rects.length, 2);
        // Fill first (radius=8 outer).
        assert.equal(dc.rects[0]!.radiusX, 8);
        // Stroke second (radius=8 - half=1 = 7).
        assert.equal(dc.rects[1]!.radiusX, 7);
    });

    test('CornerRadius.Full clamps to min(width, height)/2 — wide rect → stadium', () => {
        const b = new Border();
        b.Fill   = new SolidColorBrush(Color.Red);
        b.CornerRadius = CornerRadius.Full;
        b.Measure(new Size(200, 40));
        b.Arrange(new Rect(0, 0, 200, 40));

        const dc = new CapturingContext();
        b.Render(dc);

        assert.equal(dc.rects.length, 1);
        const r = dc.rects[0]!;
        // Half the shorter side — height was 40, so radius = 20.
        assert.equal(r.radiusX, 20);
        assert.equal(r.radiusY, 20);
    });

    test('CornerRadius.Full on a square rect produces a circle', () => {
        const b = new Border();
        b.Fill   = new SolidColorBrush(Color.Red);
        b.CornerRadius = CornerRadius.Full;
        b.Measure(new Size(64, 64));
        b.Arrange(new Rect(0, 0, 64, 64));

        const dc = new CapturingContext();
        b.Render(dc);

        assert.equal(dc.rects[0]!.radiusX, 32);
        assert.equal(dc.rects[0]!.radiusY, 32);
    });

    test('CornerRadius.Full with stroke insets the inner radius by half the thickness', () => {
        const b = new Border();
        b.BorderBrush     = new SolidColorBrush(Color.Black);
        b.BorderThickness = new Thickness(4);
        b.CornerRadius    = CornerRadius.Full;
        b.Measure(new Size(80, 40));
        b.Arrange(new Rect(0, 0, 80, 40));

        const dc = new CapturingContext();
        b.Render(dc);

        assert.equal(dc.rects.length, 1);
        // Outer radius = min(80,40)/2 = 20. Inner = 20 - 4/2 = 18.
        assert.equal(dc.rects[0]!.radiusX, 18);
        assert.equal(dc.rects[0]!.radiusY, 18);
    });

    test('CornerRadius.Full is a CornerRadius with every corner Number.POSITIVE_INFINITY', () => {
        // Documenting the sentinel encoding — render-side code keys off
        // !Number.isFinite on EACH corner independently, so anyone
        // introducing a NEW sentinel (e.g. a `Half` family) needs to
        // keep that recognition path in sync. Each corner non-finite
        // gets folded to min(width, height) / 2 at paint time.
        assert.ok(CornerRadius.Full instanceof CornerRadius);
        assert.equal(CornerRadius.Full.TopLeft,     Number.POSITIVE_INFINITY);
        assert.equal(CornerRadius.Full.TopRight,    Number.POSITIVE_INFINITY);
        assert.equal(CornerRadius.Full.BottomRight, Number.POSITIVE_INFINITY);
        assert.equal(CornerRadius.Full.BottomLeft,  Number.POSITIVE_INFINITY);
    });

    test('CornerRadius asymmetric (Full, 0, 0, Full) paints rounded outer ends only', () => {
        // The connected-bar shape ToolBar's First button uses: rounded
        // top-left + bottom-left, square top-right + bottom-right.
        // The renderer can't lower this to a primitive `<rect rx ry>`,
        // so it falls back to a PathGeometry via DrawGeometry. We
        // assert the geometry path was taken (no rounded-rect call).
        const b = new Border();
        b.Fill = new SolidColorBrush(Color.Red);
        b.CornerRadius = new CornerRadius(
            Number.POSITIVE_INFINITY, 0, 0, Number.POSITIVE_INFINITY);
        b.Measure(new Size(200, 40));
        b.Arrange(new Rect(0, 0, 200, 40));

        const dc = new CapturingContext();
        b.Render(dc);

        // Non-uniform corners — the rounded-rect primitive isn't usable,
        // so the background flows through DrawGeometry (captured into
        // `geometries`, not `rects`).
        assert.equal(dc.rects.length, 0);
        assert.equal(dc.geometries.length, 1);
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

    test('changing Fill leaves measure and arrange valid (Render-only)', () => {
        const b = new Border();
        b.Measure(new Size(100, 100));
        b.Arrange(new Rect(0, 0, 100, 100));

        b.Fill = new SolidColorBrush(Color.Red);
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

