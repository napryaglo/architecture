// Phase 5 — SkIntersections::intersect(SkDQuad, SkDLine) port tests.
// Mirrors a few of the PathOpsQuadLineIntersectionTest.cpp scenarios:
// interior crossings (0/1/2), endpoint touches, no intersection, axis-
// aligned scan-line entry points.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { Intersections } from '../intersections.js';
import { Line } from '../line.js';
import { Point } from '../point.js';
import { Quad } from '../quad.js';
// Side-effect import installs intersectQuadLine et al. on Intersections.
import '../quad-line-intersection.js';

const P = (x: number, y: number) => new Point(x, y);
const Q = (p0: Point, p1: Point, p2: Point) => {
    const q = new Quad();
    q.fPts = [p0, p1, p2];
    return q;
};
const L = (p0: Point, p1: Point) => new Line(p0, p1);

const APPROX = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) < tol;

describe('Intersections.intersectQuadLine — interior crossings', () => {
    test('parabola y=x² crossed by horizontal line at y=4 → two roots', () => {
        // Quad approximating y=x² over x ∈ [-3, 3]: pts (-3,9), (0,-9), (3,9).
        // (Bezier control points; not the curve itself, but it's a valid
        // quad with two roots when sliced by y=4.)
        const q = Q(P(-3, 9), P(0, -9), P(3, 9));
        const line = L(P(-5, 4), P(5, 4));
        const i = new Intersections();
        const n = i.intersectQuadLine(q, line);
        assert.equal(n, 2, 'two crossings');
        // Both intersection points should have y ≈ 4.
        assert.ok(APPROX(i.pt(0).fY, 4), `pt0.y = ${i.pt(0).fY}`);
        assert.ok(APPROX(i.pt(1).fY, 4), `pt1.y = ${i.pt(1).fY}`);
    });

    test('parabola tangent to horizontal line at apex → one root (double root)', () => {
        // Apex of (-1,1)–(0,-1)–(1,1) is the curve's lowest y. A line
        // tangent at that minimum should yield one t value.
        const q = Q(P(-1, 1), P(0, -1), P(1, 1));
        // The actual minimum y is 0 (parametric quad min, not control min).
        const line = L(P(-3, 0), P(3, 0));
        const i = new Intersections();
        const n = i.intersectQuadLine(q, line);
        assert.equal(n, 1);
        assert.ok(APPROX(i.pt(0).fY, 0));
    });
});

describe('Intersections.intersectQuadLine — endpoint touches', () => {
    test('line ends exactly on a quad endpoint', () => {
        // Quad starts at (0,0); line ends at (0,0).
        const q = Q(P(0, 0), P(1, 2), P(2, 0));
        const line = L(P(-5, 0), P(0, 0));
        const i = new Intersections();
        const n = i.intersectQuadLine(q, line);
        assert.equal(n, 1);
        assert.ok(APPROX(i.pt(0).fX, 0));
        assert.ok(APPROX(i.pt(0).fY, 0));
        // Quad t at the endpoint is 0.
        assert.ok(APPROX(i.fT[0]![0]!, 0));
        // Line t at its second endpoint is 1.
        assert.ok(APPROX(i.fT[1]![0]!, 1));
    });
});

describe('Intersections.intersectQuadLine — no intersection', () => {
    test('parabola sitting above a horizontal line', () => {
        // Quad bounded below by y=5; line at y=0.
        const q = Q(P(-1, 5), P(0, 10), P(1, 5));
        const line = L(P(-5, 0), P(5, 0));
        const i = new Intersections();
        const n = i.intersectQuadLine(q, line);
        assert.equal(n, 0);
    });

    test('line entirely to the side of the quad', () => {
        const q = Q(P(0, 0), P(1, 1), P(2, 0));
        const line = L(P(10, -5), P(10, 5)); // vertical x=10
        const i = new Intersections();
        const n = i.intersectQuadLine(q, line);
        assert.equal(n, 0);
    });
});

describe('Intersections.horizontalQuad — scan-line entry', () => {
    test('parabola crossed by horizontal scan line at y=4 over x∈[-5,5]', () => {
        const q = Q(P(-3, 9), P(0, -9), P(3, 9));
        const i = new Intersections();
        const n = i.horizontalQuad(q, -5, 5, 4, false);
        assert.equal(n, 2);
        for (let k = 0; k < n; ++k) assert.ok(APPROX(i.pt(k).fY, 4));
    });
});

describe('Intersections.verticalQuad — scan-line entry', () => {
    test('parabola crossed by vertical scan line at x=0 → one root', () => {
        const q = Q(P(-3, 9), P(0, -9), P(3, 9));
        const i = new Intersections();
        const n = i.verticalQuad(q, -10, 10, 0, false);
        assert.equal(n, 1);
        assert.ok(APPROX(i.pt(0).fX, 0));
    });
});
