import type { Edge } from '../graph.js';
import type { IFirstLayerOrderer } from './first-layer-orderer.js';

// No-op strategy. Returns the layer in the same order it received.
// This is the historical behavior of CustomLayout — nodes appear in
// `graph.nodes` insertion order — and remains the default constructor
// argument so existing callers keep working unchanged.
export class IdentityFirstLayerOrderer implements IFirstLayerOrderer
{
    public Order(layer: string[], _edges: Edge[]): string[]
    {
        return [...layer];
    }
}
