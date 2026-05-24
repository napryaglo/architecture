import type { Edge } from '../graph.js';
import type { AcademicReference } from '../pipeline-element.js';
import type { IReorderer } from './reorderer.js';

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
export class BarycenterReorderer implements IReorderer
{
    public readonly Name               = 'Barycenter';
    public readonly AlgorithmName      = 'Barycenter heuristic (Sugiyama)';
    public readonly AcademicReferences: readonly AcademicReference[] = [
        {
            authors: 'Sugiyama, K., Tagawa, S., Toda, M.',
            year:    1981,
            title:   'Methods for visual understanding of hierarchical system structures',
            venue:   'IEEE Transactions on Systems, Man, and Cybernetics 11(2)',
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
