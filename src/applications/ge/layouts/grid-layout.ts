import { Point } from '../../../runtime/index.js';
import type { Graph } from '../graph.js';
import type { ILayout } from './layout.js';

// Rectangular grid, left-to-right then top-to-bottom. `origin` is the
// position of the first node (row 0, column 0); subsequent nodes are
// spaced by spacingX horizontally and spacingY vertically.
export class GridLayout implements ILayout
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
            out.set(graph.nodes[i]!.Id, new Point(
                this.origin.X + col * this.spacingX,
                this.origin.Y + row * this.spacingY,
            ));
        }
        return out;
    }
}
