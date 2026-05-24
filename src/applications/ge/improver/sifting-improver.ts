import type { Edge } from '../graph.js';
import type { AcademicReference } from '../pipeline-element.js';
import type { ILocalImprover } from './local-improver.js';

// Sifting heuristic from Matuszewski, Schönfeld & Molitor 1999 ("Using
// sifting for k-layer straightline crossing minimization"). Distinct
// from the pair-swap heuristics (Transpose, GreedySwitch) in two
// important ways:
//
//   * EVERY position, not just adjacent. For each node v we lift it
//     out of its layer and try inserting it at each of the
//     |layer| - 1 other positions; whichever position gives the
//     lowest combined crossing count (against both adjacent layers)
//     wins. v then moves there, even if the best position is far
//     from where v started.
//   * Escapes adjacent-swap local optima. A configuration can be
//     stable under any single pair-swap and still have a better
//     ordering reachable by moving one node several slots. Sifting
//     finds those moves.
//
// Processing order within a layer is "by decreasing degree" — nodes
// with more neighbours move first, so high-leverage placements are
// committed before low-leverage ones. Matuszewski et al. describe a
// single layer-by-layer pass; we expose `maxPasses` (default 1) for
// callers who want to iterate.
//
// Cost: O(|layer|^2 * |edges|) per layer per pass — fine for the
// small graphs this module currently targets. The classical
// "Bilayer Cross Counting" speedup (Barth et al. 2002) would bring
// this to O(|edges| log |layer|) if needed later.
export class SiftingImprover implements ILocalImprover
{
    public readonly Name               = 'Sifting';
    public readonly AlgorithmName      = 'Per-node best-position sifting';
    public readonly AcademicReferences: readonly AcademicReference[] = [
        {
            authors: 'Matuszewski, C., Schönfeld, R., Molitor, P.',
            year:    1999,
            title:   'Using sifting for k-layer straightline crossing minimization',
            venue:   'Graph Drawing ’99, LNCS 1731',
        },
    ];

    constructor(public readonly maxPasses: number = 1) {}

    public Improve(layers: string[][], edges: Edge[]): string[][]
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

        // Counts edges that cross between two specific adjacent layer
        // orderings. An edge (u → v) where u is in `upper` and v is
        // in `lower` crosses another such edge iff their endpoints
        // appear in opposite order on the two layers. Edges that
        // don't span this transition are ignored (returns undefined
        // from the index map).
        const crossingsBetween = (upper: string[], lower: string[]): number =>
        {
            if (upper.length === 0 || lower.length === 0) return 0;
            const upperIdx = new Map<string, number>();
            const lowerIdx = new Map<string, number>();
            for (let i = 0; i < upper.length; i++) upperIdx.set(upper[i]!, i);
            for (let i = 0; i < lower.length; i++) lowerIdx.set(lower[i]!, i);

            const pairs: Array<[number, number]> = [];
            for (const e of edges)
            {
                const u = upperIdx.get(e.From);
                const l = lowerIdx.get(e.To);
                if (u !== undefined && l !== undefined) pairs.push([u, l]);
            }

            let count = 0;
            for (let i = 0; i < pairs.length; i++)
            {
                const [au, al] = pairs[i]!;
                for (let j = i + 1; j < pairs.length; j++)
                {
                    const [bu, bl] = pairs[j]!;
                    if ((au < bu && al > bl) || (au > bu && al < bl)) count++;
                }
            }
            return count;
        };

        for (let pass = 0; pass < this.maxPasses; pass++)
        {
            let anyMove = false;

            for (let L = 0; L < current.length; L++)
            {
                const above = L > 0                  ? current[L - 1]! : [];
                const below = L < current.length - 1 ? current[L + 1]! : [];
                const row = current[L]!;

                // Snapshot node order by decreasing total degree.
                // Sorting `row` directly would change the layer
                // ordering before we evaluate moves; we want only
                // the processing order to depend on degree.
                const order = [...row].sort((a, b) =>
                {
                    const da = (preds.get(a)?.length ?? 0) + (succs.get(a)?.length ?? 0);
                    const db = (preds.get(b)?.length ?? 0) + (succs.get(b)?.length ?? 0);
                    return db - da;
                });

                for (const node of order)
                {
                    const currentIdx = row.indexOf(node);
                    if (currentIdx < 0) continue;
                    row.splice(currentIdx, 1);

                    // Try every possible reinsertion slot. Ties go to
                    // the position closest to the node's previous one
                    // to keep the move set minimal.
                    let bestPos = currentIdx;
                    let bestCost = Infinity;
                    for (let pos = 0; pos <= row.length; pos++)
                    {
                        const trial = [...row];
                        trial.splice(pos, 0, node);
                        const cost = crossingsBetween(above, trial) + crossingsBetween(trial, below);
                        if (cost < bestCost
                            || (cost === bestCost && Math.abs(pos - currentIdx) < Math.abs(bestPos - currentIdx)))
                        {
                            bestCost = cost;
                            bestPos = pos;
                        }
                    }

                    row.splice(bestPos, 0, node);
                    if (bestPos !== currentIdx) anyMove = true;
                }
            }

            if (!anyMove) break;
        }

        return current;
    }
}
