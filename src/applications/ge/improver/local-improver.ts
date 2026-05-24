import type { Edge } from '../graph.js';
import type { IPipelineElement } from '../pipeline-element.js';

// Strategy interface for the "polish" step that runs AFTER a global
// reorderer (e.g. BarycenterReorderer). A ILocalImprover takes the
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
export interface ILocalImprover extends IPipelineElement
{
    Improve(layers: string[][], edges: Edge[]): string[][];
}
