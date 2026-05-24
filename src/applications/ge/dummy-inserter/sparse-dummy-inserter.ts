import { Edge } from '../graph.js';
import type { AcademicReference } from '../pipeline-element.js';
import type { IDummyInserter, DummyInsertionResult } from './dummy-inserter.js';

// Sparse normalization from Eiglsperger, Siebenhaller & Kaufmann
// 2005, Section 2 of "An Efficient Implementation of Sugiyama's
// Algorithm for Layered Graph Drawing" (JGAA 9(3), 305–325).
//
// Rather than inserting one dummy per intermediate layer for every
// multi-layer edge (the classical normalization that produces a
// chain of length k–1 for a span-k edge), this inserter creates AT
// MOST TWO dummies per edge:
//
//   * span 1 (proper edge)  → no dummies; chain = [u, v]
//   * span 2                → single r-vertex at L_{from+1};
//                             chain = [u, r, v], both segments proper
//   * span > 2              → p-vertex at L_{from+1} and q-vertex
//                             at L_{to-1}; chain = [u, p, q, v].
//                             The (p, q) edge — the "segment" of e
//                             — spans span−2 layers and is drawn as
//                             a single vertical line (in the
//                             linear-segments model, the segment
//                             middle is the vertical part of the
//                             polyline).
//
// Result: dummy count is O(|V|+|E|) instead of O(|V||E|); every
// long edge becomes a 3-segment polyline (slanted entry → vertical
// middle → slanted exit), i.e. at most 2 bends regardless of span.
//
// Implications for downstream stages:
//   * The reorderer's adjacent-only sweep cannot see the (p, q)
//     segment directly when it spans more than one row. We rely on
//     the chain neighbour relationship to keep p and q in
//     consistent columns; the vertical aligner then pulls them
//     onto a shared x so the segment renders as a clean vertical.
//   * The aligner's clearance constraint keeps unrelated nodes
//     out of the segment's path, avoiding edge-cuts-through-node
//     artefacts that the reorderer cannot detect.
//   * The router builds 3- (or 2-) point chains, so multi-layer
//     edges get the "linear segments" look automatically.
export class SparseDummyInserter implements IDummyInserter
{
    public readonly Name               = 'Sparse Normalization';
    public readonly AlgorithmName      = 'Linear-segments dummy insertion (≤ 2 dummies per edge)';
    public readonly AcademicReferences: readonly AcademicReference[] = [
        {
            authors: 'Eiglsperger, M., Siebenhaller, M., Kaufmann, M.',
            year:    2005,
            title:   "An efficient implementation of Sugiyama's algorithm for layered graph drawing",
            venue:   'Journal of Graph Algorithms and Applications 9(3), 305–325',
        },
    ];

    public Insert(
        layers: string[][],
        edges:  Edge[],
        depths: Map<string, number>,
    ): DummyInsertionResult
    {
        const expandedLayers = layers.map(row => [...row]);
        const expandedEdges:  Edge[] = [];
        const chains = new Map<Edge, string[]>();
        let counter = 0;

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

            if (span === 2)
            {
                // Single r-vertex at the intermediate layer.
                const r = `__dummy_r_${counter++}__`;
                expandedLayers[dFrom + 1]!.push(r);
                expandedEdges.push(new Edge(e.From, r));
                expandedEdges.push(new Edge(r, e.To));
                chains.set(e, [e.From, r, e.To]);
                continue;
            }

            // span > 2: p at top intermediate, q at bottom
            // intermediate; the (p, q) segment edge spans
            // (span − 2) layers and is drawn as a single
            // vertical line at render time.
            const p = `__dummy_p_${counter++}__`;
            const q = `__dummy_q_${counter++}__`;
            expandedLayers[dFrom + 1]!.push(p);
            expandedLayers[dTo   - 1]!.push(q);
            expandedEdges.push(new Edge(e.From, p));
            expandedEdges.push(new Edge(p,      q));
            expandedEdges.push(new Edge(q,      e.To));
            chains.set(e, [e.From, p, q, e.To]);
        }

        return { layers: expandedLayers, edges: expandedEdges, chains };
    }
}
