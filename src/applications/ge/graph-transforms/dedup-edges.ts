import { Edge, Graph } from '../graph.js';
import type { AcademicReference } from '../pipeline-element.js';
import type { IGraphTransform } from './graph-transform.js';

// Collapses parallel edges with the same (From, To). The first edge
// in source order wins; later duplicates are dropped. Doesn't merge
// (From, To) with (To, From) — edges are directed.
export class DedupEdgesTransform implements IGraphTransform
{
    public readonly Name               = 'Deduplicate Edges';
    public readonly AlgorithmName      = 'Set-based edge deduplication';
    public readonly AcademicReferences: readonly AcademicReference[] = [];

    public Apply(graph: Graph): Graph
    {
        const seen = new Set<string>();
        const kept: Edge[] = [];
        for (const e of graph.edges)
        {
            const key = `${e.From}->${e.To}`;
            if (seen.has(key)) continue;
            seen.add(key);
            kept.push(e);
        }
        return new Graph(graph.nodes, kept);
    }
}
