// Inverse of `pathGeometryToSvgD` — parses an SVG `d=` path-data string
// into a `PathGeometry`. Round-tripping is geometry-identical (not
// byte-identical): all path commands are absorbed, but the writer only
// emits the absolute forms, so `M 0 0 l 10 0` parses, then re-writes as
// `M 0 0 L 10 0`.
//
// Supports the full SVG 1.1 path-data grammar:
//   M m  moveto              L l  lineto
//   H h  horizontal lineto   V v  vertical lineto
//   C c  cubic Bézier        S s  smooth cubic (reflect previous control)
//   Q q  quadratic Bézier    T t  smooth quadratic (reflect previous control)
//   A a  elliptical arc      Z z  closepath
// Uppercase = absolute, lowercase = relative (delta from current pen).
//
// The grammar tolerates whitespace and commas anywhere between tokens
// and sticky number parsing (no separator before a sign or a `.` after
// an integer — `M0,0L1.5.5` is `M(0,0) L(1.5, 0.5)`).

import { Point, Size } from '../primitives.js';

import {
    ArcSegment,
    CubicBezierSegment,
    LineSegment,
    PathFigure,
    PathGeometry,
    PathSegment,
    QuadraticBezierSegment,
    SweepDirection,
} from './geometry.js';

interface TokenStream
{
    src: string;
    i:   number;
}

function isWhitespaceOrComma(ch: string): boolean
{
    return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f' || ch === ',';
}

function skipSeparators(t: TokenStream): void
{
    while (t.i < t.src.length && isWhitespaceOrComma(t.src[t.i]!)) t.i++;
}

function peekCommand(t: TokenStream): string | undefined
{
    skipSeparators(t);
    if (t.i >= t.src.length) return undefined;
    const ch = t.src[t.i]!;
    if ((ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z')) return ch;
    return undefined;
}

// Reads a number token. SVG numbers are signed decimal floats with optional
// exponent. Sticky parsing: `-` starts a new number even without a separator
// after the previous one; a `.` immediately after a digit-only number starts
// the fractional part of the *next* number when the previous number had no
// decimal point of its own.
function readNumber(t: TokenStream): number
{
    skipSeparators(t);
    const start = t.i;
    let i = t.i;
    const s = t.src;
    const n = s.length;

    if (i < n && (s[i] === '+' || s[i] === '-')) i++;
    let hasDigits = false;
    while (i < n && s[i]! >= '0' && s[i]! <= '9') { i++; hasDigits = true; }
    if (i < n && s[i] === '.')
    {
        i++;
        while (i < n && s[i]! >= '0' && s[i]! <= '9') { i++; hasDigits = true; }
    }
    if (!hasDigits) throw new Error(`pathGeometryFromSvgD: expected number at offset ${start}, got '${s.slice(start, start + 8)}'`);
    if (i < n && (s[i] === 'e' || s[i] === 'E'))
    {
        i++;
        if (i < n && (s[i] === '+' || s[i] === '-')) i++;
        const expStart = i;
        while (i < n && s[i]! >= '0' && s[i]! <= '9') i++;
        if (i === expStart) throw new Error(`pathGeometryFromSvgD: malformed exponent at offset ${start}`);
    }
    const out = parseFloat(s.slice(start, i));
    t.i = i;
    return out;
}

// SVG arc flags are single 0/1 digits, no separator from neighbors. Accept
// any non-zero value as truthy to match permissive Skia / Cairo parsers.
function readFlag(t: TokenStream): boolean
{
    skipSeparators(t);
    if (t.i >= t.src.length) throw new Error(`pathGeometryFromSvgD: expected arc flag at offset ${t.i}`);
    const ch = t.src[t.i]!;
    if (ch === '0') { t.i++; return false; }
    if (ch === '1') { t.i++; return true; }
    return readNumber(t) !== 0;
}

export function pathGeometryFromSvgD(d: string): PathGeometry
{
    const t: TokenStream = { src: d, i: 0 };
    const figures: PathFigure[] = [];

    let pen          = Point.Zero;
    let figureStart  = Point.Zero;
    let segs: PathSegment[] = [];
    let figureOpen   = false;
    let prevCubic: Point | undefined = undefined;
    let prevQuad:  Point | undefined = undefined;

    let cmd: string = '';

    function commitFigure(closed: boolean): void
    {
        if (!figureOpen) return;
        figures.push(new PathFigure(figureStart, segs, closed));
        segs = [];
        figureOpen = false;
    }

    while (true)
    {
        const next = peekCommand(t);
        if (next !== undefined)
        {
            cmd = next;
            t.i++;
        }
        else
        {
            // No command — either the previous command repeats with new args,
            // or we're done. Peek for a numeric argument; if none, exit.
            skipSeparators(t);
            if (t.i >= t.src.length) break;
            if (cmd === '')
            {
                throw new Error(`pathGeometryFromSvgD: numeric argument before any command at offset ${t.i}`);
            }
        }

        const abs = cmd === cmd.toUpperCase();
        switch (cmd.toUpperCase())
        {
            case 'M':
            {
                commitFigure(false);
                const x = readNumber(t);
                const y = readNumber(t);
                pen = abs ? new Point(x, y) : new Point(pen.X + x, pen.Y + y);
                figureStart = pen;
                figureOpen  = true;
                // Implicit repeat after M is L (preserve abs/rel).
                cmd = abs ? 'L' : 'l';
                prevCubic = undefined;
                prevQuad  = undefined;
                break;
            }
            case 'L':
            {
                requireFigureOpen(figureOpen, cmd, t);
                const x = readNumber(t);
                const y = readNumber(t);
                const p = abs ? new Point(x, y) : new Point(pen.X + x, pen.Y + y);
                segs.push(new LineSegment(p));
                pen = p;
                prevCubic = undefined;
                prevQuad  = undefined;
                break;
            }
            case 'H':
            {
                requireFigureOpen(figureOpen, cmd, t);
                const x = readNumber(t);
                const p = abs ? new Point(x, pen.Y) : new Point(pen.X + x, pen.Y);
                segs.push(new LineSegment(p));
                pen = p;
                prevCubic = undefined;
                prevQuad  = undefined;
                break;
            }
            case 'V':
            {
                requireFigureOpen(figureOpen, cmd, t);
                const y = readNumber(t);
                const p = abs ? new Point(pen.X, y) : new Point(pen.X, pen.Y + y);
                segs.push(new LineSegment(p));
                pen = p;
                prevCubic = undefined;
                prevQuad  = undefined;
                break;
            }
            case 'C':
            {
                requireFigureOpen(figureOpen, cmd, t);
                const x1 = readNumber(t); const y1 = readNumber(t);
                const x2 = readNumber(t); const y2 = readNumber(t);
                const x3 = readNumber(t); const y3 = readNumber(t);
                const c1 = abs ? new Point(x1, y1) : new Point(pen.X + x1, pen.Y + y1);
                const c2 = abs ? new Point(x2, y2) : new Point(pen.X + x2, pen.Y + y2);
                const p  = abs ? new Point(x3, y3) : new Point(pen.X + x3, pen.Y + y3);
                segs.push(new CubicBezierSegment(c1, c2, p));
                pen = p;
                prevCubic = c2;
                prevQuad  = undefined;
                break;
            }
            case 'S':
            {
                // Reflect previous cubic's last control around pen for c1.
                requireFigureOpen(figureOpen, cmd, t);
                const x2 = readNumber(t); const y2 = readNumber(t);
                const x3 = readNumber(t); const y3 = readNumber(t);
                const c2 = abs ? new Point(x2, y2) : new Point(pen.X + x2, pen.Y + y2);
                const p  = abs ? new Point(x3, y3) : new Point(pen.X + x3, pen.Y + y3);
                const c1 = prevCubic !== undefined
                    ? new Point(2 * pen.X - prevCubic.X, 2 * pen.Y - prevCubic.Y)
                    : pen;
                segs.push(new CubicBezierSegment(c1, c2, p));
                pen = p;
                prevCubic = c2;
                prevQuad  = undefined;
                break;
            }
            case 'Q':
            {
                requireFigureOpen(figureOpen, cmd, t);
                const x1 = readNumber(t); const y1 = readNumber(t);
                const x2 = readNumber(t); const y2 = readNumber(t);
                const c1 = abs ? new Point(x1, y1) : new Point(pen.X + x1, pen.Y + y1);
                const p  = abs ? new Point(x2, y2) : new Point(pen.X + x2, pen.Y + y2);
                segs.push(new QuadraticBezierSegment(c1, p));
                pen = p;
                prevQuad  = c1;
                prevCubic = undefined;
                break;
            }
            case 'T':
            {
                requireFigureOpen(figureOpen, cmd, t);
                const x2 = readNumber(t); const y2 = readNumber(t);
                const p  = abs ? new Point(x2, y2) : new Point(pen.X + x2, pen.Y + y2);
                const c1: Point = prevQuad !== undefined
                    ? new Point(2 * pen.X - prevQuad.X, 2 * pen.Y - prevQuad.Y)
                    : pen;
                segs.push(new QuadraticBezierSegment(c1, p));
                pen = p;
                prevQuad  = c1;
                prevCubic = undefined;
                break;
            }
            case 'A':
            {
                requireFigureOpen(figureOpen, cmd, t);
                const rx  = readNumber(t);
                const ry  = readNumber(t);
                const rot = readNumber(t);
                const lrg = readFlag(t);
                const swp = readFlag(t);
                const x   = readNumber(t);
                const y   = readNumber(t);
                const p   = abs ? new Point(x, y) : new Point(pen.X + x, pen.Y + y);
                segs.push(new ArcSegment(
                    p, new Size(rx, ry), rot, lrg,
                    swp ? SweepDirection.Clockwise : SweepDirection.Counterclockwise,
                ));
                pen = p;
                prevCubic = undefined;
                prevQuad  = undefined;
                break;
            }
            case 'Z':
            {
                commitFigure(true);
                pen = figureStart;
                prevCubic = undefined;
                prevQuad  = undefined;
                // Z takes no arguments; clear the implicit-repeat state so
                // the next iteration must read a new command.
                cmd = '';
                break;
            }
            default:
                throw new Error(`pathGeometryFromSvgD: unknown command '${cmd}'`);
        }
    }
    commitFigure(false);
    return new PathGeometry(figures);
}

// Strict mode: every figure must begin with M. Permissive parsers (Chrome
// in particular) treat a leading L / C / etc. as starting at (0,0); we
// throw instead so authoring mistakes don't produce silently-shifted
// geometry.
function requireFigureOpen(figureOpen: boolean, cmd: string, t: TokenStream): void
{
    if (figureOpen) return;
    throw new Error(`pathGeometryFromSvgD: '${cmd}' at offset ${t.i} before any 'M'`);
}
