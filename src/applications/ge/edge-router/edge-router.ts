import type { Point } from '../../../runtime/index.js';
import type { Edge } from '../graph.js';
import type { EdgePorts } from '../port-assigner/index.js';
import type { IPipelineElement } from '../pipeline-element.js';

// Strategy interface for the EDGE ROUTING stage — the final
// geometric step that turns each original edge into a polyline of
// waypoints. Runs after position computation + vertical alignment;
// receives positions for ALL nodes (real + dummies) so it can route
// multi-layer edges through their dummy chain.
//
// Contract:
//   * Input position map contains real-node AND dummy positions.
//   * `chains` is the edge → node-Id-chain map produced by the
//     dummy inserter. For a span-1 edge the chain is `[u, v]`;
//     for a span-k edge it is `[u, d1, …, dk-1, v]`.
//   * `ports`, when provided, supplies the source / target
//     connection points on the node boundaries. The router uses
//     them in place of the chain's first and last waypoint
//     (otherwise those would be the node centres). When ports are
//     undefined the router falls back to the chain endpoint
//     positions.
//   * Returned map keys are the original (real-graph) edges.
//     Values are polylines of 2 or more waypoints in render-coord
//     space (same coord system as the input positions).
export interface IEdgeRouter extends IPipelineElement
{
    Route(
        positions: Map<string, Point>,
        chains:    Map<Edge, string[]>,
        ports?:    Map<Edge, EdgePorts>,
    ): Map<Edge, Point[]>;
}
