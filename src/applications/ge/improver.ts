import type { Edge } from './graph.js';

// Strategy interface for the "polish" step that runs AFTER a global
// reorderer (e.g. BarycenterReorderer). A LocalImprover takes the
// reordered layers and tries to improve them via local moves —
// swapping adjacent nodes, sliding ranges, etc. — that the global
// heuristic missed.
//
// Contract:
//   * Input layers are not mutated; the returned array is a fresh
//     outer array with fresh inner arrays.
//   * Each returned inner array is a permutation of the corresponding
//     input array (same node Ids, possibly reordered).
//   * As with Reorderer, edges may include dummy chain endpoints —
//     the improver treats them like any other node.
export interface LocalImprover
{
    Improve(layers: string[][], edges: Edge[]): string[][];
}

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
export class TransposeImprover implements LocalImprover
{
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
export class GreedySwitchImprover implements LocalImprover
{
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
export class SiftingImprover implements LocalImprover
{
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
export class IlpExactImprover implements LocalImprover
{
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
