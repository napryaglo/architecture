import type { Edge } from '../graph.js';
import type { AcademicReference } from '../pipeline-element.js';
import type { IReorderer } from './reorderer.js';

// Median heuristic for crossing reduction (Gansner et al. 1993 — the
// scheme used by Graphviz dot). Same down/up sweep skeleton as
// BarycenterReorderer; the only thing that changes is the sort key
// each node is assigned per sweep:
//
//   * 0 neighbours    → keep current index ("stay put")
//   * 1 neighbour     → that single index
//   * 2 neighbours    → midpoint of the two indices (== barycenter)
//   * k odd           → the middle index of the sorted list
//   * k even, k >= 4  → weighted median: bias toward whichever side
//                       of the median pair is more crowded, so the
//                       node lands closer to its denser cluster of
//                       neighbours
//
// In theory, median gives a 3-approximation for one-sided crossing
// minimisation (Eades & Wormald), where pure barycenter is only a
// 4-approximation in the worst case. In practice both heuristics
// trade wins depending on the graph — running both and keeping the
// better result is a common production strategy.
export class MedianReorderer implements IReorderer
{
    public readonly Name               = 'Median';
    public readonly AlgorithmName      = 'Weighted median heuristic (3-approximation)';
    public readonly AcademicReferences: readonly AcademicReference[] = [
        {
            authors: 'Eades, P., Wormald, N. C.',
            year:    1994,
            title:   'Edge crossings in drawings of bipartite graphs',
            venue:   'Algorithmica 11(4)',
        },
        {
            authors: 'Gansner, E. R., Koutsofios, E., North, S. C., Vo, K.-P.',
            year:    1993,
            title:   'A technique for drawing directed graphs',
            venue:   'IEEE Transactions on Software Engineering 19(3)',
        },
    ];

    constructor(public readonly iterations: number = 12) {}

    public Reorder(layers: string[][], edges: Edge[]): string[][]
    {
        const preds = new Map<string, string[]>();
        const succs = new Map<string, string[]>();
        for (const row of layers)
        {
            for (const id of row)
            {
                preds.set(id, []);
                succs.set(id, []);
            }
        }
        for (const e of edges)
        {
            succs.get(e.From)?.push(e.To);
            preds.get(e.To)?.push(e.From);
        }

        const current = layers.map(row => [...row]);

        const sweep = (rowIdx: number, refRow: string[], neighbours: Map<string, string[]>): boolean =>
        {
            const refIndex = new Map<string, number>();
            for (let i = 0; i < refRow.length; i++) refIndex.set(refRow[i]!, i);

            const row = current[rowIdx]!;
            const decorated = row.map((id, originalIndex) =>
            {
                const positions: number[] = [];
                for (const nb of neighbours.get(id) ?? [])
                {
                    const idx = refIndex.get(nb);
                    if (idx !== undefined) positions.push(idx);
                }
                positions.sort((a, b) => a - b);
                const med = this.medianValue(positions, originalIndex);
                return { id, med, originalIndex };
            });
            decorated.sort((a, b) => a.med - b.med || a.originalIndex - b.originalIndex);
            const reordered = decorated.map(d => d.id);

            let changed = false;
            for (let i = 0; i < reordered.length; i++)
            {
                if (reordered[i] !== row[i]) { changed = true; break; }
            }
            current[rowIdx] = reordered;
            return changed;
        };

        for (let iter = 0; iter < this.iterations; iter++)
        {
            let changed = false;
            for (let L = 1; L < current.length; L++)
            {
                if (sweep(L, current[L - 1]!, preds)) changed = true;
            }
            for (let L = current.length - 2; L >= 0; L--)
            {
                if (sweep(L, current[L + 1]!, succs)) changed = true;
            }
            if (!changed) break;
        }

        return current;
    }

    // The weighted-median formula. `positions` is the sorted list of
    // neighbour indices in the reference layer; `fallback` is the
    // node's current index, used when it has no neighbours in the
    // reference layer (avoids dragging isolated nodes to position 0).
    private medianValue(positions: number[], fallback: number): number
    {
        const n = positions.length;
        if (n === 0) return fallback;
        const m = Math.floor(n / 2);
        if (n % 2 === 1) return positions[m]!;
        if (n === 2) return (positions[0]! + positions[1]!) / 2;
        const left  = positions[m - 1]! - positions[0]!;
        const right = positions[n - 1]! - positions[m]!;
        // left + right is 0 only when all neighbours are at the same
        // index — degenerate but possible after dummy-node insertion.
        // Fall back to the simple midpoint to avoid NaN.
        if (left + right === 0) return (positions[m - 1]! + positions[m]!) / 2;
        return (positions[m - 1]! * right + positions[m]! * left) / (left + right);
    }
}
