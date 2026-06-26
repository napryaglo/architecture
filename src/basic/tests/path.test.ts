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
    SolidColorBrush,
} from '../../visual-engine/index.js';
import { Path } from '../shapes/path.js';

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

describe('Path — Data → Geometry', () => {
    test('parses an SVG path-data string into a single-figure PathGeometry', () => {
        const p = new Path();
        p.Data = 'M 0,0 L -12,-6 L -12,6 Z';
        const g = p.Geometry;
        assert.ok(g instanceof PathGeometry, 'Geometry is a PathGeometry');
        assert.equal(g.Figures.length, 1);
        const fig = g.Figures[0]!;
        assert.equal(fig.StartPoint.X, 0);
        assert.equal(fig.StartPoint.Y, 0);
        // Two LineSegments (the Z close doesn't add a segment).
        assert.equal(fig.Segments.length, 2);
        assert.ok(fig.Segments.every(s => s instanceof LineSegment));
        assert.equal(fig.IsClosed, true);
        const last = fig.Segments[1] as LineSegment;
        assert.equal(last.Point.X, -12);
        assert.equal(last.Point.Y, 6);
    });

    test('re-assigning Data swaps the Geometry', () => {
        const p = new Path();
        p.Data = 'M 0,0 L 10,0';
        const first = p.Geometry;
        p.Data = 'M 0,0 L 0,20';
        assert.notEqual(p.Geometry, first);
        const fig = (p.Geometry as PathGeometry).Figures[0]!;
        assert.equal((fig.Segments[0] as LineSegment).Point.Y, 20);
    });

    test('empty Data parses to an empty (zero-figure) geometry', () => {
        const p = new Path();
        p.Data = '';
        assert.equal((p.Geometry as PathGeometry).Figures.length, 0);
    });

    test('default Data is empty string — no geometry until assigned', () => {
        const p = new Path();
        // The DataKey default is '' but no OnPropertyChanged fires for the
        // unset default, so Geometry stays at Shape's undefined default.
        assert.equal(p.Geometry, undefined);
        assert.equal(p.Data, '');
    });
});

describe('Path — layout-free rendering at local origin', () => {
    test('MeasureOverride yields Size.Zero (no intrinsic size)', () => {
        const p = new Path();
        p.Data = 'M 0,0 L 100,0';
        p.Measure(new Size(500, 500));
        assert.equal(p.DesiredSize.Width, 0);
        assert.equal(p.DesiredSize.Height, 0);
    });

    test('paints the authored geometry verbatim, including negative coords', () => {
        const p = new Path();
        p.Data = 'M 0,0 L -12,-6 L -12,6 Z';
        p.Fill = new SolidColorBrush(Color.FromHex('#112233'));
        p.Measure(new Size(0, 0));
        p.Arrange(new Rect(0, 0, 0, 0));
        const dc = new CapturingContext();
        p.Render(dc);
        assert.equal(dc.geoms.length, 1);
        const fig = (dc.geoms[0]!.geometry as PathGeometry).Figures[0]!;
        // The −12,−6 vertex survives — no clamp to the layout rect.
        assert.equal((fig.Segments[0] as LineSegment).Point.X, -12);
        assert.equal((fig.Segments[0] as LineSegment).Point.Y, -6);
    });
});
