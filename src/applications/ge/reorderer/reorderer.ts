import type { Edge } from '../graph.js';
import type { IPipelineElement } from '../pipeline-element.js';

// Strategy interface for layered-layout crossing reduction. A
// IReorderer takes a layered structure (each layer is a list of node
// Ids in left-to-right order) plus the edges between them and returns
// a NEW layered structure with each row permuted to reduce crossings.
//
// Contract:
//   * Input layers are not mutated — the returned array is a fresh
//     outer array with fresh inner arrays.
//   * Each returned inner array is a permutation of the corresponding
//     input array (same node Ids, possibly reordered).
//   * Edges may include dummy-node endpoints (Sugiyama-style chain
//     expansion); the reorderer treats them like any other node and
//     trusts that real / dummy split is handled by the caller.
export interface IReorderer extends IPipelineElement
{
    Reorder(layers: string[][], edges: Edge[]): string[][];
}
