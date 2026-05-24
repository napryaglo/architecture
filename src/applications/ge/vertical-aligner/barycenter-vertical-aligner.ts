import { Point } from '../../../runtime/index.js';
import type { Edge } from '../graph.js';
import type { AcademicReference } from '../pipeline-element.js';
import type { IVerticalAligner } from './vertical-aligner.js';

// Iterative barycenter-style vertical alignment. For each node v,
// the desired x is the mean of all its neighbours' x positions
// (preds + succs). v is then shifted toward that target, clamped by
//   (1) minimum spacing to its in-layer neighbours, AND
//   (2) edge-node clearance — the move is rejected (or partially
//       accepted via binary search) if it would put any non-
//       incident edge within `clearance` of v, or any non-
//       incident node within `clearance` of an edge incident to v.
//
// Constraint (2) is the difference between this aligner and a
// naive barycenter pull: without it, alignment pulls chains into
// shared columns and ends up cutting through nodes that happen to
// sit at intermediate layers in that column. The clearance check
// catches that and backs off via binary search to the farthest
// feasible point on the (oldX → target) line.
//
// Y coordinates stay fixed throughout — only x is adjusted.
export class BarycenterVerticalAligner implements IVerticalAligner
{
    public readonly Name               = 'Barycenter Pull';
    public readonly AlgorithmName      = 'Iterative neighbour-mean pull with clearance constraints';
    public readonly AcademicReferences: readonly AcademicReference[] = [];

    constructor(
        public readonly iterations: number = 8,
        // Minimum centre-to-centre horizontal distance between two
        // nodes sharing a layer. Default 180 gives generous breathing
        // room between aligned columns; circles (radius 28) sit
        // comfortably apart with whitespace between them.
        public readonly minSpacing: number = 180,
        // Minimum centre-to-segment / centre-to-centre clearance
        // used by constraint (2). Default 32 = 28 (node radius) + 4
        // pixel buffer, matching the geometric crossing counter's
        // overlap threshold.
        public readonly clearance: number = 32,
    ) {}

    public Align(positions: Map<string, Point>, edges: Edge[]): Map<string, Point>
    {
        const preds = new Map<string, string[]>();
        const succs = new Map<string, string[]>();
        for (const id of positions.keys())
        {
            preds.set(id, []);
            succs.set(id, []);
        }
        for (const e of edges)
        {
            if (!positions.has(e.From) || !positions.has(e.To)) continue;
            succs.get(e.From)!.push(e.To);
            preds.get(e.To)!.push(e.From);
        }

        // Cache "edges incident to each node" so the clearance check
        // doesn't re-scan the whole edge list per query.
        const incident = new Map<string, Edge[]>();
        for (const id of positions.keys()) incident.set(id, []);
        for (const e of edges)
        {
            incident.get(e.From)?.push(e);
            incident.get(e.To)?.push(e);
        }

        const byY = new Map<number, string[]>();
        for (const [id, p] of positions)
        {
            if (!byY.has(p.Y)) byY.set(p.Y, []);
            byY.get(p.Y)!.push(id);
        }
        for (const layer of byY.values())
        {
            layer.sort((a, b) => positions.get(a)!.X - positions.get(b)!.X);
        }

        // Working copy of x positions (y unchanged).
        const xs = new Map<string, number>();
        for (const [id, p] of positions) xs.set(id, p.X);

        const ys = new Map<string, number>();
        for (const [id, p] of positions) ys.set(id, p.Y);

        // Squared distance from point (px, py) to the segment
        // ((x1, y1), (x2, y2)). Cheaper than computing the real
        // distance — we only need to compare against `clearance²`.
        const distSqToSegment = (
            px: number, py: number,
            x1: number, y1: number, x2: number, y2: number,
        ): number =>
        {
            const dx = x2 - x1;
            const dy = y2 - y1;
            const lenSq = dx * dx + dy * dy;
            if (lenSq === 0)
            {
                const ddx = px - x1;
                const ddy = py - y1;
                return ddx * ddx + ddy * ddy;
            }
            let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
            if (t < 0) t = 0;
            else if (t > 1) t = 1;
            const cx = x1 + t * dx;
            const cy = y1 + t * dy;
            const ddx = px - cx;
            const ddy = py - cy;
            return ddx * ddx + ddy * ddy;
        };

        const clearanceSq = this.clearance * this.clearance;

        // True iff moving `id` to (newX, ys[id]) keeps every edge
        // and every node at ≥ clearance from each other (for the
        // edges incident to id and the nodes near them).
        const isMoveFeasible = (id: string, newX: number): boolean =>
        {
            const myY = ys.get(id)!;

            // (a) No non-incident edge passes within clearance of id.
            for (const e of edges)
            {
                if (e.From === id || e.To === id) continue;
                const aX = xs.get(e.From);
                const bX = xs.get(e.To);
                if (aX === undefined || bX === undefined) continue;
                const aY = ys.get(e.From)!;
                const bY = ys.get(e.To)!;
                if (distSqToSegment(newX, myY, aX, aY, bX, bY) < clearanceSq) return false;
            }

            // (b) No edge incident to id, with id at newX, comes
            //     within clearance of any non-endpoint node.
            for (const e of incident.get(id) ?? [])
            {
                const isFrom = e.From === id;
                const otherId = isFrom ? e.To : e.From;
                const otherX = xs.get(otherId);
                if (otherX === undefined) continue;
                const otherY = ys.get(otherId)!;
                const sx1 = isFrom ? newX : otherX;
                const sy1 = isFrom ? myY  : otherY;
                const sx2 = isFrom ? otherX : newX;
                const sy2 = isFrom ? otherY : myY;
                for (const [nid] of positions)
                {
                    if (nid === e.From || nid === e.To) continue;
                    const nx = xs.get(nid)!;
                    const ny = ys.get(nid)!;
                    if (distSqToSegment(nx, ny, sx1, sy1, sx2, sy2) < clearanceSq) return false;
                }
            }
            return true;
        };

        // Find the farthest feasible point on the line from oldX
        // toward targetX (target = barycenter pull). Binary search
        // 8 levels gives sub-pixel resolution for our typical
        // pixel ranges.
        const findFeasibleX = (id: string, oldX: number, targetX: number): number =>
        {
            if (Math.abs(targetX - oldX) < 0.5) return oldX;
            if (isMoveFeasible(id, targetX)) return targetX;
            let lo = oldX;
            let hi = targetX;
            for (let i = 0; i < 8; i++)
            {
                const mid = (lo + hi) / 2;
                if (isMoveFeasible(id, mid)) lo = mid;
                else                          hi = mid;
            }
            return lo;
        };

        for (let iter = 0; iter < this.iterations; iter++)
        {
            let totalShift = 0;
            for (const layerNodes of byY.values())
            {
                for (let i = 0; i < layerNodes.length; i++)
                {
                    const id = layerNodes[i]!;
                    const neighborIds = [
                        ...(preds.get(id) ?? []),
                        ...(succs.get(id) ?? []),
                    ];
                    if (neighborIds.length === 0) continue;

                    let sum = 0;
                    let cnt = 0;
                    for (const nb of neighborIds)
                    {
                        const nx = xs.get(nb);
                        if (nx !== undefined) { sum += nx; cnt++; }
                    }
                    if (cnt === 0) continue;
                    let target = sum / cnt;

                    // Clamp by in-layer neighbours' positions.
                    const leftBound  = i > 0
                        ? xs.get(layerNodes[i - 1]!)! + this.minSpacing
                        : Number.NEGATIVE_INFINITY;
                    const rightBound = i < layerNodes.length - 1
                        ? xs.get(layerNodes[i + 1]!)! - this.minSpacing
                        : Number.POSITIVE_INFINITY;
                    if (target < leftBound)  target = leftBound;
                    if (target > rightBound) target = rightBound;

                    const oldX = xs.get(id)!;
                    if (Math.abs(target - oldX) <= 0.01) continue;

                    // Respect edge-node clearance — back off via
                    // binary search if the full move would cut a
                    // node out of an edge or an edge out of a node.
                    const accepted = findFeasibleX(id, oldX, target);
                    if (Math.abs(accepted - oldX) > 0.01)
                    {
                        xs.set(id, accepted);
                        totalShift += Math.abs(accepted - oldX);
                    }
                }
            }
            if (totalShift < 0.1) break;
        }

        // Safety: alignment can pull the layer with the smallest
        // x-coordinate toward an even smaller x (the leftmost
        // in-layer node has no left neighbour to clamp against).
        // If any node drifted left of the original leftmost, shift
        // the whole layout right so the relative geometry is
        // preserved but nothing leaks past the canvas left edge.
        let originalMinX = Number.POSITIVE_INFINITY;
        for (const p of positions.values()) if (p.X < originalMinX) originalMinX = p.X;
        let finalMinX = Number.POSITIVE_INFINITY;
        for (const x of xs.values()) if (x < finalMinX) finalMinX = x;
        if (finalMinX < originalMinX)
        {
            const shift = originalMinX - finalMinX;
            for (const [id, x] of xs) xs.set(id, x + shift);
        }

        const result = new Map<string, Point>();
        for (const [id, p] of positions)
        {
            result.set(id, new Point(xs.get(id)!, p.Y));
        }
        return result;
    }
}
