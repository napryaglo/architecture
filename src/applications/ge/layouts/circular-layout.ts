import { Point } from '../../../runtime/index.js';
import type { Graph } from '../graph.js';
import type { ILayout } from './layout.js';

// Evenly-spaced points on a circle. First node goes to the top
// (12 o'clock) and the rest run clockwise. `center` is the center of
// the circle in the canvas's coordinate space; `radius` controls how
// large the layout is.
export class CircularLayout implements ILayout
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
            out.set(graph.nodes[i]!.Id, new Point(x, y));
        }
        return out;
    }
}
