// Phase 2 — Geometry virtual surface (§19.2).
//
// Covers: GetBounds(), Contains(p), Intersects(other) across each
// concrete Geometry subclass, plus a Transform-aware base-class
// round-trip and the FillRule branch on PathGeometry / GeometryGroup.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { Point, Rect, Size } from '../../primitives.js';
import {
    RectangleGeometry,
    EllipseGeometry,
    LineGeometry,
    PathGeometry,
    PathFigure,
    LineSegment,
    CubicBezierSegment,
    QuadraticBezierSegment,
    ArcSegment,
    SweepDirection,
    GeometryGroup,
    FillRule,
} from '../geometry.js';
import { TranslateTransform, ScaleTransform } from '../../drawing/transform.js';

const P = (x: number, y: number) => new Point(x, y);

// ── RectangleGeometry ────────────────────────────────────────────

describe('RectangleGeometry — GetBounds / Contains', () => {
    test('plain rect bounds matches the Rect DP', () => {
        const r = new RectangleGeometry(new Rect(5, 10, 50, 30));
        assert.deepEqual(
            { x: r.GetBounds().X, y: r.GetBounds().Y, w: r.GetBounds().Width, h: r.GetBounds().Height },
            { x: 5, y: 10, w: 50, h: 30 });
    });

    test('rounded-corner: AABB unchanged', () => {
        const r = new RectangleGeometry(new Rect(0, 0, 100, 50), 10, 10);
        const b = r.GetBounds();
        assert.equal(b.X, 0); assert.equal(b.Y, 0);
        assert.equal(b.Width, 100); assert.equal(b.Height, 50);
    });

    test('contains: interior point', () => {
        const r = new RectangleGeometry(new Rect(0, 0, 100, 50));
        assert.equal(r.Contains(P(50, 25)), true);
    });

    test('contains: outside point', () => {
        const r = new RectangleGeometry(new Rect(0, 0, 100, 50));
        assert.equal(r.Contains(P(150, 25)), false);
    });

    test('rounded contains: corner cell rejects when outside the radius', () => {
        // 100×50 rect, radius 20 — corner ellipse center at (20, 20).
        // Point (5, 5) is inside the AABB rectangle but well outside the
        // 20-radius corner ellipse.
        const r = new RectangleGeometry(new Rect(0, 0, 100, 50), 20, 20);
        assert.equal(r.Contains(P(5, 5)), false);
    });

    test('rounded contains: corner cell accepts when inside the radius', () => {
        const r = new RectangleGeometry(new Rect(0, 0, 100, 50), 20, 20);
        // (10, 10) is at distance √200 ≈ 14.14 from corner center (20, 20)
        // — inside the radius 20 ellipse.
        assert.equal(r.Contains(P(10, 10)), true);
    });
});

// ── EllipseGeometry ──────────────────────────────────────────────

describe('EllipseGeometry — GetBounds / Contains', () => {
    test('bounds = enclosing AABB', () => {
        const e = new EllipseGeometry(P(50, 30), 25, 15);
        const b = e.GetBounds();
        assert.equal(b.X, 25); assert.equal(b.Y, 15);
        assert.equal(b.Width, 50); assert.equal(b.Height, 30);
    });

    test('contains: center point', () => {
        const e = new EllipseGeometry(P(0, 0), 10, 10);
        assert.equal(e.Contains(P(0, 0)), true);
    });

    test('contains: focus point', () => {
        const e = new EllipseGeometry(P(0, 0), 10, 10);
        assert.equal(e.Contains(P(7, 0)), true);
    });

    test('rejects point just outside the perimeter', () => {
        const e = new EllipseGeometry(P(0, 0), 10, 10);
        assert.equal(e.Contains(P(10.001, 0)), false);
    });

    test('degenerate (radius 0) never contains', () => {
        const e = new EllipseGeometry(P(0, 0), 0, 10);
        assert.equal(e.Contains(P(0, 0)), false);
    });
});

// ── LineGeometry ─────────────────────────────────────────────────

describe('LineGeometry — GetBounds / Contains', () => {
    test('bounds = AABB of endpoints', () => {
        const l = new LineGeometry(P(10, 5), P(50, 80));
        const b = l.GetBounds();
        assert.equal(b.X, 10); assert.equal(b.Y, 5);
        assert.equal(b.Width, 40); assert.equal(b.Height, 75);
    });

    test('contains always false (no fill)', () => {
        const l = new LineGeometry(P(0, 0), P(100, 100));
        assert.equal(l.Contains(P(50, 50)), false);
        assert.equal(l.Contains(P(0, 0)), false);
    });
});

// ── PathGeometry ─────────────────────────────────────────────────

function makeTriangle(): PathGeometry
{
    // CCW triangle (0,0) → (100,0) → (50,100) → close.
    return new PathGeometry([
        new PathFigure(
            P(0, 0),
            [new LineSegment(P(100, 0)), new LineSegment(P(50, 100))],
            true),
    ]);
}

describe('PathGeometry — bounds + ray cast', () => {
    test('triangle bounds matches the AABB of vertices', () => {
        const b = makeTriangle().GetBounds();
        assert.equal(b.X, 0); assert.equal(b.Y, 0);
        assert.equal(b.Width, 100); assert.equal(b.Height, 100);
    });

    test('triangle contains: interior point', () => {
        assert.equal(makeTriangle().Contains(P(50, 30)), true);
    });

    test('triangle contains: outside corner', () => {
        assert.equal(makeTriangle().Contains(P(5, 80)), false);
    });

    test('cubic figure bounds includes off-curve handle excursion', () => {
        // Cubic from (0, 0) with handles (50, -50) (50, -50) to (100, 0).
        // True extrema take y to y_min = -3·50·(1/4) - 3·50·(1/4) = nope,
        // just trust Cubic.boundingRect.
        const p = new PathGeometry([
            new PathFigure(
                P(0, 0),
                [new CubicBezierSegment(P(50, -50), P(50, -50), P(100, 0))],
                false),
        ]);
        const b = p.GetBounds();
        // The cubic's max-y at t=0.5 is -3/4 · 50 - 3/4 · 50 = -75/2 = -37.5.
        // Bounds.Y should be roughly that.
        assert.ok(b.Y < -30, `bounds.Y ${b.Y} should be below -30`);
        assert.equal(b.X, 0); assert.equal(b.Right, 100);
    });

    test('quad figure: contains uses the actual curve shape', () => {
        // Triangle with the top edge replaced by a quad that bulges UP
        // to y = -50, so a point above the straight-edge line but
        // INSIDE the bulged region IS contained.
        const p = new PathGeometry([
            new PathFigure(
                P(0, 0),
                [
                    new QuadraticBezierSegment(P(50, -100), P(100, 0)),
                    new LineSegment(P(50, 100)),
                ],
                true),
        ]);
        // At (50, -10) the bulged quad gives y(0.5) = -50, so y=-10
        // is INSIDE.
        assert.equal(p.Contains(P(50, -10)), true);
        // (50, -60) is above the bulge apex → outside.
        assert.equal(p.Contains(P(50, -60)), false);
    });

    test('EvenOdd annulus: outer-only point inside, hollow center outside', () => {
        // Outer square (0..100, 0..100) CCW + inner square (40..60, 40..60)
        // ALSO CCW. Under EvenOdd, the inner hole appears as outside.
        const p = new PathGeometry([
            new PathFigure(P(0, 0), [
                new LineSegment(P(100, 0)),
                new LineSegment(P(100, 100)),
                new LineSegment(P(0, 100)),
            ], true),
            new PathFigure(P(40, 40), [
                new LineSegment(P(60, 40)),
                new LineSegment(P(60, 60)),
                new LineSegment(P(40, 60)),
            ], true),
        ]);
        p.FillRule = FillRule.EvenOdd;
        assert.equal(p.Contains(P(20, 50)), true);   // outer ring
        assert.equal(p.Contains(P(50, 50)), false);  // hole center
    });
});

// ── ArcSegment in PathGeometry ──────────────────────────────────

describe('PathGeometry with ArcSegment — bounds account for arc sweep', () => {
    test('quarter-arc figure bounds includes the arc apex', () => {
        // Start (100, 0), arc to (0, 100), rx=ry=100 sweep=Clockwise
        // → outer arc through (70.71, 70.71).
        const p = new PathGeometry([
            new PathFigure(P(100, 0), [
                new ArcSegment(P(0, 100), new Size(100, 100), 0, false,
                               SweepDirection.Clockwise),
            ], false),
        ]);
        const b = p.GetBounds();
        // X range [0, 100], Y range [0, 100] for the outer arc.
        assert.ok(b.X >= -0.01 && b.X <= 0.01);
        assert.ok(b.Right >= 99.99 && b.Right <= 100.01);
        assert.ok(b.Bottom >= 99.99 && b.Bottom <= 100.01);
    });
});

// ── GeometryGroup ────────────────────────────────────────────────

describe('GeometryGroup — composite bounds / contains', () => {
    test('bounds = union of child bounds', () => {
        const g = new GeometryGroup([
            new RectangleGeometry(new Rect(0, 0, 10, 10)),
            new RectangleGeometry(new Rect(20, 20, 10, 10)),
        ]);
        const b = g.GetBounds();
        assert.equal(b.X, 0); assert.equal(b.Y, 0);
        assert.equal(b.Width, 30); assert.equal(b.Height, 30);
    });

    test('EvenOdd: XOR-fold child Contains', () => {
        // Two overlapping rectangles, EvenOdd. The overlap region is OUT.
        const g = new GeometryGroup([
            new RectangleGeometry(new Rect(0, 0, 20, 20)),
            new RectangleGeometry(new Rect(10, 0, 20, 20)),
        ]);
        g.FillRule = FillRule.EvenOdd;
        assert.equal(g.Contains(P(5, 10)), true);    // only in A
        assert.equal(g.Contains(P(25, 10)), true);   // only in B
        assert.equal(g.Contains(P(15, 10)), false);  // in both → flipped out
    });

    test('Nonzero (v1 OR-fold): contains when ANY child contains', () => {
        const g = new GeometryGroup([
            new RectangleGeometry(new Rect(0, 0, 20, 20)),
            new RectangleGeometry(new Rect(10, 0, 20, 20)),
        ]);
        g.FillRule = FillRule.Nonzero;
        assert.equal(g.Contains(P(15, 10)), true);
    });
});

// ── Transform-aware base methods ────────────────────────────────

describe('Geometry.Transform — round-trip via base class', () => {
    test('translated rectangle: bounds shift by the offset', () => {
        const r = new RectangleGeometry(new Rect(0, 0, 100, 50));
        r.Transform = new TranslateTransform(10, 20);
        const b = r.GetBounds();
        assert.equal(b.X, 10);
        assert.equal(b.Y, 20);
        assert.equal(b.Width, 100);
        assert.equal(b.Height, 50);
    });

    test('translated rectangle: Contains shifts by the offset', () => {
        const r = new RectangleGeometry(new Rect(0, 0, 100, 50));
        r.Transform = new TranslateTransform(10, 20);
        // (15, 25) is inside the post-transform rect; (5, 5) is not.
        assert.equal(r.Contains(P(15, 25)), true);
        assert.equal(r.Contains(P(5, 5)), false);
    });

    test('scaled ellipse: bounds reflect the scale', () => {
        const e = new EllipseGeometry(P(0, 0), 10, 10);
        e.Transform = new ScaleTransform(2, 1);
        const b = e.GetBounds();
        // (-20, -10) origin, 40 × 20 bbox.
        assert.equal(b.X, -20); assert.equal(b.Y, -10);
        assert.equal(b.Width, 40); assert.equal(b.Height, 20);
    });

    test('Intersects: bbox-only — overlap detected', () => {
        const a = new RectangleGeometry(new Rect(0, 0, 50, 50));
        const b = new RectangleGeometry(new Rect(25, 25, 50, 50));
        assert.equal(a.Intersects(b), true);
    });

    test('Intersects: disjoint bboxes → false', () => {
        const a = new RectangleGeometry(new Rect(0, 0, 10, 10));
        const b = new RectangleGeometry(new Rect(100, 100, 10, 10));
        assert.equal(a.Intersects(b), false);
    });
});
