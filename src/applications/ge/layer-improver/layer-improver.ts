import type { Graph } from '../graph.js';
import type { IPipelineElement } from '../pipeline-element.js';

// Strategy interface for the layer-assignment refinement step. Runs
// AFTER the column-ordering stages (Reorderer + LocalImprover), so
// the improver sees the actual column positions the downstream
// pipeline will render with — not a stand-in based on insertion
// order. If the improver changes any depths, the orchestrator
// re-runs the column-ordering stages and calls the improver again;
// the outer loop iterates until no depth changes.
//
// Contract:
//   * Input depth map is not mutated; return a fresh Map.
//   * Returned map contains the same set of keys as the input.
//   * `layers` is the current ordered layer structure produced by
//     the Reorderer (+ LocalImprover) for the input depth map, with
//     dummy nodes still in place. The improver uses it to read the
//     actual column index of each real node when scoring moves.
//   * `firstLayerNodes`, when provided, is an L0-pin constraint
//     that the strategy MUST respect: nodes in the set stay at
//     depth 0; sources NOT in the set stay at depth ≥ 1.
export interface ILayerImprover extends IPipelineElement
{
    Improve(
        depths:           Map<string, number>,
        graph:            Graph,
        layers:           string[][],
        firstLayerNodes?: ReadonlySet<string>,
    ): Map<string, number>;
}
