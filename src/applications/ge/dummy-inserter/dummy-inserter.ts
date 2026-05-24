import type { Edge } from '../graph.js';
import type { IPipelineElement } from '../pipeline-element.js';

// Result of a dummy-insertion pass: the expanded layer structure
// (with dummies appended in their intermediate layers) plus the
// expanded edge set (with each original multi-layer edge replaced
// by a chain of unit-length edges through the dummies).
//
// `chains` maps each original edge to the full chain of node Ids
// that represent it after expansion: `[u, d1, d2, ..., dk, v]`
// where u/v are the real endpoints and d_i are the dummies in each
// intermediate layer. For span-1 edges the chain is just `[u, v]`.
// Downstream consumers (the edge router) use this to build
// polylines that bend through the dummy positions.
export interface DummyInsertionResult
{
    layers: string[][];
    edges:  Edge[];
    chains: Map<Edge, string[]>;
}

// Strategy interface for breaking multi-layer edges. Stage 5 in the
// pipeline. Takes the current layer structure, the original edges,
// and the depth map; produces an expanded layout where every edge
// spans at most one layer transition, with dummy nodes filling the
// gaps.
//
// Contract:
//   * Input layers are not mutated; the returned layers array is
//     fresh and may include dummy node Ids that don't exist in the
//     original Graph.
//   * Dummy Ids must be unique and identifiable so the caller can
//     filter them out before rendering.
//   * Edges that already span exactly one layer pass through
//     unchanged (no dummies needed).
export interface IDummyInserter extends IPipelineElement
{
    Insert(
        layers: string[][],
        edges:  Edge[],
        depths: Map<string, number>,
    ): DummyInsertionResult;
}
