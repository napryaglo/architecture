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
import {
    Cookie,
    Diamond,
    Pentagon,
    Gem,
    FourSidedCookie,
    SixSidedCookie,
    SevenSidedCookie,
    NineSidedCookie,
    TwelveSidedCookie,
} from '../shapes/cookie.js';

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

function render(c: Cookie, w: number, h: number): CapturingContext
{
    c.Measure(new Size(w, h));
    c.Arrange(new Rect(0, 0, w, h));
    const dc = new CapturingContext();
    c.Render(dc);
    return dc;
}

describe('Cookie defaults', () => {
    test('fresh Cookie: Sides=6, Rotation=-90, CornerRadius=0', () => {
        const c = new Cookie();
        assert.equal(c.Sides, 6);
        assert.equal(c.Rotation, -90);
        assert.equal(c.CornerRadius, 0);
    });
});

describe('Cookie render', () => {
    test('sharp N-gon: N-1 line segments (closing happens via IsClosed)', () => {
        const c = new Cookie();
        c.Fill = new SolidColorBrush(Color.Red);
        c.Sides = 5;
        const dc = render(c, 100, 100);
        const fig = (dc.geoms[0]!.geometry as PathGeometry).Figures[0]!;
        assert.equal(fig.Segments.length, 4);
        for (const seg of fig.Segments) assert.ok(seg instanceof LineSegment);
        assert.ok(fig.IsClosed);
    });

    test('rounded N-gon: 2·N segments (L+Q per vertex)', () => {
        const c = new Cookie();
        c.Sides = 6;
        c.CornerRadius = 5;
        const dc = render(c, 100, 100);
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

    test('Sides < 3 clamped to 3 (triangle)', () => {
        const c = new Cookie();
        c.Sides = 2;
        const dc = render(c, 100, 100);
        const fig = (dc.geoms[0]!.geometry as PathGeometry).Figures[0]!;
        // 3-1 = 2 segments
        assert.equal(fig.Segments.length, 2);
    });

    test('Rotation=-90 puts the first vertex at the top centre', () => {
        const c = new Cookie();
        c.Sides = 4;
        // Rotation defaults to -90 — vertex 0 at top.
        const dc = render(c, 100, 100);
        const fig = (dc.geoms[0]!.geometry as PathGeometry).Figures[0]!;
        // Vertex 0 is at angle phi0 = -90° → cos(-π/2)=0, sin(-π/2)=-1.
        // So point = (cx + rx*0, cy + ry*(-1)) = (cx, cy - ry) = (50, 0).
        assert.ok(Math.abs(fig.StartPoint.X - 50) < 0.0001);
        assert.ok(Math.abs(fig.StartPoint.Y - 0)  < 0.0001);
    });

    test('zero-size skips render', () => {
        const c = new Cookie();
        const dc = render(c, 0, 50);
        assert.equal(dc.geoms.length, 0);
    });
});

describe('Cookie aliases override Sides via metadata', () => {
    test('FourSidedCookie defaults to 4 sides', () => {
        const c = new FourSidedCookie();
        assert.equal(c.Sides, 4);
    });
    test('SixSidedCookie defaults to 6 sides', () => {
        assert.equal(new SixSidedCookie().Sides, 6);
    });
    test('SevenSidedCookie defaults to 7 sides', () => {
        assert.equal(new SevenSidedCookie().Sides, 7);
    });
    test('NineSidedCookie defaults to 9 sides', () => {
        assert.equal(new NineSidedCookie().Sides, 9);
    });
    test('TwelveSidedCookie defaults to 12 sides', () => {
        assert.equal(new TwelveSidedCookie().Sides, 12);
    });
    test('Diamond defaults to 4 sides, -90 rotation', () => {
        const d = new Diamond();
        assert.equal(d.Sides, 4);
        assert.equal(d.Rotation, -90);
    });
    test('Pentagon defaults to 5 sides', () => {
        assert.equal(new Pentagon().Sides, 5);
    });
    test('Gem defaults to 6 sides, 0 rotation (flat-top)', () => {
        const g = new Gem();
        assert.equal(g.Sides, 6);
        assert.equal(g.Rotation, 0);
    });
});
