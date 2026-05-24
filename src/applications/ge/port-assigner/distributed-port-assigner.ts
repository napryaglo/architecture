import { Point } from '../../../runtime/index.js';
import type { Edge } from '../graph.js';
import type { AcademicReference } from '../pipeline-element.js';
import type { EdgePorts, IPortAssigner } from './port-assigner.js';

type Cardinal = 'east' | 'south' | 'west' | 'north';

// Centre angles of each cardinal direction in canvas radians (Y
// grows downward, so south = +π/2).
const CARDINAL_ANGLE: Record<Cardinal, number> = {
    east:   0,
    south:  Math.PI / 2,
    west:   Math.PI,
    north: -Math.PI / 2,
};

// Distributes multiple edges that share a node-side across the
// boundary arc instead of stacking them at one cardinal point.
// For each (node, cardinal-direction) bucket, edges are sorted by
// the angle to their other endpoint and placed along the boundary
// at fixed angular spacing centred on the cardinal direction.
//
// On graphs where most nodes have at most one edge per side this
// behaves identically to CardinalPortAssigner. The visible win
// shows up for hub nodes (e.g. agent-orchestrator with three south
// successors): instead of three lines emerging from the same point,
// they fan out across the south arc and read as three distinct
// connections.
export class DistributedPortAssigner implements IPortAssigner
{
    public readonly Name               = 'Distributed';
    public readonly AlgorithmName      = 'Fan out across the cardinal arc at fixed angular spacing';
    public readonly AcademicReferences: readonly AcademicReference[] = [];

    constructor(
        // Node radius — used to project ports onto the circular
        // boundary. Match this to the scene's NodeVisual.Radius.
        public readonly nodeRadius: number = 28,
        // Angular spacing between consecutive ports in the same
        // bucket. 15° gives a visually clear separation; tighter
        // values pack more edges into a side at the cost of
        // overlap risk.
        public readonly anglePerPortDeg: number = 15,
    ) {}

    public Assign(positions: Map<string, Point>, edges: Edge[]): Map<Edge, EdgePorts>
    {
        // Pick a cardinal based on the (dx, dy) vector from one
        // endpoint to the other. We prefer vertical (south/north)
        // over horizontal (east/west) when both components are
        // non-zero — matching what looks right in a layered DAG
        // where most edges have a dominant y component.
        const cardinalOf = (dx: number, dy: number): Cardinal | null =>
        {
            if (dy > 0) return 'south';
            if (dy < 0) return 'north';
            if (dx > 0) return 'east';
            if (dx < 0) return 'west';
            return null;
        };

        type BucketEntry = { edge: Edge; angle: number };
        // Key shape: `${nodeId}|${cardinal}|source` or `…|target`.
        const buckets = new Map<string, BucketEntry[]>();

        for (const e of edges)
        {
            const u = positions.get(e.From);
            const v = positions.get(e.To);
            if (u === undefined || v === undefined) continue;

            const dx = v.X - u.X;
            const dy = v.Y - u.Y;

            // Source side: bucket at u by direction TO v.
            const outCard = cardinalOf(dx, dy);
            if (outCard !== null)
            {
                const key = `${e.From}|${outCard}|source`;
                if (!buckets.has(key)) buckets.set(key, []);
                buckets.get(key)!.push({ edge: e, angle: Math.atan2(dy, dx) });
            }
            // Target side: bucket at v by direction TO u (opposite).
            const inCard = cardinalOf(-dx, -dy);
            if (inCard !== null)
            {
                const key = `${e.To}|${inCard}|target`;
                if (!buckets.has(key)) buckets.set(key, []);
                buckets.get(key)!.push({ edge: e, angle: Math.atan2(-dy, -dx) });
            }
        }

        const sourcePortFor = new Map<Edge, Point>();
        const targetPortFor = new Map<Edge, Point>();
        const r = this.nodeRadius;
        const spacingRad = this.anglePerPortDeg * Math.PI / 180;

        for (const [key, bucket] of buckets)
        {
            const sep = key.split('|');
            const nodeId  = sep[0]!;
            const cardinal = sep[1] as Cardinal;
            const kind     = sep[2]!;                // 'source' | 'target'
            const nodePos = positions.get(nodeId);
            if (nodePos === undefined) continue;

            bucket.sort((a, b) => a.angle - b.angle);
            const centre = CARDINAL_ANGLE[cardinal];
            const k = bucket.length;

            for (let i = 0; i < k; i++)
            {
                const offset = (i - (k - 1) / 2) * spacingRad;
                const angle  = centre + offset;
                const port = new Point(
                    nodePos.X + r * Math.cos(angle),
                    nodePos.Y + r * Math.sin(angle),
                );
                if (kind === 'source') sourcePortFor.set(bucket[i]!.edge, port);
                else                    targetPortFor.set(bucket[i]!.edge, port);
            }
        }

        const ports = new Map<Edge, EdgePorts>();
        for (const e of edges)
        {
            const src = sourcePortFor.get(e);
            const tgt = targetPortFor.get(e);
            if (src !== undefined && tgt !== undefined)
            {
                ports.set(e, { source: src, target: tgt });
            }
        }
        return ports;
    }
}
