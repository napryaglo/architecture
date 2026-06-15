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
    CubicBezierSegment,
    PathGeometry,
    Pen,
    SolidColorBrush,
} from '../../visual-engine/index.js';
import { Squircle } from '../shapes/squircle.js';

interface CapturedGeom { brush: Brush | undefined; pen: Pen | undefined; geometry: unknown; }

class CapturingContext implements DrawingContext
{
    public geoms: CapturedGeom[] = [];
    DrawGeometry(brush: Brush | undefined, pen: Pen | undefined, geometry: unknown): void
    { this.geoms.push({ brush, pen, geometry }); }
    DrawRectangle(): void { throw new Error('not used'); }
    DrawText():      void { throw new Error('not used'); }
    PushTransform(): void { /* no-op */ }
    PushClip():      void { /* no-op */ }
    Pop():           void { /* no-op */ }
}

function render(s: Squircle, w: number, h: number): CapturingContext
{
    s.Measure(new Size(w, h));
    s.Arrange(new Rect(0, 0, w, h));
    const dc = new CapturingContext();
    s.Render(dc);
    return dc;
}

describe('Squircle defaults', () => {
    test('fresh Squircle has no fill / no stroke / superness 4', () => {
        const s = new Squircle();
        assert.equal(s.Background, undefined);
        assert.equal(s.Stroke, undefined);
        assert.equal(s.StrokeThickness, 0);
        assert.equal(s.Superness, 4);
    });

    test('MeasureOverride returns Size.Zero', () => {
        const s = new Squircle();
        s.Measure(new Size(500, 500));
        assert.ok(s.DesiredSize.Equals(Size.Zero));
    });
});

describe('Squircle render', () => {
    test('emits one PathGeometry figure with 4 cubic Bezier segments (4 quadrants)', () => {
        const s = new Squircle();
        s.Background = new SolidColorBrush(Color.Red);
        const dc = render(s, 100, 100);

        assert.equal(dc.geoms.length, 1);
        const path = dc.geoms[0]!.geometry as PathGeometry;
        assert.ok(path instanceof PathGeometry);
        assert.equal(path.Figures.length, 1);
        const figure = path.Figures[0]!;
        assert.equal(figure.Segments.length, 4);
        for (const seg of figure.Segments)
        {
            assert.ok(seg instanceof CubicBezierSegment);
        }
        assert.ok(figure.IsClosed);
    });

    test('Superness=2 produces the canonical Bezier-circle kappa (~0.5523 of the radius)', () => {
        const s = new Squircle();
        s.Superness = 2;
        const dc = render(s, 200, 200);
        const fig = (dc.geoms[0]!.geometry as PathGeometry).Figures[0]!;
        // Quadrant 1 (top → right): start is (100, 0), the first control
        // is at (100 + k * 100, 0). k for n=2 must be ~0.5523.
        const seg1 = fig.Segments[0] as CubicBezierSegment;
        const kRecovered = (seg1.Point1.X - 100) / 100;
        assert.ok(Math.abs(kRecovered - 0.5523) < 0.001,
            `expected Bezier circle constant ~0.5523, got ${kRecovered}`);
    });

    test('Superness larger than 2 pulls handles farther toward the corner', () => {
        const sN2 = new Squircle(); sN2.Superness = 2;
        const sN8 = new Squircle(); sN8.Superness = 8;
        const dc2 = render(sN2, 200, 200);
        const dc8 = render(sN8, 200, 200);
        const k2 = ((dc2.geoms[0]!.geometry as PathGeometry).Figures[0]!.Segments[0] as CubicBezierSegment).Point1.X - 100;
        const k8 = ((dc8.geoms[0]!.geometry as PathGeometry).Figures[0]!.Segments[0] as CubicBezierSegment).Point1.X - 100;
        // Larger n → control closer to corner → larger handle offset.
        assert.ok(k8 > k2, `expected k(8) > k(2), got k2=${k2}, k8=${k8}`);
    });

    test('zero-size RenderSize skips rendering', () => {
        const s = new Squircle();
        const dc = render(s, 0, 0);
        assert.equal(dc.geoms.length, 0);
    });

    test('Stroke inset shifts the path inward by half-thickness', () => {
        const s = new Squircle();
        s.Stroke = new SolidColorBrush(Color.Black);
        s.StrokeThickness = 4;
        s.Superness = 2;
        const dc = render(s, 200, 200);
        const fig = (dc.geoms[0]!.geometry as PathGeometry).Figures[0]!;
        // Top point should sit at (cx, half) where cx = 100, half = 2.
        assert.equal(fig.StartPoint.X, 100);
        assert.equal(fig.StartPoint.Y, 2);
    });
});
