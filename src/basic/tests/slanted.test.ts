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
    MatrixTransform,
    PathGeometry,
    Pen,
    SolidColorBrush,
    Transform,
} from '../../visual-engine/index.js';
import { Slanted } from '../shapes/slanted.js';

interface CapturedGeom { brush: Brush | undefined; pen: Pen | undefined; geometry: unknown; }

class CapturingContext implements DrawingContext
{
    public geoms: CapturedGeom[] = [];
    public xforms: (Transform | undefined)[] = [];
    public popCount = 0;
    DrawGeometry(b: Brush | undefined, p: Pen | undefined, g: unknown): void
    { this.geoms.push({ brush: b, pen: p, geometry: g }); }
    DrawRectangle(): void { throw new Error('not used'); }
    DrawText():      void { throw new Error('not used'); }
    PushTransform(x: Transform): void { this.xforms.push(x); }
    PushClip(): void { /* no-op */ }
    Pop():      void { this.popCount++; }
}

function render(s: Slanted, w: number, h: number): CapturingContext
{
    s.Measure(new Size(w, h));
    s.Arrange(new Rect(0, 0, w, h));
    const dc = new CapturingContext();
    s.Render(dc);
    return dc;
}

describe('Slanted', () => {
    test('defaults: LeanAngle = -12, Superness inherits 4 from Squircle', () => {
        const s = new Slanted();
        assert.equal(s.LeanAngle, -12);
        assert.equal(s.Superness, 4);
    });

    test('non-zero lean pushes a SkewX matrix and pops after the draw', () => {
        const s = new Slanted();
        s.Background = new SolidColorBrush(Color.Red);
        const dc = render(s, 100, 100);
        assert.equal(dc.xforms.length, 1);
        assert.equal(dc.popCount, 1);
        const xf = dc.xforms[0] as MatrixTransform;
        assert.ok(xf instanceof MatrixTransform);
        // The matrix should have a non-zero M21 (horizontal shear coefficient).
        const m = xf.Matrix;
        assert.notEqual(m.M21, 0);
    });

    test('LeanAngle = 0 skips the transform path', () => {
        const s = new Slanted();
        s.LeanAngle = 0;
        const dc = render(s, 100, 100);
        assert.equal(dc.xforms.length, 0);
        assert.equal(dc.popCount, 0);
    });

    test('inner Squircle width shrinks by H · |tan(LeanAngle)| to fit the slot', () => {
        const s = new Slanted();
        s.LeanAngle = -45;  // tan(45) = 1
        const dc = render(s, 100, 100);
        const fig = (dc.geoms[0]!.geometry as PathGeometry).Figures[0]!;
        // top point is at (centerX, 0). For w_inner = w - h*1 = 0,
        // the figure collapses to a point at midX.
        const top = fig.StartPoint;
        assert.equal(top.X, 50);
        // First segment is a CubicBezier — check it didn't blow up.
        assert.ok(fig.Segments[0] instanceof CubicBezierSegment);
    });

    test('zero-size skips render entirely', () => {
        const s = new Slanted();
        const dc = render(s, 0, 50);
        assert.equal(dc.geoms.length, 0);
        assert.equal(dc.xforms.length, 0);
    });
});
