import { Graph, type Edge } from '../graph.js';
import type { AcademicReference } from '../pipeline-element.js';
import type { IGraphTransform } from './graph-transform.js';

// Keeps only edges the predicate returns true for. Nodes are
// untouched — even ones that become isolated.
export class FilterEdgesTransform implements IGraphTransform
{
    public readonly Name               = 'Filter Edges';
    public readonly AlgorithmName      = 'Predicate-based edge filtering';
    public readonly AcademicReferences: readonly AcademicReference[] = [];

    constructor(public readonly predicate: (edge: Edge) => boolean) {}

    public Apply(graph: Graph): Graph
    {
        return new Graph(graph.nodes, graph.edges.filter(this.predicate));
    }
}
