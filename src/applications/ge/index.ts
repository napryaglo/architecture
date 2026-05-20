// Barrel re-exports for the `ge` graph-visualization framework.
// Consumers (currently main.ts; future experiment scripts) import
// from here rather than the individual files.
export { Node, Edge, Graph } from './graph.js';
export {
    type Layout,
    ManualLayout,
    CircularLayout,
    GridLayout,
} from './layout.js';
export {
    NodeVisual,
    EdgeVisual,
    BuildScene,
    type SceneStyle,
} from './scene.js';
export {
    type Reorderer,
    BarycenterReorderer,
    MedianReorderer,
} from './reorderer.js';
export {
    type LocalImprover,
    TransposeImprover,
    GreedySwitchImprover,
    SiftingImprover,
    IlpExactImprover,
} from './improver.js';
export {
    type GraphTransform,
    GraphPipeline,
    FilterNodesTransform,
    FilterEdgesTransform,
    DedupEdgesTransform,
    CollapseAntiparallelEdgesTransform,
    DropIsolatedNodesTransform,
    MapLabelsTransform,
} from './pipeline.js';
