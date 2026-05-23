import type { Point } from '../../../runtime/index.js';
import type { Graph } from '../graph.js';
import { LongestPathLayerAssigner, type ILayerAssigner } from '../layer-assigner/index.js';
import { ChainDummyInserter, type IDummyInserter } from '../dummy-inserter/index.js';
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

    constructor(
        public readonly reorderer:           IReorderer = new BarycenterReorderer(),
        public readonly improver?:           ILocalImprover,
        public readonly firstLayerOrderer:   IFirstLayerOrderer = new IdentityFirstLayerOrderer(),
        public readonly firstLayerNodes?:    ReadonlySet<string>,
        public readonly layerImprover?:      ILayerImprover,
        public readonly layerAssigner:       ILayerAssigner          = new LongestPathLayerAssigner(),
        public readonly dummyInserter:       IDummyInserter          = new ChainDummyInserter(),
        public readonly positionComputer:    IPositionComputer       = new CenteredGridPositionComputer(),
        public readonly geometricCounter:    IGeometricCrossingCounter = new GeometricCrossingCounter(),
        public readonly adjacentCounter:     IAdjacentCrossingCounter  = new AdjacentCrossingCounter(),
    ) {}

    public Apply(graph: Graph): Map<string, Point>
    {
        // Stage 2 — layer assignment.
        let depths = this.layerAssigner.Assign(graph, this.firstLayerNodes);

        // Stage 3 — optional layer-improvement pass.
        if (this.layerImprover !== undefined)
        {
            depths = this.layerImprover.Improve(depths, graph, this.firstLayerNodes);
        }

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

        // Stage 4 — first-layer ordering.
        if (layersInit.length > 0)
        {
            layersInit[0] = this.firstLayerOrderer.Order(layersInit[0]!, graph.edges);
        }

        // Baseline geometric count — what the SVG would look like
        // without any reordering or improvement.
        const positionsBaseline = this.positionComputer.Compute(layersInit);
        const crossingsGeoBefore = this.geometricCounter.Count(positionsBaseline, graph.edges);

        // Stage 5 — dummy insertion.
        const { layers: layersExpanded, edges: expandedEdges } =
            this.dummyInserter.Insert(layersInit, graph.edges, depths);

        // Adjacent-only count operates on the expanded structure;
        // that is what the reorderer sweep actually sees and
        // optimizes.
        const crossingsAdjBefore = this.adjacentCounter.Count(layersExpanded, expandedEdges);

        // Stage 6 — within-layer reordering.
        let ordered = this.reorderer.Reorder(layersExpanded, expandedEdges);

        // Stage 7 — optional local-improvement polish.
        if (this.improver !== undefined)
        {
            ordered = this.improver.Improve(ordered, expandedEdges);
        }

        // Stage 8 — position computation.
        const positionsAfterAll = this.positionComputer.Compute(ordered);
        const crossingsAdjAfter = this.adjacentCounter.Count(ordered, expandedEdges);

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
