import type { Edge } from '../graph.js';
import type { IPipelineElement } from '../pipeline-element.js';

// Strategy interface for the initial ordering of the FIRST layer (L0,
// the sources — nodes with no incoming edges). This ordering seeds
// the down-sweep of the reorderer (which can't move L0 nodes because
// they have no predecessors to compute a barycenter from) and so
// strongly influences every layer below. The up-sweep can later
// reorder L0 via its successors, but starting from a thoughtful seed
// gives subsequent stages a better fixed point to converge to.
//
// Contract:
//   * Input layer array is not mutated; return a fresh permutation.
//   * The returned array contains exactly the same node Ids as the
//     input (same set, possibly different order).
//   * `edges` is the full edge list; the strategy can inspect it to
//     compute degree, reach, or other topological metrics.
export interface IFirstLayerOrderer extends IPipelineElement
{
    Order(layer: string[], edges: Edge[]): string[];
}
