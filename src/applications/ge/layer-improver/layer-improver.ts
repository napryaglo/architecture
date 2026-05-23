import type { Graph } from '../graph.js';

// Strategy interface for the layer-assignment step (i.e. which depth /
// row each node lands in). Runs AFTER the initial layering (longest-
// path) and BEFORE within-layer reordering, so callers can experiment
// with moving nodes between rows independent of the column placement
// algorithms (Reorderer, LocalImprover).
//
// Contract:
//   * Input depth map is not mutated; return a fresh Map.
//   * Returned map contains the same set of keys as the input.
//   * `firstLayerNodes`, when provided, is an L0-pin constraint that
//     the strategy MUST respect: nodes in the set stay at depth 0;
//     sources NOT in the set stay at depth ≥ 1.
export interface ILayerImprover
{
    Improve(
        depths:           Map<string, number>,
        graph:            Graph,
        firstLayerNodes?: ReadonlySet<string>,
    ): Map<string, number>;
}
