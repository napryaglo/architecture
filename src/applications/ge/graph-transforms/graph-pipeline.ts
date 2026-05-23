import type { Graph } from '../graph.js';
import type { IGraphTransform } from './graph-transform.js';

// Chain of transforms applied left-to-right. Each Apply call runs the
// full chain against the supplied input and returns the final graph.
// The pipeline itself holds no per-run state, so the same instance can
// be reused across runs.
export class GraphPipeline
{
    public readonly transforms: IGraphTransform[];

    constructor(transforms: IGraphTransform[] = [])
    {
        this.transforms = transforms;
    }

    // Append a transform; returns this for fluent-chain construction:
    //   new GraphPipeline().Add(a).Add(b).Apply(g)
    public Add(transform: IGraphTransform): this
    {
        this.transforms.push(transform);
        return this;
    }

    public Apply(graph: Graph): Graph
    {
        let current = graph;
        for (const t of this.transforms)
        {
            current = t.Apply(current);
        }
        return current;
    }
}
