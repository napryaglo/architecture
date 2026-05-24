import type { Graph } from '../graph.js';
import type { AcademicReference } from '../pipeline-element.js';
import type { ILayerAssigner } from './layer-assigner.js';

// For each node v, returns the number of edges in the longest simple
// path that ENDS at v. Sources (nodes with no predecessors) map to 0;
// every other node maps to 1 + max(depth(p)) across its predecessors.
// The result doubles as a layer assignment for layered DAG drawing.
//
// Implementation: DFS on the REVERSE adjacency (predecessor list)
// with memoization. The DAG precondition lets us memoize safely — no
// node is ever re-entered while its depth is still being computed,
// because the lack of cycles guarantees that the predecessor walk
// terminates.
//
// Throws when the graph contains a cycle; longest-simple-path is
// NP-hard on general digraphs, so we refuse rather than silently
// returning a wrong-but-cheap answer.
export class LongestPathLayerAssigner implements ILayerAssigner
{
    public readonly Name               = 'Longest Path';
    public readonly AlgorithmName      = 'Longest-path layering (DFS, memoized)';
    public readonly AcademicReferences: readonly AcademicReference[] = [
        {
            authors: 'Eades, P., Lin, X., Smyth, W. F.',
            year:    1989,
            title:   'A fast and effective heuristic for the feedback arc set problem',
            venue:   'Information Processing Letters',
        },
        {
            authors: 'Healy, P., Nikolov, N. S.',
            year:    2013,
            title:   'Hierarchical drawing algorithms',
            venue:   'Handbook of Graph Drawing and Visualization (Tamassia, ed.), CRC Press',
        },
    ];

    public Assign(graph: Graph, firstLayerNodes?: ReadonlySet<string>): Map<string, number>
    {
        if (!graph.IsDirectedAcyclic())
        {
            throw new Error("Longest-path depths require a DAG");
        }

        const preds = new Map<string, string[]>();
        for (const n of graph.nodes) preds.set(n.Id, []);
        for (const e of graph.edges) preds.get(e.To)?.push(e.From);

        const pinSet = firstLayerNodes;

        const depth = new Map<string, number>();
        const compute = (u: string): number =>
        {
            const cached = depth.get(u);
            if (cached !== undefined) return cached;

            const myPreds = preds.get(u) ?? [];
            let best = 0;
            for (const p of myPreds)
            {
                const d = compute(p) + 1;
                if (d > best) best = d;
            }

            // Apply the L0-pin constraint. When a non-empty
            // firstLayerNodes set is supplied:
            //   * Pinned nodes are forced to depth 0 (we trust the
            //     caller that they are real sources; pinning a node
            //     with predecessors will produce edges pointing the
            //     wrong way in the drawing).
            //   * Sources NOT in the set are pushed to depth 1, so
            //     that L0 ends up containing only the pinned nodes.
            //     Downstream depths cascade naturally through the
            //     recursive `compute` calls.
            if (pinSet !== undefined && pinSet.size > 0)
            {
                if (pinSet.has(u))
                {
                    best = 0;
                }
                else if (myPreds.length === 0)
                {
                    best = Math.max(best, 1);
                }
            }

            depth.set(u, best);
            return best;
        };

        for (const n of graph.nodes) compute(n.Id);
        return depth;
    }
}
