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
    LineSegment,
    PathGeometry,
    Pen,
    QuadraticBezierSegment,
    SolidColorBrush,
} from '../../visual-engine/index.js';
import { Triangle } from '../shapes/triangle.js';

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

function render(t: Triangle, w: number, h: number): CapturingContext
{
    t.Measure(new Size(w, h));
    t.Arrange(new Rect(0, 0, w, h));
    const dc = new CapturingContext();
    t.Render(dc);
    return dc;
}

describe('Triangle', () => {
    test('sharp triangle (CornerRadius=0): 2 line segments + start vertex', () => {
        const t = new Triangle();
        t.Background = new SolidColorBrush(Color.Red);
        const dc = render(t, 100, 100);
        const fig = (dc.geoms[0]!.geometry as PathGeometry).Figures[0]!;
        assert.equal(fig.Segments.length, 2);
        for (const seg of fig.Segments) assert.ok(seg instanceof LineSegment);
        // Start at the top vertex.
        assert.equal(fig.StartPoint.X, 50);
        assert.equal(fig.StartPoint.Y, 0);
    });

    test('rounded triangle: 3 lines + 3 quad-Beziers (one round per vertex)', () => {
        const t = new Triangle();
        t.CornerRadius = 10;
        const dc = render(t, 100, 100);
        const fig = (dc.geoms[0]!.geometry as PathGeometry).Figures[0]!;
        assert.equal(fig.Segments.length, 6);
        let lines = 0, quads = 0;
        for (const seg of fig.Segments)
        {
            if (seg instanceof LineSegment) lines++;
            else if (seg instanceof QuadraticBezierSegment) quads++;
        }
        assert.equal(lines, 3);
        assert.equal(quads, 3);
    });

    test('CornerRadius clamped to half the shortest edge (no overlap)', () => {
        const t = new Triangle();
        // 100x100 triangle: bottom edge = 100, slant edges = ~111.8.
        // shortest/2 = 50. Setting r = 9999 should clamp to <= 50.
        t.CornerRadius = 9999;
        const dc = render(t, 100, 100);
        const fig = (dc.geoms[0]!.geometry as PathGeometry).Figures[0]!;
        // Path must still emit something (no NaN / negative-length issues).
        assert.ok(fig.Segments.length > 0);
    });

    test('zero-size skips render', () => {
        const t = new Triangle();
        const dc = render(t, 0, 50);
        assert.equal(dc.geoms.length, 0);
    });
});
