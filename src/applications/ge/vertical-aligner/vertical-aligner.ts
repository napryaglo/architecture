import type { Point } from '../../../runtime/index.js';
import type { Edge } from '../graph.js';
import type { IPipelineElement } from '../pipeline-element.js';

// Strategy interface for the VERTICAL ALIGNMENT stage — the final
// post-processing pass that refines node x-coordinates to make
// connected chains look like clean vertical lines. Runs AFTER the
// position computer (stage 8) and is the last touch before
// rendering.
//
// Contract:
//   * Input position map is not mutated; return a fresh Map.
//   * Returned map contains the same set of keys as the input.
//   * Y coordinates must be preserved exactly — alignment is an
//     X-only operation.
//   * Within-layer left-to-right order of nodes must be preserved
//     (no swapping); the strategy can shift x positions to align
//     chains but must not produce overlapping or reordered nodes.
export interface IVerticalAligner extends IPipelineElement
{
    Align(positions: Map<string, Point>, edges: Edge[]): Map<string, Point>;
}
