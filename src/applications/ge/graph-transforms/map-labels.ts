import { Graph, Node } from '../graph.js';
import type { AcademicReference } from '../pipeline-element.js';
import type { IGraphTransform } from './graph-transform.js';

// Rewrites labels via the supplied function. Returning undefined
// clears the label. Produces new Node instances so the input graph's
// nodes are not modified.
export class MapLabelsTransform implements IGraphTransform
{
    public readonly Name               = 'Map Labels';
    public readonly AlgorithmName      = 'Per-node label rewriting';
    public readonly AcademicReferences: readonly AcademicReference[] = [];

    constructor(public readonly fn: (node: Node) => string | undefined) {}

    public Apply(graph: Graph): Graph
    {
        const newNodes = graph.nodes.map(n => new Node(n.Id, this.fn(n)));
        return new Graph(newNodes, graph.edges);
    }
}
