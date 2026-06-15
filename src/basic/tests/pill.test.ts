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
    Pen,
    RectangleGeometry,
    SolidColorBrush,
} from '../../visual-engine/index.js';
import { Pill } from '../shapes/pill.js';

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

function render(p: Pill, w: number, h: number): CapturingContext
{
    p.Measure(new Size(w, h));
    p.Arrange(new Rect(0, 0, w, h));
    const dc = new CapturingContext();
    p.Render(dc);
    return dc;
}

describe('Pill', () => {
    test('defaults', () => {
        const p = new Pill();
        assert.equal(p.Background, undefined);
        assert.equal(p.Stroke, undefined);
        assert.equal(p.StrokeThickness, 0);
    });

    test('wide pill: corner radius equals half the height', () => {
        const p = new Pill();
        p.Background = new SolidColorBrush(Color.Red);
        const dc = render(p, 200, 60);
        const g = dc.geoms[0]!.geometry as RectangleGeometry;
        assert.ok(g instanceof RectangleGeometry);
        assert.equal(g.RadiusX, 30);
        assert.equal(g.RadiusY, 30);
    });

    test('tall pill: corner radius equals half the width', () => {
        const p = new Pill();
        const dc = render(p, 40, 200);
        const g = dc.geoms[0]!.geometry as RectangleGeometry;
        assert.equal(g.RadiusX, 20);
        assert.equal(g.RadiusY, 20);
    });

    test('square pill: corner radius equals half the side (circle case)', () => {
        const p = new Pill();
        const dc = render(p, 100, 100);
        const g = dc.geoms[0]!.geometry as RectangleGeometry;
        assert.equal(g.RadiusX, 50);
        assert.equal(g.RadiusY, 50);
    });

    test('zero-size skips render', () => {
        const p = new Pill();
        const dc = render(p, 0, 50);
        assert.equal(dc.geoms.length, 0);
    });

    test('stroke insets the rect by half-thickness on every side', () => {
        const p = new Pill();
        p.Stroke = new SolidColorBrush(Color.Black);
        p.StrokeThickness = 4;
        const dc = render(p, 100, 60);
        const g = dc.geoms[0]!.geometry as RectangleGeometry;
        assert.ok(g.Rect.Equals(new Rect(2, 2, 96, 56)));
    });
});
