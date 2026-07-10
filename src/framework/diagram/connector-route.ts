import { Point } from '../../visual-engine/index.js';

// ─────────────────────────────────────────────────────────────────────
// Pure polyline geometry for connector labels (§ diagram-text Slice 5).
// A connector's rendered route is a point polyline (Connector.CurrentRoutePoints);
// a label rides it at a parameter t ∈ [0, 1] measured by ARC LENGTH, so
// t = 0.5 is the true midpoint of the drawn path (not the middle vertex).
// These functions place a label at t and, for the drag, find the t nearest
// a cursor — both independent of the rendering / layout tiers so they unit-test
// on plain point arrays.

export interface RoutePoint
{
    readonly point:   Point;
    readonly tangent: number;   // radians, direction of the route at `point`
}

function distance(a: Point, b: Point): number
{
    return Math.hypot(b.X - a.X, b.Y - a.Y);
}

// Total arc length of the polyline — backs the connector's {Length} field.
export function polylineLength(points: readonly Point[]): number
{
    let total = 0;
    for (let i = 0; i < points.length - 1; i++) total += distance(points[i]!, points[i + 1]!);
    return total;
}

// The point (and route direction) at arc-length fraction `t` along the
// polyline. Clamps t to [0, 1]; degenerate inputs collapse to the first point.
export function pointAlongPolyline(points: readonly Point[], t: number): RoutePoint
{
    if (points.length === 0) return { point: Point.Zero, tangent: 0 };
    if (points.length === 1) return { point: points[0]!, tangent: 0 };

    let total = 0;
    for (let i = 0; i < points.length - 1; i++) total += distance(points[i]!, points[i + 1]!);
    if (total === 0) return { point: points[0]!, tangent: 0 };

    const target = Math.max(0, Math.min(1, t)) * total;
    let acc = 0;
    for (let i = 0; i < points.length - 1; i++)
    {
        const a = points[i]!, b = points[i + 1]!;
        const len = distance(a, b);
        if (len === 0) continue;
        if (acc + len >= target)
        {
            const local = (target - acc) / len;
            return {
                point:   new Point(a.X + (b.X - a.X) * local, a.Y + (b.Y - a.Y) * local),
                tangent: Math.atan2(b.Y - a.Y, b.X - a.X),
            };
        }
        acc += len;
    }
    // Numerical tail — pin to the final vertex.
    const a = points[points.length - 2]!, b = points[points.length - 1]!;
    return { point: b, tangent: Math.atan2(b.Y - a.Y, b.X - a.X) };
}

// The arc-length fraction t ∈ [0, 1] whose polyline point is closest to `p`.
// Backs the label drag: the label slides ALONG the route to the nearest point
// under the cursor instead of following it off the path. Degenerate inputs → 0.
export function nearestTOnPolyline(points: readonly Point[], p: Point): number
{
    if (points.length < 2) return 0;

    let total = 0;
    for (let i = 0; i < points.length - 1; i++) total += distance(points[i]!, points[i + 1]!);
    if (total === 0) return 0;

    let acc = 0;
    let bestArc = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < points.length - 1; i++)
    {
        const a = points[i]!, b = points[i + 1]!;
        const len = distance(a, b);
        if (len === 0) continue;
        // Project p onto segment a→b, clamped to the segment.
        const dx = b.X - a.X, dy = b.Y - a.Y;
        let u = ((p.X - a.X) * dx + (p.Y - a.Y) * dy) / (len * len);
        u = Math.max(0, Math.min(1, u));
        const projX = a.X + dx * u, projY = a.Y + dy * u;
        const d = Math.hypot(p.X - projX, p.Y - projY);
        if (d < bestDist)
        {
            bestDist = d;
            bestArc  = acc + len * u;
        }
        acc += len;
    }
    return bestArc / total;
}
