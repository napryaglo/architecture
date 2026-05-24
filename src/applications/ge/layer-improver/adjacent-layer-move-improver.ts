import type { Graph } from '../graph.js';
import type { AcademicReference } from '../pipeline-element.js';
import type { ILayerImprover } from './layer-improver.js';

// Iteratively probes depth moves: for each node v, sift through every
// valid depth in [lo, hi] (bracketed by predecessors / successors) and
// commit whichever yields the fewest real-edge crossings under the
// REAL column ordering supplied by the orchestrator.
//
// Critically, column indices are read from the `layers` parameter —
// the actual Reorderer (+ LocalImprover) output the orchestrator
// passes in. That makes the cost metric reflect what the SVG will
// show: multi-layer edges drawn as straight diagonals between
// real-node positions. The orchestrator re-runs the column-ordering
// stages after each Improve call so the layers reflect the latest
// depth assignment; an outer fixpoint loop iterates this until no
// move helps.
//
// When the improver moves a node to a new depth, its column index in
// the destination layer defaults to "appended at the end". That's a
// throwaway placement — the next Reorderer pass will reorder columns
// properly. The metric still uses these throwaway columns to score
// the trial, so trials are approximate; the fixpoint loop corrects
// over multiple passes.
export class AdjacentLayerMoveImprover implements ILayerImprover
{
    public readonly Name               = 'Adjacent-Layer Move';
    public readonly AlgorithmName      = 'Sifting-range depth moves with real-edge crossing cost';
    public readonly AcademicReferences: readonly AcademicReference[] = [
        {
            authors: 'Matuszewski, C., Schönfeld, R., Molitor, P.',
            year:    1999,
            title:   'Using sifting for k-layer straightline crossing minimization',
            venue:   'Graph Drawing ’99, LNCS 1731',
        },
    ];

    constructor(
        public readonly maxPasses: number = 10,
        // Loose mode (true) lets a node share a row with a direct
        // predecessor or successor (the corresponding edge renders
        // horizontally). Strict mode requires strict pred < v < succ.
        // Both modes preserve the DAG invariant (no upward edges).
        public readonly allowSameLayerNeighbors: boolean = true,
    ) {}

    public Improve(
        depths:           Map<string, number>,
        graph:            Graph,
        layers:           string[][],
        firstLayerNodes?: ReadonlySet<string>,
    ): Map<string, number>
    {
        const preds = new Map<string, string[]>();
        const succs = new Map<string, string[]>();
        for (const n of graph.nodes)
        {
            preds.set(n.Id, []);
            succs.set(n.Id, []);
        }
        for (const e of graph.edges)
        {
            succs.get(e.From)?.push(e.To);
            preds.get(e.To)?.push(e.From);
        }

        const current = new Map(depths);
        const allowEq = this.allowSameLayerNeighbors;

        const realIds = new Set<string>();
        for (const n of graph.nodes) realIds.add(n.Id);

        // Snapshot the column order of real nodes as the Reorderer
        // delivered it, by walking each row of `layers` (which still
        // includes dummies) and keeping only real-node Ids in order.
        // This is the stable reference column order we'll project
        // moved nodes against.
        const refColumnOrder: string[][] = [];
        for (const row of layers)
        {
            const realRow: string[] = [];
            for (const id of row) if (realIds.has(id)) realRow.push(id);
            refColumnOrder.push(realRow);
        }

        const orient = (px: number, py: number, qx: number, qy: number, rx: number, ry: number): number =>
        {
            const v = (qx - px) * (ry - py) - (qy - py) * (rx - px);
            return v > 0 ? 1 : v < 0 ? -1 : 0;
        };

        const segmentsIntersect = (
            ax1: number, ay1: number, ax2: number, ay2: number,
            bx1: number, by1: number, bx2: number, by2: number,
        ): boolean =>
        {
            const o1 = orient(ax1, ay1, ax2, ay2, bx1, by1);
            const o2 = orient(ax1, ay1, ax2, ay2, bx2, by2);
            const o3 = orient(bx1, by1, bx2, by2, ax1, ay1);
            const o4 = orient(bx1, by1, bx2, by2, ax2, ay2);
            return o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0;
        };

        // Builds the per-depth real-node column list for the current
        // depth assignment, preserving the Reorderer's column order
        // for nodes that haven't moved and appending moved-in nodes
        // at the end of their new layer. Returns (id → [col, depth]).
        const computePositions = (): Map<string, [number, number]> =>
        {
            let maxD = 0;
            for (const d of current.values()) if (d > maxD) maxD = d;
            const columns: string[][] = [];
            for (let i = 0; i <= maxD; i++) columns.push([]);

            // First pass: preserve reference column order for nodes
            // still at their reference depth.
            for (let d = 0; d < refColumnOrder.length; d++)
            {
                for (const id of refColumnOrder[d]!)
                {
                    if (current.get(id) === d) columns[d]!.push(id);
                }
            }
            // Second pass: append moved nodes at their new depth.
            for (const n of graph.nodes)
            {
                const d = current.get(n.Id) ?? 0;
                if (d >= columns.length) columns.push([]);
                const refD = depthInRef(n.Id);
                if (refD === d) continue;        // already placed in first pass
                columns[d]!.push(n.Id);
            }

            const positions = new Map<string, [number, number]>();
            for (let d = 0; d < columns.length; d++)
            {
                for (let i = 0; i < columns[d]!.length; i++)
                {
                    positions.set(columns[d]![i]!, [i, d]);
                }
            }
            return positions;
        };

        // Helper used by computePositions: where did this node originally
        // live (per the reference column order)? Returns -1 if not found.
        const refDepthLookup = new Map<string, number>();
        for (let d = 0; d < refColumnOrder.length; d++)
        {
            for (const id of refColumnOrder[d]!) refDepthLookup.set(id, d);
        }
        const depthInRef = (id: string): number => refDepthLookup.get(id) ?? -1;

        // Returns true iff (px, py) is colinear with the segment
        // ((x1, y1), (x2, y2)) AND falls strictly inside it (not at
        // either endpoint). Used to detect when an edge passes
        // through a non-incident node's logical position.
        const pointOnSegmentInterior = (
            px: number, py: number,
            x1: number, y1: number, x2: number, y2: number,
        ): boolean =>
        {
            // Reject endpoints.
            if ((px === x1 && py === y1) || (px === x2 && py === y2)) return false;
            // Colinearity via cross product.
            if ((x2 - x1) * (py - y1) - (y2 - y1) * (px - x1) !== 0) return false;
            // Bounding-box check (inclusive).
            const xMin = x1 < x2 ? x1 : x2;
            const xMax = x1 < x2 ? x2 : x1;
            const yMin = y1 < y2 ? y1 : y2;
            const yMax = y1 < y2 ? y2 : y1;
            return px >= xMin && px <= xMax && py >= yMin && py <= yMax;
        };

        // Count real-edge crossings (segment-segment intersections)
        // PLUS edge-node overlaps (an edge whose interior lies on a
        // non-incident node's (column, depth) position) — both kinds
        // are visually indistinguishable in the SVG, so the metric
        // treats them as one.
        const countCrossings = (): number =>
        {
            const positions = computePositions();
            const E = graph.edges.length;
            let count = 0;
            for (let i = 0; i < E; i++)
            {
                const e1 = graph.edges[i]!;
                const a = positions.get(e1.From);
                const b = positions.get(e1.To);
                if (a === undefined || b === undefined) continue;
                for (let j = i + 1; j < E; j++)
                {
                    const e2 = graph.edges[j]!;
                    if (e1.From === e2.From || e1.From === e2.To
                        || e1.To === e2.From || e1.To === e2.To) continue;
                    const c = positions.get(e2.From);
                    const d = positions.get(e2.To);
                    if (c === undefined || d === undefined) continue;
                    if (segmentsIntersect(a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1])) count++;
                }
                // Edge-node overlap: e1 passing through some other
                // real node's (column, depth) position.
                for (const n of graph.nodes)
                {
                    if (n.Id === e1.From || n.Id === e1.To) continue;
                    const p = positions.get(n.Id);
                    if (p === undefined) continue;
                    if (pointOnSegmentInterior(p[0], p[1], a[0], a[1], b[0], b[1])) count++;
                }
            }
            return count;
        };

        const initialCount = countCrossings();
        let baseline = initialCount;

        // For a node v, the inclusive valid-depth bracket.
        const validRange = (id: string): [number, number] =>
        {
            let lo = 0;
            for (const p of preds.get(id) ?? [])
            {
                const pd = current.get(p) ?? 0;
                const minOk = allowEq ? pd : pd + 1;
                if (minOk > lo) lo = minOk;
            }
            let hi = Number.POSITIVE_INFINITY;
            for (const s of succs.get(id) ?? [])
            {
                const sd = current.get(s) ?? 0;
                const maxOk = allowEq ? sd : sd - 1;
                if (maxOk < hi) hi = maxOk;
            }
            if (firstLayerNodes !== undefined && firstLayerNodes.size > 0)
            {
                if (firstLayerNodes.has(id)) return [0, 0];
                if (lo < 1) lo = 1;
            }
            return [lo, hi];
        };

        for (let pass = 0; pass < this.maxPasses; pass++)
        {
            let moved = false;
            for (const node of graph.nodes)
            {
                const id = node.Id;
                const L = current.get(id) ?? 0;
                const [lo, hi] = validRange(id);
                if (!Number.isFinite(hi) || hi < lo) continue;

                let bestDepth = L;
                let bestCost = baseline;
                for (let d = lo; d <= hi; d++)
                {
                    if (d === L) continue;
                    current.set(id, d);
                    const cost = countCrossings();
                    if (cost < bestCost)
                    {
                        bestCost = cost;
                        bestDepth = d;
                    }
                }
                current.set(id, bestDepth);
                if (bestDepth !== L)
                {
                    baseline = bestCost;
                    moved = true;
                }
            }
            if (!moved) break;
        }

        console.log(`    layer-move (real-edge crossings): ${initialCount} → ${baseline}`);
        return current;
    }
}
