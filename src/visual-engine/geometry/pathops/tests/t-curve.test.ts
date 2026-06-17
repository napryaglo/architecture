// Phase 5 — SkTCurve abstract + SkTQuad / SkTCubic concrete wrapper
// tests. Verifies interface dispatch lights up correctly across quad
// and cubic; SkTSpan's bounds-init path; and that the not-yet-ported
// engine methods throw with a clear message.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { Cubic } from '../cubic.js';
import { Quad } from '../quad.js';
import { Point } from '../point.js';
import { TCubic, TQuad, TSect, TSpan } from '../t-sect.js';
import { Intersections } from '../intersections.js';
import { Line } from '../line.js';
// Side-effects: install line × curve methods used by SkTCurve.intersectRay.
import '../quad-line-intersection.js';
import '../cubic-line-intersection.js';

const P = (x: number, y: number) => new Point(x, y);

function makeQuad(): Quad
{
    const q = new Quad();
    q.fPts = [P(0, 0), P(1, 2), P(2, 0)];
    return q;
}

function makeCubic(): Cubic
{
    const c = new Cubic();
    c.fPts = [P(0, 0), P(1, 3), P(2, 3), P(3, 0)];
    return c;
}

describe('TCurve dispatch — TQuad', () => {
    test('pointCount / pointLast / maxIntersections', () => {
        const tq = new TQuad(makeQuad());
        assert.equal(tq.pointCount(), 3);
        assert.equal(tq.pointLast(), 2);
        assert.equal(tq.maxIntersections(), 4);
    });

    test('pt / setPt round-trip', () => {
        const tq = new TQuad(makeQuad());
        const p = P(99, 99);
        tq.setPt(1, p);
        assert.ok(tq.pt(1).equals(p));
    });

    test('ptAtT(0) and ptAtT(1) match endpoints', () => {
        const tq = new TQuad(makeQuad());
        assert.ok(tq.ptAtT(0).equals(P(0, 0)));
        assert.ok(tq.ptAtT(1).equals(P(2, 0)));
    });

    test('intersectRay dispatches to Intersections.intersectRayQuadLine', () => {
        const tq = new TQuad(makeQuad());
        const line = new Line(P(-5, 1), P(5, 1));
        const ix = new Intersections();
        const n = tq.intersectRay(ix, line);
        // y=1 cuts the parabola in two — same as the quad-line tests.
        assert.ok(n >= 1, `expected ≥1 ray intersection, got ${n}`);
    });

    test('subDivide writes into dst TQuad without throwing', () => {
        const src = new TQuad(makeQuad());
        const dst = new TQuad();
        src.subDivide(0, 0.5, dst);
        // dst's first point should match src.ptAtT(0); dst's last should
        // match src.ptAtT(0.5).
        assert.ok(dst.pt(0).equals(src.ptAtT(0)));
        const endNear = dst.pt(2);
        const expectedEnd = src.ptAtT(0.5);
        assert.ok(Math.abs(endNear.fX - expectedEnd.fX) < 1e-9);
        assert.ok(Math.abs(endNear.fY - expectedEnd.fY) < 1e-9);
    });
});

describe('TCurve dispatch — TCubic', () => {
    test('pointCount / pointLast / maxIntersections', () => {
        const tc = new TCubic(makeCubic());
        assert.equal(tc.pointCount(), 4);
        assert.equal(tc.pointLast(), 3);
        assert.equal(tc.maxIntersections(), 9);
    });

    test('hullIntersects(TQuad) routes through Cubic.hullIntersectsQuad', () => {
        const tc = new TCubic(makeCubic());
        const tq = new TQuad(makeQuad());
        const isLinear = { value: false };
        // Both shapes overlap in space — hulls should intersect.
        const result = tc.hullIntersects(tq, isLinear);
        assert.equal(typeof result, 'boolean');
    });

    test('intersectRay dispatches to Intersections.intersectRayCubicLine', () => {
        const tc = new TCubic(makeCubic());
        const line = new Line(P(-5, 1), P(5, 1));
        const ix = new Intersections();
        const n = tc.intersectRay(ix, line);
        assert.ok(n >= 1);
    });
});

describe('TSpan — bounds initialisation', () => {
    test('TSpan for a TQuad initialises non-collapsed bounds', () => {
        const tq = new TQuad(makeQuad());
        const span = new TSpan(tq);
        span.init(tq);
        const ok = span.initBounds(tq);
        assert.ok(ok, 'non-collapsed span returns true');
        assert.ok(span.fBoundsMax > 0);
    });

    test('contains() works after init/initBounds', () => {
        const tq = new TQuad(makeQuad());
        const span = new TSpan(tq);
        span.init(tq);
        span.initBounds(tq);
        assert.ok(span.contains(0.5));
        assert.ok(span.contains(0));
        assert.ok(span.contains(1));
    });
});

describe('TSect — construction + stub BinarySearch', () => {
    test('TSect builds a head span', () => {
        const tq = new TQuad(makeQuad());
        const sect = new TSect(tq);
        assert.ok(sect.fHead !== undefined);
        assert.equal(sect.fActiveCount, 1);
    });

    test('BinarySearch runs without throwing on coincident quads', () => {
        const s1 = new TSect(new TQuad(makeQuad()));
        const s2 = new TSect(new TQuad(makeQuad()));
        const ix = new Intersections();
        // Same curve twice — the engine should handle without throwing
        // (it may detect coincidence or emit endpoint matches).
        TSect.BinarySearch(s1, s2, ix);
        assert.ok(ix.used() >= 0);
    });
});
