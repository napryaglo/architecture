import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    Color,
    Rect,
    Size,
    type DrawingContext,
} from '../../runtime/index.js';
import {
    ArcSegment,
    Brush,
    LineSegment,
    PathGeometry,
    Pen,
    SolidColorBrush,
} from '../../visual-engine/index.js';
import { Fan, FanPivot } from '../shapes/fan.js';

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

function render(f: Fan, w: number, h: number): CapturingContext
{
    f.Measure(new Size(w, h));
    f.Arrange(new Rect(0, 0, w, h));
    const dc = new CapturingContext();
    f.Render(dc);
    return dc;
}

describe('Fan', () => {
    test('default pivot is BottomLeft', () => {
        const f = new Fan();
        assert.equal(f.Pivot, FanPivot.BottomLeft);
    });

    test('Bottom-left pivot: figure starts at (0, H), arc ends at (W, H)', () => {
        const f = new Fan();
        f.Fill = new SolidColorBrush(Color.Red);
        const dc = render(f, 100, 100);
        const fig = (dc.geoms[0]!.geometry as PathGeometry).Figures[0]!;
        assert.equal(fig.StartPoint.X, 0);
        assert.equal(fig.StartPoint.Y, 100);
        const arc = fig.Segments[1] as ArcSegment;
        assert.equal(arc.Point.X, 100);
        assert.equal(arc.Point.Y, 100);
    });

    test('Top-right pivot anchors at (W, 0)', () => {
        const f = new Fan();
        f.Pivot = FanPivot.TopRight;
        const dc = render(f, 100, 100);
        const fig = (dc.geoms[0]!.geometry as PathGeometry).Figures[0]!;
        assert.equal(fig.StartPoint.X, 100);
        assert.equal(fig.StartPoint.Y, 0);
    });

    test('emits one line + one arc + closing line', () => {
        const f = new Fan();
        const dc = render(f, 100, 100);
        const fig = (dc.geoms[0]!.geometry as PathGeometry).Figures[0]!;
        assert.equal(fig.Segments.length, 3);
        assert.ok(fig.Segments[0] instanceof LineSegment);
        assert.ok(fig.Segments[1] instanceof ArcSegment);
        assert.ok(fig.Segments[2] instanceof LineSegment);
    });

    test('zero-size skips render', () => {
        const f = new Fan();
        const dc = render(f, 0, 50);
        assert.equal(dc.geoms.length, 0);
    });
});
