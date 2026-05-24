import { Graph, type Node } from '../graph.js';
import type { AcademicReference } from '../pipeline-element.js';
import type { IGraphTransform } from './graph-transform.js';

// Keeps only nodes the predicate returns true for. Edges whose
// endpoints no longer exist are dropped as well — otherwise the
// downstream scene builder would silently skip them, hiding the fact
// that the graph is inconsistent.
export class FilterNodesTransform implements IGraphTransform
{
    public readonly Name               = 'Filter Nodes';
    public readonly AlgorithmName      = 'Predicate-based node filtering';
    public readonly AcademicReferences: readonly AcademicReference[] = [];

    constructor(public readonly predicate: (node: Node) => boolean) {}

    public Apply(graph: Graph): Graph
    {
        const keptNodes = graph.nodes.filter(this.predicate);
        const keptIds = new Set(keptNodes.map(n => n.Id));
        const keptEdges = graph.edges.filter(e => keptIds.has(e.From) && keptIds.has(e.To));
        return new Graph(keptNodes, keptEdges);
    }
}
