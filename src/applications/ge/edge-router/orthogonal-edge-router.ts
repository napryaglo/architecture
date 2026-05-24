import { Point } from '../../../runtime/index.js';
import type { Edge } from '../graph.js';
import type { AcademicReference } from '../pipeline-element.js';
import type { EdgePorts } from '../port-assigner/index.js';
import type { IEdgeRouter } from './edge-router.js';

// Orthogonal (elbow-style) edge router. Each segment between two
// consecutive chain waypoints is rendered as a vertical–horizontal–
// vertical staircase: start point, go straight down to the midpoint
// y, traverse horizontally to the destination's x, then continue
// straight down to the destination. The result is a polyline whose
// every segment is either purely horizontal or purely vertical — no
// diagonals.
//
// When two consecutive waypoints already share an x (typically
// because the vertical aligner pulled the chain into a shared
// column), no elbow is inserted: the segment stays a single straight
// vertical line. So aligned chains render as clean verticals; only
// where alignment couldn't fully take effect do you see the
// midpoint elbow.
//
// All entry and exit segments at real-node endpoints are vertical,
// so edges meet node circles cleanly from above / below regardless
// of how the rest of the route bends.
export class OrthogonalEdgeRouter implements IEdgeRouter
{
    public readonly Name               = 'Orthogonal';
    public readonly AlgorithmName      = 'Per-segment vertical–horizontal–vertical staircase';
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
            const port = ports?.get(edge);
            const chainPoints: Point[] = [];
            let complete = true;
            for (let i = 0; i < chain.length; i++)
            {
                let p: Point | undefined;
                if (i === 0 && port !== undefined)                  p = port.source;
                else if (i === chain.length - 1 && port !== undefined) p = port.target;
                else                                                p = positions.get(chain[i]!);
                if (p === undefined) { complete = false; break; }
                chainPoints.push(p);
            }
            if (!complete || chainPoints.length < 2) continue;

            // Build the orthogonal polyline. We append the starting
            // point once, then for each subsequent waypoint either
            // append it directly (vertical segment already) or
            // append the two elbow corners plus the waypoint.
            const orthoPoints: Point[] = [chainPoints[0]!];
            for (let i = 1; i < chainPoints.length; i++)
            {
                const prev = orthoPoints[orthoPoints.length - 1]!;
                const next = chainPoints[i]!;
                if (prev.X === next.X)
                {
                    // Already vertical — no elbow needed.
                    orthoPoints.push(next);
                }
                else
                {
                    const midY = (prev.Y + next.Y) / 2;
                    orthoPoints.push(new Point(prev.X, midY));
                    orthoPoints.push(new Point(next.X, midY));
                    orthoPoints.push(next);
                }
            }

            routes.set(edge, orthoPoints);
        }

        return routes;
    }
}
