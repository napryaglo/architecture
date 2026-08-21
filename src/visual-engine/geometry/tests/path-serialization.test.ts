// §19-deferred #5 — PathGeometry serialization round-trip.
//
// pathGeometryToSvgD writes; pathGeometryFromSvgD parses. The two are
// geometry-symmetric: write(parse(s)) === write(parse(write(parse(s)))).
// Byte-equality isn't guaranteed because the parser absorbs relative /
// shorthand commands and the writer only emits absolute L / C / Q / A.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { Point, Size } from '../../primitives.js';
import {
    ArcSegment,
    CubicBezierSegment,
    LineSegment,
    PathFigure,
    PathGeometry,
    QuadraticBezierSegment,
    SweepDirection,
} from '../geometry.js';
import { pathGeometryToSvgD } from '../path-to-svg.js';
import { pathGeometryFromSvgD } from '../path-from-svg.js';

const P = (x: number, y: number): Point => new Point(x, y);

// Helpers to inspect parsed output structurally — instanceof + numeric
// comparisons avoid baking deep-equal expectations on MuralBase internals.
function expectLine(seg: object, x: number, y: number): void
{
    assert.ok(seg instanceof LineSegment, `expected LineSegment, got ${(seg as object).constructor.name}`);
    assert.equal(seg.Point.X, x); assert.equal(seg.Point.Y, y);
}

function expectCubic(seg: object, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): void
{
    assert.ok(seg instanceof CubicBezierSegment);
    assert.equal(seg.Point1.X, x1); assert.equal(seg.Point1.Y, y1);
    assert.equal(seg.Point2.X, x2); assert.equal(seg.Point2.Y, y2);
    assert.equal(seg.Point3.X, x3); assert.equal(seg.Point3.Y, y3);
}

function expectQuad(seg: object, x1: number, y1: number, x2: number, y2: number): void
{
    assert.ok(seg instanceof QuadraticBezierSegment);
    assert.equal(seg.Point1.X, x1); assert.equal(seg.Point1.Y, y1);
    assert.equal(seg.Point2.X, x2); assert.equal(seg.Point2.Y, y2);
}

function expectArc(seg: object, x: number, y: number, rx: number, ry: number,
                   rot: number, large: boolean, sweep: SweepDirection): void
{
    assert.ok(seg instanceof ArcSegment);
    assert.equal(seg.Point.X, x); assert.equal(seg.Point.Y, y);
    assert.equal(seg.Size.Width, rx); assert.equal(seg.Size.Height, ry);
    assert.equal(seg.RotationAngle, rot);
    assert.equal(seg.IsLargeArc, large);
    assert.equal(seg.SweepDirection, sweep);
}

// ── parse — single-figure shapes ─────────────────────────────────────

describe('pathGeometryFromSvgD — single-figure parse', () => {
    test('empty input yields a Figures=[] PathGeometry', () => {
        const p = pathGeometryFromSvgD('');
        assert.equal(p.Figures.length, 0);
    });

    test('whitespace-only input yields empty PathGeometry', () => {
        const p = pathGeometryFromSvgD('   \t\n  ');
        assert.equal(p.Figures.length, 0);
    });

    test('M only — single point figure, no segments, open', () => {
        const p = pathGeometryFromSvgD('M 5 10');
        assert.equal(p.Figures.length, 1);
        const f = p.Figures[0]!;
        assert.equal(f.StartPoint.X, 5); assert.equal(f.StartPoint.Y, 10);
        assert.equal(f.Segments.length, 0);
        assert.equal(f.IsClosed, false);
    });

    test('rect from M L L L Z absolutes', () => {
        const p = pathGeometryFromSvgD('M 0 0 L 10 0 L 10 5 L 0 5 Z');
        assert.equal(p.Figures.length, 1);
        const f = p.Figures[0]!;
        assert.deepEqual([f.StartPoint.X, f.StartPoint.Y], [0, 0]);
        assert.equal(f.Segments.length, 3);
        expectLine(f.Segments[0]!, 10, 0);
        expectLine(f.Segments[1]!, 10, 5);
        expectLine(f.Segments[2]!,  0, 5);
        assert.equal(f.IsClosed, true);
    });

    test('rect from M l l l Z relatives — same geometry', () => {
        const p = pathGeometryFromSvgD('M 0 0 l 10 0 l 0 5 l -10 0 Z');
        const f = p.Figures[0]!;
        expectLine(f.Segments[0]!, 10, 0);
        expectLine(f.Segments[1]!, 10, 5);
        expectLine(f.Segments[2]!,  0, 5);
        assert.equal(f.IsClosed, true);
    });

    test('implicit L after M', () => {
        // M 0 0 1 1 2 2 == M 0 0 L 1 1 L 2 2
        const p = pathGeometryFromSvgD('M 0 0 1 1 2 2');
        const f = p.Figures[0]!;
        expectLine(f.Segments[0]!, 1, 1);
        expectLine(f.Segments[1]!, 2, 2);
    });

    test('implicit l after m — relative chain', () => {
        // m 0 0 1 1 1 1 == M 0 0 L 1 1 L 2 2
        const p = pathGeometryFromSvgD('m 0 0 1 1 1 1');
        const f = p.Figures[0]!;
        expectLine(f.Segments[0]!, 1, 1);
        expectLine(f.Segments[1]!, 2, 2);
    });

    test('H V commands — horizontal / vertical lines', () => {
        const p = pathGeometryFromSvgD('M 5 5 H 10 V 8 h -3 v -1');
        const f = p.Figures[0]!;
        expectLine(f.Segments[0]!, 10, 5);
        expectLine(f.Segments[1]!, 10, 8);
        expectLine(f.Segments[2]!,  7, 8);
        expectLine(f.Segments[3]!,  7, 7);
    });

    test('C absolute and c relative cubic', () => {
        const p = pathGeometryFromSvgD('M 0 0 C 1 2 3 4 5 6 c 1 0 2 0 3 0');
        const f = p.Figures[0]!;
        expectCubic(f.Segments[0]!, 1, 2, 3, 4, 5, 6);
        // pen at (5,6) — relative c 1 0 2 0 3 0 → C(6,6,7,6,8,6)
        expectCubic(f.Segments[1]!, 6, 6, 7, 6, 8, 6);
    });

    test('S reflects previous cubic control', () => {
        // After C 1 0 4 0 5 0, the last control is (4,0), pen is (5,0).
        // S 7 0 8 0 ⇒ reflect (4,0) about (5,0) → c1=(6,0); cubic to (8,0).
        const p = pathGeometryFromSvgD('M 0 0 C 1 0 4 0 5 0 S 7 0 8 0');
        const f = p.Figures[0]!;
        expectCubic(f.Segments[1]!, 6, 0, 7, 0, 8, 0);
    });

    test('S with no preceding C falls back to pen for c1', () => {
        // After M (no cubic yet), S c2 p ⇒ c1 = pen.
        const p = pathGeometryFromSvgD('M 2 3 S 5 5 6 6');
        const f = p.Figures[0]!;
        expectCubic(f.Segments[0]!, 2, 3, 5, 5, 6, 6);
    });

    test('Q absolute and q relative quadratic', () => {
        const p = pathGeometryFromSvgD('M 0 0 Q 1 2 3 4 q 1 0 2 0');
        const f = p.Figures[0]!;
        expectQuad(f.Segments[0]!, 1, 2, 3, 4);
        // pen at (3,4) — relative q 1 0 2 0 → Q(4,4,5,4)
        expectQuad(f.Segments[1]!, 4, 4, 5, 4);
    });

    test('T reflects previous quad control', () => {
        // After Q 1 0 3 0, last quad ctrl is (1,0), pen at (3,0).
        // T 6 0 ⇒ c1 = reflect (1,0) about (3,0) = (5,0), p = (6,0).
        const p = pathGeometryFromSvgD('M 0 0 Q 1 0 3 0 T 6 0');
        const f = p.Figures[0]!;
        expectQuad(f.Segments[1]!, 5, 0, 6, 0);
    });

    test('T with no preceding Q falls back to pen for c1', () => {
        const p = pathGeometryFromSvgD('M 2 3 T 5 5');
        const f = p.Figures[0]!;
        expectQuad(f.Segments[0]!, 2, 3, 5, 5);
    });

    test('A absolute arc', () => {
        const p = pathGeometryFromSvgD('M 0 0 A 10 5 30 1 0 20 0');
        const f = p.Figures[0]!;
        expectArc(f.Segments[0]!, 20, 0, 10, 5, 30, true, SweepDirection.Counterclockwise);
    });

    test('A relative arc with sweep=1 ⇒ Clockwise', () => {
        const p = pathGeometryFromSvgD('M 5 5 a 3 4 0 0 1 10 0');
        const f = p.Figures[0]!;
        expectArc(f.Segments[0]!, 15, 5, 3, 4, 0, false, SweepDirection.Clockwise);
    });
});

// ── multi-figure / Z + subsequent M ─────────────────────────────────

describe('pathGeometryFromSvgD — multi-figure', () => {
    test('two figures via Z + M', () => {
        const p = pathGeometryFromSvgD('M 0 0 L 1 0 Z M 5 5 L 6 5 Z');
        assert.equal(p.Figures.length, 2);
        assert.deepEqual([p.Figures[0]!.StartPoint.X, p.Figures[0]!.StartPoint.Y], [0, 0]);
        assert.deepEqual([p.Figures[1]!.StartPoint.X, p.Figures[1]!.StartPoint.Y], [5, 5]);
        assert.equal(p.Figures[0]!.IsClosed, true);
        assert.equal(p.Figures[1]!.IsClosed, true);
    });

    test('open figure followed by M closes the open figure with IsClosed=false', () => {
        const p = pathGeometryFromSvgD('M 0 0 L 1 0 M 5 5 L 6 5');
        assert.equal(p.Figures.length, 2);
        assert.equal(p.Figures[0]!.IsClosed, false);
        assert.equal(p.Figures[1]!.IsClosed, false);
    });

    test('relative M after Z is relative to figure start', () => {
        // After Z, pen returns to figureStart (0,0). m 5 5 ⇒ figureStart (5,5).
        const p = pathGeometryFromSvgD('M 0 0 L 1 0 Z m 5 5 l 1 0');
        assert.deepEqual([p.Figures[1]!.StartPoint.X, p.Figures[1]!.StartPoint.Y], [5, 5]);
        expectLine(p.Figures[1]!.Segments[0]!, 6, 5);
    });
});

// ── tokenizer edge cases ────────────────────────────────────────────

describe('pathGeometryFromSvgD — tokenizer edge cases', () => {
    test('no whitespace at all', () => {
        const p = pathGeometryFromSvgD('M0,0L10,0L10,5L0,5Z');
        const f = p.Figures[0]!;
        expectLine(f.Segments[0]!, 10, 0);
        expectLine(f.Segments[1]!, 10, 5);
        expectLine(f.Segments[2]!,  0, 5);
        assert.equal(f.IsClosed, true);
    });

    test('negatives without separator', () => {
        const p = pathGeometryFromSvgD('M0,0L-1-1L-2-2');
        const f = p.Figures[0]!;
        expectLine(f.Segments[0]!, -1, -1);
        expectLine(f.Segments[1]!, -2, -2);
    });

    test('decimals — sticky parse', () => {
        // M 0 0 L 1.5 .5 ⇒ second number is 0.5, not "5".
        const p = pathGeometryFromSvgD('M 0 0 L 1.5 .5');
        const f = p.Figures[0]!;
        expectLine(f.Segments[0]!, 1.5, 0.5);
    });

    test('decimals — adjacent without separator', () => {
        // M0,0L1.5.5 ⇒ L (1.5, 0.5).
        const p = pathGeometryFromSvgD('M0,0L1.5.5');
        const f = p.Figures[0]!;
        expectLine(f.Segments[0]!, 1.5, 0.5);
    });

    test('explicit +sign on numbers', () => {
        const p = pathGeometryFromSvgD('M+0+0L+10+5');
        const f = p.Figures[0]!;
        expectLine(f.Segments[0]!, 10, 5);
    });

    test('scientific notation', () => {
        const p = pathGeometryFromSvgD('M 0 0 L 1e2 2E-1');
        const f = p.Figures[0]!;
        expectLine(f.Segments[0]!, 100, 0.2);
    });

    test('arc flags glued to coordinates', () => {
        // 0010 0 ⇒ large=0, sweep=0, x=1, y=0 ; but here we glue:
        // A 10 5 0 1010 1 ⇒ rx=10 ry=5 rot=0 large=1 sweep=0 x=10 y=1
        // Actually SVG spec: flags are single chars, so 1010 1 ⇒
        // large=1, sweep=0, x=10, y=1. Confirm.
        const p = pathGeometryFromSvgD('M 0 0 A 10 5 0 1 0 10 1');
        expectArc(p.Figures[0]!.Segments[0]!,
            10, 1, 10, 5, 0, true, SweepDirection.Counterclockwise);
    });

    test('non-M / non-z command before M throws', () => {
        assert.throws(() => pathGeometryFromSvgD('L 5 5'), /before any 'M'/);
    });

    test('unknown command throws', () => {
        assert.throws(() => pathGeometryFromSvgD('M 0 0 X 5 5'), /unknown command 'X'/);
    });

    test('numeric arg with no leading command throws', () => {
        assert.throws(() => pathGeometryFromSvgD('5 5'), /before any command/);
    });
});

// ── writer & round-trip ─────────────────────────────────────────────

describe('pathGeometryToSvgD — formatting', () => {
    test('rect emits absolute M L L L Z', () => {
        const p = new PathGeometry([
            new PathFigure(P(0, 0), [
                new LineSegment(P(10, 0)),
                new LineSegment(P(10, 5)),
                new LineSegment(P(0,  5)),
            ], true),
        ]);
        assert.equal(pathGeometryToSvgD(p), 'M 0 0 L 10 0 L 10 5 L 0 5 Z');
    });

    test('cubic + quad emit C and Q', () => {
        const p = new PathGeometry([
            new PathFigure(P(0, 0), [
                new CubicBezierSegment(P(1, 2), P(3, 4), P(5, 6)),
                new QuadraticBezierSegment(P(7, 8), P(9, 10)),
            ], false),
        ]);
        assert.equal(pathGeometryToSvgD(p), 'M 0 0 C 1 2 3 4 5 6 Q 7 8 9 10');
    });

    test('arc emits A with all 7 fields', () => {
        const p = new PathGeometry([
            new PathFigure(P(0, 0), [
                new ArcSegment(P(20, 0), new Size(10, 5), 30,
                    true, SweepDirection.Counterclockwise),
            ], false),
        ]);
        assert.equal(pathGeometryToSvgD(p), 'M 0 0 A 10 5 30 1 0 20 0');
    });
});

describe('PathGeometry round-trip', () => {
    function roundTrip(d: string): string
    {
        return pathGeometryToSvgD(pathGeometryFromSvgD(d));
    }

    test('absolute rect is byte-stable across two round-trips', () => {
        const a = roundTrip('M 0 0 L 10 0 L 10 5 L 0 5 Z');
        const b = roundTrip(a);
        assert.equal(a, b);
    });

    test('relative becomes absolute but reparses identically', () => {
        const a = roundTrip('M 0 0 l 10 0 l 0 5 l -10 0 Z');
        assert.equal(a, 'M 0 0 L 10 0 L 10 5 L 0 5 Z');
        assert.equal(roundTrip(a), a);
    });

    test('H/V relatives lower to L', () => {
        const a = roundTrip('M 5 5 H 10 V 8 h -3 v -1');
        assert.equal(a, 'M 5 5 L 10 5 L 10 8 L 7 8 L 7 7');
    });

    test('S lowers to C with reflected control', () => {
        const a = roundTrip('M 0 0 C 1 0 4 0 5 0 S 7 0 8 0');
        assert.equal(a, 'M 0 0 C 1 0 4 0 5 0 C 6 0 7 0 8 0');
    });

    test('T lowers to Q with reflected control', () => {
        const a = roundTrip('M 0 0 Q 1 0 3 0 T 6 0');
        assert.equal(a, 'M 0 0 Q 1 0 3 0 Q 5 0 6 0');
    });

    test('arc round-trips byte-stable', () => {
        const src = 'M 0 0 A 10 5 30 1 0 20 0 Z';
        const a = roundTrip(src);
        assert.equal(a, src);
    });

    test('multi-figure paths preserve figure boundaries', () => {
        const src = 'M 0 0 L 1 0 Z M 5 5 L 6 5 Z';
        assert.equal(roundTrip(src), src);
    });
});
