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
    MatrixTransform,
    PathGeometry,
    Pen,
    SolidColorBrush,
    Transform,
} from '../../visual-engine/index.js';
import { Puffy, PuffyBase, PuffyDiamond } from '../shapes/puffy.js';

interface CapturedGeom { brush: Brush | undefined; pen: Pen | undefined; geometry: unknown; }

class CapturingContext implements DrawingContext
{
    public geoms: CapturedGeom[] = [];
    public xforms: Transform[] = [];
    public popCount = 0;
    DrawGeometry(b: Brush | undefined, p: Pen | undefined, g: unknown): void
    { this.geoms.push({ brush: b, pen: p, geometry: g }); }
    DrawRectangle(): void { throw new Error('not used'); }
    DrawText():      void { throw new Error('not used'); }
    PushTransform(x: Transform): void { this.xforms.push(x); }
    PushClip():      void { /* no-op */ }
    Pop():           void { this.popCount++; }
}

function render(p: Puffy, w: number, h: number): CapturingContext
{
    p.Measure(new Size(w, h));
    p.Arrange(new Rect(0, 0, w, h));
    const dc = new CapturingContext();
    p.Render(dc);
    return dc;
}

describe('Puffy', () => {
    test('defaults: BumpsPerSide=2, Base=Square', () => {
        const p = new Puffy();
        assert.equal(p.BumpsPerSide, 2);
        assert.equal(p.Base, PuffyBase.Square);
    });

    test('Square base: emits 4·BumpsPerSide ArcSegments (one per lobe)', () => {
        const p = new Puffy();
        p.Background = new SolidColorBrush(Color.Red);
        p.BumpsPerSide = 2;
        const dc = render(p, 100, 100);
        const fig = (dc.geoms[0]!.geometry as PathGeometry).Figures[0]!;
        assert.equal(fig.Segments.length, 8);
        for (const seg of fig.Segments) assert.ok(seg instanceof ArcSegment);
        assert.ok(fig.IsClosed);
    });

    test('Square base does not push any transform (rotation skipped)', () => {
        const p = new Puffy();
        const dc = render(p, 100, 100);
        assert.equal(dc.xforms.length, 0);
        assert.equal(dc.popCount, 0);
    });

    test('Diamond base pushes a rotation matrix and pops after the draw', () => {
        const p = new Puffy();
        p.Base = PuffyBase.Diamond;
        const dc = render(p, 100, 100);
        assert.equal(dc.xforms.length, 1);
        assert.equal(dc.popCount, 1);
        assert.ok(dc.xforms[0] instanceof MatrixTransform);
    });

    test('BumpsPerSide=3 produces 12 ArcSegments (3 per edge × 4 edges)', () => {
        const p = new Puffy();
        p.BumpsPerSide = 3;
        const dc = render(p, 200, 200);
        const fig = (dc.geoms[0]!.geometry as PathGeometry).Figures[0]!;
        assert.equal(fig.Segments.length, 12);
    });

    test('zero-size skips render', () => {
        const p = new Puffy();
        const dc = render(p, 0, 50);
        assert.equal(dc.geoms.length, 0);
    });
});

describe('PuffyDiamond', () => {
    test('defaults to Base=Diamond', () => {
        assert.equal(new PuffyDiamond().Base, PuffyBase.Diamond);
    });
});
