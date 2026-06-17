// Phase 6 foundation tests. Cover:
//   * OpGlobalState — phase transitions, ID counters, winding-failed.
//   * OpPtT — ring construction via init / addOpp / insert, navigation
//     (next / prev / find / containsSegment), Overlaps static helper.
//   * OpSpanBase / OpSpan — initBase / init wire up pt-T correctly;
//     fCoinEnd ring stays consistent across insertCoinEnd; the
//     fCoincident ring on OpSpan ditto.
//   * OpAngle skeleton — set() captures (start, end) and mints an ID;
//     ring-walking helpers (loopCount / loopContains / previous) work
//     once a ring is built through the test-only append.
//
// All cross-class methods that defer to OpSegment / OpCoincidence
// throw a clear "Phase 6 follow-up" error; the tests below stay on
// the foundation surface so they pass against the current skeleton.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { Point } from '../point.js';
import { OpGlobalState, OpPhase } from '../op-global-state.js';
import { OpPtT, OpSpan, OpSpanBase } from '../op-span.js';
import { OpAngle } from '../op-angle.js';
import {
    OpVerb,
    type OpContourLike,
    type OpSegmentLike,
} from '../op-fwd.js';
import { OpContour } from '../op-contour.js';
import { OpSegment } from '../op-segment.js';

// ── Test scaffolding ──────────────────────────────────────────────
//
// Now that OpSegment + OpContour are ported, the foundation tests use
// a real segment instead of an OpSegmentLike stub.

function makeRig(): {
    state: OpGlobalState;
    contour: OpContour;
    segment: OpSegmentLike;
}
{
    const state = new OpGlobalState();
    const contour = new OpContour();
    contour.init(state, false, false);
    const segment = contour.addLine([new Point(0, 0), new Point(1, 0)]);
    return { state, contour, segment };
}

// ── OpGlobalState ─────────────────────────────────────────────────

describe('OpGlobalState — phase + ID counters', () => {
    test('default phase is kNoChange; setPhase transitions; same-phase throws', () => {
        const s = new OpGlobalState();
        assert.equal(s.phase(), OpPhase.kNoChange);
        s.setPhase(OpPhase.kIntersecting);
        assert.equal(s.phase(), OpPhase.kIntersecting);
        // kNoChange is a no-op.
        s.setPhase(OpPhase.kNoChange);
        assert.equal(s.phase(), OpPhase.kIntersecting);
        // Same-phase transition throws.
        assert.throws(() => s.setPhase(OpPhase.kIntersecting));
        // Different phase is fine.
        s.setPhase(OpPhase.kWalking);
        assert.equal(s.phase(), OpPhase.kWalking);
    });

    test('ID counters mint monotonic values per slot', () => {
        const s = new OpGlobalState();
        assert.equal(s.nextAngleID(),   1);
        assert.equal(s.nextAngleID(),   2);
        assert.equal(s.nextPtTID(),     1);
        assert.equal(s.nextSpanID(),    1);
        assert.equal(s.nextSegmentID(), 1);
        assert.equal(s.nextContourID(), 1);
        assert.equal(s.nextCoinID(),    1);
        // Slots are independent.
        assert.equal(s.nextAngleID(), 3);
    });

    test('winding-failed sticky bit', () => {
        const s = new OpGlobalState();
        assert.equal(s.windingFailed(), false);
        s.setWindingFailed();
        assert.equal(s.windingFailed(), true);
        s.setWindingFailed();   // idempotent
        assert.equal(s.windingFailed(), true);
    });

    test('nested counter + allocatedOpSpan flag', () => {
        const s = new OpGlobalState();
        assert.equal(s.nested(), 0);
        s.bumpNested();
        s.bumpNested();
        assert.equal(s.nested(), 2);
        s.clearNested();
        assert.equal(s.nested(), 0);
        assert.equal(s.allocatedOpSpan(), false);
        s.setAllocatedOpSpan();
        assert.equal(s.allocatedOpSpan(), true);
        s.resetAllocatedOpSpan();
        assert.equal(s.allocatedOpSpan(), false);
    });
});

// ── OpPtT ─────────────────────────────────────────────────────────

describe('OpPtT — initialisation + ring walks', () => {
    test('init sets t / pt / fSpan and self-links fNext', () => {
        const rig = makeRig();
        const span = new OpSpanBase();
        span.initBase(rig.segment, undefined, 0.25, new Point(2, 3));
        const ptT = span.ptT();
        assert.equal(ptT.fT, 0.25);
        assert.ok(ptT.fPt.equals(new Point(2, 3)));
        assert.equal(ptT.span(), span);
        assert.equal(ptT.next(), ptT, 'fresh ptT self-loops');
        assert.equal(ptT.deleted(), false);
        assert.equal(ptT.coincident(), false);
    });

    test('addOpp links two pt-Ts into a 2-element ring', () => {
        const rig = makeRig();
        const a = new OpSpanBase();
        const b = new OpSpanBase();
        a.initBase(rig.segment, undefined, 0.2, new Point(0, 0));
        b.initBase(rig.segment, undefined, 0.7, new Point(0, 0));
        const aP = a.ptT();
        const bP = b.ptT();
        // oppPrev on a fresh self-linked b just returns b itself.
        const oppPrev = aP.oppPrev(bP);
        assert.equal(oppPrev, bP);
        aP.addOpp(bP, oppPrev!);
        assert.equal(aP.next(), bP);
        assert.equal(bP.next(), aP);
        assert.ok(aP.containsPtT(bP));
        assert.ok(bP.containsPtT(aP));
    });

    test('Overlaps detects an interval intersection in t-space', () => {
        const rig = makeRig();
        const s1 = new OpSpanBase();
        const e1 = new OpSpanBase();
        const s2 = new OpSpanBase();
        const e2 = new OpSpanBase();
        s1.initBase(rig.segment, undefined, 0.0, new Point(0, 0));
        e1.initBase(rig.segment, undefined, 0.6, new Point(0, 0));
        s2.initBase(rig.segment, undefined, 0.4, new Point(0, 0));
        e2.initBase(rig.segment, undefined, 0.9, new Point(0, 0));
        const r = OpPtT.Overlaps(s1.ptT(), e1.ptT(), s2.ptT(), e2.ptT());
        assert.equal(r.overlaps, true);
        assert.equal(r.sOut!.fT, 0.4);
        assert.equal(r.eOut!.fT, 0.6);
    });

    test('Overlaps reports no-overlap for disjoint intervals', () => {
        const rig = makeRig();
        const s1 = new OpSpanBase();
        const e1 = new OpSpanBase();
        const s2 = new OpSpanBase();
        const e2 = new OpSpanBase();
        s1.initBase(rig.segment, undefined, 0.0, new Point(0, 0));
        e1.initBase(rig.segment, undefined, 0.3, new Point(0, 0));
        s2.initBase(rig.segment, undefined, 0.5, new Point(0, 0));
        e2.initBase(rig.segment, undefined, 0.9, new Point(0, 0));
        const r = OpPtT.Overlaps(s1.ptT(), e1.ptT(), s2.ptT(), e2.ptT());
        assert.equal(r.overlaps, false);
    });

    test('setDeleted + setCoincident flag handling', () => {
        const rig = makeRig();
        const span = new OpSpanBase();
        span.initBase(rig.segment, undefined, 0.5, new Point(0, 0));
        const p = span.ptT();
        p.setCoincident();
        assert.equal(p.coincident(), true);
        p.setDeleted();
        assert.equal(p.deleted(), true);
        // setCoincident after delete throws.
        assert.throws(() => p.setCoincident());
        // setDeleted twice throws.
        assert.throws(() => p.setDeleted());
    });
});

// ── OpSpanBase ─────────────────────────────────────────────────────

describe('OpSpanBase — init + fCoinEnd ring + simple()', () => {
    test('initBase sets fields and mints a span ID', () => {
        const rig = makeRig();
        const span = new OpSpanBase();
        span.initBase(rig.segment, undefined, 0.3, new Point(4, 5));
        assert.equal(span.t(), 0.3);
        assert.ok(span.pt().equals(new Point(4, 5)));
        assert.equal(span.segment(), rig.segment);
        assert.equal(span.final(), false);
        assert.equal(span.coinEnd(), span, 'fCoinEnd self-links');
        assert.ok(span.fID > 0);
    });

    test('final() is true exactly when t === 1', () => {
        const rig = makeRig();
        const final = new OpSpanBase();
        const inner = new OpSpanBase();
        final.initBase(rig.segment, undefined, 1.0, new Point(1, 0));
        inner.initBase(rig.segment, undefined, 0.5, new Point(0.5, 0));
        assert.equal(final.final(), true);
        assert.equal(inner.final(), false);
        // upCast() on final span throws.
        assert.throws(() => final.upCast());
        // upCast() on inner span returns the span (it IS an OpSpan in
        // production; foundation tests just verify the contract).
        // upCastable returns undefined for final, this for inner.
        assert.equal(final.upCastable(), undefined);
    });

    test('insertCoinEnd weaves two spans into a coincident-end ring', () => {
        const rig = makeRig();
        const a = new OpSpanBase();
        const b = new OpSpanBase();
        a.initBase(rig.segment, undefined, 0.4, new Point(0, 0));
        b.initBase(rig.segment, undefined, 0.6, new Point(0, 0));
        // Initially self-loops.
        assert.equal(a.coinEnd(), a);
        assert.equal(b.coinEnd(), b);
        a.insertCoinEnd(b);
        // After insert, walking fCoinEnd from a should hit b and vice
        // versa — the ring length is 2.
        assert.ok(a.containsCoinEndSpan(b));
        assert.ok(b.containsCoinEndSpan(a));
        // Idempotent: re-insert leaves the ring as-is (silent).
        a.insertCoinEnd(b);
        assert.ok(a.containsCoinEndSpan(b));
    });

    test('simple() is true on a single-element pt-T ring', () => {
        const rig = makeRig();
        const span = new OpSpanBase();
        span.initBase(rig.segment, undefined, 0.5, new Point(0, 0));
        // A fresh pt-T ring is self-looped; Skia's simple() checks
        // that next.next === self, which is true for a self-loop too.
        assert.equal(span.simple(), true);
    });

    test('checkForCollapsedCoincidence is safe with no coincidence wired', () => {
        const rig = makeRig();
        const a = new OpSpanBase();
        a.initBase(rig.segment, undefined, 0.5, new Point(0, 0));
        // No OpCoincidence is bound to the rig's global state — the
        // method should silently no-op rather than crash. merge /
        // mergeMatches were ported in chunk 4; their live behaviour is
        // covered by op-coincidence.test.ts.
        assert.doesNotThrow(() => a.checkForCollapsedCoincidence());
    });
});

// ── OpSpan ─────────────────────────────────────────────────────────

describe('OpSpan — init + winding accumulators + fCoincident ring', () => {
    test('init wires defaults and rejects t === 1', () => {
        const rig = makeRig();
        const s = new OpSpan();
        s.init(rig.segment, undefined, 0.5, new Point(0.5, 0));
        assert.equal(s.t(), 0.5);
        assert.equal(s.windValue(), 1, 'default windValue is 1');
        assert.equal(s.oppValue(),  0);
        assert.equal(s.windSum(),  -0x80000000 | 0, 'windSum starts unset (SK_MinS32)');
        assert.equal(s.oppSum(),   -0x80000000 | 0);
        assert.equal(s.done(), false);
        assert.equal(s.isCanceled(), false);
        assert.equal(s.isCoincident(), false);
        // Final span rejection.
        const t = new OpSpan();
        assert.throws(() => t.init(rig.segment, undefined, 1.0, new Point(1, 0)));
    });

    test('setWindValue rejects negative, post-setWindSum, or done-conflict', () => {
        const rig = makeRig();
        const s = new OpSpan();
        s.init(rig.segment, undefined, 0.3, new Point(0, 0));
        assert.throws(() => s.setWindValue(-1));
        s.setWindValue(2);
        assert.equal(s.windValue(), 2);
        // setWindSum should accept once.
        s.setWindSum(5);
        assert.equal(s.windSum(), 5);
        // After windSum is set, setWindValue throws.
        assert.throws(() => s.setWindValue(3));
    });

    test('setWindSum disagreement triggers winding-failed soft-fail', () => {
        const rig = makeRig();
        const s = new OpSpan();
        s.init(rig.segment, undefined, 0.3, new Point(0, 0));
        s.setWindSum(7);
        assert.equal(s.windSum(), 7);
        // Same value — fine, no failure flag.
        s.setWindSum(7);
        assert.equal(rig.state.windingFailed(), false);
        // Different value — flag flips, but stored value stays at 7.
        s.setWindSum(9);
        assert.equal(s.windSum(), 7, 'soft-fail keeps original value');
        assert.equal(rig.state.windingFailed(), true);
    });

    test('insertCoincidence weaves two OpSpans into a coincident ring', () => {
        const rig = makeRig();
        const a = new OpSpan();
        const b = new OpSpan();
        a.init(rig.segment, undefined, 0.2, new Point(0, 0));
        b.init(rig.segment, undefined, 0.8, new Point(0, 0));
        assert.equal(a.isCoincident(), false);
        a.insertCoincidence(b);
        assert.equal(a.isCoincident(), true);
        assert.equal(b.isCoincident(), true);
        assert.ok(a.containsCoincidenceSpan(b));
        assert.ok(b.containsCoincidenceSpan(a));
        // clearCoincident detaches.
        assert.equal(a.clearCoincident(), true);
        assert.equal(a.isCoincident(), false);
        // Idempotent: a second clear returns false.
        assert.equal(a.clearCoincident(), false);
    });

    test('computeWindSum + sortableTop still throw (winding walker pending)', () => {
        const rig = makeRig();
        const s = new OpSpan();
        s.init(rig.segment, undefined, 0.4, new Point(0, 0));
        // release was ported in chunk 4; computeWindSum / sortableTop
        // wait for the winding walker (Phase 6 future chunk).
        assert.throws(() => s.computeWindSum(), /Phase 6 follow-up/);
        assert.throws(() => s.sortableTop(undefined), /Phase 6 follow-up/);
    });
});

// ── OpAngle skeleton ──────────────────────────────────────────────

describe('OpAngle — set() captures spans + ring walks', () => {
    test('set captures start/end and mints a unique ID', () => {
        const rig = makeRig();
        const start = new OpSpan();
        const end   = new OpSpanBase();
        start.init(rig.segment, undefined, 0.2, new Point(0, 0));
        end.initBase(rig.segment, undefined, 0.8, new Point(0, 0));
        const angle = new OpAngle();
        angle.set(start, end);
        assert.equal(angle.start(), start);
        assert.equal(angle.end(),   end);
        assert.ok(angle.fID > 0);
        // start === end is rejected.
        assert.throws(() => angle.set(start, start));
    });

    test('midT averages start.t() and end.t()', () => {
        const rig = makeRig();
        const a = new OpSpan();
        const b = new OpSpanBase();
        // Use t-values whose sum is exactly representable in float64
        // so the midpoint doesn't drift by ULPs.
        a.init(rig.segment, undefined, 0.25, new Point(0, 0));
        b.initBase(rig.segment, undefined, 0.75, new Point(0, 0));
        const angle = new OpAngle();
        angle.set(a, b);
        assert.equal(angle.midT(), 0.5);
    });

    test('loopCount / loopContains / previous walk a test-built ring', () => {
        const rig = makeRig();
        // Build three spans + three angles in a 3-element ring.
        const sA = new OpSpan(); const eA = new OpSpanBase();
        const sB = new OpSpan(); const eB = new OpSpanBase();
        const sC = new OpSpan(); const eC = new OpSpanBase();
        sA.init(rig.segment, undefined, 0.0, new Point(0, 0));
        eA.initBase(rig.segment, undefined, 0.3, new Point(0, 0));
        sB.init(rig.segment, undefined, 0.3, new Point(0, 0));
        eB.initBase(rig.segment, undefined, 0.6, new Point(0, 0));
        sC.init(rig.segment, undefined, 0.6, new Point(0, 0));
        eC.initBase(rig.segment, undefined, 1.0, new Point(0, 0));
        const aA = new OpAngle(); aA.set(sA, eA);
        const aB = new OpAngle(); aB.set(sB, eB);
        const aC = new OpAngle(); aC.set(sC, eC);
        // Build ring aA -> aB -> aC -> aA via the test-only appender.
        aA._appendTestOnly(aB);
        aA._appendTestOnly(aC);
        assert.equal(aA.loopCount(), 3);
        assert.equal(aA.previous(), aC, 'predecessor of aA is aC');
        assert.equal(aB.previous(), aA);
        // loopContains: an angle whose start.t === aB.end.t (0.6) AND
        // end.t === aB.start.t (0.3) on the same segment qualifies.
        // Build it: start at sC (t=0.6) end at eA (t=0.3) — wait, eA
        // is on a different range. Construct a custom probe instead.
        const probeStart = new OpSpan(); probeStart.init(rig.segment, undefined, 0.6, new Point(0, 0));
        const probeEnd   = new OpSpanBase(); probeEnd.initBase(rig.segment, undefined, 0.3, new Point(0, 0));
        const probe = new OpAngle();
        probe.set(probeStart, probeEnd);
        // aA's ring contains aB whose start.t=0.3 / end.t=0.6.
        // loopContains() looks for any ring-mate whose start.t equals
        // probe.end.t (0.3) AND end.t equals probe.start.t (0.6).
        // aB matches: start.t=0.3 === probe.end.t, end.t=0.6 ===
        // probe.start.t. So loopContains(probe) on aA returns true.
        assert.ok(aA.loopContains(probe), 'aB matches probe via reverse-end pairing');
    });

    test('previous on an unlinked angle throws', () => {
        const rig = makeRig();
        const start = new OpSpan();
        const end   = new OpSpanBase();
        start.init(rig.segment, undefined, 0.0, new Point(0, 0));
        end.initBase(rig.segment, undefined, 1.0, new Point(0, 0));
        const a = new OpAngle();
        a.set(start, end);
        assert.throws(() => a.previous());
    });

    // The "Phase 6 follow-up stubs throw" probe lived here while the
    // sort kernel was unported. Chunk 3 implemented after / orderable /
    // setSpans / setSector / insert / merge; the new test surface for
    // those lives in `op-angle.test.ts` and covers the live kernel.
});
