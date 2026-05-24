import type { Point } from '../../../runtime/index.js';
import type { Edge } from '../graph.js';
import type { EdgePorts } from '../port-assigner/index.js';
import type { IEdgeRouter } from './edge-router.js';

// Minimum-viable polyline router. For each original edge, the route
// is exactly the positions of its chain — `[pos(u), pos(d1), …,
// pos(dk-1), pos(v)]`. A single-layer edge collapses to a 2-point
// polyline (visually identical to a straight segment); a multi-layer
// edge bends through each dummy's column position, producing the
// classic Sugiyama "long edges follow the layer structure" look.
//
// When `ports` is supplied, the chain's first and last entries are
// replaced with the source / target port points so edges terminate
// at the node boundary instead of the centre. Intermediate dummy
// waypoints still use centre positions.
//
// If any node in the chain has no position (shouldn't happen with a
// correctly-wired pipeline), the edge is skipped silently.
export class PolylineEdgeRouter implements IEdgeRouter
{
    public Route(
        positions: Map<string, Point>,
        chains:    Map<Edge, string[]>,
        ports?:    Map<Edge, EdgePorts>,
    ): Map<Edge, Point[]>
    {
        const routes = new Map<Edge, Point[]>();
        for (const [edge, chain] of chains)
        {
            const port = ports?.get(edge);
            const points: Point[] = [];
            let complete = true;
            for (let i = 0; i < chain.length; i++)
            {
                let p: Point | undefined;
                if (i === 0 && port !== undefined)                  p = port.source;
                else if (i === chain.length - 1 && port !== undefined) p = port.target;
                else                                                p = positions.get(chain[i]!);
                if (p === undefined) { complete = false; break; }
                points.push(p);
            }
            if (complete && points.length >= 2)
            {
                routes.set(edge, points);
            }
        }
        return routes;
    }
}
