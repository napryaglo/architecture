import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    Color,
    Rect,
    Size,
    type DrawingContext,
} from '../../runtime/index.js';
import { Brush, Pen, RectangleGeometry, SolidColorBrush } from '../../visual-engine/index.js';
import { Rectangle } from '../shapes/rectangle.js';

// Captures DrawGeometry calls so we can assert shape, fill, stroke.
interface CapturedGeom
{
    brush: Brush | undefined;
    pen: Pen | undefined;
    geometry: unknown;
}

class CapturingContext implements DrawingContext
{
    public geoms: CapturedGeom[] = [];
    DrawGeometry(brush: Brush | undefined, pen: Pen | undefined, geometry: unknown): void
    {
        this.geoms.push({ brush, pen, geometry });
    }
    DrawRectangle(): void { throw new Error('Rectangle uses DrawGeometry, not DrawRectangle'); }
    DrawText(): void      { throw new Error('not used'); }
    PushTransform(): void { /* no-op */ }
    PushClip(): void      { /* no-op */ }
    Pop(): void           { /* no-op */ }
}

describe('Rectangle defaults', () => {
    test('fresh Rectangle has no fill, no stroke, zero radii', () => {
        const r = new Rectangle();
        assert.equal(r.Background, undefined);
        assert.equal(r.Stroke, undefined);
        assert.equal(r.StrokeThickness, 0);
        assert.equal(r.RadiusX, 0);
        assert.equal(r.RadiusY, 0);
    });

    test('MeasureOverride returns Size.Zero (shapes have no intrinsic size)', () => {
        const r = new Rectangle();
        r.Measure(new Size(500, 500));
        assert.ok(r.DesiredSize.Equals(Size.Zero));
    });
});

describe('Rectangle render', () => {
    test('no fill, no stroke → still emits a DrawGeometry (renderer no-ops on both undefined)', () => {
        const r = new Rectangle();
        r.Measure(new Size(100, 100));
        r.Arrange(new Rect(0, 0, 100, 100));
        const dc = new CapturingContext();
        r.Render(dc);
        // Matches Border semantics: a Rectangle with no Fill / no Stroke
        // still issues one DrawGeometry; the DC is responsible for the
        // no-op when both paints are undefined.
        assert.equal(dc.geoms.length, 1);
        assert.equal(dc.geoms[0]!.brush, undefined);
        assert.equal(dc.geoms[0]!.pen, undefined);
    });

    test('Fill-only paints solid rectangle covering RenderSize', () => {
        const r = new Rectangle();
        r.Background = new SolidColorBrush(Color.Red);
        r.Measure(new Size(100, 100));
        r.Arrange(new Rect(0, 0, 100, 100));
        const dc = new CapturingContext();
        r.Render(dc);

        assert.equal(dc.geoms.length, 1);
        const g = dc.geoms[0]!;
        assert.equal(g.brush, r.Background);
        assert.equal(g.pen, undefined);
        const geom = g.geometry as RectangleGeometry;
        assert.ok(geom instanceof RectangleGeometry);
        assert.ok(geom.Rect.Equals(new Rect(0, 0, 100, 100)));
    });

    test('Stroke insets geometry by half-thickness on every side', () => {
        const r = new Rectangle();
        r.Stroke = new SolidColorBrush(Color.Black);
        r.StrokeThickness = 4;
        r.Measure(new Size(100, 100));
        r.Arrange(new Rect(0, 0, 100, 100));
        const dc = new CapturingContext();
        r.Render(dc);

        assert.equal(dc.geoms.length, 1);
        const g = dc.geoms[0]!;
        assert.equal(g.pen!.Brush, r.Stroke);
        assert.equal(g.pen!.Thickness, 4);
        const geom = g.geometry as RectangleGeometry;
        assert.ok(geom.Rect.Equals(new Rect(2, 2, 96, 96)));
    });

    test('RadiusX / RadiusY flow into RectangleGeometry', () => {
        const r = new Rectangle();
        r.Background = new SolidColorBrush(Color.Red);
        r.RadiusX = 5;
        r.RadiusY = 8;
        r.Measure(new Size(100, 100));
        r.Arrange(new Rect(0, 0, 100, 100));
        const dc = new CapturingContext();
        r.Render(dc);

        const geom = dc.geoms[0]!.geometry as RectangleGeometry;
        assert.equal(geom.RadiusX, 5);
        assert.equal(geom.RadiusY, 8);
    });

    test('zero-size RenderSize skips rendering', () => {
        const r = new Rectangle();
        r.Background = new SolidColorBrush(Color.Red);
        r.Measure(new Size(0, 0));
        r.Arrange(new Rect(0, 0, 0, 0));
        const dc = new CapturingContext();
        r.Render(dc);
        assert.equal(dc.geoms.length, 0);
    });

    test('stroke thicker than the rect clamps inset rect to zero (no negative dims)', () => {
        const r = new Rectangle();
        r.Stroke = new SolidColorBrush(Color.Black);
        r.StrokeThickness = 50;
        r.Measure(new Size(10, 10));
        r.Arrange(new Rect(0, 0, 10, 10));
        const dc = new CapturingContext();
        r.Render(dc);
        const geom = dc.geoms[0]!.geometry as RectangleGeometry;
        assert.equal(geom.Rect.Width, 0);
        assert.equal(geom.Rect.Height, 0);
    });
});
