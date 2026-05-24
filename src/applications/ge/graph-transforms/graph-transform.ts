import type { Graph } from '../graph.js';
import type { IPipelineElement } from '../pipeline-element.js';

// A IGraphTransform reads a Graph and returns a NEW Graph — it never
// mutates the input. Pipelines compose transforms by feeding the
// output of step N into step N+1, so each stage sees a fresh graph
// representing the cumulative effect of the previous stages.
//
// Node and Edge instances may be shared between input and output
// graphs when a transform doesn't change them; share-vs-clone is the
// transform author's call. Mutating a shared Node/Edge after the fact
// would be visible in both graphs (they're Models with their own
// property state), which is why most transforms produce new instances
// when they need to change content.
export interface IGraphTransform extends IPipelineElement
{
    Apply(graph: Graph): Graph;
}
