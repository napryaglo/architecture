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
import {
    PixelArt,
    PixelCircle,
    PixelTriangle,
    PixelSource,
} from '../shapes/pixel-shape.js';

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

function render(p: PixelArt, w: number, h: number): CapturingContext
{
    p.Measure(new Size(w, h));
    p.Arrange(new Rect(0, 0, w, h));
    const dc = new CapturingContext();
    p.Render(dc);
    return dc;
}

describe('PixelArt defaults', () => {
    test('GridSize=8, Source=Circle', () => {
        const p = new PixelArt();
        assert.equal(p.GridSize, 8);
        assert.equal(p.Source, PixelSource.Circle);
    });
});

describe('PixelCircle', () => {
    test('emits ~ πR² pixels (approximately 50/64 for an 8×8 grid)', () => {
        const p = new PixelCircle();
        p.Fill = new SolidColorBrush(Color.Red);
        p.GridSize = 8;
        const dc = render(p, 80, 80);
        const path = dc.geoms[0]!.geometry as PathGeometry;
        // For an 8×8 grid, a unit-circle rasterisation produces roughly
        // 48-52 filled cells (π · (0.5)² · 64 ≈ 50.3).
        assert.ok(path.Figures.length >= 40 && path.Figures.length <= 56,
            `expected ~50 filled cells, got ${path.Figures.length}`);
    });

    test('every emitted figure is a closed 4-sided rectangle', () => {
        const p = new PixelCircle();
        const dc = render(p, 80, 80);
        const figures = (dc.geoms[0]!.geometry as PathGeometry).Figures;
        for (const fig of figures)
        {
            assert.equal(fig.Segments.length, 3);  // 3 L + implicit close = 4 sides
            for (const seg of fig.Segments) assert.ok(seg instanceof LineSegment);
            assert.ok(fig.IsClosed);
        }
    });

    test('higher GridSize produces more pixels', () => {
        const small = new PixelCircle(); small.GridSize = 8;
        const big   = new PixelCircle(); big.GridSize = 16;
        const dcSmall = render(small, 100, 100);
        const dcBig   = render(big,   100, 100);
        const ns = (dcSmall.geoms[0]!.geometry as PathGeometry).Figures.length;
        const nb = (dcBig  .geoms[0]!.geometry as PathGeometry).Figures.length;
        // n_big should be about 4× n_small (area scales with N²).
        assert.ok(nb > ns * 2,
            `expected ~4× pixels at higher grid, got ${ns} → ${nb}`);
    });

    test('zero-size skips render', () => {
        const p = new PixelCircle();
        const dc = render(p, 0, 50);
        assert.equal(dc.geoms.length, 0);
    });
});

describe('PixelTriangle', () => {
    test('emits a point-up triangle pattern (fewer than half the grid filled)', () => {
        const p = new PixelTriangle();
        p.GridSize = 8;
        const dc = render(p, 80, 80);
        const n = (dc.geoms[0]!.geometry as PathGeometry).Figures.length;
        // Triangle area is ~ 1/2 of the grid → expect ~32 filled cells.
        assert.ok(n >= 20 && n <= 40, `expected ~32 cells, got ${n}`);
    });
});
