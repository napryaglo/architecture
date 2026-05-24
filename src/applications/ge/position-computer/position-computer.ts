import type { Point } from '../../../runtime/index.js';
import type { Edge } from '../graph.js';
import type { IPipelineElement } from '../pipeline-element.js';

// Strategy interface for the POSITION COMPUTATION stage: maps a
// finished layer ordering (each layer = ordered list of node Ids,
// possibly including dummy nodes) to per-node (x, y) coordinates.
//
// Contract:
//   * Returned map contains an entry for every Id present in any
//     layer of the input (dummies included; the caller is
//     responsible for filtering dummies if it doesn't want them
//     rendered).
//   * All coordinates should be non-negative — HeadlessTarget's
//     auto-bounds machinery requires that.
//   * `edges` is OPTIONAL — only edge-aware computers (e.g. the
//     Brandes–Köpf coordinate assigner) use it; centred-grid-style
//     computers can ignore the argument.
export interface IPositionComputer extends IPipelineElement
{
    Compute(layers: string[][], edges?: Edge[]): Map<string, Point>;
}
