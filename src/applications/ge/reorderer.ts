import type { Edge } from './graph.js';

// Strategy interface for layered-layout crossing reduction. A
// Reorderer takes a layered structure (each layer is a list of node
// Ids in left-to-right order) plus the edges between them and returns
// a NEW layered structure with each row permuted to reduce crossings.
//
// Contract:
//   * Input layers are not mutated — the returned array is a fresh
//     outer array with fresh inner arrays.
//   * Each returned inner array is a permutation of the corresponding
//     input array (same node Ids, possibly reordered).
//   * Edges may include dummy-node endpoints (Sugiyama-style chain
//     expansion); the reorderer treats them like any other node and
//     trusts that real / dummy split is handled by the caller.
export interface Reorderer
{
    Reorder(layers: string[][], edges: Edge[]): string[][];
}

// Sugiyama-style barycenter heuristic. Each sweep reorders one layer
// by the mean index of its neighbours in the adjacent reference layer:
//   * down sweep — order layer L by mean index of preds in L-1
//   * up   sweep — order layer L by mean index of succs in L+1
// Nodes with no neighbours in the reference layer keep their current
// index (their barycenter defaults to "stay put"), which prevents
// isolated nodes from getting yanked to one end.
//
// Ties break on the previous index, so the sort is stable — chains of
// identical barycenters don't shuffle randomly between iterations. We
// alternate down/up sweeps and stop early when a full down+up pair
// produces no change.
//
// Multi-layer edges are silently ignored by each sweep: a predecessor
// not in the directly-adjacent layer simply isn't found in `refIndex`.
// To make multi-layer edges visible, expand them into unit-length
// chains via dummy nodes before calling Reorder (the caller's job).
export class BarycenterReorderer implements Reorderer
{
    constructor(public readonly iterations: number = 12) {}

    public Reorder(layers: string[][], edges: Edge[]): string[][]
    {
        // Derive the node-Id universe from `layers` itself so this
        // method handles both the original graph and any expanded
        // (dummy-augmented) version without needing a separate node
        // list passed in.
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
                let sum = 0;
                let cnt = 0;
                for (const nb of neighbours.get(id) ?? [])
                {
                    const idx = refIndex.get(nb);
                    if (idx !== undefined) { sum += idx; cnt++; }
                }
                const bary = cnt > 0 ? sum / cnt : originalIndex;
                return { id, bary, originalIndex };
            });
            decorated.sort((a, b) => a.bary - b.bary || a.originalIndex - b.originalIndex);
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
}

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
export class MedianReorderer implements Reorderer
{
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
