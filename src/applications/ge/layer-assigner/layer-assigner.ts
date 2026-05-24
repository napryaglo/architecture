import type { Graph } from '../graph.js';
import type { IPipelineElement } from '../pipeline-element.js';

// Strategy interface for the LAYER ASSIGNMENT stage: given a graph,
// decide which row each node lands in. The result is a depth map
// (node Id → integer depth). Depth 0 is the topmost layer.
//
// Contract:
//   * Returned map contains an entry for every node in `graph.nodes`.
//   * Honours `firstLayerNodes` when provided: pinned nodes → 0,
//     sources NOT in the set are pushed to depth ≥ 1.
//   * May throw on graphs that don't satisfy the assigner's
//     preconditions (e.g. longest-path-based assigners throw on
//     cycles).
export interface ILayerAssigner extends IPipelineElement
{
    Assign(graph: Graph, firstLayerNodes?: ReadonlySet<string>): Map<string, number>;
}
