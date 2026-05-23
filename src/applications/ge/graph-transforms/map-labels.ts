import { Graph, Node } from '../graph.js';
import type { IGraphTransform } from './graph-transform.js';

// Rewrites labels via the supplied function. Returning undefined
// clears the label. Produces new Node instances so the input graph's
// nodes are not modified.
export class MapLabelsTransform implements IGraphTransform
{
    constructor(public readonly fn: (node: Node) => string | undefined) {}

    public Apply(graph: Graph): Graph
    {
        const newNodes = graph.nodes.map(n => new Node(n.Id, this.fn(n)));
        return new Graph(newNodes, graph.edges);
    }
}
