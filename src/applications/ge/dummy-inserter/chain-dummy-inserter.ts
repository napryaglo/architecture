import { Edge } from '../graph.js';
import type { AcademicReference } from '../pipeline-element.js';
import type { IDummyInserter, DummyInsertionResult } from './dummy-inserter.js';

// Sugiyama-style chain expansion. For each original edge u → v with
// span k > 1, inserts k − 1 dummy nodes (one per intermediate layer)
// and replaces the edge with a chain u → d₁ → … → dₖ₋₁ → v. Edges
// with span 0 or 1 pass through unchanged.
//
// Dummies are named `__dummy_N__` (where N is a monotonically
// increasing counter scoped to this call) so consumers can filter
// them out via the `IsDummy` static helper or a prefix check.
export class ChainDummyInserter implements IDummyInserter
{
    public readonly Name               = 'Chain Normalization';
    public readonly AlgorithmName      = 'Classical k−1 dummy chain per multi-layer edge';
    public readonly AcademicReferences: readonly AcademicReference[] = [
        {
            authors: 'Sugiyama, K., Tagawa, S., Toda, M.',
            year:    1981,
            title:   'Methods for visual understanding of hierarchical system structures',
            venue:   'IEEE Transactions on Systems, Man, and Cybernetics 11(2)',
        },
    ];

    public static IsDummy(id: string): boolean
    {
        return id.startsWith('__dummy_');
    }

    public Insert(
        layers: string[][],
        edges:  Edge[],
        depths: Map<string, number>,
    ): DummyInsertionResult
    {
        const expandedLayers = layers.map(row => [...row]);
        const expandedEdges: Edge[] = [];
        const chains = new Map<Edge, string[]>();
        let dummyCounter = 0;

        for (const e of edges)
        {
            const dFrom = depths.get(e.From) ?? 0;
            const dTo   = depths.get(e.To)   ?? 0;
            const span  = dTo - dFrom;
            if (span <= 1)
            {
                expandedEdges.push(e);
                chains.set(e, [e.From, e.To]);
                continue;
            }
            const chain: string[] = [e.From];
            let prev = e.From;
            for (let layer = dFrom + 1; layer < dTo; layer++)
            {
                const dummy = `__dummy_${dummyCounter++}__`;
                expandedLayers[layer]!.push(dummy);
                expandedEdges.push(new Edge(prev, dummy));
                chain.push(dummy);
                prev = dummy;
            }
            expandedEdges.push(new Edge(prev, e.To));
            chain.push(e.To);
            chains.set(e, chain);
        }

        return { layers: expandedLayers, edges: expandedEdges, chains };
    }
}
