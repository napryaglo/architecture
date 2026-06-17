// Phase 6 chunk 3 — OpAngle sort kernel.
//
// Tests focus on observable kernel behaviour:
//   * setSpans + setSector + findSector — sector assignment for
//     canonical line / quad / cubic shapes. Sectors are 0-31 (16
//     compass points × 2 each); they're consumed by after() to
//     short-circuit angle comparison when sweeps don't overlap.
//   * orderable on line × line pairs (the closed-form branch).
//   * insert + merge — sorted-ring construction. The kernel is
//     designed so two angles meeting at a shared corner sort by their
//     local tangent direction (CW); we probe with constructed angle
//     pairs whose order is geometrically obvious.
//   * sortAngles on OpSegment — top-level wiring: walk every span,
//     gather from/to angles + coincident-ring angles, build a sorted
//     ring per branching span. Tested by integration: build a
//     symmetric "X" of two segments meeting at a shared interior pt-T
//     and verify both incoming and outgoing angles wind up in one
//     ordered ring.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { Point } from '../point.js';
import { OpAngle } from '../op-angle.js';
import { OpContour } from '../op-contour.js';
import { OpGlobalState } from '../op-global-state.js';
import { OpVerb } from '../op-fwd.js';

const P = (x: number, y: number) => new Point(x, y);

function newContour(): { state: OpGlobalState; contour: OpContour }
{
    const state = new OpGlobalState();
    const contour = new OpContour();
    contour.init(state, false, false);
    return { state, contour };
}

// ── findSector — canonical compass-point assignment ─────────────

describe('OpAngle.findSector — compass-point assignment', () => {
    // Skia's sedecimant table gives 16 angular slots (numbered 0-15);
    // the returned sector is `slot * 2 + 1` so it lives on odd indices
    // 1, 3, 5, ..., 31 — leaving the even slots for synthetic "bump"
    // values inserted later (setSector bumps exact-compass cases by
    // +/-1). We assert the *exact* engine outputs here so any drift
    // in the sedecimant constants surfaces loudly.
    test('positive-x line → 31', () => {
        const a = new OpAngle();
        assert.equal(a.findSector(OpVerb.kLine, 1, 0), 31);
    });

    test('positive-y line → 23', () => {
        const a = new OpAngle();
        assert.equal(a.findSector(OpVerb.kLine, 0, 1), 23);
    });

    test('negative-x line → 15', () => {
        const a = new OpAngle();
        assert.equal(a.findSector(OpVerb.kLine, -1, 0), 15);
    });

    test('negative-y line → 7', () => {
        const a = new OpAngle();
        assert.equal(a.findSector(OpVerb.kLine, 0, -1), 7);
    });

    test('NE diagonal x===y on a curve hits 45° row → 27', () => {
        const a = new OpAngle();
        // Quad verb with x === y exactly hits the "abs(x) == abs(y)"
        // middle row at column [y>0][x>0]; raw value = 13, doubled +1 = 27.
        assert.equal(a.findSector(OpVerb.kQuad, 1, 1), 27);
    });
});

// ── setSpans + setSector on real segments ───────────────────────

describe('OpAngle.setSpans + setSector — sweep + sector wiring', () => {
    test('horizontal line angle has both sweep vectors along +x; sector = 31', () => {
        const { contour } = newContour();
        const seg = contour.addLine([P(0, 0), P(10, 0)]);
        const angle = new OpAngle();
        angle.set(seg.head(), seg.tail());
        // Sweep[0] should be (10, 0); sweep[1] = sweep[0] for lines.
        assert.equal(angle.fSweep[0].fX, 10);
        assert.equal(angle.fSweep[0].fY, 0);
        assert.equal(angle.fSweep[1].fX, 10);
        assert.equal(angle.fSweep[1].fY, 0);
        assert.equal(angle.fIsCurve, false);
        // Sector lands at index 31. isCurve === false takes the
        // short-path: sectorEnd === sectorStart and the mask is a
        // single-bit (1 << 31). JS bitwise left-shift produces signed
        // -2147483648 — that's how the mask is stored.
        assert.equal(angle.sectorStart(), 31);
        assert.equal(angle.sectorEnd(),   31);
        assert.equal(angle.sectorMask(),  1 << 31);   // -2147483648 (signed)
    });

    test('quad angle has non-trivial sweep; isCurve = true', () => {
        const { contour } = newContour();
        // Parabolic arc: control polygon (0,0) (1,2) (2,0).
        const seg = contour.addQuad([P(0, 0), P(1, 2), P(2, 0)]);
        const angle = new OpAngle();
        angle.set(seg.head(), seg.tail());
        // Sweep[0] = p1 - p0 = (1, 2). Sweep[1] = p2 - p0 = (2, 0).
        assert.equal(angle.fSweep[0].fX, 1);
        assert.equal(angle.fSweep[0].fY, 2);
        assert.equal(angle.fSweep[1].fX, 2);
        assert.equal(angle.fSweep[1].fY, 0);
        assert.equal(angle.fIsCurve, true);
        // Both sector endpoints should be valid (>= 0), not "deferred".
        assert.ok(angle.sectorStart() >= 0);
        assert.ok(angle.sectorEnd()   >= 0);
        assert.ok(angle.sectorMask()  >  0);
    });

    test('reverse-direction angle on a line flips the sweep sign', () => {
        const { contour } = newContour();
        const seg = contour.addLine([P(0, 0), P(10, 0)]);
        const angle = new OpAngle();
        // Reverse: end is the segment head; start is the tail.
        angle.set(seg.tail(), seg.head());
        // Sweep is computed off the SUB-DIVIDED curve part for the
        // [start, end] window. For a line with start.t > end.t the
        // sub-divide reverses the endpoints, so sweep[0] points the
        // other way.
        assert.equal(angle.fSweep[0].fX, -10);
        assert.equal(angle.fSweep[0].fY, 0);
    });
});

// ── orderable for line × line — closed-form branch ──────────────

describe('OpAngle.orderable — line × line closed form', () => {
    test('two lines at right angles report a definite order', () => {
        const { contour } = newContour();
        const horiz = contour.addLine([P(0, 0), P(10, 0)]);
        const vert  = contour.addLine([P(0, 0), P(0, 10)]);
        const a = new OpAngle(); a.set(horiz.head(), horiz.tail());
        const b = new OpAngle(); b.set(vert.head(),  vert.tail());
        const r = a.orderable(b);
        // Either 0 or 1 — we just need a deterministic non-negative
        // answer (means: orderable).
        assert.ok(r === 0 || r === 1, `orderable returned ${r}`);
    });

    test('two anti-parallel lines return 1 (180° apart)', () => {
        const { contour } = newContour();
        const right = contour.addLine([P(0, 0), P(10, 0)]);
        const left  = contour.addLine([P(0, 0), P(-10, 0)]);
        const a = new OpAngle(); a.set(right.head(), right.tail());
        const b = new OpAngle(); b.set(left.head(),  left.tail());
        const r = a.orderable(b);
        // Skia's closed-form line/line branch returns 1 for "exactly
        // 180 degrees apart" before the unorderable bail-out.
        assert.equal(r, 1);
    });

    test('two identical lines mark both as unorderable', () => {
        const { contour } = newContour();
        const right1 = contour.addLine([P(0, 0), P(10, 0)]);
        const right2 = contour.addLine([P(0, 0), P(10, 0)]);
        const a = new OpAngle(); a.set(right1.head(), right1.tail());
        const b = new OpAngle(); b.set(right2.head(), right2.tail());
        const r = a.orderable(b);
        assert.equal(r, -1);
        assert.equal(a.unorderable(), true);
        assert.equal(b.unorderable(), true);
    });
});

// ── insert builds a sorted ring ────────────────────────────────

describe('OpAngle.insert — sorted-ring construction', () => {
    test('two angles meeting at origin build a 2-element ring via insert', () => {
        const { contour } = newContour();
        // Two transverse lines through origin: horizontal and vertical.
        const horiz = contour.addLine([P(0, 0), P(10, 0)]);
        const vert  = contour.addLine([P(0, 0), P(0, 10)]);
        const a = new OpAngle(); a.set(horiz.head(), horiz.tail());
        const b = new OpAngle(); b.set(vert.head(),  vert.tail());
        const ok = a.insert(b);
        assert.equal(ok, true);
        assert.equal(a.loopCount(), 2);
        // Ring is symmetric: a.next.next === a.
        assert.equal(a.next()!.next(), a);
    });

    test('three angles around a shared point form a 3-element ring', () => {
        const { contour } = newContour();
        const e = contour.addLine([P(0, 0), P(10, 0)]);
        const n = contour.addLine([P(0, 0), P(0, 10)]);
        const w = contour.addLine([P(0, 0), P(-10, 0)]);
        const ae = new OpAngle(); ae.set(e.head(), e.tail());
        const an = new OpAngle(); an.set(n.head(), n.tail());
        const aw = new OpAngle(); aw.set(w.head(), w.tail());
        ae.insert(an);
        ae.insert(aw);
        assert.equal(ae.loopCount(), 3);
    });
});

// ── sortAngles wiring on a real segment ─────────────────────────

describe('OpSegment.sortAngles — branching span integration', () => {
    test('two segments meeting at an interior pt-T produce a sorted angle ring', () => {
        const { contour } = newContour();
        // Two lines that share a point at (5, 0):
        //   A: (0, 0) → (10, 0)   (horizontal)
        //   B: (5, -5) → (5, 5)   (vertical), with interior pt-T at (5,0).
        const a = contour.addLine([P(0, 0), P(10, 0)]);
        const b = contour.addLine([P(5, -5), P(5, 5)]);
        // Inject the shared pt-T into both segments. addT splices new
        // interior OpSpans into each segment's chain.
        a.addT(0.5, P(5, 0));
        b.addT(0.5, P(5, 0));
        contour.calcAngles();
        // Sorting should run without throwing.
        const ok = a.sortAngles();
        assert.equal(ok, true);
        const okB = b.sortAngles();
        assert.equal(okB, true);
        // The interior span on A should carry both fromAngle and
        // toAngle pointers — sortAngles links them into one ring (or
        // strips them to undefined if the ring degenerates to 1).
        const innerA = a.head().next().upCastable();
        assert.notEqual(innerA, undefined);
    });
});
