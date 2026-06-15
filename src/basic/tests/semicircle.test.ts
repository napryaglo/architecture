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
import { Semicircle } from '../shapes/semicircle.js';

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

function render(s: Semicircle, w: number, h: number): CapturingContext
{
    s.Measure(new Size(w, h));
    s.Arrange(new Rect(0, 0, w, h));
    const dc = new CapturingContext();
    s.Render(dc);
    return dc;
}

describe('Semicircle', () => {
    test('arc spans the full width and full height of the rect', () => {
        const s = new Semicircle();
        s.Background = new SolidColorBrush(Color.Red);
        const dc = render(s, 200, 100);
        const fig = (dc.geoms[0]!.geometry as PathGeometry).Figures[0]!;
        const arc = fig.Segments[0] as ArcSegment;
        assert.ok(arc instanceof ArcSegment);
        assert.equal(arc.Size.Width, 100);  // rx = w/2
        assert.equal(arc.Size.Height, 100); // ry = h
    });

    test('base line closes from arc-end back to start', () => {
        const s = new Semicircle();
        const dc = render(s, 200, 100);
        const fig = (dc.geoms[0]!.geometry as PathGeometry).Figures[0]!;
        assert.equal(fig.Segments.length, 2);
        assert.ok(fig.Segments[1] instanceof LineSegment);
    });

    test('zero-size skips render', () => {
        const s = new Semicircle();
        const dc = render(s, 0, 50);
        assert.equal(dc.geoms.length, 0);
    });
});
