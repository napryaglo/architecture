import { Point } from '../../runtime/index.js';
import { Edge, type Graph } from './graph.js';
import { BarycenterReorderer, type Reorderer } from './reorderer.js';
import type { LocalImprover } from './improver.js';

// A Layout converts graph topology into per-node 2D positions.
// Returns a map keyed by Node.Id — the scene builder reads positions
// from this map when constructing NodeVisuals and EdgeVisuals.
//
// Layouts are pure: same Graph in, same positions out. Stateful
// algorithms (force-directed simulation, layered DAG flow) can still
// implement this by running the simulation in Apply and returning the
// final positions.
export interface Layout
{
    Apply(graph: Graph): Map<string, Point>;
}

export class CustomLayout implements Layout
{
    // Populated by Apply on every call. Lets callers (e.g. the demo
    // harness in main.ts) read out before/after crossing counts to
    // render onto the scene or diff between runs.
    public LastCrossings?: {
        adjacentBefore:  number;
        adjacentAfter:   number;
        geometricBefore: number;
        geometricAfter:  number;
    };

    constructor(
        public readonly layerSpacingY: number = 100,
        public readonly nodeSpacingX:  number = 110,
        public readonly padding:       number = 50,
        public readonly reorderer:     Reorderer = new BarycenterReorderer(),
        public readonly improver?:     LocalImprover,
    ) {}

    // Layered layout with Sugiyama-style dummy nodes. Each real node
    // lands in a row equal to its longest-path depth; multi-layer
    // edges (those whose endpoints are more than one layer apart) are
    // broken into chains of unit-length edges by inserting an
    // invisible dummy node in each intermediate layer. The barycenter
    // sweep then operates on the expanded structure, so every layer
    // transition is visible to the heuristic and contributes to
    // crossing reduction. Dummies exist only during layout — they are
    // stripped from the returned position map, so callers see only
    // real-node positions. Graphs containing cycles throw via
    // ComputeLongestPathDepths.
    public Apply(graph: Graph): Map<string, Point>
    {
        const depths = this.ComputeLongestPathDepths(graph);

        // Bucket real nodes by depth, preserving graph.nodes order so
        // the initial within-layer ordering is deterministic.
        let maxLayer = 0;
        for (const d of depths.values()) if (d > maxLayer) maxLayer = d;
        const layersInit: string[][] = [];
        for (let i = 0; i <= maxLayer; i++) layersInit.push([]);
        for (const n of graph.nodes)
        {
            const d = depths.get(n.Id) ?? 0;
            layersInit[d]!.push(n.Id);
        }

        // Baseline geometric count uses real nodes only — the comparison
        // we want is "what would the SVG look like without any of this"
        // versus "what does it look like after dummies + barycenter".
        const positionsBaseline = this.LayersToPositions(layersInit);
        const crossingsGeoBefore = this.CountCrossings(positionsBaseline, graph.edges);

        // Build the expanded structure: same real layers plus dummy
        // nodes for every intermediate layer of every multi-layer edge.
        // Each original edge u→v with span k>1 becomes a chain
        // u→d1→d2→…→d(k-1)→v, with d_i living in u's layer + i.
        const layersExpanded = layersInit.map(row => [...row]);
        const expandedEdges: Edge[] = [];
        let dummyCounter = 0;
        for (const e of graph.edges)
        {
            const dFrom = depths.get(e.From) ?? 0;
            const dTo   = depths.get(e.To)   ?? 0;
            const span  = dTo - dFrom;
            if (span <= 1)
            {
                expandedEdges.push(e);
                continue;
            }
            let prev = e.From;
            for (let layer = dFrom + 1; layer < dTo; layer++)
            {
                const dummy = `__dummy_${dummyCounter++}__`;
                layersExpanded[layer]!.push(dummy);
                expandedEdges.push(new Edge(prev, dummy));
                prev = dummy;
            }
            expandedEdges.push(new Edge(prev, e.To));
        }

        // Adjacent-only count operates on the expanded structure; that
        // is what the barycenter sweep actually sees and optimizes.
        const crossingsAdjBefore = this.CountAdjacentCrossings(layersExpanded, expandedEdges);

        let ordered = this.reorderer.Reorder(layersExpanded, expandedEdges);
        if (this.improver !== undefined)
        {
            ordered = this.improver.Improve(ordered, expandedEdges);
        }

        const positionsAfterAll = this.LayersToPositions(ordered);
        const crossingsAdjAfter = this.CountAdjacentCrossings(ordered, expandedEdges);

        // Drop dummies for the final position map and for the
        // geometric count — only real nodes get rendered, so the
        // visual crossing count must be measured against just the
        // original edges between real positions.
        const realIds = new Set<string>();
        for (const n of graph.nodes) realIds.add(n.Id);
        const positions = new Map<string, Point>();
        for (const [id, p] of positionsAfterAll)
        {
            if (realIds.has(id)) positions.set(id, p);
        }
        const crossingsGeoAfter = this.CountCrossings(positions, graph.edges);

        this.LastCrossings = {
            adjacentBefore:  crossingsAdjBefore,
            adjacentAfter:   crossingsAdjAfter,
            geometricBefore: crossingsGeoBefore,
            geometricAfter:  crossingsGeoAfter,
        };
        console.log(`  crossings (adjacent-only): ${crossingsAdjBefore} → ${crossingsAdjAfter}`);
        console.log(`  crossings (geometric):    ${crossingsGeoBefore} → ${crossingsGeoAfter}`);

        return positions;
    }

    // Maps a finished layer ordering to (x, y) positions. Each layer
    // is centered horizontally on the same axis (so layers of
    // different widths still share the same midline) and offset by
    // `padding` so all coordinates stay positive — HeadlessTarget's
    // auto-bounds machinery needs non-negative positions.
    private LayersToPositions(layers: string[][]): Map<string, Point>
    {
        let maxLayerSize = 0;
        for (const ids of layers)
        {
            if (ids.length > maxLayerSize) maxLayerSize = ids.length;
        }
        const layoutWidth = Math.max(0, (maxLayerSize - 1) * this.nodeSpacingX);
        const xCenter = this.padding + layoutWidth / 2;

        const positions = new Map<string, Point>();
        for (let layer = 0; layer < layers.length; layer++)
        {
            const ids = layers[layer]!;
            const rowWidth = (ids.length - 1) * this.nodeSpacingX;
            const startX = xCenter - rowWidth / 2;
            const y = this.padding + layer * this.layerSpacingY;
            for (let i = 0; i < ids.length; i++)
            {
                positions.set(ids[i]!, new Point(startX + i * this.nodeSpacingX, y));
            }
        }
        return positions;
    }

    // Geometric crossing count — treats each edge as a line segment
    // between its endpoints' positions and counts pairs whose interiors
    // intersect. Edges sharing an endpoint are skipped (a meet at a
    // node is not a crossing). Includes multi-layer edges, so the count
    // matches what you see in the SVG.
    private CountCrossings(positions: Map<string, Point>, edges: Edge[]): number
    {
        type Seg = { x1: number; y1: number; x2: number; y2: number; from: string; to: string };
        const segs: Seg[] = [];
        for (const e of edges)
        {
            const a = positions.get(e.From);
            const b = positions.get(e.To);
            if (a === undefined || b === undefined) continue;
            segs.push({ x1: a.X, y1: a.Y, x2: b.X, y2: b.Y, from: e.From, to: e.To });
        }

        let count = 0;
        for (let i = 0; i < segs.length; i++)
        {
            const a = segs[i]!;
            for (let j = i + 1; j < segs.length; j++)
            {
                const b = segs[j]!;
                // Edges sharing a node never count as crossing each other.
                if (a.from === b.from || a.from === b.to ||
                    a.to   === b.from || a.to   === b.to) continue;
                if (this.SegmentsIntersect(a.x1, a.y1, a.x2, a.y2, b.x1, b.y1, b.x2, b.y2))
                {
                    count++;
                }
            }
        }
        return count;
    }

    // Strict open-segment intersection via the orientation predicate.
    // Returns false for collinear / touching configurations — only
    // proper interior crossings count. Sufficient for our straight-
    // line layout where coincident segments aren't expected.
    private SegmentsIntersect(
        ax1: number, ay1: number, ax2: number, ay2: number,
        bx1: number, by1: number, bx2: number, by2: number,
    ): boolean
    {
        const orient = (px: number, py: number, qx: number, qy: number, rx: number, ry: number): number =>
        {
            const v = (qx - px) * (ry - py) - (qy - py) * (rx - px);
            return v > 0 ? 1 : v < 0 ? -1 : 0;
        };
        const o1 = orient(ax1, ay1, ax2, ay2, bx1, by1);
        const o2 = orient(ax1, ay1, ax2, ay2, bx2, by2);
        const o3 = orient(bx1, by1, bx2, by2, ax1, ay1);
        const o4 = orient(bx1, by1, bx2, by2, ax2, ay2);
        return o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0;
    }

    // Counts edge crossings between every pair of ADJACENT layers in
    // the supplied ordering. Two edges (uFrom in L → uTo in L+1) and
    // (vFrom in L → vTo in L+1) cross iff their endpoints land in
    // opposite order on the two layers — i.e. the relative position
    // of (uFrom, vFrom) flips between layer L and layer L+1.
    //
    // Multi-layer edges (those spanning more than one layer, e.g.
    // L0 → L3) are skipped here for the same reason ReorderByBarycenter
    // ignores them: handling them properly would need dummy nodes on
    // every intermediate layer. They still contribute visual crossings
    // in the rendered SVG, just not to this metric.
    private CountAdjacentCrossings(layers: string[][], edges: Edge[]): number
    {
        const layerOf = new Map<string, number>();
        const indexInLayer = new Map<string, number>();
        for (let L = 0; L < layers.length; L++)
        {
            for (let i = 0; i < layers[L]!.length; i++)
            {
                const id = layers[L]![i]!;
                layerOf.set(id, L);
                indexInLayer.set(id, i);
            }
        }

        // Bucket adjacent-layer edges by their source layer.
        const byLayerPair = new Map<number, Array<{ fromIdx: number; toIdx: number }>>();
        for (const e of edges)
        {
            const lFrom = layerOf.get(e.From);
            const lTo = layerOf.get(e.To);
            if (lFrom === undefined || lTo === undefined) continue;
            if (lTo - lFrom !== 1) continue;
            if (!byLayerPair.has(lFrom)) byLayerPair.set(lFrom, []);
            byLayerPair.get(lFrom)!.push({
                fromIdx: indexInLayer.get(e.From)!,
                toIdx:   indexInLayer.get(e.To)!,
            });
        }

        let count = 0;
        for (const edges of byLayerPair.values())
        {
            for (let i = 0; i < edges.length; i++)
            {
                const a = edges[i]!;
                for (let j = i + 1; j < edges.length; j++)
                {
                    const b = edges[j]!;
                    if ((a.fromIdx < b.fromIdx && a.toIdx > b.toIdx) ||
                        (a.fromIdx > b.fromIdx && a.toIdx < b.toIdx))
                    {
                        count++;
                    }
                }
            }
        }
        return count;
    }

    private IsPlanar(graph: Graph): boolean
    {
        // Implement a planarity test here, such as the Hopcroft and Tarjan algorithm.
        // For simplicity, we'll just return false for now.
        return false;
    }

    // DFS-based cycle detection using the classic three-color scheme:
    //   white (0) = not yet visited
    //   gray  (1) = on the current recursion stack
    //   black (2) = fully explored and recursion returned
    // Encountering a gray neighbor means we found a back-edge, i.e. a
    // cycle. Self-loops (edge from a node to itself) count as cycles.
    private IsDirectedAcyclic(graph: Graph): boolean
    {
        const adj = new Map<string, string[]>();
        
        for (const n of graph.nodes)
            adj.set(n.Id, []);
        
        for (const e of graph.edges)
            adj.get(e.From)?.push(e.To);

        const color = new Map<string, number>();
        
        for (const n of graph.nodes)
            color.set(n.Id, 0);

        const visit = (u: string): boolean =>
        {
            color.set(u, 1);
            for (const v of adj.get(u) ?? [])
            {
                const c = color.get(v) ?? 0;
                if (c === 1) return false;          // back-edge → cycle
                if (c === 0 && !visit(v)) return false;
            }
            color.set(u, 2);
            return true;
        };

        for (const n of graph.nodes)
        {
            if (color.get(n.Id) === 0 && !visit(n.Id)) return false;
        }
        return true;
    }

    // Returns every cycle DFS discovers via a back-edge. Each cycle is
    // a list of node Ids in traversal order; the implicit closing edge
    // goes from the last entry back to the first (so a cycle like
    // a → b → a is reported as ["a", "b"], and a self-loop a → a as
    // ["a"]).
    //
    // This is the "back-edge" enumeration: one cycle is reported for
    // every back-edge found, which means n back-edges in the DFS tree
    // produce n cycle entries. It is NOT a complete enumeration of all
    // elementary (simple) cycles — graphs with multiple elementary
    // cycles that share nodes may have some hidden by DFS ordering.
    // For full enumeration use Johnson's algorithm; for diagnostics
    // ("which edges close cycles so I can break them?") this is
    // sufficient and runs in O(V + E).
    public FindCycles(graph: Graph): string[][]
    {
        const adj = new Map<string, string[]>();
        for (const n of graph.nodes) adj.set(n.Id, []);
        for (const e of graph.edges) adj.get(e.From)?.push(e.To);

        const color = new Map<string, number>();
        for (const n of graph.nodes) color.set(n.Id, 0);

        const stack: string[] = [];                       // current DFS recursion path
        const stackIndex = new Map<string, number>();     // Id → its index in `stack`
        const cycles: string[][] = [];

        const visit = (u: string): void =>
        {
            color.set(u, 1);
            stackIndex.set(u, stack.length);
            stack.push(u);
            for (const v of adj.get(u) ?? [])
            {
                const c = color.get(v) ?? 0;
                if (c === 1)
                {
                    // Back-edge u → v: the cycle is the suffix of the
                    // recursion path from v onward (which ends at u).
                    const start = stackIndex.get(v)!;
                    cycles.push(stack.slice(start));
                }
                else if (c === 0)
                {
                    visit(v);
                }
            }
            color.set(u, 2);
            stack.pop();
            stackIndex.delete(u);
        };

        for (const n of graph.nodes)
        {
            if (color.get(n.Id) === 0) visit(n.Id);
        }
        return cycles;
    }

    // For each node v, returns the number of edges in the longest
    // simple path that ENDS at v. Sources (nodes with no predecessors)
    // map to 0; every other node maps to 1 + max(depth(p)) across its
    // predecessors p. The result doubles as a layer assignment for
    // layered DAG drawing.
    //
    // Implementation: DFS on the REVERSE adjacency (predecessor list)
    // with memoization. The DAG precondition lets us memoize safely —
    // no node is ever re-entered while its depth is still being
    // computed, because the lack of cycles guarantees that the
    // predecessor walk terminates.
    //
    // Throws when the graph contains a cycle; longest-simple-path is
    // NP-hard on general digraphs, so we refuse rather than silently
    // returning a wrong-but-cheap answer.
    private ComputeLongestPathDepths(graph: Graph): Map<string, number>
    {
        if (!this.IsDirectedAcyclic(graph))
        {
            throw new Error("Longest-path depths require a DAG");
        }

        const preds = new Map<string, string[]>();
        for (const n of graph.nodes) preds.set(n.Id, []);
        for (const e of graph.edges) preds.get(e.To)?.push(e.From);

        const depth = new Map<string, number>();
        const compute = (u: string): number =>
        {
            const cached = depth.get(u);
            if (cached !== undefined) return cached;
            let best = 0;
            for (const p of preds.get(u) ?? [])
            {
                const d = compute(p) + 1;
                if (d > best) best = d;
            }
            depth.set(u, best);
            return best;
        };

        for (const n of graph.nodes) compute(n.Id);
        return depth;
    }
}

// Pre-computed positions — wraps a Map you built by hand. Useful for
// reproducing a saved layout or pinning specific nodes during
// experiments with other algorithms.
export class ManualLayout implements Layout
{
    constructor(private readonly positions: Map<string, Point>) {}

    public Apply(_graph: Graph): Map<string, Point>
    {
        return new Map(this.positions);
    }
}

// Evenly-spaced points on a circle. First node goes to the top
// (12 o'clock) and the rest run clockwise. `center` is the center of
// the circle in the canvas's coordinate space; `radius` controls how
// large the layout is.
export class CircularLayout implements Layout
{
    constructor(
        public readonly center: Point,
        public readonly radius: number,
    ) {}

    public Apply(graph: Graph): Map<string, Point>
    {
        const out = new Map<string, Point>();
        const n = graph.nodes.length;
        if (n === 0) return out;
        for (let i = 0; i < n; i++)
        {
            const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
            const x = this.center.X + this.radius * Math.cos(angle);
            const y = this.center.Y + this.radius * Math.sin(angle);
            out.set(graph.nodes[i]!.Id, new Point(x, y));
        }
        return out;
    }
}

// Rectangular grid, left-to-right then top-to-bottom. `origin` is the
// position of the first node (row 0, column 0); subsequent nodes are
// spaced by spacingX horizontally and spacingY vertically.
export class GridLayout implements Layout
{
    constructor(
        public readonly columns: number,
        public readonly spacingX: number,
        public readonly spacingY: number,
        public readonly origin: Point = new Point(0, 0),
    ) {}

    public Apply(graph: Graph): Map<string, Point>
    {
        const out = new Map<string, Point>();
        for (let i = 0; i < graph.nodes.length; i++)
        {
            const col = i % this.columns;
            const row = Math.floor(i / this.columns);
            out.set(graph.nodes[i]!.Id, new Point(
                this.origin.X + col * this.spacingX,
                this.origin.Y + row * this.spacingY,
            ));
        }
        return out;
    }
}
