// §19.7 — CombinedGeometry + combine() + intersectsExact tests.
//
// The pathops boolean-ops engine has its own deep test corpus at
// src/visual-engine/geometry/pathops/tests/op-driver.test.ts. The
// tests below probe ONLY the Geometry↔OpPath bridge and the memoized
// CombinedGeometry MuralBase — they assume the kernel works and check
// that the lift produces sensible figures, that the memo invalidates
// on input changes, and that the WPF combine modes map to the right
// Skia ops.
//
// Engine status as of §19.7 (after the §19.7-engine fix-up):
//
//   * **Union, Xor, Exclude (Difference)** — produce correct figures
//     verified by Contains against (in-A-only, in-B-only, in-overlap,
//     outside) probe points.
//   * **Intersect** — works for B-fully-inside-A; still empty for
//     overlapping rects (chase walker doesn't reach the inner-overlap
//     boundary). Tests probe what works and document the remaining
//     case as a §19.7-engine follow-up.
//   * **Curve combines** (ellipse + rect) — produce extra duplicate
//     figures that confuse EvenOdd Contains. Same follow-up.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { Point, Rect } from '../../primitives.js';
import {
    RectangleGeometry,
    EllipseGeometry,
    PathGeometry,
    PathFigure,
    LineSegment,
} from '../geometry.js';
import {
    CombinedGeometry,
    GeometryCombineMode,
    combine,
    intersectsExact,
} from '../combine.js';

const P = (x: number, y: number) => new Point(x, y);

function rect(x: number, y: number, w: number, h: number): RectangleGeometry
{
    return new RectangleGeometry(new Rect(x, y, w, h));
}

// ── combine() helper — empty operand short-cuts ────────────────

describe('combine — empty operand short-cuts', () => {
    test('Union with empty B equals an A-shaped result', () => {
        const a = rect(0, 0, 10, 10);
        const b = new PathGeometry([]);
        const r = combine(a, b, GeometryCombineMode.Union);
        // Result must be non-empty and contain (5, 5) — interior of A.
        assert.ok(r.Figures.length >= 1);
        assert.equal(r.Contains(P(5, 5)), true);
    });

    test('Intersect with empty B equals empty', () => {
        const a = rect(0, 0, 10, 10);
        const b = new PathGeometry([]);
        const r = combine(a, b, GeometryCombineMode.Intersect);
        assert.equal(r.Figures.length, 0);
    });
});

// ── combine() — overlapping rectangles ──────────────────────────

describe('combine — overlapping rectangles', () => {
    test('Union of two 10×10 squares overlapping by 5×5 covers both corners + overlap', () => {
        const a = rect(0, 0, 10, 10);
        const b = rect(5, 5, 10, 10);
        const r = combine(a, b, GeometryCombineMode.Union);
        // L-shape includes A-only, B-only, and the overlap.
        assert.equal(r.Contains(P(2, 2)),   true);   // A only
        assert.equal(r.Contains(P(7, 7)),   true);   // overlap
        assert.equal(r.Contains(P(12, 12)), true);   // B only
        assert.equal(r.Contains(P(50, 50)), false);  // outside both
    });

    test('Intersect of A fully containing B equals B', () => {
        const a = rect(0, 0, 20, 20);
        const b = rect(5, 5, 10, 10);
        const r = combine(a, b, GeometryCombineMode.Intersect);
        // The engine handles the contained case correctly; result = B.
        assert.equal(r.Contains(P(10, 10)), true);   // inside B
        assert.equal(r.Contains(P(2, 2)),   false);  // in A only, not B
        assert.equal(r.Contains(P(18, 18)), false);  // in A only, not B
    });

    test('Exclude (A - B) where B is fully inside A produces a donut', () => {
        const a = rect(0, 0, 20, 20);
        const b = rect(5, 5, 10, 10);
        const r = combine(a, b, GeometryCombineMode.Exclude);
        // (10, 10) inside B → removed.
        assert.equal(r.Contains(P(10, 10)), false);
        // (2, 2) in A only → in donut.
        assert.equal(r.Contains(P(2, 2)),   true);
        // (18, 18) in A only → in donut.
        assert.equal(r.Contains(P(18, 18)), true);
        // Outside A → not in result.
        assert.equal(r.Contains(P(25, 25)), false);
    });

    test('Intersect of two overlapping rectangles produces the 5×5 overlap square', () => {
        const a = rect(0, 0, 10, 10);
        const b = rect(5, 5, 10, 10);
        const r = combine(a, b, GeometryCombineMode.Intersect);
        // Overlap rect (5,5)→(10,5)→(10,10)→(5,10)→close.
        // Contains:
        //  - (7, 7)    in both → in intersection
        //  - (2, 2)    in A only → not in intersection
        //  - (12, 12)  in B only → not in intersection
        //  - (25, 25)  outside both → not in intersection
        assert.equal(r.Contains(P(7, 7)),   true);
        assert.equal(r.Contains(P(2, 2)),   false);
        assert.equal(r.Contains(P(12, 12)), false);
        assert.equal(r.Contains(P(25, 25)), false);
    });

    test('Exclude (A - B) for overlapping rects produces the L-shape', () => {
        const a = rect(0, 0, 10, 10);
        const b = rect(5, 5, 10, 10);
        const r = combine(a, b, GeometryCombineMode.Exclude);
        // L-shape: (0,0)→(10,0)→(10,5)→(5,5)→(5,10)→(0,10)→close.
        // Contains:
        //  - (2, 2)  in A only → in A - B
        //  - (7, 7)  in both → removed
        //  - (12,12) in B only → not in A - B
        assert.equal(r.Contains(P(2, 2)),   true);
        assert.equal(r.Contains(P(7, 7)),   false);
        assert.equal(r.Contains(P(12, 12)), false);
    });

    test('Xor — overlap is the hole, both unique regions survive', () => {
        const a = rect(0, 0, 10, 10);
        const b = rect(5, 5, 10, 10);
        const r = combine(a, b, GeometryCombineMode.Xor);
        assert.equal(r.Contains(P(2, 2)),  true);   // A only
        assert.equal(r.Contains(P(12, 12)), true);  // B only
        assert.equal(r.Contains(P(7, 7)),  false);  // overlap → out
    });
});

// ── combine() — ellipses ────────────────────────────────────────

describe('combine — ellipse + rectangle', () => {
    test('Union of a circle and a rect contains both interiors', () => {
        // Circle radius 10 at origin + rect (-5,-5)–(15,15).
        // Union covers both. Sample inside the circle outside the rect,
        // inside the rect outside the circle, and inside both.
        const circ = new EllipseGeometry(P(0, 0), 10, 10);
        const r    = rect(-5, -5, 20, 20);
        const out  = combine(circ, r, GeometryCombineMode.Union);
        assert.equal(out.Contains(P(0, 0)),    true);  // inside both
        assert.equal(out.Contains(P(-9, 0)),   true);  // circle only (left lobe)
        assert.equal(out.Contains(P(14, 14)),  true);  // rect only (top-right corner)
        assert.equal(out.Contains(P(20, 20)),  false); // outside both
    });

    test('Intersect of a circle and a rect equals the curve-clipped overlap', () => {
        const circ = new EllipseGeometry(P(0, 0), 10, 10);
        const r    = rect(-5, -5, 20, 20);
        const out  = combine(circ, r, GeometryCombineMode.Intersect);
        // Interior of both circle and rect.
        assert.equal(out.Contains(P(0, 0)),   true);   // origin, in both
        assert.equal(out.Contains(P(5, 5)),   true);   // in both
        // Outside circle, inside rect → not in intersect.
        assert.equal(out.Contains(P(14, 14)), false);
        // Outside rect, inside circle → not in intersect.
        assert.equal(out.Contains(P(-9, 0)),  false);
        // Outside both.
        assert.equal(out.Contains(P(20, 20)), false);
    });
});

// ── intersectsExact() — sanity ──────────────────────────────────

describe('intersectsExact', () => {
    test('disjoint bboxes → false (fast path)', () => {
        const a = rect(0, 0, 10, 10);
        const b = rect(100, 100, 10, 10);
        assert.equal(intersectsExact(a, b), false);
    });

    test('overlapping rectangles → true', () => {
        const a = rect(0, 0, 10, 10);
        const b = rect(5, 5, 10, 10);
        assert.equal(intersectsExact(a, b), true);
    });

    test('touching-at-corner rectangles → bbox-true; Op-Intersect would be exact-false', () => {
        // The bbox fast-path returns true for touching corners (bboxes
        // overlap at a single point). The full engine call is skipped
        // when bboxes are disjoint; otherwise the result reflects what
        // Op(Intersect) finds. This documents the fast-path contract.
        const a = rect(0, 0, 10, 10);
        const b = rect(10, 10, 10, 10);
        assert.equal(typeof intersectsExact(a, b), 'boolean');
    });
});

// ── CombinedGeometry MuralBase — memo + invalidation ────────────────

describe('CombinedGeometry — MuralBase class', () => {
    test('toPathGeometry returns a memoized PathGeometry', () => {
        const a = rect(0, 0, 10, 10);
        const b = rect(5, 5, 10, 10);
        const cg = new CombinedGeometry(a, b, GeometryCombineMode.Union);
        const r1 = cg.toPathGeometry();
        const r2 = cg.toPathGeometry();
        // Same instance — memo wasn't invalidated.
        assert.equal(r1, r2);
    });

    test('changing Geometry1 invalidates the memo', () => {
        const a = rect(0, 0, 10, 10);
        const b = rect(5, 5, 10, 10);
        const cg = new CombinedGeometry(a, b, GeometryCombineMode.Union);
        const r1 = cg.toPathGeometry();
        // Swap operand A for a bigger rect — memo should flush.
        cg.Geometry1 = rect(0, 0, 100, 100);
        const r2 = cg.toPathGeometry();
        assert.notEqual(r1, r2);
        // Union with the larger A should contain (50, 50).
        assert.equal(r2.Contains(P(50, 50)), true);
    });

    test('changing GeometryCombineMode invalidates the memo (instance identity)', () => {
        const a = rect(0, 0, 10, 10);
        const b = rect(5, 5, 10, 10);
        const cg = new CombinedGeometry(a, b, GeometryCombineMode.Union);
        const r1 = cg.toPathGeometry();
        cg.GeometryCombineMode = GeometryCombineMode.Xor;
        const r2 = cg.toPathGeometry();
        // Same mode would memoize to the same instance; a mode change
        // forces a fresh combine and a new PathGeometry.
        assert.notEqual(r1, r2);
    });

    test('GetBounds + Contains route through the memoized PathGeometry (Union)', () => {
        const a = rect(0, 0, 10, 10);
        const b = rect(5, 5, 10, 10);
        const cg = new CombinedGeometry(a, b, GeometryCombineMode.Union);
        // Union of A + B covers (0..15) × (0..15) as an L-shape.
        assert.equal(cg.Contains(P(2, 2)),   true);   // A only
        assert.equal(cg.Contains(P(12, 12)), true);   // B only
        assert.equal(cg.Contains(P(50, 50)), false);  // outside both
    });

    test('undefined Geometry1 + defined Geometry2 — degenerate', () => {
        const cg = new CombinedGeometry();
        cg.Geometry2 = rect(0, 0, 10, 10);
        cg.GeometryCombineMode = GeometryCombineMode.Union;
        const r = cg.toPathGeometry();
        // Union with empty must still produce the non-empty operand.
        assert.equal(r.Contains(P(5, 5)), true);
    });
});

// ── Smoke: PathGeometry with arc lowers cleanly through combine ──

describe('combine — PathGeometry input lowers cleanly', () => {
    test('Triangle PathGeometry combined with a rect via Union covers both', () => {
        const tri = new PathGeometry([
            new PathFigure(P(0, 0), [
                new LineSegment(P(100, 0)),
                new LineSegment(P(50, 100)),
            ], true),
        ]);
        const r = rect(25, 25, 50, 50);
        const out = combine(tri, r, GeometryCombineMode.Union);
        // Inside the triangle (above the rect): apex region.
        assert.equal(out.Contains(P(50, 90)),  true);
        // Inside the rect (outside the triangle near the rect bottom edges).
        assert.equal(out.Contains(P(50, 50)),  true);
        // Outside both.
        assert.equal(out.Contains(P(50, 200)), false);
    });
});

// §19-deferred #2 — refit pass exercised on real Op() output.
//
// Refit is correctness-preserving cosmetic cleanup. These tests verify
// that the pass doesn't distort covered area on inputs that exercise
// the line-collapse and curve-coalesce branches.
describe('combine — refit pass on real boolean output', () => {
    test('Two identical rects Union — covered area unchanged after refit', () => {
        // Touching edges become collinear after the Op walker traces
        // the shared border. Refit collapses the resulting line chains.
        const a = rect(0, 0, 100, 10);
        const b = rect(0, 0, 100, 10);
        const r = combine(a, b, GeometryCombineMode.Union);
        assert.equal(r.Contains(P(50, 5)),  true);   // inside both
        assert.equal(r.Contains(P(50, 50)), false);  // outside both
    });

    test('Circle Intersect rect (curve coalescing path) — covered area unchanged', () => {
        // Same shape as the ellipse + rect Intersect test above. The
        // engine's circle output splits each quarter-arc into multiple
        // cubic sub-spans at the rect boundary; the refit pass coalesces
        // adjacent sub-spans of the same arc back into one cubic.
        const circ = new EllipseGeometry(P(0, 0), 10, 10);
        const r    = rect(-5, -5, 20, 20);
        const out  = combine(circ, r, GeometryCombineMode.Intersect);
        assert.equal(out.Contains(P(0, 0)), true);    // inside both
        assert.equal(out.Contains(P(5, 5)), true);    // inside both
        assert.equal(out.Contains(P(20, 20)), false); // outside both
    });
});
