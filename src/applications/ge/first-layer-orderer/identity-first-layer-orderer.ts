import type { Edge } from '../graph.js';
import type { AcademicReference } from '../pipeline-element.js';
import type { IFirstLayerOrderer } from './first-layer-orderer.js';

// No-op strategy. Returns the layer in the same order it received.
// This is the historical behavior of CustomLayout — nodes appear in
// `graph.nodes` insertion order — and remains the default constructor
// argument so existing callers keep working unchanged.
export class IdentityFirstLayerOrderer implements IFirstLayerOrderer
{
    public readonly Name               = 'Identity';
    public readonly AlgorithmName      = 'Passthrough (insertion order)';
    public readonly AcademicReferences: readonly AcademicReference[] = [];

    public Order(layer: string[], _edges: Edge[]): string[]
    {
        return [...layer];
    }
}
