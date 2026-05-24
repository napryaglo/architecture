import type { Edge } from '../graph.js';
import type { AcademicReference } from '../pipeline-element.js';
import type { ILocalImprover } from './local-improver.js';

// Greedy switching heuristic from Eades & Kelly 1986 ("Heuristics for
// reducing crossings in 2-layered networks"). Like TransposeImprover
// it swaps adjacent pairs when doing so reduces local crossings, but
// in two key ways simpler:
//
//   * One bidirectional sweep — no iteration to convergence. A
//     top-down pass evaluates each pair only against the predecessor
//     layer above; a bottom-up pass evaluates each pair only against
//     the successor layer below.
//   * Each pair is judged on a SINGLE reference layer per pass, not
//     both at once. Cheaper, but means a swap that helps with one
//     side may hurt the other — we trust the global reorderer
//     stage to have handled the cross-layer trade-off.
//
// On graphs where the global heuristic already converged, Greedy
// Switching is essentially a no-op. Its main use is as a quick
// post-pass after a fast-but-coarse reorderer, or as a cheaper
// substitute for Transpose when iteration is too expensive.
export class GreedySwitchImprover implements ILocalImprover
{
    public readonly Name               = 'Greedy Switch';
    public readonly AlgorithmName      = 'Single bidirectional adjacent-swap pass';
    public readonly AcademicReferences: readonly AcademicReference[] = [
        {
            authors: 'Eades, P., Kelly, D.',
            year:    1986,
            title:   'Heuristics for reducing crossings in 2-layered networks',
            venue:   'Ars Combinatoria 21A',
        },
    ];

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

        // Top-down: each layer's pairs evaluated against the layer
        // above (using predecessor edges only).
        for (let L = 1; L < current.length; L++)
        {
            const above = current[L - 1]!;
            const aboveIndex = new Map<string, number>();
            for (let i = 0; i < above.length; i++) aboveIndex.set(above[i]!, i);

            const row = current[L]!;
            for (let i = 0; i < row.length - 1; i++)
            {
                const v = row[i]!;
                const w = row[i + 1]!;
                const vP = indicesIn(preds.get(v) ?? [], aboveIndex);
                const wP = indicesIn(preds.get(w) ?? [], aboveIndex);
                if (pairCrossings(wP, vP) < pairCrossings(vP, wP))
                {
                    row[i] = w;
                    row[i + 1] = v;
                }
            }
        }

        // Bottom-up: each layer's pairs evaluated against the layer
        // below (using successor edges only).
        for (let L = current.length - 2; L >= 0; L--)
        {
            const below = current[L + 1]!;
            const belowIndex = new Map<string, number>();
            for (let i = 0; i < below.length; i++) belowIndex.set(below[i]!, i);

            const row = current[L]!;
            for (let i = 0; i < row.length - 1; i++)
            {
                const v = row[i]!;
                const w = row[i + 1]!;
                const vS = indicesIn(succs.get(v) ?? [], belowIndex);
                const wS = indicesIn(succs.get(w) ?? [], belowIndex);
                if (pairCrossings(wS, vS) < pairCrossings(vS, wS))
                {
                    row[i] = w;
                    row[i + 1] = v;
                }
            }
        }

        return current;
    }
}
