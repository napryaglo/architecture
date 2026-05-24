import type { Point } from '../../../runtime/index.js';
import type { Graph } from '../graph.js';
import { LongestPathLayerAssigner, type ILayerAssigner } from '../layer-assigner/index.js';
import { SparseDummyInserter, type IDummyInserter } from '../dummy-inserter/index.js';
import { CenteredGridPositionComputer, type IPositionComputer } from '../position-computer/index.js';
import {
    AdjacentCrossingCounter,
    GeometricCrossingCounter,
    type IAdjacentCrossingCounter,
    type IGeometricCrossingCounter,
} from '../crossing-counter/index.js';
import { BarycenterReorderer, type IReorderer } from '../reorderer/index.js';
import type { ILocalImprover } from '../improver/index.js';
import { IdentityFirstLayerOrderer, type IFirstLayerOrderer } from '../first-layer-orderer/index.js';
import type { ILayerImprover } from '../layer-improver/index.js';
import { BarycenterVerticalAligner, type IVerticalAligner } from '../vertical-aligner/index.js';
import { OrthogonalEdgeRouter, type IEdgeRouter } from '../edge-router/index.js';
import { DistributedPortAssigner, type IPortAssigner } from '../port-assigner/index.js';
import type { Edge } from '../graph.js';
import type { ILayout } from './layout.js';

// Orchestrator for the layered DAG layout pipeline. Composes the
// strategy stages and runs them in order; holds no layout algorithm
// itself. Every algorithmic concern lives in its own strategy
// interface — see the stage-named subfolders for the catalogue of
// implementations.
//
// Stages, in order:
//   1. (skipped here — pre-layout transforms run on the Graph
//      outside the pipeline, via GraphPipeline)
//   2. layerAssigner       (ILayerAssigner)
//   3. layerImprover       (ILayerImprover, optional)
//   4. firstLayerOrderer   (IFirstLayerOrderer)
//   5. dummyInserter       (IDummyInserter)
//   6. reorderer           (IReorderer)
//   7. improver            (ILocalImprover, optional)
//   8. positionComputer    (IPositionComputer)
//
// The two crossing counters (geometric + adjacent) are used for
// diagnostics only — they populate LastCrossings so callers can
// render the metric onto the SVG or compare between runs.
export class LayoutPipeline implements ILayout
{
    // Populated by Apply on every call. Lets callers read out
    // before/after crossing counts to render onto the scene or diff
    // between runs.
    public LastCrossings?: {
        adjacentBefore:  number;
        adjacentAfter:   number;
        geometricBefore: number;
        geometricAfter:  number;
    };

    // Populated by Apply on every call. Polyline waypoints per real
    // edge — produced by the edge router on top of the (real +
    // dummy) position map. Consumers (the scene builder) read this
    // to draw multi-layer edges as bent polylines instead of direct
    // diagonals between real-node endpoints.
    public LastRoutes?: Map<Edge, Point[]>;

    constructor(
        public readonly reorderer:           IReorderer = new BarycenterReorderer(),
        public readonly improver?:           ILocalImprover,
        public readonly firstLayerOrderer:   IFirstLayerOrderer = new IdentityFirstLayerOrderer(),
        public readonly firstLayerNodes?:    ReadonlySet<string>,
        public readonly layerImprover?:      ILayerImprover,
        public readonly layerAssigner:       ILayerAssigner          = new LongestPathLayerAssigner(),
        public readonly dummyInserter:       IDummyInserter          = new SparseDummyInserter(),
        public readonly positionComputer:    IPositionComputer       = new CenteredGridPositionComputer(),
        public readonly geometricCounter:    IGeometricCrossingCounter = new GeometricCrossingCounter(),
        public readonly adjacentCounter:     IAdjacentCrossingCounter  = new AdjacentCrossingCounter(),
        // Cap the outer fixpoint loop where layer-improver moves
        // trigger re-runs of the column-ordering stages. Each
        // iteration is a full re-pipeline, so set this generously
        // for small graphs (cheap) and conservatively for large ones.
        public readonly maxLayerImproverIterations: number = 12,
        // Stage 9 — final vertical-alignment pass. Refines node x
        // coordinates so connected chains render as clean vertical
        // lines. Pass undefined to skip alignment entirely.
        public readonly verticalAligner: IVerticalAligner | undefined = new BarycenterVerticalAligner(),
        // Stage 10 — edge router. Produces a polyline per real edge
        // using dummy positions as bend waypoints. Pass undefined to
        // fall back to two-point straight segments at render time.
        public readonly edgeRouter:      IEdgeRouter      | undefined = new OrthogonalEdgeRouter(),
        // Stage 11 — port assigner. Picks boundary connection points
        // on the source / target circles for each edge; the router
        // uses these in place of node centres as chain endpoints.
        // Pass undefined to route from centre to centre instead.
        public readonly portAssigner:    IPortAssigner    | undefined = new DistributedPortAssigner(),
    ) {}

    public Apply(graph: Graph): Map<string, Point>
    {
        // Stage 2 — layer assignment.
        let depths = this.layerAssigner.Assign(graph, this.firstLayerNodes);

        // Runs the column-ordering stages (4–7) against the current
        // depth assignment. Returns the layersInit (real nodes only,
        // bucketed by depth) and the ordered expanded layers (with
        // dummies) plus the expanded edge set. Called once for the
        // baseline and again after every successful layer-improver
        // pass so the next pass sees fresh columns.
        const runColumnStages = () =>
        {
            let maxLayer = 0;
            for (const d of depths.values()) if (d > maxLayer) maxLayer = d;
            const layersInit: string[][] = [];
            for (let i = 0; i <= maxLayer; i++) layersInit.push([]);
            for (const n of graph.nodes)
            {
                const d = depths.get(n.Id) ?? 0;
                layersInit[d]!.push(n.Id);
            }
            if (layersInit.length > 0)
            {
                layersInit[0] = this.firstLayerOrderer.Order(layersInit[0]!, graph.edges);
            }

            const { layers: expanded, edges: expandedEdges, chains } =
                this.dummyInserter.Insert(layersInit, graph.edges, depths);

            let ordered = this.reorderer.Reorder(expanded, expandedEdges);
            if (this.improver !== undefined)
            {
                ordered = this.improver.Improve(ordered, expandedEdges);
            }
            return { layersInit, expanded, expandedEdges, ordered, chains };
        };

        let { layersInit, expanded, expandedEdges, ordered, chains } = runColumnStages();

        // Baseline crossings — recorded BEFORE the layer-improver
        // fixpoint loop runs, so LastCrossings shows what the layout
        // looked like with just the column-ordering stages.
        const positionsBaseline = this.positionComputer.Compute(layersInit);
        const crossingsGeoBefore = this.geometricCounter.Count(positionsBaseline, graph.edges);
        const crossingsAdjBefore = this.adjacentCounter.Count(expanded, expandedEdges);

        // Stage 3 (post-reorder fixpoint) — layer-improver tries
        // depth moves using the ACTUAL ordered columns produced by
        // stages 4–7. Each successful move triggers a re-run of the
        // column stages so the next pass sees fresh columns. Iterates
        // until a full Improve call yields no depth change.
        if (this.layerImprover !== undefined)
        {
            for (let iter = 0; iter < this.maxLayerImproverIterations; iter++)
            {
                const newDepths = this.layerImprover.Improve(depths, graph, ordered, this.firstLayerNodes);
                let changed = false;
                for (const [k, v] of newDepths)
                {
                    if (depths.get(k) !== v) { changed = true; break; }
                }
                if (!changed) break;
                depths = newDepths;
                ({ layersInit, expanded, expandedEdges, ordered, chains } = runColumnStages());
            }
        }

        // Stage 8 — position computation. Produces (x, y) for every
        // node in the expanded structure, real AND dummy.
        let positionsAfterAll = this.positionComputer.Compute(ordered);
        const crossingsAdjAfter = this.adjacentCounter.Count(ordered, expandedEdges);

        // Stage 9 — vertical alignment. Operates on the FULL
        // position map (real + dummies) so that aligning a real
        // chain endpoint also pulls its dummies along the chain,
        // making the polyline router produce truly vertical chains
        // for aligned columns.
        if (this.verticalAligner !== undefined)
        {
            positionsAfterAll = this.verticalAligner.Align(positionsAfterAll, expandedEdges);
        }

        // Stage 11 — port assignment. Pick a boundary connection
        // point on each edge's source / target circle so edges
        // visibly terminate at the node boundary (not the centre).
        const ports = this.portAssigner !== undefined
            ? this.portAssigner.Assign(positionsAfterAll, graph.edges)
            : undefined;

        // Stage 10 — edge routing. Uses chains + post-alignment
        // positions + (optional) ports to produce a polyline per
        // real edge.
        const routes = this.edgeRouter !== undefined
            ? this.edgeRouter.Route(positionsAfterAll, chains, ports)
            : undefined;
        this.LastRoutes = routes;

        // Strip dummies from the returned position map — only real
        // nodes get rendered (dummies live on as bend waypoints
        // inside `LastRoutes` polylines).
        const realIds = new Set<string>();
        for (const n of graph.nodes) realIds.add(n.Id);
        const positions = new Map<string, Point>();
        for (const [id, p] of positionsAfterAll)
        {
            if (realIds.has(id)) positions.set(id, p);
        }

        const crossingsGeoAfter = this.geometricCounter.Count(positions, graph.edges);

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
}
