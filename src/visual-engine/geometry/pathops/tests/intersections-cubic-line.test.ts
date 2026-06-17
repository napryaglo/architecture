// Phase 5 — SkIntersections::intersect(SkDCubic, SkDLine) port tests.
// Sampled from PathOpsCubicLineIntersectionTest.cpp scenarios; the
// patterns are: 0/1/2/3 interior crossings, endpoint touches, and the
// axis-aligned scan-line entries (horizontalCubic / verticalCubic).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { Cubic } from '../cubic.js';
import { Intersections } from '../intersections.js';
import { Line } from '../line.js';
import { Point } from '../point.js';
// Side-effect import installs intersectCubicLine et al.
import '../cubic-line-intersection.js';

const P = (x: number, y: number) => new Point(x, y);
const C = (p0: Point, p1: Point, p2: Point, p3: Point) => {
    const c = new Cubic();
    c.fPts = [p0, p1, p2, p3];
    return c;
};
const L = (p0: Point, p1: Point) => new Line(p0, p1);

const APPROX = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) < tol;

describe('Intersections.intersectCubicLine — interior crossings', () => {
    test('S-curve crossed by horizontal line through inflection (1 root)', () => {
        // Antisymmetric S-curve through (0, 0) crossing y=0 at t=0.5.
        const c = C(P(-3, -3), P(-1,  3), P(1, -3), P(3, 3));
        const line = L(P(-5, 0), P(5, 0));
        const i = new Intersections();
        const n = i.intersectCubicLine(c, line);
        assert.ok(n >= 1, `expected ≥1 root, got ${n}`);
        // Some root yields y ≈ 0.
        let okIdx = -1;
        for (let k = 0; k < n; ++k) if (APPROX(i.pt(k).fY, 0, 1e-3)) { okIdx = k; break; }
        assert.ok(okIdx >= 0, 'a root has y ≈ 0');
    });

    test('hill cubic crossed by horizontal line below peak (2 roots)', () => {
        // Cubic that rises and falls — control points generate a single
        // hill above y=0.
        const c = C(P(-2, 0), P(-1, 8), P(1, 8), P(2, 0));
        const line = L(P(-5, 3), P(5, 3));
        const i = new Intersections();
        const n = i.intersectCubicLine(c, line);
        assert.ok(n >= 2, `expected ≥2 roots, got ${n}`);
        let withY3 = 0;
        for (let k = 0; k < n; ++k) if (APPROX(i.pt(k).fY, 3, 1e-3)) withY3++;
        assert.ok(withY3 >= 2, 'at least two roots have y ≈ 3');
    });
});

describe('Intersections.intersectCubicLine — endpoint touches', () => {
    test('line ends exactly on a cubic endpoint', () => {
        const c = C(P(0, 0), P(1, 5), P(2, 5), P(3, 0));
        const line = L(P(-5, 0), P(0, 0));
        const i = new Intersections();
        const n = i.intersectCubicLine(c, line);
        assert.ok(n >= 1);
        // First (sorted by t_cubic) result should be the endpoint.
        const endpointMatch
            = (APPROX(i.fT[0]![0]!, 0) && APPROX(i.fT[1]![0]!, 1))
           || (APPROX(i.fT[0]![n - 1]!, 0) && APPROX(i.fT[1]![n - 1]!, 1));
        assert.ok(endpointMatch, 'endpoint t-pair (cubic=0, line=1) present');
    });
});

describe('Intersections.intersectCubicLine — no intersection', () => {
    test('cubic sitting above a horizontal line', () => {
        const c = C(P(-1, 5), P(0, 8), P(0, 8), P(1, 5));
        const line = L(P(-5, 0), P(5, 0));
        const i = new Intersections();
        const n = i.intersectCubicLine(c, line);
        assert.equal(n, 0);
    });

    test('line entirely to the side of the cubic', () => {
        const c = C(P(0, 0), P(1, 1), P(2, 1), P(3, 0));
        const line = L(P(10, -5), P(10, 5));
        const i = new Intersections();
        const n = i.intersectCubicLine(c, line);
        assert.equal(n, 0);
    });
});

describe('Intersections.horizontalCubic / verticalCubic', () => {
    test('horizontalCubic at y=3 over [-5, 5] catches the hill cubic twice', () => {
        const c = C(P(-2, 0), P(-1, 8), P(1, 8), P(2, 0));
        const i = new Intersections();
        const n = i.horizontalCubic(c, -5, 5, 3, false);
        assert.ok(n >= 2);
        for (let k = 0; k < n; ++k) assert.ok(APPROX(i.pt(k).fY, 3, 1e-3));
    });

    test('verticalCubic at x=0 produces one root', () => {
        const c = C(P(-2, 0), P(-1, 8), P(1, 8), P(2, 0));
        const i = new Intersections();
        const n = i.verticalCubic(c, -10, 10, 0, false);
        assert.equal(n, 1);
        assert.ok(APPROX(i.pt(0).fX, 0));
    });
});
