import type { Edge } from '../graph.js';
import type { AcademicReference } from '../pipeline-element.js';
import type { ILocalImprover } from './local-improver.js';

// Transpose heuristic from Gansner et al. 1993 ("A Technique for
// Drawing Directed Graphs"). Iterates over every adjacent pair (v, w)
// in every layer and swaps them whenever doing so reduces the count
// of crossings contributed by their incident edges (both into the
// layer above and into the layer below). Repeats the entire pass
// until a full sweep yields no swaps.
//
// The local-only cost function is what makes this cheap: we don't
// recount global crossings, just the crossings between v's incident
// edges and w's incident edges. For two nodes v (currently left) and
// w (currently right) sharing a reference layer, an edge from v with
// reference-index `a` crosses an edge from w with reference-index `b`
// iff `a > b`. Sum that over predecessors-in-L-1 and successors-in-L+1,
// then compare against the swapped-order cost.
//
// Gansner's original description has no iteration cap; we add one
// (`maxPasses`) purely as a safety belt against pathological
// configurations and floating-point edge cases — in practice the
// algorithm converges in a handful of passes.
export class TransposeImprover implements ILocalImprover
{
    public readonly Name               = 'Transpose';
    public readonly AlgorithmName      = 'Iterated adjacent-pair swap (Gansner)';
    public readonly AcademicReferences: readonly AcademicReference[] = [
        {
            authors: 'Gansner, E. R., Koutsofios, E., North, S. C., Vo, K.-P.',
            year:    1993,
            title:   'A technique for drawing directed graphs',
            venue:   'IEEE Transactions on Software Engineering 19(3)',
        },
    ];

    constructor(public readonly maxPasses: number = 100) {}

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

        // Number of crossings between v's edges and w's edges given
        // v is positioned left of w. Each (a, b) pair where v has an
        // edge to / from `a` and w has an edge to / from `b` crosses
        // iff a > b.
        const pairCrossings = (vNb: number[], wNb: number[]): number =>
        {
            let c = 0;
            for (const a of vNb)
            {
                for (const b of wNb)
                {
                    if (a > b) c++;
                }
            }
            return c;
        };

        // Looks up `nbList` Ids against a precomputed reference-layer
        // index map, dropping any that aren't in the reference layer.
        // Returning a fresh array keeps the inner loop allocation-light.
        const indicesIn = (nbList: string[], refIndex: Map<string, number>): number[] =>
        {
            const out: number[] = [];
            for (const nb of nbList)
            {
                const idx = refIndex.get(nb);
                if (idx !== undefined) out.push(idx);
            }
            return out;
        };

        let passes = 0;
        let improved = true;
        while (improved && passes < this.maxPasses)
        {
            improved = false;
            passes++;

            for (let L = 0; L < current.length; L++)
            {
                // Reference-layer index maps are stable across the
                // inner pair loop, so compute them once per layer.
                const above = L > 0                  ? current[L - 1]! : [];
                const below = L < current.length - 1 ? current[L + 1]! : [];
                const aboveIndex = new Map<string, number>();
                const belowIndex = new Map<string, number>();
                for (let i = 0; i < above.length; i++) aboveIndex.set(above[i]!, i);
                for (let i = 0; i < below.length; i++) belowIndex.set(below[i]!, i);

                const row = current[L]!;
                for (let i = 0; i < row.length - 1; i++)
                {
                    const v = row[i]!;
                    const w = row[i + 1]!;

                    const vP = indicesIn(preds.get(v) ?? [], aboveIndex);
                    const wP = indicesIn(preds.get(w) ?? [], aboveIndex);
                    const vS = indicesIn(succs.get(v) ?? [], belowIndex);
                    const wS = indicesIn(succs.get(w) ?? [], belowIndex);

                    const costCurrent = pairCrossings(vP, wP) + pairCrossings(vS, wS);
                    const costSwapped = pairCrossings(wP, vP) + pairCrossings(wS, vS);

                    if (costSwapped < costCurrent)
                    {
                        row[i] = w;
                        row[i + 1] = v;
                        improved = true;
                    }
                }
            }
        }

        return current;
    }
}
