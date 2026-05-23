import { Point } from '../../../runtime/index.js';
import type { Graph } from '../graph.js';
import type { ILayout } from './layout.js';

// Pre-computed positions — wraps a Map you built by hand. Useful for
// reproducing a saved layout or pinning specific nodes during
// experiments with other algorithms.
export class ManualLayout implements ILayout
{
    constructor(private readonly positions: Map<string, Point>) {}

    public Apply(_graph: Graph): Map<string, Point>
    {
        return new Map(this.positions);
    }
}
