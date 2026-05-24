import { Point } from '../../../runtime/index.js';
import type { Edge } from '../graph.js';
import type { AcademicReference } from '../pipeline-element.js';
import type { EdgePorts, IPortAssigner } from './port-assigner.js';

// Cardinal-direction port assigner for circular nodes. For each
// edge, chooses ports on the source/target boundaries based on the
// dominant geometric direction of the edge:
//
//   dy > 0  (target below source)  → south of source, north of target
//   dy < 0  (target above source — unusual in a DAG)
//                                   → north of source, south of target
//   dy = 0, dx > 0                  → east of source, west of target
//   dy = 0, dx < 0                  → west of source, east of target
//
// Multiple edges that share a node and direction get the SAME port
// (no spreading along the boundary arc). That's fine for circles —
// the visual artifact is "edges meet at one spot on the circle",
// which still reads more cleanly than "edges vanish into the
// centre". A future DistributedPortAssigner could spread them
// across the relevant semicircle.
export class CardinalPortAssigner implements IPortAssigner
{
    public readonly Name               = 'Cardinal';
    public readonly AlgorithmName      = 'Stack at the closest of four cardinal boundary points';
    public readonly AcademicReferences: readonly AcademicReference[] = [];

    constructor(public readonly nodeRadius: number = 28) {}

    public Assign(positions: Map<string, Point>, edges: Edge[]): Map<Edge, EdgePorts>
    {
        const ports = new Map<Edge, EdgePorts>();
        const r = this.nodeRadius;
        for (const e of edges)
        {
            const u = positions.get(e.From);
            const v = positions.get(e.To);
            if (u === undefined || v === undefined) continue;

            const dx = v.X - u.X;
            const dy = v.Y - u.Y;
            let source: Point;
            let target: Point;

            if (dy > 0)
            {
                // Going down: leave the bottom of source, enter the
                // top of target. The most common case in a layered
                // DAG.
                source = new Point(u.X, u.Y + r);
                target = new Point(v.X, v.Y - r);
            }
            else if (dy < 0)
            {
                // Going up: should be rare in a DAG, but handle it
                // symmetrically.
                source = new Point(u.X, u.Y - r);
                target = new Point(v.X, v.Y + r);
            }
            else
            {
                // Same row. Pick east/west based on dx sign.
                if (dx > 0)
                {
                    source = new Point(u.X + r, u.Y);
                    target = new Point(v.X - r, v.Y);
                }
                else if (dx < 0)
                {
                    source = new Point(u.X - r, u.Y);
                    target = new Point(v.X + r, v.Y);
                }
                else
                {
                    // Source and target coincide. Degenerate — fall
                    // back to centres.
                    source = u;
                    target = v;
                }
            }

            ports.set(e, { source, target });
        }
        return ports;
    }
}
