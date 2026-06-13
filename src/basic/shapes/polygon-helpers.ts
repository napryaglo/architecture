import { Point } from '../../runtime/index.js';
import {
    LineSegment,
    PathFigure,
    QuadraticBezierSegment,
} from '../../visual-engine/index.js';

// Build a closed PathFigure that walks the vertices in order, rounding
// each corner with a quadratic Bezier whose control point IS the vertex.
//
// `r = 0` → sharp polygon (LineSegments only).
// `r > 0` → for each vertex Vi we compute two "near points":
//             * nearIn[i]  — `r` from Vi toward V_{i-1} (on incoming edge)
//             * nearOut[i] — `r` from Vi toward V_{i+1} (on outgoing edge)
//           Path walks: L nearIn[i+1], Q V_{i+1}, nearOut[i+1] per edge.
//
// Caller is responsible for clamping `r` to half the shortest edge so
// successive near-points along the same edge don't cross.
export function buildRoundedPolygon(verts: readonly Point[], r: number): PathFigure
{
    if (r === 0)
    {
        const segs: LineSegment[] = [];
        for (let i = 1; i < verts.length; i++) segs.push(new LineSegment(verts[i]!));
        return new PathFigure(verts[0]!, segs, true);
    }

    const n       = verts.length;
    const nearOut: Point[] = [];
    const nearIn:  Point[] = [];
    for (let i = 0; i < n; i++)
    {
        const v    = verts[i]!;
        const next = verts[(i + 1) % n]!;
        const prev = verts[(i + n - 1) % n]!;
        nearOut.push(off(v, unit(v, next), r));
        nearIn .push(off(v, unit(v, prev), r));
    }

    const segs: (LineSegment | QuadraticBezierSegment)[] = [];
    for (let i = 0; i < n; i++)
    {
        const j = (i + 1) % n;
        segs.push(new LineSegment(nearIn[j]!));
        segs.push(new QuadraticBezierSegment(verts[j]!, nearOut[j]!));
    }
    return new PathFigure(nearOut[0]!, segs, true);
}

// Largest corner radius that keeps successive round-corner near-points
// from crossing on the shortest edge. Cap at `shortest / 2` minus a
// tiny epsilon so degenerate cases don't produce reversed segments.
export function maxCornerRadius(verts: readonly Point[]): number
{
    const n = verts.length;
    let min = Infinity;
    for (let i = 0; i < n; i++)
    {
        const a = verts[i]!;
        const b = verts[(i + 1) % n]!;
        const d = Math.hypot(b.X - a.X, b.Y - a.Y);
        if (d < min) min = d;
    }
    return Math.max(0, min / 2 - 0.001);
}

function unit(a: Point, b: Point): Point
{
    const dx = b.X - a.X;
    const dy = b.Y - a.Y;
    const m  = Math.hypot(dx, dy) || 1;
    return new Point(dx / m, dy / m);
}

function off(p: Point, dir: Point, dist: number): Point
{
    return new Point(p.X + dir.X * dist, p.Y + dir.Y * dist);
}
