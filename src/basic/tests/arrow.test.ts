import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    Color,
    Rect,
    Size,
    type DrawingContext,
} from '../../runtime/index.js';
import {
    Brush,
    PathGeometry,
    Pen,
    QuadraticBezierSegment,
    SolidColorBrush,
} from '../../visual-engine/index.js';
import { Arrow } from '../shapes/arrow.js';

interface CapturedGeom { brush: Brush | undefined; pen: Pen | undefined; geometry: unknown; }

class CapturingContext implements DrawingContext
{
    public geoms: CapturedGeom[] = [];
    DrawGeometry(b: Brush | undefined, p: Pen | undefined, g: unknown): void
    { this.geoms.push({ brush: b, pen: p, geometry: g }); }
    DrawRectangle(): void { throw new Error('not used'); }
    DrawText():      void { throw new Error('not used'); }
    PushTransform(): void { /* no-op */ }
    PushClip():      void { /* no-op */ }
    Pop():           void { /* no-op */ }
}

function render(a: Arrow, w: number, h: number): CapturingContext
{
    a.Measure(new Size(w, h));
    a.Arrange(new Rect(0, 0, w, h));
    const dc = new CapturingContext();
    a.Render(dc);
    return dc;
}

describe('Arrow', () => {
    test('defaults: BowDepth=0.15, CornerRadius=0', () => {
        const a = new Arrow();
        assert.equal(a.BowDepth, 0.15);
        assert.equal(a.CornerRadius, 0);
    });

    test('sharp arrow: line + quad-bezier (bowed base) + line, closed', () => {
        const a = new Arrow();
        a.Background = new SolidColorBrush(Color.Red);
        const dc = render(a, 100, 100);
        const fig = (dc.geoms[0]!.geometry as PathGeometry).Figures[0]!;
        assert.equal(fig.Segments.length, 3);
        // Middle segment is the bowed base (quad bezier).
        assert.ok(fig.Segments[1] instanceof QuadraticBezierSegment);
    });

    test('bow control point sits BowDepth × H above the bottom midpoint', () => {
        const a = new Arrow();
        a.BowDepth = 0.2;
        const dc = render(a, 100, 100);
        const fig = (dc.geoms[0]!.geometry as PathGeometry).Figures[0]!;
        const bow = fig.Segments[1] as QuadraticBezierSegment;
        // Control should be at (50, 80) — midpoint X, bottom - 0.2 * H.
        assert.equal(bow.Point1.X, 50);
        assert.equal(bow.Point1.Y, 80);
    });

    test('rounded arrow: 3 lines + 3 quad-Beziers + 1 bowed-base quad', () => {
        const a = new Arrow();
        a.CornerRadius = 10;
        const dc = render(a, 100, 100);
        const fig = (dc.geoms[0]!.geometry as PathGeometry).Figures[0]!;
        // Round-arrow path: L, Q(br), Q(base), Q(bl), L, Q(top)
        assert.equal(fig.Segments.length, 6);
    });

    test('zero-size skips render', () => {
        const a = new Arrow();
        const dc = render(a, 0, 50);
        assert.equal(dc.geoms.length, 0);
    });
});
