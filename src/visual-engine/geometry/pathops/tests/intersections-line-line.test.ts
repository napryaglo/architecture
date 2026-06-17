// Phase 5 entry tests — SkIntersections::intersect(SkDLine, SkDLine).
// Mirrors the test patterns in Skia's PathOpsLineIntersectionTest.cpp /
// PathOpsTestCommon — pairs of segments with known expected counts and
// (where applicable) parameter values.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { Intersections } from '../intersections.js';
import { Line } from '../line.js';
import { Point } from '../point.js';

const P = (x: number, y: number) => new Point(x, y);
const L = (p0: Point, p1: Point) => new Line(p0, p1);

const APPROX = (a: number, b: number) => Math.abs(a - b) < 1e-9;

describe('Intersections.intersectLineLine — interior cross', () => {
    test('two segments crossing at midpoint produce one hit', () => {
        const a = L(P(0, 0), P(10, 10));
        const b = L(P(10, 0), P(0, 10));
        const i = new Intersections();
        i.intersectLineLine(a, b);
        assert.equal(i.used(), 1);
        assert.ok(APPROX(i.fT[0]![0]!, 0.5), `t0 = ${i.fT[0]![0]}`);
        assert.ok(APPROX(i.fT[1]![0]!, 0.5), `t1 = ${i.fT[1]![0]}`);
        assert.ok(APPROX(i.pt(0).fX, 5));
        assert.ok(APPROX(i.pt(0).fY, 5));
    });

    test('crossing at off-centre point', () => {
        const a = L(P(0, 0), P(10, 0));    // horizontal at y=0
        const b = L(P(3, -2), P(3, 4));    // vertical at x=3
        const i = new Intersections();
        i.intersectLineLine(a, b);
        assert.equal(i.used(), 1);
        assert.ok(APPROX(i.fT[0]![0]!, 0.3), 'cross at x=3 → t=0.3 along [0,10]');
        // b's range is y=-2..4; intersection at y=0 → t = 2/6 = 1/3
        assert.ok(APPROX(i.fT[1]![0]!, 1 / 3));
        assert.ok(APPROX(i.pt(0).fX, 3));
        assert.ok(APPROX(i.pt(0).fY, 0));
    });
});

describe('Intersections.intersectLineLine — endpoint touches', () => {
    test('T-junction: b ends exactly on a interior point', () => {
        const a = L(P(0, 0), P(10, 0));
        const b = L(P(5, 0), P(5, 5));       // b starts on a at t=0.5
        const i = new Intersections();
        i.intersectLineLine(a, b);
        assert.equal(i.used(), 1);
        assert.ok(APPROX(i.fT[0]![0]!, 0.5));
        assert.ok(APPROX(i.fT[1]![0]!, 0));
    });

    test('exact endpoint coincidence: A.end === B.start', () => {
        const a = L(P(0, 0), P(5, 5));
        const b = L(P(5, 5), P(10, 0));
        const i = new Intersections();
        i.intersectLineLine(a, b);
        assert.equal(i.used(), 1);
        assert.ok(APPROX(i.fT[0]![0]!, 1));
        assert.ok(APPROX(i.fT[1]![0]!, 0));
    });
});

describe('Intersections.intersectLineLine — no intersection', () => {
    test('parallel non-coincident lines', () => {
        const a = L(P(0, 0), P(10, 0));
        const b = L(P(0, 5), P(10, 5));
        const i = new Intersections();
        i.intersectLineLine(a, b);
        assert.equal(i.used(), 0);
    });

    test('disjoint segments on the same infinite line — non-overlapping ranges', () => {
        const a = L(P(0, 0), P(2, 0));
        const b = L(P(5, 0), P(7, 0));
        const i = new Intersections();
        i.intersectLineLine(a, b);
        assert.equal(i.used(), 0);
    });

    test('skew lines whose infinite-line intersection is outside both segments', () => {
        const a = L(P(0, 0), P(2, 2));
        const b = L(P(10, 0), P(12, 2));
        const i = new Intersections();
        i.intersectLineLine(a, b);
        assert.equal(i.used(), 0);
    });
});

describe('Intersections.intersectLineLine — coincident segments', () => {
    test('fully overlapping segments produce 2 results marked coincident', () => {
        const a = L(P(0, 0), P(10, 0));
        const b = L(P(2, 0), P(8, 0));
        const i = new Intersections();
        i.intersectLineLine(a, b);
        assert.equal(i.used(), 2, 'two endpoint markers for the overlap');
        assert.ok(i.isCoincident(0));
        assert.ok(i.isCoincident(1));
    });
});

describe('Intersections.intersectLineLine — axis-aligned cross via horizontalLine', () => {
    test('vertical segment vs horizontal scan-line', () => {
        const v = L(P(3, -2), P(3, 4));
        const i = new Intersections();
        // horizontal "line" from x ∈ [0, 10] at y=0
        i.horizontalLine(v, 0, 10, 0, false);
        assert.equal(i.used(), 1);
        assert.ok(APPROX(i.pt(0).fX, 3));
        assert.ok(APPROX(i.pt(0).fY, 0));
    });

    test('horizontal segment vs vertical scan-line', () => {
        const h = L(P(-2, 3), P(4, 3));
        const i = new Intersections();
        // vertical "line" from y ∈ [0, 10] at x=0
        i.verticalLine(h, 0, 10, 0, false);
        assert.equal(i.used(), 1);
        assert.ok(APPROX(i.pt(0).fX, 0));
        assert.ok(APPROX(i.pt(0).fY, 3));
    });
});
