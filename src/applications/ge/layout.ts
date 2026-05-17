import { Point } from '../../runtime/index.js';
import type { Graph } from './graph.js';

// A Layout converts graph topology into per-node 2D positions.
// Returns a map keyed by Node.id — the scene builder reads positions
// from this map when constructing NodeVisuals and EdgeVisuals.
//
// Layouts are pure: same Graph in, same positions out. Stateful
// algorithms (force-directed simulation, layered DAG flow) can still
// implement this by running the simulation in Apply and returning the
// final positions.
export interface Layout
{
    Apply(graph: Graph): Map<string, Point>;
}

// Pre-computed positions — wraps a Map you built by hand. Useful for
// reproducing a saved layout or pinning specific nodes during
// experiments with other algorithms.
export class ManualLayout implements Layout
{
    constructor(private readonly positions: Map<string, Point>) {}

    public Apply(_graph: Graph): Map<string, Point>
    {
        return new Map(this.positions);
    }
}

// Evenly-spaced points on a circle. First node goes to the top
// (12 o'clock) and the rest run clockwise. `center` is the center of
// the circle in the canvas's coordinate space; `radius` controls how
// large the layout is.
export class CircularLayout implements Layout
{
    constructor(
        public readonly center: Point,
        public readonly radius: number,
    ) {}

    public Apply(graph: Graph): Map<string, Point>
    {
        const out = new Map<string, Point>();
        const n = graph.nodes.length;
        if (n === 0) return out;
        for (let i = 0; i < n; i++)
        {
            const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
            const x = this.center.X + this.radius * Math.cos(angle);
            const y = this.center.Y + this.radius * Math.sin(angle);
            out.set(graph.nodes[i]!.id, new Point(x, y));
        }
        return out;
    }
}

// Rectangular grid, left-to-right then top-to-bottom. `origin` is the
// position of the first node (row 0, column 0); subsequent nodes are
// spaced by spacingX horizontally and spacingY vertically.
export class GridLayout implements Layout
{
    constructor(
        public readonly columns: number,
        public readonly spacingX: number,
        public readonly spacingY: number,
        public readonly origin: Point = new Point(0, 0),
    ) {}

    public Apply(graph: Graph): Map<string, Point>
    {
        const out = new Map<string, Point>();
        for (let i = 0; i < graph.nodes.length; i++)
        {
            const col = i % this.columns;
            const row = Math.floor(i / this.columns);
            out.set(graph.nodes[i]!.id, new Point(
                this.origin.X + col * this.spacingX,
                this.origin.Y + row * this.spacingY,
            ));
        }
        return out;
    }
}
