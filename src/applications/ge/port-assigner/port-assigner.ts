import type { Point } from '../../../runtime/index.js';
import type { Edge } from '../graph.js';
import type { IPipelineElement } from '../pipeline-element.js';

// Per-edge connection points on the source and target node
// boundaries. The router substitutes these for the chain's first
// and last waypoint (which would otherwise be the node centres)
// so edges visibly terminate at the boundary instead of vanishing
// into the circle.
export interface EdgePorts
{
    source: Point;
    target: Point;
}

// Strategy interface for the PORT ASSIGNMENT stage. Runs after
// vertical alignment and before the edge router; produces an
// (source-port, target-port) pair for each real edge using the
// post-alignment node positions.
//
// Contract:
//   * Input position map contains all node positions (real +
//     dummies); the strategy only reads positions for edge
//     endpoints (which are always real nodes).
//   * Returned map keys are the original (real-graph) edges.
//   * Each port is a concrete (x, y) point that lies on the
//     associated node's boundary.
export interface IPortAssigner extends IPipelineElement
{
    Assign(positions: Map<string, Point>, edges: Edge[]): Map<Edge, EdgePorts>;
}
