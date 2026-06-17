// §19-deferred #1 — outline widening tests.
//
// `widen(g, pen)` produces a PathGeometry whose covered area
// approximates the stroked path. Tests probe:
//   * Endpoint inclusion / exclusion at distances ≤ / > half-thickness.
//   * Cap shape behaviour (Flat / Square / Round).
//   * Join behaviour (Bevel / Miter / Round) at 90° corners + miter-
//     limit fallback.
//   * Closed-polyline output produces two figures (outer + inner ring).
//
// Exact-polygon equality would be brittle (curve flattening, round-arc
// stepping). Coverage-based probes verify the area; structural counts
// verify the figure topology.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { Point, Rect } from '../../primitives.js';
import {
    EllipseGeometry,
    LineGeometry,
    PathFigure,
    PathGeometry,
    LineSegment,
    RectangleGeometry,
} from '../geometry.js';
import { widen } from '../widen.js';
import { LineCap, LineJoin, Pen } from '../../drawing/pen.js';

const P = (x: number, y: number): Point => new Point(x, y);

function makePen(thickness: number, cap: LineCap = LineCap.Flat,
                  join: LineJoin = LineJoin.Miter, miterLimit: number = 10): Pen
{
    const pen = new Pen();
    pen.Thickness  = thickness;
    pen.LineCap    = cap;
    pen.LineJoin   = join;
    pen.MiterLimit = miterLimit;
    return pen;
}

// ── basic line strokes ───────────────────────────────────────────────

describe('widen — LineGeometry', () => {
    test('zero-thickness yields empty', () => {
        const g = new LineGeometry(P(0, 0), P(10, 0));
        const out = widen(g, makePen(0));
        assert.equal(out.Figures.length, 0);
    });

    test('horizontal line, flat caps — covers strip ±half', () => {
        const g = new LineGeometry(P(0, 0), P(10, 0));
        const out = widen(g, makePen(4));
        // Inside strip [0..10] × [-2..2].
        assert.equal(out.Contains(P(5, 0)),   true);
        assert.equal(out.Contains(P(5, 1.5)), true);
        assert.equal(out.Contains(P(5, -1.5)), true);
        // Outside strip.
        assert.equal(out.Contains(P(5, 3)),  false);
        assert.equal(out.Contains(P(5, -3)), false);
        // Flat cap → no fill beyond endpoints.
        assert.equal(out.Contains(P(-1, 0)),  false);
        assert.equal(out.Contains(P(11, 0)),  false);
    });

    test('square cap extends strip by half on each end', () => {
        const g = new LineGeometry(P(0, 0), P(10, 0));
        const out = widen(g, makePen(4, LineCap.Square));
        // Square cap extends by half = 2 past each endpoint.
        assert.equal(out.Contains(P(-1, 0)), true);
        assert.equal(out.Contains(P(11, 0)), true);
        // But not by 3 past.
        assert.equal(out.Contains(P(-2.5, 0)), false);
        assert.equal(out.Contains(P(12.5, 0)), false);
    });

    test('round cap covers ~half-disc at each endpoint', () => {
        const g = new LineGeometry(P(0, 0), P(10, 0));
        const out = widen(g, makePen(4, LineCap.Round));
        // Inside half-disc at (-, 0) at distance 1.5 from (0,0).
        assert.equal(out.Contains(P(-1.5, 0)), true);
        // But not at distance 3.
        assert.equal(out.Contains(P(-3, 0)), false);
    });
});

// ── rectangles + path geometry as input ──────────────────────────────

describe('widen — RectangleGeometry', () => {
    test('rect outline emits two figures (outer + inner ring)', () => {
        const g = new RectangleGeometry(new Rect(0, 0, 10, 10));
        const out = widen(g, makePen(2));
        assert.equal(out.Figures.length, 2);
    });

    test('rect outline — points on the border belong to the stroked ring', () => {
        const g = new RectangleGeometry(new Rect(0, 0, 10, 10));
        const out = widen(g, makePen(2));
        // Outer offset extends 1 past the border (at top edge, y=-1).
        // Inner offset retracts 1 into the rect (at top edge, y=1).
        // Point at (5, 0) — on the border — sits between rings: filled.
        assert.equal(out.Contains(P(5, 0)),  true);
        assert.equal(out.Contains(P(5, -0.5)), true);   // just outside
        assert.equal(out.Contains(P(5, 0.5)),  true);   // just inside
        // Well outside the stroke.
        assert.equal(out.Contains(P(5, -3)), false);
        // Deep inside the rect (the unfilled hole).
        assert.equal(out.Contains(P(5, 5)), false);
    });
});

// ── PathGeometry — open + closed inputs ──────────────────────────────

describe('widen — PathGeometry', () => {
    test('open V-shape with miter join — outer corner extends past vertex', () => {
        // 90° V centered at (10, 10) opening downward.
        const g = new PathGeometry([
            new PathFigure(P(0, 0), [
                new LineSegment(P(10, 10)),
                new LineSegment(P(20, 0)),
            ], false),
        ]);
        const out = widen(g, makePen(2, LineCap.Flat, LineJoin.Miter));
        // Outside corner of the V is the BOTTOM at (10, 10+miter)
        // — miter pushes the offset outward at 45° beyond the vertex.
        // half=1, 90° angle → miter length = √2 ≈ 1.41.
        assert.equal(out.Contains(P(10, 11)), true);
    });

    test('open V-shape with bevel join — outer corner clipped at offset distance', () => {
        const g = new PathGeometry([
            new PathFigure(P(0, 0), [
                new LineSegment(P(10, 10)),
                new LineSegment(P(20, 0)),
            ], false),
        ]);
        const out = widen(g, makePen(2, LineCap.Flat, LineJoin.Bevel));
        // Bevel — outer corner at the offset distance (1) from vertex
        // but no miter spike. Probe at (10, 1.5) is well past bevel.
        assert.equal(out.Contains(P(10, 2)),   false);
    });

    test('miter falls back to bevel when miter-limit exceeded', () => {
        // Very sharp angle ⇒ huge miter length. With miterLimit=1
        // the renderer should bevel.
        const g = new PathGeometry([
            new PathFigure(P(0, 0), [
                new LineSegment(P(10, 1)),    // shallow zigzag — nearly collinear
                new LineSegment(P(20, 0)),
            ], false),
        ]);
        const out = widen(g, makePen(2, LineCap.Flat, LineJoin.Miter, /* miterLimit */ 1));
        // Without a fallback, the miter would shoot far out vertically
        // around (10, 10+); with the fallback it stops near the bevel.
        assert.equal(out.Contains(P(10, 5)),  false);
    });

    test('closed PathGeometry emits two figures', () => {
        const triangle = new PathGeometry([
            new PathFigure(P(0, 0), [
                new LineSegment(P(10, 0)),
                new LineSegment(P(5, 10)),
            ], true),
        ]);
        const out = widen(triangle, makePen(2));
        assert.equal(out.Figures.length, 2);
    });
});

// ── EllipseGeometry — curve flatten + offset ─────────────────────────

describe('widen — EllipseGeometry', () => {
    test('unit-ish ellipse outline contains points on the ellipse boundary', () => {
        const g = new EllipseGeometry(P(0, 0), 10, 10);
        const out = widen(g, makePen(2));
        // (10, 0) is on the circle — should be in the outlined ring.
        assert.equal(out.Contains(P(10, 0)), true);
        // (10.5, 0) — just outside circle, inside outer ring.
        assert.equal(out.Contains(P(10.5, 0)), true);
        // (9.5, 0) — just inside circle, inside outer ring.
        assert.equal(out.Contains(P(9.5, 0)), true);
        // (0, 0) — deep inside the hole.
        assert.equal(out.Contains(P(0, 0)), false);
        // (15, 0) — well outside.
        assert.equal(out.Contains(P(15, 0)), false);
    });
});
