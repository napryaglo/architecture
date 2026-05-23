// Stage 1 — Graph Transforms.
// Interface, pipeline orchestrator, and concrete transforms for the
// pre-layout graph-cleanup stage. Consumers should import from this
// barrel rather than the individual files.
export { type IGraphTransform }            from './graph-transform.js';
export { GraphPipeline }                  from './graph-pipeline.js';
export { FilterNodesTransform }           from './filter-nodes.js';
export { FilterEdgesTransform }           from './filter-edges.js';
export { DedupEdgesTransform }            from './dedup-edges.js';
export { CollapseAntiparallelEdgesTransform } from './collapse-antiparallel-edges.js';
export { DropIsolatedNodesTransform }     from './drop-isolated-nodes.js';
export { MapLabelsTransform }             from './map-labels.js';
