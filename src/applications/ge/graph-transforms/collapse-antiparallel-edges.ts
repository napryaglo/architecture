import { Edge, Graph } from '../graph.js';
import type { AcademicReference } from '../pipeline-element.js';
import type { IGraphTransform } from './graph-transform.js';

// When both A→B and B→A exist, keeps whichever direction appears
// first in source order and drops the other. Useful for breaking
// request/response 2-cycles that scenario sequences create (e.g.
// command-bus → validator → command-bus), so downstream DAG-only
// algorithms (longest-path layering, topological sort) can run.
//
// Run AFTER DedupEdgesTransform if exact duplicates are also possible;
// the dedup pass guarantees each direction appears at most once,
// which keeps this transform's "first wins" rule deterministic.
export class CollapseAntiparallelEdgesTransform implements IGraphTransform
{
    public readonly Name               = 'Collapse Antiparallel Edges';
    public readonly AlgorithmName      = 'Antiparallel edge collapse (first-wins)';
    public readonly AcademicReferences: readonly AcademicReference[] = [];

    public Apply(graph: Graph): Graph
    {
        const present = new Set(graph.edges.map(e => `${e.From}->${e.To}`));
        const droppedReverse = new Set<string>();
        const kept: Edge[] = [];
        for (const e of graph.edges)
        {
            const reverseKey = `${e.To}->${e.From}`;
            // Skip this edge if it's the reverse of one we already kept.
            if (droppedReverse.has(`${e.From}->${e.To}`)) continue;
            kept.push(e);
            if (present.has(reverseKey)) droppedReverse.add(reverseKey);
        }
        return new Graph(graph.nodes, kept);
    }
}
