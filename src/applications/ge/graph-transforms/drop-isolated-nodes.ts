import { Graph } from '../graph.js';
import type { IGraphTransform } from './graph-transform.js';

// Drops nodes that have no incident edges (in or out). Useful after
// FilterEdgesTransform to clean up orphans.
export class DropIsolatedNodesTransform implements IGraphTransform
{
    public Apply(graph: Graph): Graph
    {
        const referenced = new Set<string>();
        for (const e of graph.edges)
        {
            referenced.add(e.From);
            referenced.add(e.To);
        }
        return new Graph(
            graph.nodes.filter(n => referenced.has(n.Id)),
            graph.edges,
        );
    }
}
