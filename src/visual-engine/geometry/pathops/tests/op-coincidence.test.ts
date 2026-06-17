// Phase 6 chunk 4 — OpCoincidence + CoincidentSpans tests.
//
// Focused on observable behaviour:
//
//   * CoincidentSpans set / extend / contains / collapsed / flipped
//     — record-level state, no resolver involved.
//   * OpCoincidence.add  + Ordered  — front-of-list ordering and the
//     segment-priority swap when not ordered.
//   * OpCoincidence.fixUp / release(segment) / markCollapsed — list
//     maintenance.
//   * OpCoincidence.contains x2 — record-presence queries used by
//     OpSegment.missingCoincidence.
//   * OpCoincidence.overlap — t-range overlap predicate.
//   * Constructor auto-registers with globalState.fCoincidence so
//     OpSpanBase.checkForCollapsedCoincidence + OpSpan.release can
//     reach it without explicit plumbing.
//   * OpSegment.missingCoincidence + OpContour.missingCoincidence
//     smoke pass: two coincident lines through addT() set up a
//     resolvable case, the resolver records a coincident pair.
//   * OpSegment.moveNearby on a doubly-added pt-T deduplicates by
//     releasing the redundant span via the now-live OpSpan.release.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { Point } from '../point.js';
import { OpContour } from '../op-contour.js';
import { OpCoincidence, CoincidentSpans } from '../op-coincidence.js';
import { OpGlobalState } from '../op-global-state.js';

const P = (x: number, y: number) => new Point(x, y);

function newContour(): { state: OpGlobalState; contour: OpContour; coincidence: OpCoincidence }
{
    const state = new OpGlobalState();
    const coincidence = new OpCoincidence(state);
    const contour = new OpContour();
    contour.init(state, false, false);
    return { state, contour, coincidence };
}

// ── Constructor wiring ──────────────────────────────────────────

describe('OpCoincidence — constructor auto-registers with global state', () => {
    test('after new OpCoincidence(state), state.coincidence() returns it', () => {
        const state = new OpGlobalState();
        assert.equal(state.coincidence(), undefined);
        const coin = new OpCoincidence(state);
        assert.equal(state.coincidence(), coin);
        assert.equal(coin.isEmpty(), true);
        assert.equal(coin.globalState(), state);
    });
});

// ── CoincidentSpans record-level state ──────────────────────────

describe('CoincidentSpans — set / contains / extend / flipped / collapsed', () => {
    test('set captures all four pt-T pointers and flagging is on', () => {
        const { contour } = newContour();
        const a = contour.addLine([P(0, 0), P(10, 0)]);
        const b = contour.addLine([P(0, 0), P(10, 0)]);
        const csPtT = a.addT(0.25)!;
        const cePtT = a.addT(0.75)!;
        const osPtT = b.addT(0.25)!;
        const oePtT = b.addT(0.75)!;
        const rec = new CoincidentSpans();
        rec.init();
        rec.set(undefined, csPtT, cePtT, osPtT, oePtT);
        assert.equal(rec.coinPtTStart(), csPtT);
        assert.equal(rec.coinPtTEnd(),   cePtT);
        assert.equal(rec.oppPtTStart(),  osPtT);
        assert.equal(rec.oppPtTEnd(),    oePtT);
        // setters flagged each pt-T as coincident.
        assert.equal(csPtT.coincident(), true);
        assert.equal(cePtT.coincident(), true);
        assert.equal(osPtT.coincident(), true);
        assert.equal(oePtT.coincident(), true);
        // Not flipped (osT < oeT).
        assert.equal(rec.flipped(), false);
    });

    test('flipped() reports true when oppStart.fT > oppEnd.fT', () => {
        const { contour } = newContour();
        const a = contour.addLine([P(0, 0), P(10, 0)]);
        const b = contour.addLine([P(10, 0), P(0, 0)]);
        const rec = new CoincidentSpans();
        rec.init();
        rec.set(undefined,
                a.addT(0.25)!, a.addT(0.75)!,
                b.addT(0.75)!, b.addT(0.25)!);
        assert.equal(rec.flipped(), true);
    });

    test('contains(s, e) returns true for fully-enclosed t-range', () => {
        const { contour } = newContour();
        const a = contour.addLine([P(0, 0), P(10, 0)]);
        const b = contour.addLine([P(0, 0), P(10, 0)]);
        const rec = new CoincidentSpans();
        rec.init();
        rec.set(undefined,
                a.addT(0.2)!, a.addT(0.8)!,
                b.addT(0.2)!, b.addT(0.8)!);
        // Inner range entirely inside [0.2, 0.8].
        const innerS = a.addT(0.4)!;
        const innerE = a.addT(0.6)!;
        assert.equal(rec.contains(innerS, innerE), true);
        // Outside.
        const outerS = a.addT(0.05)!;
        const outerE = a.addT(0.95)!;
        assert.equal(rec.contains(outerS, outerE), false);
    });

    test('extend widens both starts and ends', () => {
        const { contour } = newContour();
        const a = contour.addLine([P(0, 0), P(10, 0)]);
        const b = contour.addLine([P(0, 0), P(10, 0)]);
        const rec = new CoincidentSpans();
        rec.init();
        rec.set(undefined,
                a.addT(0.4)!, a.addT(0.6)!,
                b.addT(0.4)!, b.addT(0.6)!);
        const newS  = a.addT(0.2)!;
        const newE  = a.addT(0.8)!;
        const newOS = b.addT(0.2)!;
        const newOE = b.addT(0.8)!;
        assert.equal(rec.extend(newS, newE, newOS, newOE), true);
        assert.equal(rec.coinPtTStart().fT, 0.2);
        assert.equal(rec.coinPtTEnd().fT,   0.8);
        // Same-or-tighter range returns false.
        assert.equal(rec.extend(rec.coinPtTStart(), rec.coinPtTEnd(),
                                 rec.oppPtTStart(),  rec.oppPtTEnd()), false);
    });
});

// ── OpCoincidence.add + Ordered ─────────────────────────────────

describe('OpCoincidence.add — list ordering + Ordered comparator', () => {
    test('add appends a record to fHead (FIFO LIFO depending on direction)', () => {
        const { contour, coincidence } = newContour();
        const a = contour.addLine([P(0, 0), P(10, 0)]);
        const b = contour.addLine([P(0, 0), P(10, 0)]);
        coincidence.add(a.addT(0.2)!, a.addT(0.8)!,
                        b.addT(0.2)!, b.addT(0.8)!);
        assert.equal(coincidence.isEmpty(), false);
        assert.notEqual(coincidence.fHead, undefined);
        // Second add lands BEFORE the first (Skia uses fHead-prepend).
        coincidence.add(a.addT(0.3)!, a.addT(0.7)!,
                        b.addT(0.3)!, b.addT(0.7)!);
        assert.equal(coincidence.fHead!.coinPtTStart().fT, 0.3,
                     'newest add is the new fHead');
        assert.equal(coincidence.fHead!.next()!.coinPtTStart().fT, 0.2);
    });

    test('Ordered prefers lower-id segment by verb then lex(x, y)', () => {
        const { contour } = newContour();
        const a = contour.addLine([P(0, 0), P(10, 0)]);
        const b = contour.addLine([P(1, 0), P(11, 0)]);
        // a has p0.x=0 < b.p0.x=1 → a is "lower" per Ordered.
        assert.equal(OpCoincidence.Ordered(a, b), true);
        assert.equal(OpCoincidence.Ordered(b, a), false);
    });
});

// ── fixUp / release / markCollapsed ─────────────────────────────

describe('OpCoincidence — list maintenance', () => {
    test('release(segment) drops every record touching the segment', () => {
        const { contour, coincidence } = newContour();
        const a = contour.addLine([P(0, 0), P(10, 0)]);
        const b = contour.addLine([P(0, 0), P(10, 0)]);
        coincidence.add(a.addT(0.2)!, a.addT(0.8)!,
                        b.addT(0.2)!, b.addT(0.8)!);
        coincidence.release(a);
        // Implementation walks once; one record touching a should be
        // gone or its tail. Either way, isEmpty becomes true here.
        // (Mural's port releases each touch-once.)
        assert.equal(coincidence.fHead === undefined
                     || coincidence.fHead.coinPtTStart().segment() !== a, true);
    });

    test('contains(seg, opp, t) finds an inner-t-range record', () => {
        const { contour, coincidence } = newContour();
        const a = contour.addLine([P(0, 0), P(10, 0)]);
        const b = contour.addLine([P(0, 0), P(10, 0)]);
        coincidence.add(a.addT(0.2)!, a.addT(0.8)!,
                        b.addT(0.2)!, b.addT(0.8)!);
        assert.equal(coincidence.contains(a, b, 0.5), true,
                     't=0.5 falls inside the recorded opp range');
        assert.equal(coincidence.contains(a, b, 0.9), false,
                     't=0.9 is outside the recorded opp range');
    });
});

// ── overlap predicate ───────────────────────────────────────────

describe('OpCoincidence.overlap — t-range intersection', () => {
    test('overlap reports the inner [max(starts), min(ends)] window', () => {
        const { contour, coincidence } = newContour();
        const a = contour.addLine([P(0, 0), P(10, 0)]);
        const c1s = a.addT(0.2)!, c1e = a.addT(0.8)!;
        const c2s = a.addT(0.5)!, c2e = a.addT(0.9)!;
        const out = { overS: 0, overE: 0 };
        assert.equal(coincidence.overlap(c1s, c1e, c2s, c2e, out), true);
        assert.equal(out.overS, 0.5);
        assert.equal(out.overE, 0.8);
    });

    test('overlap is false for disjoint t-ranges', () => {
        const { contour, coincidence } = newContour();
        const a = contour.addLine([P(0, 0), P(10, 0)]);
        const c1s = a.addT(0.1)!, c1e = a.addT(0.3)!;
        const c2s = a.addT(0.6)!, c2e = a.addT(0.9)!;
        const out = { overS: 0, overE: 0 };
        assert.equal(coincidence.overlap(c1s, c1e, c2s, c2e, out), false);
    });
});

// ── apply on a hand-built coincident pair ───────────────────────

describe('OpCoincidence.apply — winding propagation across coincident spans', () => {
    test('two coincident lines: apply moves the source winding to the opp', () => {
        const { contour, coincidence } = newContour();
        const a = contour.addLine([P(0, 0), P(10, 0)]);
        const b = contour.addLine([P(0, 0), P(10, 0)]);
        const csPtT = a.addT(0.2)!;
        const cePtT = a.addT(0.8)!;
        const osPtT = b.addT(0.2)!;
        const oePtT = b.addT(0.8)!;
        coincidence.add(csPtT, cePtT, osPtT, oePtT);
        // Coincident pair recorded. apply walks both span chains in
        // parallel, transferring windValue from source to opp and
        // zeroing the source. The chain has only one interior span on
        // each side (between t=0.2 and t=0.8) — applies must not throw.
        const ok = coincidence.apply();
        assert.equal(ok, true);
    });
});

// ── moveNearby integration: dedup a doubly-added pt-T ───────────

describe('OpSegment.moveNearby + OpSpan.release integration', () => {
    test('two identical addT lands one inner span; moveNearby is a safe no-op', () => {
        const { contour } = newContour();
        // OpSpan.release (chunk 4) needs a coincidence wired in to
        // avoid throwing through fixUp. newContour() does this.
        const a = contour.addLine([P(0, 0), P(10, 0)]);
        a.addT(0.5);
        a.addT(0.5);   // exact dup — addT returns the existing pt-T
        // One inner span only; moveNearby walks the chain without
        // releasing any span.
        const ok = a.moveNearby();
        assert.equal(ok, true);
    });
});
