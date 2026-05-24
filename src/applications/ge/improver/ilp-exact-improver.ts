import type { Edge } from '../graph.js';
import type { AcademicReference } from '../pipeline-element.js';
import type { ILocalImprover } from './local-improver.js';

// Exact ILP-formulated improver for k-layer crossing minimization,
// solved via brute-force permutation enumeration per layer.
//
// ILP FORMULATION (per layer L being optimized, with adjacent layers
// held fixed):
//
//   Variables
//     x_{ij} ∈ {0,1}      for each ordered pair (i, j), i ≠ j, in L
//                         x_{ij} = 1 iff i is placed before j
//     c_{e,f} ∈ {0,1}     for each pair of edges (e, f) whose endpoints
//                         lie in L and an adjacent layer
//                         c_{e,f} = 1 iff e and f cross
//
//   Constraints
//     x_{ij} + x_{ji} = 1                       (anti-symmetry)
//     x_{ij} + x_{jk} - x_{ik} ≤ 1   ∀ i, j, k   (transitivity — no
//                                                  3-cycles in the
//                                                  ordering)
//     For each crossing-eligible edge pair (e = a→b, f = c→d) where
//     a, c lie in L and b, d lie in an adjacent layer:
//         c_{e,f} ≥ x_{ac} − x_{bd}             (XOR linearization)
//         c_{e,f} ≥ x_{bd} − x_{ac}
//
//   Objective
//     minimize Σ c_{e,f}
//
// SOLVER: this codebase doesn't ship with an LP/ILP backend
// (CPLEX/Gurobi/GLPK), so we don't actually build the model and hand
// it to a solver — we enumerate all |L|! orderings of each layer and
// score them directly. For the architecture graph (max layer size 8
// → 40320 perms) this finishes in well under a second; layers larger
// than `maxLayerSize` are skipped to keep run-times bounded.
//
// Globally exact across all k layers is harder — the per-layer
// subproblem and the k-layer problem aren't the same, since each
// layer's optimum depends on its neighbours. We iterate (top-down +
// bottom-up) until no layer's best reorder reduces total crossings;
// the result is a Nash-style equilibrium under the 2-layer exact
// move, which in practice is at least as good as any local-swap
// heuristic and very often the true k-layer optimum.
export class IlpExactImprover implements ILocalImprover
{
    public readonly Name               = 'ILP Exact';
    public readonly AlgorithmName      = 'Integer linear program formulation (brute-force enumeration)';
    public readonly AcademicReferences: readonly AcademicReference[] = [
        {
            authors: 'Jünger, M., Mutzel, P.',
            year:    1997,
            title:   '2-layer straightline crossing minimization: Performance of exact and heuristic algorithms',
            venue:   'Journal of Graph Algorithms and Applications 1(1)',
        },
    ];

    constructor(
        public readonly maxPasses:    number = 8,
        public readonly maxLayerSize: number = 9,
    ) {}

    public Improve(layers: string[][], edges: Edge[]): string[][]
    {
        const current = layers.map(row => [...row]);

        // Reuse the bilayer-crossing counter shape from SiftingImprover.
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
            let improved = false;

            // Alternate top-down on even passes, bottom-up on odd
            // passes — this gives both neighbour layers a chance to
            // settle before being asked to host their neighbour's
            // optimum.
            const order: number[] = [];
            if (pass % 2 === 0)
                for (let L = 0; L < current.length; L++) order.push(L);
            else
                for (let L = current.length - 1; L >= 0; L--) order.push(L);

            for (const L of order)
            {
                const above = L > 0                  ? current[L - 1]! : [];
                const below = L < current.length - 1 ? current[L + 1]! : [];
                const row = current[L]!;

                if (row.length > this.maxLayerSize) continue;
                if (row.length <= 1) continue;

                const baseline = crossingsBetween(above, row) + crossingsBetween(row, below);
                let bestRow: string[] = row;
                let bestCost = baseline;

                for (const perm of this.permutations(row))
                {
                    const cost = crossingsBetween(above, perm) + crossingsBetween(perm, below);
                    if (cost < bestCost)
                    {
                        bestCost = cost;
                        bestRow = perm;
                    }
                }

                if (bestCost < baseline)
                {
                    current[L] = bestRow;
                    improved = true;
                }
            }

            if (!improved) break;
        }

        return current;
    }

    // Yields every permutation of `arr` as a fresh array. Recursive
    // generator — simple enough for our bounded layer sizes.
    private *permutations<T>(arr: readonly T[]): Generator<T[]>
    {
        if (arr.length <= 1)
        {
            yield [...arr];
            return;
        }
        for (let i = 0; i < arr.length; i++)
        {
            const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
            for (const perm of this.permutations(rest))
            {
                yield [arr[i]!, ...perm];
            }
        }
    }
}
