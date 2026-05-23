import type { Graph } from '../graph.js';
import type { ILayerImprover } from './layer-improver.js';

// Iteratively probes single-step moves: for each node v in graph
// order, try lowering its depth by 1 (move up in the drawing) and
// raising its depth by 1 (move down). Each candidate is checked
// against three constraints — predecessor depth, successor depth,
// and the L0 pin — and then scored by total geometric crossings
// under a (within-layer-index, depth) placement using graph.nodes
// order. Moves that strictly reduce the score are committed; the
// pass repeats until a full sweep produces no commit or maxPasses
// runs out.
//
// Cost metric is geometric crossings in LOGICAL coordinate space
// (within-layer index, layer number) — intentionally independent of
// the final rendered geometry. The improver's job is to choose a
// layer assignment, not to preview the SVG; logical coordinates
// capture the topological structure that downstream stages consume.
//
// Within-layer order during evaluation is `graph.nodes` insertion
// order. This is a coarse proxy: a downstream Reorderer will reshuffle
// columns anyway, so micro-level crossings may shift after layout
// completes. But it's stable across trials, so move decisions are
// at least self-consistent within this pass.
export class AdjacentLayerMoveImprover implements ILayerImprover
{
    constructor(
        public readonly maxPasses: number = 10,
        // When true, a node may share a row with one of its direct
        // predecessors or successors — the corresponding edge then
        // renders horizontally. The DAG invariant (no upward edges)
        // is still enforced: a node may not be placed at a depth
        // STRICTLY LESS than any predecessor, or STRICTLY GREATER
        // than any successor. This matches the user's intent that
        // initial layering be strict (longest-path enforces strict
        // depth) while the optimization pass may relax.
        // Set false to keep the optimization pass strict too (no
        // horizontal edges produced by moves here).
        public readonly allowSameLayerNeighbors: boolean = true,
    ) {}

    public Improve(
        depths:           Map<string, number>,
        graph:            Graph,
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

        // A candidate depth is valid iff every predecessor sits at or
        // above it (depending on `allowSameLayerNeighbors`), every
        // successor sits at or below it, and the L0 pin is honored.
        //
        // Strict mode (allowSameLayerNeighbors = false):
        //   pred.depth < newDepth, succ.depth > newDepth
        // Loose mode (allowSameLayerNeighbors = true):
        //   pred.depth <= newDepth, succ.depth >= newDepth
        // Both modes preserve the DAG invariant (no edges going
        // upward in the drawing); loose just permits horizontal ones.
        const allowEq = this.allowSameLayerNeighbors;
        const isValid = (id: string, newDepth: number): boolean =>
        {
            if (newDepth < 0) return false;
            for (const p of preds.get(id) ?? [])
            {
                const pd = current.get(p) ?? 0;
                if (allowEq ? pd > newDepth : pd >= newDepth) return false;
            }
            for (const s of succs.get(id) ?? [])
            {
                const sd = current.get(s) ?? 0;
                if (allowEq ? sd < newDepth : sd <= newDepth) return false;
            }
            if (firstLayerNodes !== undefined && firstLayerNodes.size > 0)
            {
                if (firstLayerNodes.has(id) && newDepth !== 0) return false;
                if (!firstLayerNodes.has(id) && newDepth === 0) return false;
            }
            return true;
        };

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

        // Counts crossings in LOGICAL coordinate space: x = within-
        // layer index (assigned by graph.nodes order), y = layer
        // number. This is intentionally independent of how the layout
        // is finally rendered (which centers each layer around a
        // shared midline). The improver's job is to choose a layer
        // assignment, not to preview the SVG.
        const countCrossings = (): number =>
        {
            const indexInLayer = new Map<string, number>();
            const layerCounts = new Map<number, number>();
            for (const n of graph.nodes)
            {
                const d = current.get(n.Id) ?? 0;
                const idx = layerCounts.get(d) ?? 0;
                indexInLayer.set(n.Id, idx);
                layerCounts.set(d, idx + 1);
            }

            const E = graph.edges.length;
            let count = 0;
            for (let i = 0; i < E; i++)
            {
                const e1 = graph.edges[i]!;
                const x1a = indexInLayer.get(e1.From)!;
                const y1a = current.get(e1.From) ?? 0;
                const x1b = indexInLayer.get(e1.To)!;
                const y1b = current.get(e1.To) ?? 0;

                for (let j = i + 1; j < E; j++)
                {
                    const e2 = graph.edges[j]!;
                    if (e1.From === e2.From || e1.From === e2.To
                        || e1.To === e2.From || e1.To === e2.To) continue;

                    const x2a = indexInLayer.get(e2.From)!;
                    const y2a = current.get(e2.From) ?? 0;
                    const x2b = indexInLayer.get(e2.To)!;
                    const y2b = current.get(e2.To) ?? 0;

                    if (segmentsIntersect(x1a, y1a, x1b, y1b, x2a, y2a, x2b, y2b)) count++;
                }
            }
            return count;
        };

        const initialCount = countCrossings();
        let baseline = initialCount;

        for (let pass = 0; pass < this.maxPasses; pass++)
        {
            let moved = false;
            for (const node of graph.nodes)
            {
                const id = node.Id;
                const L = current.get(id) ?? 0;

                // Try -1 then +1. The first improving move wins; we
                // don't bother probing both and picking the better,
                // because subsequent passes will get the second-best
                // direction if it still helps.
                for (const newDepth of [L - 1, L + 1])
                {
                    if (!isValid(id, newDepth)) continue;
                    current.set(id, newDepth);
                    const cost = countCrossings();
                    if (cost < baseline)
                    {
                        baseline = cost;
                        moved = true;
                        break;
                    }
                    current.set(id, L);
                }
            }
            if (!moved) break;
        }

        console.log(`    layer-move (logical crossings): ${initialCount} → ${baseline}`);
        return current;
    }
}
