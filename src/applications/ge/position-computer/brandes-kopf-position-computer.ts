import { Point } from '../../../runtime/index.js';
import type { Edge } from '../graph.js';
import type { AcademicReference } from '../pipeline-element.js';
import type { IPositionComputer } from './position-computer.js';

// Brandes & Köpf (2002) "Fast and Simple Horizontal Coordinate
// Assignment" — full 4-pass variant.
//
// The canonical pass is "top-down, leftmost":
//   1. VERTICAL ALIGNMENT. Walk layers top-down. For each node v,
//      try to join the block of one of its MEDIAN upper neighbours
//      (left-median first, then right-median) provided no in-layer
//      crossing constraint is violated. `root` (block leader) and
//      `align` (cyclic chain through block members) are produced.
//   2. HORIZONTAL COMPACTION. For each root r, recursively place
//      its block at its leftmost valid x given the constraint
//      x ≥ x[left_in-layer_neighbour.root] + δ for every member.
//      Inter-block-tree constraints are recorded as `shift`s
//      against the destination block's sink so disjoint subtrees
//      don't inflate each other.
//
// The four passes are the canonical pass run with different
// transformations of the input layers + neighbour graph:
//
//   * down-left   — input as-is                                 (this pass)
//   * down-right  — each layer reversed                         (mirror x at end)
//   * up-left     — layer order reversed, lower-neighbours used (no x mirror)
//   * up-right    — both reversals                              (mirror x at end)
//
// Each pass produces an x-coordinate per node. The four x maps
// are normalised so each pass's min x equals 0. The paper's
// "balanced" combine averages the two median x-values per node;
// it removes left/right bias but can produce non-grid-aligned
// fractional positions for chains that one pass got perfectly
// aligned and another did not.
//
// We instead PICK THE BEST OF FIVE candidates: the four single
// passes and the balanced average. "Best" is the layout with
// the smallest sum of |x[u] − x[v]| across the (real + dummy)
// edges — a proxy that directly rewards aligned chains (zero
// dx per chain segment is the optimum) and naturally also
// reduces crossings. Single-pass results stay grid-aligned when
// they win; the balanced average wins on graphs where the four
// passes individually have stubborn misalignments that average
// out to something cleaner.
//
// References to "blocks" / "alignments" / "sinks" follow the
// paper's vocabulary; see also Healy & Nikolov (2013), Section
// 13 of the Handbook of Graph Drawing, which has a textbook-style
// walkthrough of the same algorithm.

type Bias      = 'left' | 'right';
type Direction = 'down' | 'up';

export class BrandesKopfPositionComputer implements IPositionComputer
{
    public readonly Name               = 'Brandes–Köpf';
    public readonly AlgorithmName      = 'Block-based horizontal coordinate assignment (4-pass balanced)';
    public readonly AcademicReferences: readonly AcademicReference[] = [
        {
            authors: 'Brandes, U., Köpf, B.',
            year:    2002,
            title:   'Fast and simple horizontal coordinate assignment',
            venue:   'Graph Drawing 2001, LNCS 2265, 31–44',
        },
    ];

    constructor(
        public readonly layerSpacingY: number = 100,
        // Horizontal minimum separation between adjacent BLOCKS
        // within a layer. With BK, columns are wherever blocks land
        // — this is the only horizontal pitch knob.
        public readonly nodeSpacingX:  number = 110,
        public readonly padding:       number = 50,
    ) {}

    public Compute(layers: string[][], edges?: Edge[]): Map<string, Point>
    {
        // Original-orientation neighbour lookups, sorted later per pass.
        const upper = new Map<string, string[]>();
        const lower = new Map<string, string[]>();
        const layerOfOriginal = new Map<string, number>();
        for (let i = 0; i < layers.length; i++)
            for (const v of layers[i]!) layerOfOriginal.set(v, i);

        if (edges !== undefined)
        {
            for (const e of edges)
            {
                const lu = layerOfOriginal.get(e.From);
                const lv = layerOfOriginal.get(e.To);
                if (lu === undefined || lv === undefined) continue;
                if (lv === lu + 1)
                {
                    if (!upper.has(e.To))   upper.set(e.To,   []);
                    if (!lower.has(e.From)) lower.set(e.From, []);
                    upper.get(e.To)!.push(e.From);
                    lower.get(e.From)!.push(e.To);
                }
                else if (lu === lv + 1)
                {
                    // Back edge — treat in both directions so neither
                    // pass loses it. Same as the previous BK
                    // implementation behaved.
                    if (!upper.has(e.From)) upper.set(e.From, []);
                    if (!lower.has(e.To))   lower.set(e.To,   []);
                    upper.get(e.From)!.push(e.To);
                    lower.get(e.To)!.push(e.From);
                }
            }
        }

        // Run the four passes and normalise each so min x = 0.
        const dl = this.runPass(layers, 'down', 'left',  upper, lower);
        const dr = this.runPass(layers, 'down', 'right', upper, lower);
        const ul = this.runPass(layers, 'up',   'left',  upper, lower);
        const ur = this.runPass(layers, 'up',   'right', upper, lower);

        const passes = [dl, dr, ul, ur].map(normaliseToZero);

        // Build the paper's balanced average (median two per node)
        // as a fifth candidate.
        const balanced = new Map<string, number>();
        for (const row of layers)
        {
            for (const v of row)
            {
                const xs = passes.map(p => p.get(v) ?? 0).sort((a, b) => a - b);
                balanced.set(v, (xs[1]! + xs[2]!) / 2);
            }
        }

        // Pick whichever of the five candidates minimises total
        // horizontal edge travel — this is the alignment metric. A
        // perfectly vertical edge contributes 0; the worse the
        // misalignment, the larger the score.
        const candidates = [
            { name: 'down-left',  x: passes[0]! },
            { name: 'down-right', x: passes[1]! },
            { name: 'up-left',    x: passes[2]! },
            { name: 'up-right',   x: passes[3]! },
            { name: 'balanced',   x: balanced   },
        ];
        let best = candidates[0]!;
        let bestScore = scoreAlignment(best.x, edges ?? []);
        for (let i = 1; i < candidates.length; i++)
        {
            const s = scoreAlignment(candidates[i]!.x, edges ?? []);
            if (s < bestScore) { bestScore = s; best = candidates[i]!; }
        }
        const xFinal = best.x;

        // Shift so the leftmost node lands at the configured padding.
        let minX = Infinity;
        for (const x of xFinal.values()) if (x < minX) minX = x;
        if (!isFinite(minX)) minX = 0;

        const positions = new Map<string, Point>();
        for (let i = 0; i < layers.length; i++)
        {
            const y = this.padding + i * this.layerSpacingY;
            for (const v of layers[i]!)
            {
                const x = this.padding + (xFinal.get(v)! - minX);
                positions.set(v, new Point(x, y));
            }
        }
        return positions;
    }

    // One BK pass. Internally always runs "top-down, leftmost"
    // canonical logic; `direction` and `bias` are applied by
    // transforming the input layers + neighbour map before the
    // call and mirroring the x output after.
    private runPass(
        layers:    string[][],
        direction: Direction,
        bias:      Bias,
        upper:     Map<string, string[]>,
        lower:     Map<string, string[]>,
    ): Map<string, number>
    {
        // Reverse layer ORDER for bottom-up so the canonical pass,
        // which always processes top-to-bottom, sees what was the
        // bottom layer first. Reverse WITHIN each layer for rightmost
        // so the leftmost-median preference is applied to what was
        // the right side of the original layer.
        let tlayers = direction === 'up' ? [...layers].reverse() : layers.map(r => [...r]);
        if (bias === 'right') tlayers = tlayers.map(row => [...row].reverse());

        // Rebuild pos / layerOf for the transformed layers.
        const pos     = new Map<string, number>();
        const layerOf = new Map<string, number>();
        for (let i = 0; i < tlayers.length; i++)
        {
            const row = tlayers[i]!;
            for (let k = 0; k < row.length; k++)
            {
                pos.set(row[k]!, k);
                layerOf.set(row[k]!, i);
            }
        }

        // Use UPPER neighbours for top-down, LOWER for bottom-up.
        // Re-sort each list by the (possibly transformed) pos so the
        // canonical pass's median selection still walks the sorted
        // adjacency.
        const baseNeighbours = direction === 'down' ? upper : lower;
        const neighbours     = new Map<string, string[]>();
        for (const [v, ns] of baseNeighbours)
        {
            neighbours.set(v, [...ns].sort((a, b) => (pos.get(a) ?? 0) - (pos.get(b) ?? 0)));
        }

        // ===== Vertical alignment (top-down, leftmost) =====
        const root  = new Map<string, string>();
        const align = new Map<string, string>();
        for (const row of tlayers)
            for (const v of row) { root.set(v, v); align.set(v, v); }

        for (let i = 0; i < tlayers.length; i++)
        {
            let r = -1;
            for (const v of tlayers[i]!)
            {
                const ns = neighbours.get(v) ?? [];
                const d  = ns.length;
                if (d === 0) continue;
                const m1 = Math.floor((d - 1) / 2);
                const m2 = Math.ceil((d - 1) / 2);
                const medians = m1 === m2 ? [m1] : [m1, m2];
                for (const m of medians)
                {
                    if (align.get(v) !== v) continue;
                    const u  = ns[m]!;
                    const pu = pos.get(u)!;
                    if (r < pu)
                    {
                        align.set(u, v);
                        root.set(v, root.get(u)!);
                        align.set(v, root.get(v)!);
                        r = pu;
                    }
                }
            }
        }

        // ===== Horizontal compaction (leftmost) =====
        const sink   = new Map<string, string>();
        const shift  = new Map<string, number>();
        const xBlock = new Map<string, number>();
        for (const row of tlayers)
            for (const v of row) { sink.set(v, v); shift.set(v, Infinity); }
        const delta = this.nodeSpacingX;

        const placeBlock = (v: string): void =>
        {
            if (xBlock.has(v)) return;
            xBlock.set(v, 0);
            let w = v;
            do
            {
                const lw = layerOf.get(w)!;
                const pw = pos.get(w)!;
                if (pw > 0)
                {
                    const u = root.get(tlayers[lw]![pw - 1]!)!;
                    placeBlock(u);
                    if (sink.get(v) === v) sink.set(v, sink.get(u)!);
                    if (sink.get(v) !== sink.get(u))
                    {
                        const sinkU = sink.get(u)!;
                        const cand  = xBlock.get(v)! - xBlock.get(u)! - delta;
                        if (cand < shift.get(sinkU)!) shift.set(sinkU, cand);
                    }
                    else
                    {
                        const cand = xBlock.get(u)! + delta;
                        if (cand > xBlock.get(v)!) xBlock.set(v, cand);
                    }
                }
                w = align.get(w)!;
            } while (w !== v);
        };

        for (const row of tlayers)
            for (const v of row)
                if (root.get(v) === v) placeBlock(v);

        // Resolve absolute x for every node.
        const x = new Map<string, number>();
        for (const row of tlayers)
        {
            for (const v of row)
            {
                const r0 = root.get(v)!;
                let xv = xBlock.get(r0)!;
                const sh = shift.get(sink.get(r0)!)!;
                if (sh < Infinity) xv += sh;
                x.set(v, xv);
            }
        }

        // For rightmost bias the transformed pass laid the layout out
        // on a mirrored x-axis; flip it back so larger original-pos
        // nodes get larger x again.
        if (bias === 'right')
        {
            let max = -Infinity;
            for (const xv of x.values()) if (xv > max) max = xv;
            if (!isFinite(max)) max = 0;
            const flipped = new Map<string, number>();
            for (const [k, v] of x) flipped.set(k, max - v);
            return flipped;
        }

        return x;
    }
}

function normaliseToZero(x: Map<string, number>): Map<string, number>
{
    let minX = Infinity;
    for (const v of x.values()) if (v < minX) minX = v;
    if (!isFinite(minX)) minX = 0;
    const out = new Map<string, number>();
    for (const [k, v] of x) out.set(k, v - minX);
    return out;
}

// Sum of horizontal edge travel — Σ |x[u] − x[v]| across all
// edges. Translation-invariant, so it doesn't matter whether the
// candidates have been normalised to the same origin. Lower is
// better: a perfectly column-aligned chain contributes zero per
// segment.
function scoreAlignment(x: Map<string, number>, edges: Edge[]): number
{
    let total = 0;
    for (const e of edges)
    {
        const a = x.get(e.From);
        const b = x.get(e.To);
        if (a === undefined || b === undefined) continue;
        total += Math.abs(a - b);
    }
    return total;
}
