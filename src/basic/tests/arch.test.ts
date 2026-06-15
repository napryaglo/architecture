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
import { Arch } from '../shapes/arch.js';

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

function render(a: Arch, w: number, h: number): CapturingContext
{
    a.Measure(new Size(w, h));
    a.Arrange(new Rect(0, 0, w, h));
    const dc = new CapturingContext();
    a.Render(dc);
    return dc;
}

describe('Arch', () => {
    test('emits one figure: arc + two lines, closed', () => {
        const a = new Arch();
        a.Background = new SolidColorBrush(Color.Red);
        const dc = render(a, 100, 200);
        const path = dc.geoms[0]!.geometry as PathGeometry;
        const fig = path.Figures[0]!;
        assert.equal(fig.Segments.length, 3);
        assert.ok(fig.Segments[0] instanceof ArcSegment);
        assert.ok(fig.Segments[1] instanceof LineSegment);
        assert.ok(fig.Segments[2] instanceof LineSegment);
        assert.ok(fig.IsClosed);
    });

    test('archHeight = W/2 when H >= W/2 (perfect doorway)', () => {
        const a = new Arch();
        const dc = render(a, 100, 300);  // h >> w/2
        const fig = (dc.geoms[0]!.geometry as PathGeometry).Figures[0]!;
        const arc = fig.Segments[0] as ArcSegment;
        // Arc radii: rx = w/2 = 50, ry = archHeight = w/2 = 50.
        assert.equal(arc.Size.Width, 50);
        assert.equal(arc.Size.Height, 50);
    });

    test('archHeight clamps to H when H < W/2 (flat arch)', () => {
        const a = new Arch();
        const dc = render(a, 300, 50);   // h < w/2
        const fig = (dc.geoms[0]!.geometry as PathGeometry).Figures[0]!;
        const arc = fig.Segments[0] as ArcSegment;
        assert.equal(arc.Size.Width, 150);  // w/2
        assert.equal(arc.Size.Height, 50);  // clamped to h
    });

    test('zero-size skips render', () => {
        const a = new Arch();
        const dc = render(a, 0, 50);
        assert.equal(dc.geoms.length, 0);
    });
});
