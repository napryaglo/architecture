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
import {
    RadialWave,
    Sunny,
    VerySunny,
    Burst,
    SoftBurst,
    Boom,
    SoftBoom,
    Flower,
} from '../shapes/radial-wave.js';

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

function render(s: RadialWave, w: number, h: number): CapturingContext
{
    s.Measure(new Size(w, h));
    s.Arrange(new Rect(0, 0, w, h));
    const dc = new CapturingContext();
    s.Render(dc);
    return dc;
}

function dist(x: number, y: number, cx: number, cy: number): number
{
    return Math.hypot(x - cx, y - cy);
}

function sampleRadii(s: RadialWave, w: number, h: number):
    { min: number; max: number; count: number }
{
    const dc  = render(s, w, h);
    const fig = (dc.geoms[0]!.geometry as PathGeometry).Figures[0]!;
    const cx  = w / 2, cy = h / 2;
    let min = Infinity, max = 0, count = 0;
    const eat = (p: { X: number; Y: number }): void => {
        const r = dist(p.X, p.Y, cx, cy);
        if (r < min) min = r;
        if (r > max) max = r;
        count++;
    };
    eat(fig.StartPoint);
    for (const seg of fig.Segments)
    {
        eat((seg as { Point: { X: number; Y: number } }).Point);
    }
    return { min, max, count };
}

describe('RadialWave defaults', () => {
    test('Lobes=8, Amplitude=0.20, Sharpness=0, Rotation=-90, Samples=24', () => {
        const r = new RadialWave();
        assert.equal(r.Lobes, 8);
        assert.equal(r.Amplitude, 0.20);
        assert.equal(r.Sharpness, 0);
        assert.equal(r.Rotation, -90);
        assert.equal(r.Samples, 24);
    });
});

describe('RadialWave render', () => {
    test('emits Lobes × Samples samples on a closed figure', () => {
        const r = new RadialWave();
        r.Background = new SolidColorBrush(Color.Red);
        r.Lobes = 8;
        r.Samples = 16;
        const dc = render(r, 100, 100);
        const fig = (dc.geoms[0]!.geometry as PathGeometry).Figures[0]!;
        assert.equal(fig.Segments.length, 8 * 16 - 1);  // start + (N×S - 1) segments
        assert.ok(fig.IsClosed);
    });

    test('Amplitude=0 collapses to an ellipse (uniform radius)', () => {
        const r = new RadialWave();
        r.Amplitude = 0;
        const { min, max } = sampleRadii(r, 200, 200);
        assert.ok(Math.abs(max - min) < 0.01,
            `expected uniform radius (ellipse), got min=${min}, max=${max}`);
    });

    test('peak radius equals r_outer (touches the inscribing ellipse)', () => {
        const r = new RadialWave();
        r.Amplitude = 0.30;
        r.Samples = 64;  // dense sampling so a peak lands close to apex
        const { max } = sampleRadii(r, 200, 200);
        assert.ok(Math.abs(max - 100) < 1.5,
            `expected peak ~100 (r_outer), got max=${max}`);
    });

    test('valley radius equals r_outer · (1 − Amplitude)', () => {
        const r = new RadialWave();
        r.Amplitude = 0.30;
        r.Samples = 64;
        const { min } = sampleRadii(r, 200, 200);
        // valley = 100 · 0.7 = 70
        assert.ok(Math.abs(min - 70) < 2,
            `expected valley ~70, got min=${min}`);
    });

    test('zero-size skips render', () => {
        const r = new RadialWave();
        const dc = render(r, 0, 50);
        assert.equal(dc.geoms.length, 0);
    });
});

describe('RadialWave named variants', () => {
    test('Sunny: 8 lobes, low amplitude (0.15), smooth (sharpness 0)', () => {
        const s = new Sunny();
        assert.equal(s.Lobes, 8);
        assert.equal(s.Amplitude, 0.15);
        assert.equal(s.Sharpness, 0);
    });
    test('VerySunny: 8 lobes, high amplitude (0.30), smooth', () => {
        const s = new VerySunny();
        assert.equal(s.Lobes, 8);
        assert.equal(s.Amplitude, 0.30);
        assert.equal(s.Sharpness, 0);
    });
    test('Burst: 12 lobes, medium amplitude, sharp (0.6)', () => {
        const s = new Burst();
        assert.equal(s.Lobes, 12);
        assert.equal(s.Amplitude, 0.20);
        assert.equal(s.Sharpness, 0.6);
    });
    test('SoftBurst: 12 lobes, medium amplitude, smooth', () => {
        const s = new SoftBurst();
        assert.equal(s.Lobes, 12);
        assert.equal(s.Amplitude, 0.20);
        assert.equal(s.Sharpness, 0);
    });
    test('Boom: 14 lobes, high amplitude, sharp', () => {
        const s = new Boom();
        assert.equal(s.Lobes, 14);
        assert.equal(s.Amplitude, 0.30);
        assert.equal(s.Sharpness, 0.6);
    });
    test('SoftBoom: 14 lobes, high amplitude, smooth', () => {
        const s = new SoftBoom();
        assert.equal(s.Lobes, 14);
        assert.equal(s.Amplitude, 0.30);
        assert.equal(s.Sharpness, 0);
    });
    test('Flower: 10 lobes, medium amplitude, smooth', () => {
        const s = new Flower();
        assert.equal(s.Lobes, 10);
        assert.equal(s.Amplitude, 0.20);
        assert.equal(s.Sharpness, 0);
    });
});
