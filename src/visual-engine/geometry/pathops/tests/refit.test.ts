// §19-deferred #2 — boolean-op output cleanup.
//
// Two transforms:
//   * `collapseCollinearLines` — drops zero-length lineTo segments,
//     fuses adjacent collinear same-direction lines.
//   * `coalesceSameOriginalCurve` — merges adjacent same-input-curve
//     sub-spans by re-subdividing the source via `Quad.subDivide` /
//     `Cubic.subDivide` on the union t-range.
//
// `refitOpPath` runs both in order. The covered area of every output
// is unchanged — these are cosmetic surface cleanups.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
    coalesceSameOriginalCurve,
    collapseCollinearLines,
    refitOpPath,
} from '../refit.js';
import { OpPath, type CurveProvenance } from '../op-path.js';
import { OpVerb } from '../op-fwd.js';
import { Point } from '../point.js';

const PT = (x: number, y: number): Point => new Point(x, y);

// ── collinear-line collapse ─────────────────────────────────────────

describe('collapseCollinearLines', () => {
    test('two collinear horizontal lines collapse to one', () => {
        const p = new OpPath();
        p.moveTo(PT(0, 0));
        p.lineTo(PT(5, 0));
        p.lineTo(PT(10, 0));
        const out = collapseCollinearLines(p);
        assert.equal(out.fCommands.length, 2);
        assert.equal(out.fCommands[0]!.verb, OpVerb.kMove);
        assert.equal(out.fCommands[1]!.verb, OpVerb.kLine);
        assert.equal(out.fCommands[1]!.pts[0]!.fX, 10);
        assert.equal(out.fCommands[1]!.pts[0]!.fY, 0);
    });

    test('three collinear segments collapse to one', () => {
        const p = new OpPath();
        p.moveTo(PT(0, 0));
        p.lineTo(PT(2, 0));
        p.lineTo(PT(5, 0));
        p.lineTo(PT(10, 0));
        const out = collapseCollinearLines(p);
        assert.equal(out.fCommands.length, 2);
        assert.equal(out.fCommands[1]!.pts[0]!.fX, 10);
    });

    test('non-collinear lines preserved', () => {
        const p = new OpPath();
        p.moveTo(PT(0, 0));
        p.lineTo(PT(5, 0));
        p.lineTo(PT(5, 5));
        const out = collapseCollinearLines(p);
        assert.equal(out.fCommands.length, 3);
    });

    test('reversed direction not merged (doubling back)', () => {
        const p = new OpPath();
        p.moveTo(PT(0, 0));
        p.lineTo(PT(5, 0));
        p.lineTo(PT(2, 0));  // collinear but reversed
        const out = collapseCollinearLines(p);
        assert.equal(out.fCommands.length, 3);
    });

    test('zero-length line dropped', () => {
        const p = new OpPath();
        p.moveTo(PT(0, 0));
        p.lineTo(PT(5, 0));
        p.lineTo(PT(5, 0));   // zero-length, drop
        p.lineTo(PT(5, 5));
        const out = collapseCollinearLines(p);
        assert.equal(out.fCommands.length, 3);
        assert.equal(out.fCommands[1]!.pts[0]!.fX, 5);
        assert.equal(out.fCommands[1]!.pts[0]!.fY, 0);
        assert.equal(out.fCommands[2]!.pts[0]!.fX, 5);
        assert.equal(out.fCommands[2]!.pts[0]!.fY, 5);
    });

    test('diagonal collinear merge', () => {
        const p = new OpPath();
        p.moveTo(PT(0, 0));
        p.lineTo(PT(2, 1));
        p.lineTo(PT(4, 2));
        p.lineTo(PT(10, 5));
        const out = collapseCollinearLines(p);
        assert.equal(out.fCommands.length, 2);
        assert.equal(out.fCommands[1]!.pts[0]!.fX, 10);
        assert.equal(out.fCommands[1]!.pts[0]!.fY, 5);
    });

    test('preserves curves between line runs', () => {
        const p = new OpPath();
        p.moveTo(PT(0, 0));
        p.lineTo(PT(2, 0));
        p.lineTo(PT(5, 0));         // merges with previous
        p.quadTo(PT(7, 5), PT(10, 0));
        p.lineTo(PT(12, 0));
        p.lineTo(PT(15, 0));        // merges with previous
        const out = collapseCollinearLines(p);
        assert.equal(out.fCommands.length, 4);
        assert.equal(out.fCommands[1]!.verb, OpVerb.kLine);
        assert.equal(out.fCommands[1]!.pts[0]!.fX, 5);
        assert.equal(out.fCommands[2]!.verb, OpVerb.kQuad);
        assert.equal(out.fCommands[3]!.verb, OpVerb.kLine);
        assert.equal(out.fCommands[3]!.pts[0]!.fX, 15);
    });

    test('rect untouched (already minimal)', () => {
        const p = new OpPath();
        p.moveTo(PT(0, 0));
        p.lineTo(PT(10, 0));
        p.lineTo(PT(10, 5));
        p.lineTo(PT(0,  5));
        p.close();
        const out = collapseCollinearLines(p);
        assert.equal(out.fCommands.length, p.fCommands.length);
    });
});

// ── same-original-curve coalescing ──────────────────────────────────

describe('coalesceSameOriginalCurve', () => {
    test('two cubics from same segment with adjacent t-ranges merge', () => {
        // A cubic (0,0) (10,30) (30,30) (40,0). Split at t=0.5 yields
        // two sub-cubics; coalescing should re-derive the original.
        const seg = {};
        const sourcePts = [PT(0, 0), PT(10, 30), PT(30, 30), PT(40, 0)];

        const provFirst:  CurveProvenance = { seg, tStart: 0,   tEnd: 0.5, sourceVerb: OpVerb.kCubic, sourcePts };
        const provSecond: CurveProvenance = { seg, tStart: 0.5, tEnd: 1,   sourceVerb: OpVerb.kCubic, sourcePts };

        // Build a synthetic OpPath with the two sub-cubics + their
        // sub-divided control polygons. cubicTo(c1, c2, end) — we
        // don't care about exact intermediate points here; the
        // coalescer reads sourcePts + t-range, ignores pts in the
        // merge.
        const p = new OpPath();
        p.moveTo(sourcePts[0]!);
        p.cubicTo(PT(99, 99), PT(99, 99), PT(20, 22.5), provFirst);
        p.cubicTo(PT(99, 99), PT(99, 99), PT(40, 0),    provSecond);

        const out = coalesceSameOriginalCurve(p);
        assert.equal(out.fCommands.length, 2);
        assert.equal(out.fCommands[1]!.verb, OpVerb.kCubic);
        // Merged cubic = original sourcePts when t0=0, t1=1.
        const merged = out.fCommands[1]!.pts;
        assert.equal(merged[0]!.fX, 10);  // c1
        assert.equal(merged[0]!.fY, 30);
        assert.equal(merged[1]!.fX, 30);  // c2
        assert.equal(merged[1]!.fY, 30);
        assert.equal(merged[2]!.fX, 40);  // p
        assert.equal(merged[2]!.fY, 0);
        // Provenance dropped on final output.
        assert.equal(out.fCommands[1]!.prov, undefined);
    });

    test('three cubics from same segment with adjacent t-ranges all merge', () => {
        const seg = {};
        const sourcePts = [PT(0, 0), PT(10, 30), PT(30, 30), PT(40, 0)];
        const p = new OpPath();
        p.moveTo(sourcePts[0]!);
        p.cubicTo(PT(0, 0), PT(0, 0), PT(0, 0), { seg, tStart: 0,    tEnd: 0.33, sourceVerb: OpVerb.kCubic, sourcePts });
        p.cubicTo(PT(0, 0), PT(0, 0), PT(0, 0), { seg, tStart: 0.33, tEnd: 0.67, sourceVerb: OpVerb.kCubic, sourcePts });
        p.cubicTo(PT(0, 0), PT(0, 0), PT(0, 0), { seg, tStart: 0.67, tEnd: 1,    sourceVerb: OpVerb.kCubic, sourcePts });

        const out = coalesceSameOriginalCurve(p);
        assert.equal(out.fCommands.length, 2);
        const merged = out.fCommands[1]!.pts;
        // Three-way merge from t=0 to t=1 reproduces the original.
        assert.equal(merged[0]!.fX, 10);
        assert.equal(merged[1]!.fX, 30);
        assert.equal(merged[2]!.fX, 40);
    });

    test('non-adjacent t-ranges DO NOT merge', () => {
        // Gap in t-range — leave both in place.
        const seg = {};
        const sourcePts = [PT(0, 0), PT(10, 0), PT(20, 0), PT(30, 0)];
        const p = new OpPath();
        p.moveTo(sourcePts[0]!);
        p.cubicTo(PT(0, 0), PT(0, 0), PT(0, 0), { seg, tStart: 0.0, tEnd: 0.3, sourceVerb: OpVerb.kCubic, sourcePts });
        p.cubicTo(PT(0, 0), PT(0, 0), PT(0, 0), { seg, tStart: 0.5, tEnd: 0.8, sourceVerb: OpVerb.kCubic, sourcePts });

        const out = coalesceSameOriginalCurve(p);
        assert.equal(out.fCommands.length, 3);
    });

    test('different source segments DO NOT merge', () => {
        const sourcePts = [PT(0, 0), PT(10, 0), PT(20, 0), PT(30, 0)];
        const p = new OpPath();
        p.moveTo(sourcePts[0]!);
        p.cubicTo(PT(0, 0), PT(0, 0), PT(0, 0), { seg: {}, tStart: 0.0, tEnd: 0.5, sourceVerb: OpVerb.kCubic, sourcePts });
        p.cubicTo(PT(0, 0), PT(0, 0), PT(0, 0), { seg: {}, tStart: 0.5, tEnd: 1.0, sourceVerb: OpVerb.kCubic, sourcePts });

        const out = coalesceSameOriginalCurve(p);
        assert.equal(out.fCommands.length, 3);
    });

    test('curves without provenance pass through untouched', () => {
        const p = new OpPath();
        p.moveTo(PT(0, 0));
        p.cubicTo(PT(1, 0), PT(2, 1), PT(3, 1));
        p.cubicTo(PT(4, 1), PT(5, 0), PT(6, 0));
        const out = coalesceSameOriginalCurve(p);
        assert.equal(out.fCommands.length, 3);
    });

    test('quad-source merge', () => {
        const seg = {};
        const sourcePts = [PT(0, 0), PT(10, 10), PT(20, 0)];
        const p = new OpPath();
        p.moveTo(sourcePts[0]!);
        p.quadTo(PT(0, 0), PT(0, 0), { seg, tStart: 0,   tEnd: 0.5, sourceVerb: OpVerb.kQuad, sourcePts });
        p.quadTo(PT(0, 0), PT(0, 0), { seg, tStart: 0.5, tEnd: 1,   sourceVerb: OpVerb.kQuad, sourcePts });

        const out = coalesceSameOriginalCurve(p);
        assert.equal(out.fCommands.length, 2);
        assert.equal(out.fCommands[1]!.verb, OpVerb.kQuad);
        // Merged quad = original.
        const merged = out.fCommands[1]!.pts;
        assert.equal(merged[0]!.fX, 10);
        assert.equal(merged[0]!.fY, 10);
        assert.equal(merged[1]!.fX, 20);
        assert.equal(merged[1]!.fY, 0);
    });
});

// ── combined refitOpPath ────────────────────────────────────────────

describe('refitOpPath', () => {
    test('combines line collapse and curve coalescing', () => {
        const seg = {};
        const sourcePts = [PT(0, 0), PT(10, 30), PT(30, 30), PT(40, 0)];
        const p = new OpPath();
        p.moveTo(PT(0, 0));
        p.lineTo(PT(5, 0));
        p.lineTo(PT(10, 0));  // merges with previous
        p.cubicTo(PT(0, 0), PT(0, 0), PT(0, 0), { seg, tStart: 0,   tEnd: 0.5, sourceVerb: OpVerb.kCubic, sourcePts });
        p.cubicTo(PT(0, 0), PT(0, 0), PT(0, 0), { seg, tStart: 0.5, tEnd: 1,   sourceVerb: OpVerb.kCubic, sourcePts });
        const out = refitOpPath(p);
        // M + L + C — three commands.
        assert.equal(out.fCommands.length, 3);
        assert.equal(out.fCommands[0]!.verb, OpVerb.kMove);
        assert.equal(out.fCommands[1]!.verb, OpVerb.kLine);
        assert.equal(out.fCommands[1]!.pts[0]!.fX, 10);
        assert.equal(out.fCommands[2]!.verb, OpVerb.kCubic);
    });

    test('idempotent', () => {
        const seg = {};
        const sourcePts = [PT(0, 0), PT(10, 30), PT(30, 30), PT(40, 0)];
        const p = new OpPath();
        p.moveTo(PT(0, 0));
        p.lineTo(PT(5, 0));
        p.lineTo(PT(10, 0));
        p.cubicTo(PT(0, 0), PT(0, 0), PT(0, 0), { seg, tStart: 0,   tEnd: 0.5, sourceVerb: OpVerb.kCubic, sourcePts });
        p.cubicTo(PT(0, 0), PT(0, 0), PT(0, 0), { seg, tStart: 0.5, tEnd: 1,   sourceVerb: OpVerb.kCubic, sourcePts });
        const once  = refitOpPath(p);
        const twice = refitOpPath(once);
        assert.equal(once.fCommands.length, twice.fCommands.length);
    });
});
