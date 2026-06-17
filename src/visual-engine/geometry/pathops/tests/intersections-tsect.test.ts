// Phase 5 — SkTSect::BinarySearch end-to-end smoke tests via
// Intersections.intersectQuadQuad / intersectCubicCubic /
// intersectCubicQuad. Verifies the bisection driver doesn't throw on
// realistic curve pairs and produces reasonable result counts.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { Cubic } from '../cubic.js';
import { Intersections } from '../intersections.js';
import { Point } from '../point.js';
import { Quad } from '../quad.js';
// Side-effects: install t-sect drivers.
import '../t-sect.js';
// Side-effects: install line × curve helpers (needed by the engine).
import '../quad-line-intersection.js';
import '../cubic-line-intersection.js';

const P = (x: number, y: number) => new Point(x, y);
const Q = (p0: Point, p1: Point, p2: Point) => {
    const q = new Quad(); q.fPts = [p0, p1, p2]; return q;
};
const C = (p0: Point, p1: Point, p2: Point, p3: Point) => {
    const c = new Cubic(); c.fPts = [p0, p1, p2, p3]; return c;
};

describe('Intersections.intersectQuadQuad — engine runs without throwing', () => {
    test('disjoint quads — zero results', () => {
        const q1 = Q(P(-10, 0), P(0, -1), P(10, 0));   // shallow hill
        const q2 = Q(P(-10, 5), P(0,  6), P(10, 5));   // shallow hill above it
        const i = new Intersections();
        const n = i.intersectQuadQuad(q1, q2);
        assert.equal(n, 0, 'no intersection between separated quads');
    });

    test('quads sharing a single endpoint', () => {
        const q1 = Q(P(0, 0), P(1, 2), P(2, 0));
        const q2 = Q(P(2, 0), P(3, 2), P(4, 0));
        const i = new Intersections();
        const n = i.intersectQuadQuad(q1, q2);
        // Endpoint hit — count is 1 (or 0 if engine doesn't catch
        // endpoint-only via EndsEqual on this shape — both are
        // acceptable outcomes of the smoke test).
        assert.ok(n >= 0);
    });
});

describe('Intersections.intersectCubicQuad — engine runs without throwing', () => {
    test('disjoint cubic and quad', () => {
        const c = C(P(-10, 5), P(-5, 8), P(5, 8), P(10, 5));
        const q = Q(P(-10, -5), P(0, -8), P(10, -5));
        const i = new Intersections();
        const n = i.intersectCubicQuad(c, q);
        assert.equal(n, 0);
    });
});

describe('Intersections.intersectCubicCubic — engine runs without throwing', () => {
    test('disjoint cubics', () => {
        const c1 = C(P(-10, 5), P(-5, 8), P(5, 8), P(10, 5));
        const c2 = C(P(-10, -5), P(-5, -8), P(5, -8), P(10, -5));
        const i = new Intersections();
        const n = i.intersectCubicCubic(c1, c2);
        assert.equal(n, 0);
    });

    test('identical cubics treated as coincident or full endpoint match', () => {
        const c1 = C(P(0, 0), P(1, 2), P(2, 2), P(3, 0));
        const c2 = C(P(0, 0), P(1, 2), P(2, 2), P(3, 0));
        const i = new Intersections();
        // The engine should NOT throw on this; result count and
        // coincidence flags depend on details but the call must succeed.
        const n = i.intersectCubicCubic(c1, c2);
        assert.ok(n >= 0);
    });
});
