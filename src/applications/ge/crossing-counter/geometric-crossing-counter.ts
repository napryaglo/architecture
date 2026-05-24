import type { Point } from '../../../runtime/index.js';
import type { Edge } from '../graph.js';
import type { IGeometricCrossingCounter } from './crossing-counter.js';

// Geometric crossing count — treats each edge as a line segment
// between its endpoints' positions and counts pairs whose interiors
// intersect. Edges sharing an endpoint are skipped (a meet at a node
// is not a crossing). Includes multi-layer edges, so the count
// matches what you see in the SVG.
//
// Also adds an EDGE-NODE OVERLAP penalty: if an edge segment passes
// within `nodeRadius` pixels of a non-incident node's centre, that's
// counted as one additional "crossing". An edge cutting through a
// node's circle is visually indistinguishable from a true crossing
// (and reads as a spurious connection — see analytics-surface sitting
// in the middle of the legacy-application→legacy-tool-bridge edge),
// so the metric treats it as one.
export class GeometricCrossingCounter implements IGeometricCrossingCounter
{
    constructor(public readonly nodeRadius: number = 28) {}

    public Count(positions: Map<string, Point>, edges: Edge[]): number
    {
        type Seg = { x1: number; y1: number; x2: number; y2: number; from: string; to: string };
        const segs: Seg[] = [];
        for (const e of edges)
        {
            const a = positions.get(e.From);
            const b = positions.get(e.To);
            if (a === undefined || b === undefined) continue;
            segs.push({ x1: a.X, y1: a.Y, x2: b.X, y2: b.Y, from: e.From, to: e.To });
        }

        let count = 0;
        for (let i = 0; i < segs.length; i++)
        {
            const a = segs[i]!;
            for (let j = i + 1; j < segs.length; j++)
            {
                const b = segs[j]!;
                // Edges sharing a node never count as crossing each other.
                if (a.from === b.from || a.from === b.to ||
                    a.to   === b.from || a.to   === b.to) continue;
                if (this.SegmentsIntersect(a.x1, a.y1, a.x2, a.y2, b.x1, b.y1, b.x2, b.y2))
                {
                    count++;
                }
            }
        }

        // Edge-node overlap penalty: for each edge segment, count how
        // many non-incident nodes it cuts through (centre within
        // `nodeRadius` of the segment).
        for (const seg of segs)
        {
            for (const [id, p] of positions)
            {
                if (id === seg.from || id === seg.to) continue;
                if (this.PointInSegmentRadius(p.X, p.Y, seg.x1, seg.y1, seg.x2, seg.y2, this.nodeRadius))
                {
                    count++;
                }
            }
        }
        return count;
    }

    // Minimum distance from point (px, py) to the closed segment
    // ((x1, y1), (x2, y2)). Returns true iff that distance ≤ radius.
    // Standard projection: clamp the parameter t to [0, 1] so the
    // distance is to the closest point on the segment (not the
    // infinite line).
    private PointInSegmentRadius(
        px: number, py: number,
        x1: number, y1: number, x2: number, y2: number,
        radius: number,
    ): boolean
    {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) return false;        // degenerate
        let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
        if (t < 0) t = 0;
        else if (t > 1) t = 1;
        const cx = x1 + t * dx;
        const cy = y1 + t * dy;
        const ddx = px - cx;
        const ddy = py - cy;
        return ddx * ddx + ddy * ddy <= radius * radius;
    }

    // Strict open-segment intersection via the orientation predicate.
    // Returns false for collinear / touching configurations — only
    // proper interior crossings count. Sufficient for straight-line
    // layouts where coincident segments aren't expected.
    private SegmentsIntersect(
        ax1: number, ay1: number, ax2: number, ay2: number,
        bx1: number, by1: number, bx2: number, by2: number,
    ): boolean
    {
        const orient = (px: number, py: number, qx: number, qy: number, rx: number, ry: number): number =>
        {
            const v = (qx - px) * (ry - py) - (qy - py) * (rx - px);
            return v > 0 ? 1 : v < 0 ? -1 : 0;
        };
        const o1 = orient(ax1, ay1, ax2, ay2, bx1, by1);
        const o2 = orient(ax1, ay1, ax2, ay2, bx2, by2);
        const o3 = orient(bx1, by1, bx2, by2, ax1, ay1);
        const o4 = orient(bx1, by1, bx2, by2, ax2, ay2);
        return o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0;
    }
}
