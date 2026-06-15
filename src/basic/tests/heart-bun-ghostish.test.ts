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
    CubicBezierSegment,
    PathGeometry,
    Pen,
    SolidColorBrush,
} from '../../visual-engine/index.js';
import { Heart } from '../shapes/heart.js';
import { Bun } from '../shapes/bun.js';
import { Ghostish } from '../shapes/ghostish.js';

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

function renderVisual(v: Heart | Bun | Ghostish, w: number, h: number): CapturingContext
{
    v.Measure(new Size(w, h));
    v.Arrange(new Rect(0, 0, w, h));
    const dc = new CapturingContext();
    v.Render(dc);
    return dc;
}

describe('Heart', () => {
    test('emits one closed figure with 4 cubic Beziers (lobes + sides)', () => {
        const h = new Heart();
        h.Background = new SolidColorBrush(Color.Red);
        const dc = renderVisual(h, 100, 100);
        const fig = (dc.geoms[0]!.geometry as PathGeometry).Figures[0]!;
        assert.equal(fig.Segments.length, 4);
        for (const seg of fig.Segments) assert.ok(seg instanceof CubicBezierSegment);
        assert.ok(fig.IsClosed);
    });

    test('point sits at the bottom centre', () => {
        const h = new Heart();
        const dc = renderVisual(h, 200, 200);
        const fig = (dc.geoms[0]!.geometry as PathGeometry).Figures[0]!;
        // 2nd segment (valley → point) ends at the point.
        const seg = fig.Segments[1] as CubicBezierSegment;
        assert.equal(seg.Point3.X, 100);  // cx
        assert.equal(seg.Point3.Y, 200);  // bottom
    });

    test('zero-size skips render', () => {
        const dc = renderVisual(new Heart(), 0, 50);
        assert.equal(dc.geoms.length, 0);
    });
});

describe('Bun', () => {
    test('defaults: Waist=0.85', () => {
        assert.equal(new Bun().Waist, 0.85);
    });

    test('emits one closed figure with 4 cubic Beziers (one per quadrant)', () => {
        const b = new Bun();
        const dc = renderVisual(b, 100, 100);
        const fig = (dc.geoms[0]!.geometry as PathGeometry).Figures[0]!;
        assert.equal(fig.Segments.length, 4);
        for (const seg of fig.Segments) assert.ok(seg instanceof CubicBezierSegment);
    });

    test('Waist clamps to [0.2, 1]', () => {
        const b = new Bun();
        b.Waist = -5;
        const dc1 = renderVisual(b, 100, 100);
        assert.equal(dc1.geoms.length, 1);  // doesn't crash
        b.Waist = 10;
        const dc2 = renderVisual(b, 100, 100);
        assert.equal(dc2.geoms.length, 1);
    });
});

describe('Ghostish', () => {
    test('defaults: ScallopCount=3', () => {
        assert.equal(new Ghostish().ScallopCount, 3);
    });

    test('emits top-arc + right-side + N-scallops + left-side', () => {
        const g = new Ghostish();
        g.ScallopCount = 3;
        const dc = renderVisual(g, 100, 200);
        const fig = (dc.geoms[0]!.geometry as PathGeometry).Figures[0]!;
        // 1 top arc + 1 right line + 3 scallop arcs + 1 left line = 6 segments
        assert.equal(fig.Segments.length, 6);
        assert.ok(fig.Segments[0] instanceof ArcSegment, 'top arc');
        assert.ok(fig.Segments[2] instanceof ArcSegment, 'scallop arc');
        assert.ok(fig.IsClosed);
    });

    test('higher ScallopCount adds more scallop arcs', () => {
        const g = new Ghostish();
        g.ScallopCount = 5;
        const dc = renderVisual(g, 100, 200);
        const fig = (dc.geoms[0]!.geometry as PathGeometry).Figures[0]!;
        // 1 top + 1 right + 5 scallops + 1 left = 8 segments
        assert.equal(fig.Segments.length, 8);
    });
});
