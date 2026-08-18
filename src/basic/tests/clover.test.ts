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
    SolidColorBrush,
} from '../../visual-engine/index.js';
import { Clover, FourLeafClover, EightLeafClover } from '../shapes/clover.js';

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

function render(c: Clover, w: number, h: number): CapturingContext
{
    c.Measure(new Size(w, h));
    c.Arrange(new Rect(0, 0, w, h));
    const dc = new CapturingContext();
    c.Render(dc);
    return dc;
}

describe('Clover defaults', () => {
    test('Leaves=4, CuspDepth=0.6, Rotation=-90, Samples=24', () => {
        const c = new Clover();
        assert.equal(c.Leaves, 4);
        assert.equal(c.CuspDepth, 0.6);
        assert.equal(c.Rotation, -90);
        assert.equal(c.Samples, 24);
    });
});

describe('Clover render', () => {
    test('emits one closed figure with N · Samples − 1 line segments', () => {
        const c = new Clover();
        c.Fill = new SolidColorBrush(Color.Red);
        c.Leaves = 4;
        c.Samples = 16;
        const dc = render(c, 100, 100);
        const fig = (dc.geoms[0]!.geometry as PathGeometry).Figures[0]!;
        assert.equal(fig.Segments.length, 4 * 16 - 1);
        assert.ok(fig.IsClosed);
    });

    test('peak radius reaches the inscribing ellipse (within 1px tolerance)', () => {
        const c = new Clover();
        c.Leaves = 4;
        c.Samples = 32;
        const dc = render(c, 200, 200);  // rx = ry = 100
        const fig = (dc.geoms[0]!.geometry as PathGeometry).Figures[0]!;
        // Among all sampled points, the furthest from the centre (100,100)
        // should be ~100 (touches the ellipse).
        let maxR = 0;
        // StartPoint is the first sample; iterate it and the segment endpoints.
        maxR = Math.max(maxR, dist(fig.StartPoint.X, fig.StartPoint.Y, 100, 100));
        for (const seg of fig.Segments)
        {
            const p = (seg as { Point: { X: number, Y: number } }).Point;
            maxR = Math.max(maxR, dist(p.X, p.Y, 100, 100));
        }
        assert.ok(Math.abs(maxR - 100) < 1.5,
            `expected max radius ~100, got ${maxR}`);
    });

    test('CuspDepth=0 collapses to an ellipse (all sample radii ≈ outer)', () => {
        const c = new Clover();
        c.CuspDepth = 0;
        c.Leaves = 4;
        c.Samples = 16;
        const dc = render(c, 200, 200);
        const fig = (dc.geoms[0]!.geometry as PathGeometry).Figures[0]!;
        let minR = Infinity, maxR = 0;
        minR = Math.min(minR, dist(fig.StartPoint.X, fig.StartPoint.Y, 100, 100));
        maxR = Math.max(maxR, dist(fig.StartPoint.X, fig.StartPoint.Y, 100, 100));
        for (const seg of fig.Segments)
        {
            const p = (seg as { Point: { X: number, Y: number } }).Point;
            minR = Math.min(minR, dist(p.X, p.Y, 100, 100));
            maxR = Math.max(maxR, dist(p.X, p.Y, 100, 100));
        }
        assert.ok(Math.abs(maxR - minR) < 0.01,
            `expected uniform radius (ellipse), got min=${minR}, max=${maxR}`);
    });

    test('CuspDepth=1 cusps reach the centre', () => {
        const c = new Clover();
        c.CuspDepth = 1;
        c.Leaves = 4;
        c.Samples = 64;  // dense sampling to catch the cusp samples
        const dc = render(c, 200, 200);
        const fig = (dc.geoms[0]!.geometry as PathGeometry).Figures[0]!;
        let minR = Infinity;
        for (const seg of fig.Segments)
        {
            const p = (seg as { Point: { X: number, Y: number } }).Point;
            minR = Math.min(minR, dist(p.X, p.Y, 100, 100));
        }
        // At least one sample lands very close to the centre.
        assert.ok(minR < 5, `expected a cusp at centre, got min radius ${minR}`);
    });

    test('zero-size skips render', () => {
        const c = new Clover();
        const dc = render(c, 0, 50);
        assert.equal(dc.geoms.length, 0);
    });
});

describe('Clover aliases', () => {
    test('FourLeafClover defaults to 4 leaves', () => {
        assert.equal(new FourLeafClover().Leaves, 4);
    });
    test('EightLeafClover defaults to 8 leaves', () => {
        assert.equal(new EightLeafClover().Leaves, 8);
    });
});

function dist(x: number, y: number, cx: number, cy: number): number
{
    return Math.hypot(x - cx, y - cy);
}
