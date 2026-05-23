import type { Edge } from '../graph.js';

// Result of a dummy-insertion pass: the expanded layer structure
// (with dummies appended in their intermediate layers) plus the
// expanded edge set (with each original multi-layer edge replaced
// by a chain of unit-length edges through the dummies).
export interface DummyInsertionResult
{
    layers: string[][];
    edges:  Edge[];
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
export interface IDummyInserter
{
    Insert(
        layers: string[][],
        edges:  Edge[],
        depths: Map<string, number>,
    ): DummyInsertionResult;
}
