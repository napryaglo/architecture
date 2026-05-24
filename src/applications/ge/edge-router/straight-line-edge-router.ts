import type { Point } from '../../../runtime/index.js';
import type { Edge } from '../graph.js';
import type { AcademicReference } from '../pipeline-element.js';
import type { EdgePorts } from '../port-assigner/index.js';
import type { IEdgeRouter } from './edge-router.js';

// Returns a 2-point line per edge: source endpoint → target
// endpoint, ignoring any dummy waypoints in the chain. With ports
// supplied the endpoints are the port boundary points; without
// ports they are the real source / target node centres.
//
// Use when you want the simplest possible visual — a direct
// diagonal between endpoints — and don't need long edges to bend
// around intermediate layers.
export class StraightLineEdgeRouter implements IEdgeRouter
{
    public readonly Name               = 'Straight Line';
    public readonly AlgorithmName      = 'Direct 2-point connection between source and target ports';
    public readonly AcademicReferences: readonly AcademicReference[] = [];

    public Route(
        positions: Map<string, Point>,
        chains:    Map<Edge, string[]>,
        ports?:    Map<Edge, EdgePorts>,
    ): Map<Edge, Point[]>
    {
        const routes = new Map<Edge, Point[]>();
        for (const [edge, chain] of chains)
        {
            if (chain.length < 2) continue;
            const port  = ports?.get(edge);
            const start = port?.source ?? positions.get(chain[0]!);
            const end   = port?.target ?? positions.get(chain[chain.length - 1]!);
            if (start === undefined || end === undefined) continue;
            routes.set(edge, [start, end]);
        }
        return routes;
    }
}
