// Shape fit-to-slot scaling (icon support). A Shape painting a SHARED
// Geometry (the icon model: one Geometry resource painted by many Shapes
// at different sizes) scales it uniformly into the render slot by pushing
// a transform FRAME — never mutating the shared geometry. Degenerate
// slots (Connector's Size.Zero route) and slot-equals-bounds (native-size
// icon, Figure shape) paint verbatim.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    Point,
    Rect,
    Size,
    type DrawingContext,
} from '../../runtime/index.js';
import { Brush, Pen, RectangleGeometry } from '../../visual-engine/index.js';
import { MatrixTransform } from '../../visual-engine/drawing/transform.js';
import type { Transform } from '../../visual-engine/drawing/transform.js';
import { Shape } from '../shapes/shape.js';

class CapturingContext implements DrawingContext
{
    public geoms:      Array<{ geometry: unknown }> = [];
    public transforms: Transform[] = [];
    DrawGeometry(_b: Brush | undefined, _p: Pen | undefined, g: unknown): void
    { this.geoms.push({ geometry: g }); }
    DrawRectangle(): void { throw new Error('not used'); }
    DrawText():      void { throw new Error('not used'); }
    PushTransform(t: Transform): void { this.transforms.push(t); }
    PushClip():      void { /* no-op */ }
    Pop():           void { /* no-op */ }
}

function render(shape: Shape): CapturingContext
{
    const dc = new CapturingContext();
    shape.Render(dc);
    return dc;
}

describe('Shape — fit shared geometry into the slot', () => {

    test('scales a 24×24 geometry into a 12×12 slot (transform frame, geometry untouched)', () => {
        const geom = new RectangleGeometry(new Rect(0, 0, 24, 24));
        const s = new Shape();
        s.Geometry = geom;
        s.Width = 12; s.Height = 12;
        s.Measure(new Size(12, 12));
        s.Arrange(new Rect(0, 0, 12, 12));

        const dc = render(s);
        assert.equal(dc.transforms.length, 1, 'a fit transform was pushed');
        const m = (dc.transforms[0] as MatrixTransform).Matrix;
        // 24→12 uniform scale anchored at the origin.
        const at24 = m.Transform(new Point(24, 24));
        assert.ok(Math.abs(at24.X - 12) < 1e-6 && Math.abs(at24.Y - 12) < 1e-6, 'scaled 0.5');
        const at0 = m.Transform(new Point(0, 0));
        assert.ok(Math.abs(at0.X) < 1e-6 && Math.abs(at0.Y) < 1e-6, 'origin stays at origin');

        // The SHARED geometry is painted as-is — scaling rode the frame.
        assert.equal(dc.geoms.length, 1);
        assert.equal(dc.geoms[0]!.geometry, geom, 'same instance, not a copy');
        assert.ok(geom.Transform.Matrix.IsIdentity, 'shared geometry not mutated');
    });

    test('native-size slot (24×24 geometry in a 24×24 slot) paints verbatim — no transform', () => {
        const s = new Shape();
        s.Geometry = new RectangleGeometry(new Rect(0, 0, 24, 24));
        s.Width = 24; s.Height = 24;
        s.Measure(new Size(24, 24));
        s.Arrange(new Rect(0, 0, 24, 24));
        const dc = render(s);
        assert.equal(dc.transforms.length, 0, 'no fit transform when slot == bounds');
        assert.equal(dc.geoms.length, 1);
    });

    test('degenerate slot (Size.Zero, like a Connector route) paints verbatim — no scaling', () => {
        // No explicit Width/Height: Shape.MeasureOverride → Size.Zero, so the
        // arranged slot is 0×0 even though the geometry spans real coords —
        // exactly the Connector case (route in absolute coords, never scaled).
        const s = new Shape();
        s.Geometry = new RectangleGeometry(new Rect(60, 60, 160, 80));
        s.Measure(new Size(800, 600));
        s.Arrange(new Rect(0, 0, 0, 0));
        const dc = render(s);
        assert.equal(dc.transforms.length, 0, 'no scaling for a degenerate slot');
        assert.equal(dc.geoms.length, 1);
    });

    test('centers within a non-square slot (uniform, letterboxed)', () => {
        // 24×24 geometry into a 40×12 slot → scale 0.5 (min), centered: the
        // 12-wide drawn icon sits at x-offset (40-12)/2 = 14.
        const s = new Shape();
        s.Geometry = new RectangleGeometry(new Rect(0, 0, 24, 24));
        s.Width = 40; s.Height = 12;
        s.Measure(new Size(40, 12));
        s.Arrange(new Rect(0, 0, 40, 12));
        const dc = render(s);
        const m = (dc.transforms[0] as MatrixTransform).Matrix;
        const origin = m.Transform(new Point(0, 0));
        assert.ok(Math.abs(origin.X - 14) < 1e-6, 'horizontally centered (x=14)');
        assert.ok(Math.abs(origin.Y) < 1e-6, 'no vertical offset (height fills)');
    });
});
