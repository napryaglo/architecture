import type { Point } from '../../../runtime/index.js';
import type { Edge } from '../graph.js';
import type { IGeometricCrossingCounter } from './crossing-counter.js';

// Geometric crossing count — treats each edge as a line segment
// between its endpoints' positions and counts pairs whose interiors
// intersect. Edges sharing an endpoint are skipped (a meet at a node
// is not a crossing). Includes multi-layer edges, so the count
// matches what you see in the SVG.
export class GeometricCrossingCounter implements IGeometricCrossingCounter
{
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
        return count;
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
