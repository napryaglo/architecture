import type { Edge } from '../graph.js';
import type { AcademicReference } from '../pipeline-element.js';
import type { IFirstLayerOrderer } from './first-layer-orderer.js';

// Sort L0 by out-degree (number of outgoing edges), descending —
// heavily-connected sources go to the front, isolated / weakly-
// connected sources to the back. Ties break on the original index
// to keep the sort stable (no shuffling between identical-degree
// nodes between runs).
//
// Useful when L0 contains a mix of structurally-important sources
// and isolated leftover nodes: this pushes the isolated ones out of
// the central "active" region of the layout, giving the connected
// sources room to align with their downstream chains.
export class OutDegreeFirstLayerOrderer implements IFirstLayerOrderer
{
    public readonly Name               = 'Out-Degree Descending';
    public readonly AlgorithmName      = 'Sort by outgoing-edge count, ties broken by original index';
    public readonly AcademicReferences: readonly AcademicReference[] = [];

    public Order(layer: string[], edges: Edge[]): string[]
    {
        const outDegree = new Map<string, number>();
        for (const id of layer) outDegree.set(id, 0);
        for (const e of edges)
        {
            const current = outDegree.get(e.From);
            if (current !== undefined) outDegree.set(e.From, current + 1);
        }

        const decorated = layer.map((id, originalIndex) => ({
            id,
            degree:        outDegree.get(id) ?? 0,
            originalIndex,
        }));
        decorated.sort((a, b) => b.degree - a.degree || a.originalIndex - b.originalIndex);
        return decorated.map(d => d.id);
    }
}
