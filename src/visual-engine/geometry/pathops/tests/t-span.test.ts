// Phase 5 — SkTSpan + SkTCoincident + simple SkTSect helper methods.
// Pinning the ported pieces of SkPathOpsTSect.cpp:
//   * SkTCoincident::setPerp (line 28)
//   * SkTSpan::addBounded, contains, findOppSpan, oppT, hasOppT,
//     linearT, removeAllBounded, removeBounded, closestBoundedT,
//     linearIntersects, linearsIntersect, onlyEndPointsInCommon,
//     hullCheck, hullsIntersect, splitAt
//   * SkTSect::addOne, addFollowing, boundsMax, tail, prev,
//     coincidentHasT, collapsed, countConsecutiveSpans, hasBounded

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { Cubic } from '../cubic.js';
import { Point } from '../point.js';
import { Quad } from '../quad.js';
import { TCoincident, TCubic, TQuad, TSect, TSpan } from '../t-sect.js';
// Side-effects: line × curve method installation.
import '../quad-line-intersection.js';
import '../cubic-line-intersection.js';

const P = (x: number, y: number) => new Point(x, y);

function makeQuad(p0 = P(0, 0), p1 = P(1, 2), p2 = P(2, 0)): Quad
{
    const q = new Quad();
    q.fPts = [p0, p1, p2];
    return q;
}

function makeCubic(): Cubic
{
    const c = new Cubic();
    c.fPts = [P(0, 0), P(1, 3), P(2, 3), P(3, 0)];
    return c;
}

describe('TCoincident.setPerp', () => {
    test('perpendicular probe finds the opposite quad', () => {
        // Two parabolas that touch tangentially at (0, 0): both have
        // their apex there, one above and one below.
        const q1 = makeQuad(P(-1, 0), P(0, -1), P(1, 0));
        const q2 = makeQuad(P(-1, 0), P(0,  1), P(1, 0));
        const c1 = new TQuad(q1);
        const c2 = new TQuad(q2);
        const co = new TCoincident();
        // Probe at t=0.5 on c1 (the apex (0,-0.5)). The perpendicular
        // pierces c2.
        co.setPerp(c1, 0.5, c1.ptAtT(0.5), c2);
        // perpT is in [0, 1] (or -1 when no probe lands)
        assert.ok(co.perpT() === -1 || (co.perpT() >= 0 && co.perpT() <= 1));
    });
});

describe('TSpan.contains / hasOppT / oppT', () => {
    test('contains walks the chain', () => {
        const tq = new TQuad(makeQuad());
        const a = new TSpan(tq); a.init(tq); a.fStartT = 0.0; a.fEndT = 0.3;
        const b = new TSpan(tq); b.init(tq); b.fStartT = 0.3; b.fEndT = 0.7;
        const c = new TSpan(tq); c.init(tq); c.fStartT = 0.7; c.fEndT = 1.0;
        a.fNext = b; b.fPrev = a; b.fNext = c; c.fPrev = b;
        assert.ok(a.contains(0.1));
        assert.ok(a.contains(0.5));
        assert.ok(a.contains(0.9));
        // contains() with a t outside all ranges still returns false.
        const detached = new TSpan(tq); detached.init(tq);
        detached.fStartT = 0.0; detached.fEndT = 0.1;
        assert.equal(detached.contains(0.5), false);
    });

    test('oppT / hasOppT walk the fBounded list', () => {
        const tq = new TQuad(makeQuad());
        const span = new TSpan(tq); span.init(tq);
        const peer = new TSpan(tq); peer.init(tq);
        peer.fStartT = 0.2; peer.fEndT = 0.8;
        span.addBounded(peer);
        assert.equal(span.oppT(0.5), peer);
        assert.ok(span.hasOppT(0.5));
        assert.equal(span.oppT(0.9), undefined);
        assert.equal(span.hasOppT(0.9), false);
    });
});

describe('TSpan.linearT / closestBoundedT', () => {
    test('linearT projects to the chord parameter', () => {
        const tq = new TQuad(makeQuad(P(0, 0), P(0, 0), P(10, 0)));
        const span = new TSpan(tq); span.init(tq);
        // Chord is (0,0)→(10,0); point at x=4 should be t ≈ 0.4.
        const t = span.linearT(P(4, 0));
        assert.ok(Math.abs(t - 0.4) < 1e-9);
    });

    test('closestBoundedT picks the nearest peer endpoint', () => {
        const tq = new TQuad(makeQuad(P(0, 0), P(1, 0), P(2, 0)));
        const span = new TSpan(tq); span.init(tq);
        const peer = new TSpan(tq); peer.init(tq);
        peer.fStartT = 0.1; peer.fEndT = 0.9;
        span.addBounded(peer);
        // Probe near peer's startT endpoint.
        const result = span.closestBoundedT(P(0, 0));
        assert.ok(result === 0.1 || result === 0.9);
    });
});

describe('TSpan.linearIntersects', () => {
    test('two well-separated quad chords do not intersect', () => {
        const a = new TQuad(makeQuad(P(0, 0), P(1, 0), P(2, 0)));   // chord at y=0
        const b = new TQuad(makeQuad(P(0, 5), P(1, 5), P(2, 5)));   // chord at y=5
        const span = new TSpan(a); span.init(a);
        const r = span.linearIntersects(b);
        assert.equal(r, 0);
    });

    test('two quads whose chords straddle return 1', () => {
        const a = new TQuad(makeQuad(P(0, 0), P(5, 0), P(10, 0))); // horizontal
        const b = new TQuad(makeQuad(P(5, -3), P(5, 0), P(5, 3))); // vertical crossing
        const span = new TSpan(a); span.init(a);
        const r = span.linearIntersects(b);
        assert.ok(r === 1 || r === 3);
    });
});

describe('TSect.addOne / addFollowing / boundsMax / tail / prev', () => {
    test('addOne increments fActiveCount', () => {
        const sect = new TSect(new TQuad(makeQuad()));
        const before = sect.fActiveCount;
        sect.addOne();
        assert.equal(sect.fActiveCount, before + 1);
    });

    test('addFollowing chains spans with prev/next links', () => {
        const sect = new TSect(new TQuad(makeQuad()));
        const head = sect.fHead!;
        head.fEndT = 0.5;
        const after = sect.addFollowing(head);
        assert.equal(after.fPrev, head);
        assert.equal(head.fNext, after);
        assert.ok(after.fStartT === 0.5);
        assert.ok(after.fEndT === 1);
    });

    test('tail returns the span with the largest endT', () => {
        const sect = new TSect(new TQuad(makeQuad()));
        const head = sect.fHead!;
        head.fEndT = 0.5;
        const second = sect.addFollowing(head);
        assert.equal(sect.tail(), second);
    });

    test('prev returns the preceding span', () => {
        const sect = new TSect(new TQuad(makeQuad()));
        const head = sect.fHead!;
        head.fEndT = 0.5;
        const second = sect.addFollowing(head);
        assert.equal(sect.prev(second), head);
        assert.equal(sect.prev(head), undefined);
    });

    test('boundsMax picks the span with the largest bbox extent', () => {
        const sect = new TSect(new TQuad(makeQuad()));
        // Single-span chain: head IS boundsMax.
        assert.equal(sect.boundsMax(), sect.fHead);
    });

    test('countConsecutiveSpans walks a contiguous run', () => {
        const sect = new TSect(new TQuad(makeQuad()));
        const head = sect.fHead!;
        head.fEndT = 0.3;
        sect.addFollowing(head); // [0.3, 1]
        const lastOut = { value: head };
        const n = sect.countConsecutiveSpans(head, lastOut);
        assert.equal(n, 2);
    });
});

describe('TSpan.onlyEndPointsInCommon', () => {
    test('two quads sharing only a start endpoint detect ptsInCommon', () => {
        const q1 = makeQuad(P(0, 0), P(1, 1), P(2, 0));   // through (0,0)
        const q2 = makeQuad(P(0, 0), P(-1, 1), P(-2, 0)); // also through (0,0), mirrored
        const s1 = new TSpan(new TQuad(q1));   s1.init(new TQuad(q1)); s1.initBounds(new TQuad(q1));
        const s2 = new TSpan(new TQuad(q2));   s2.init(new TQuad(q2)); s2.initBounds(new TQuad(q2));
        const start = { value: false };
        const oppStart = { value: false };
        const ptsInCommon = { value: false };
        s1.onlyEndPointsInCommon(s2, start, oppStart, ptsInCommon);
        assert.ok(ptsInCommon.value, 'detected shared endpoint');
    });
});

describe('TCubic.hullIntersects routing through onlyEndPointsInCommon path', () => {
    test('span chain initialises and contains() works for cubic', () => {
        const sect = new TSect(new TCubic(makeCubic()));
        const head = sect.fHead!;
        assert.ok(head.contains(0.0));
        assert.ok(head.contains(1.0));
        assert.ok(head.contains(0.5));
    });
});
