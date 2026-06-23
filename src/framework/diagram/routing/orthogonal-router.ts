import {
    LineSegment,
    PathFigure,
    PathGeometry,
    Point,
} from '../../../visual-engine/index.js';
import { PortSide, type ResolvedPortSide } from '../port.js';
import {
    ConnectorEnd,
    type IRouter,
    type RouteSpec,
    RouterRegistry,
    RoutingMode,
} from './router.js';

// 90°-only polyline router. Two-endpoint cases produce:
//
//   * 1 segment — straight line when the endpoints sit on the same
//     axis (e.g. both X-axis ports with matching Y).
//   * 2 segments — L-shape when source and target sit on mixed axes
//     (one X-axis port, one Y-axis port). Corner placed to make the
//     first segment ride source's axis and the last ride target's.
//   * 3 segments — Z-shape when both ports share the same axis but
//     not the same line. Bridge at a chosen midpoint along the axis
//     they don't share; see chooseMidX / chooseMidY for the natural
//     average vs same-side-detour split.
//
// Waypoints insert L-shapes between consecutive pairs:
//
//   * Source → wp[0]      — corner uses source's axis.
//   * wp[i]  → wp[i+1]    — default horizontal-first.
//   * wp[N]  → target     — corner makes the LAST segment ride target's
//                           axis.
//
// V1 limitations (documented in
// [src/document/connectors.md](../../../document/connectors.md) § 7.8):
//   * No obstacle awareness — a clean L/Z that crosses through another
//     Figure's footprint stays as-is.
//   * No U-shape generation for the "impossible Z" pairs (e.g. source E +
//     target W with s.X > t.X). chooseMidX picks a source-side detour
//     in those cases; the resulting Z is orthogonal but visually weird
//     (overshoots past one endpoint). Pinned in tests as v1 behavior.
class OrthogonalRouter implements IRouter
{
    public compute(spec: RouteSpec): PathGeometry
    {
        const points = computePoints(spec);
        const segments: LineSegment[] = [];
        for (let i = 1; i < points.length; i++) segments.push(new LineSegment(points[i]!));
        return new PathGeometry([new PathFigure(points[0]!, segments, false)]);
    }

    public tangentAt(spec: RouteSpec, end: ConnectorEnd): number
    {
        const points = computePoints(spec);
        // tangentAt() contract (router.ts): source-end reads the FIRST
        // segment source → next; target-end reads the LAST segment
        // previous → target. Both follow source-to-target travel order.
        if (end === ConnectorEnd.Source)
        {
            const a = points[0]!;
            const b = points.length >= 2 ? points[1]! : a;
            return angleBetween(a.X, a.Y, b.X, b.Y);
        }
        const b = points[points.length - 1]!;
        const a = points.length >= 2 ? points[points.length - 2]! : b;
        return angleBetween(a.X, a.Y, b.X, b.Y);
    }
}

// Polyline vertices in order, including source at index 0 and target
// at length - 1. compute() and tangentAt() both read from this; the
// helper exists to keep the two paths in lockstep.
function computePoints(spec: RouteSpec): Point[]
{
    const s = new Point(spec.sourceAnchor.x, spec.sourceAnchor.y);
    const t = new Point(spec.targetAnchor.x, spec.targetAnchor.y);
    const sSide = spec.sourceAnchor.side;
    const tSide = spec.targetAnchor.side;
    const sX = isXAxis(sSide);
    const tX = isXAxis(tSide);
    const out: Point[] = [s];

    if (spec.waypoints.length === 0)
    {
        appendNoWaypoint(s, sSide, sX, t, tSide, tX, out);
        return out;
    }

    const wps = spec.waypoints;
    // First pair: source's axis controls the corner. sX=true → first
    // segment horizontal; corner = (wp.X, s.Y). sX=false → first vertical.
    appendVia(s, wps[0]!, sX, out);
    // Middle pairs: no side hints. Default horizontal-first; consumer
    // can supply axis-aligned waypoints to avoid the implied corner.
    for (let i = 0; i < wps.length - 1; i++)
    {
        appendVia(wps[i]!, wps[i + 1]!, true, out);
    }
    // Last pair: target's axis controls the corner. tX=true → LAST
    // segment horizontal, which means corner = (prev.X, target.Y) → the
    // FIRST segment of this pair is vertical → firstAxisHorizontal=false.
    appendVia(wps[wps.length - 1]!, t, !tX, out);
    return out;
}

function appendNoWaypoint(
    s: Point, sSide: ResolvedPortSide, sX: boolean,
    t: Point, tSide: ResolvedPortSide, tX: boolean,
    out: Point[],
): void
{
    if (sX !== tX)
    {
        // Mixed axis → single L. Corner placed so that the first
        // segment rides source's axis. sX=true → first segment
        // horizontal, corner = (t.X, s.Y); else corner = (s.X, t.Y).
        const corner = sX ? new Point(t.X, s.Y) : new Point(s.X, t.Y);
        if (!samePoint(corner, s) && !samePoint(corner, t)) out.push(corner);
        out.push(t);
        return;
    }
    // Both axes match — straight line when endpoints share the
    // non-port axis; Z-bridge otherwise.
    if (sX)
    {
        if (s.Y === t.Y) { out.push(t); return; }
        const midX = chooseMidX(s, sSide, t, tSide);
        out.push(new Point(midX, s.Y));
        out.push(new Point(midX, t.Y));
        out.push(t);
        return;
    }
    if (s.X === t.X) { out.push(t); return; }
    const midY = chooseMidY(s, sSide, t, tSide);
    out.push(new Point(s.X, midY));
    out.push(new Point(t.X, midY));
    out.push(t);
}

// Standard L-shape between two arbitrary points. `firstAxisHorizontal`
// picks which corner of the bounding box becomes the bend point:
//   * true  → corner = (next.X, prev.Y) — first segment horizontal,
//                                         second segment vertical.
//   * false → corner = (prev.X, next.Y) — first segment vertical,
//                                         second segment horizontal.
// When prev and next already share an axis (or are equal), the corner
// would coincide with one of them; we drop it so the polyline doesn't
// have a zero-length segment.
function appendVia(prev: Point, next: Point, firstAxisHorizontal: boolean, out: Point[]): void
{
    const corner = firstAxisHorizontal
        ? new Point(next.X, prev.Y)
        : new Point(prev.X, next.Y);
    if (!samePoint(corner, prev) && !samePoint(corner, next)) out.push(corner);
    out.push(next);
}

// Pick the Z-bridge X coordinate for the "both X axis" Z-shape case.
//
// Each endpoint wants the bridge on its OUTWARD side:
//   * Source E → midX > s.X.
//   * Source W → midX < s.X.
//   * Target E → midX > t.X.
//   * Target W → midX < t.X.
//
// When the simple average (s.X + t.X) / 2 satisfies both, use it.
// Otherwise pick a stub-offset detour on the source's outward side.
// This handles the canonical aligned EW (s.X < t.X) and WE (s.X > t.X)
// with the average, the same-side EE / WW pair with the stub, and the
// impossible-Z pairs (EW with s.X > t.X, WE with s.X < t.X) with the
// source-respecting stub (target side gets violated — V1 limitation).
const ORTHOGONAL_STUB = 20;

function chooseMidX(s: Point, sSide: ResolvedPortSide, t: Point, tSide: ResolvedPortSide): number
{
    const avg = (s.X + t.X) / 2;
    const sOK = sSide === PortSide.E ? avg > s.X : avg < s.X;
    const tOK = tSide === PortSide.E ? avg > t.X : avg < t.X;
    if (sOK && tOK) return avg;
    return sSide === PortSide.E
        ? Math.max(s.X, t.X) + ORTHOGONAL_STUB
        : Math.min(s.X, t.X) - ORTHOGONAL_STUB;
}

// Y-axis twin of chooseMidX. In screen coords +Y is downward, so:
//   * Source N → midY < s.Y (north = up).
//   * Source S → midY > s.Y.
//   * Target N → midY < t.Y.
//   * Target S → midY > t.Y.
function chooseMidY(s: Point, sSide: ResolvedPortSide, t: Point, tSide: ResolvedPortSide): number
{
    const avg = (s.Y + t.Y) / 2;
    const sOK = sSide === PortSide.S ? avg > s.Y : avg < s.Y;
    const tOK = tSide === PortSide.S ? avg > t.Y : avg < t.Y;
    if (sOK && tOK) return avg;
    return sSide === PortSide.S
        ? Math.max(s.Y, t.Y) + ORTHOGONAL_STUB
        : Math.min(s.Y, t.Y) - ORTHOGONAL_STUB;
}

function isXAxis(side: ResolvedPortSide): boolean
{
    return side === PortSide.E || side === PortSide.W;
}

function samePoint(a: Point, b: Point): boolean { return a.X === b.X && a.Y === b.Y; }

function angleBetween(x0: number, y0: number, x1: number, y1: number): number
{
    const dx = x1 - x0;
    const dy = y1 - y0;
    if (dx === 0 && dy === 0) return 0;
    return Math.atan2(dy, dx);
}

RouterRegistry.register(RoutingMode.Orthogonal, new OrthogonalRouter());
