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
import { Clamshell } from '../shapes/clamshell.js';

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

function render(c: Clamshell, w: number, h: number): CapturingContext
{
    c.Measure(new Size(w, h));
    c.Arrange(new Rect(0, 0, w, h));
    const dc = new CapturingContext();
    c.Render(dc);
    return dc;
}

describe('Clamshell', () => {
    test('sharp hex (CornerRadius=0): 5 line segments closing the 6-vertex polygon', () => {
        const c = new Clamshell();
        c.Background = new SolidColorBrush(Color.Red);
        const dc = render(c, 200, 100);
        const fig = (dc.geoms[0]!.geometry as PathGeometry).Figures[0]!;
        // StartPoint = V0; segments walk V1..V5 → 5 LineSegments.
        assert.equal(fig.Segments.length, 5);
        for (const seg of fig.Segments) assert.ok(seg instanceof LineSegment);
        assert.ok(fig.IsClosed);
    });

    test('rounded hex: 6 round-corner Beziers + 6 edge lines (one of each per vertex)', () => {
        const c = new Clamshell();
        c.CornerRadius = 10;
        const dc = render(c, 200, 100);
        const fig = (dc.geoms[0]!.geometry as PathGeometry).Figures[0]!;
        assert.equal(fig.Segments.length, 12);
        let lines = 0, quads = 0;
        for (const seg of fig.Segments)
        {
            if (seg instanceof LineSegment) lines++;
            else if (seg instanceof QuadraticBezierSegment) quads++;
        }
        assert.equal(lines, 6);
        assert.equal(quads, 6);
    });

    test('start vertex (top-left flat) sits at (W·0.25, 0)', () => {
        const c = new Clamshell();
        const dc = render(c, 200, 100);
        const fig = (dc.geoms[0]!.geometry as PathGeometry).Figures[0]!;
        assert.equal(fig.StartPoint.X, 50);
        assert.equal(fig.StartPoint.Y, 0);
    });

    test('zero-size skips render', () => {
        const c = new Clamshell();
        const dc = render(c, 0, 50);
        assert.equal(dc.geoms.length, 0);
    });
});
