import { Edge, Graph, Node } from './graph.js';

// A GraphTransform reads a Graph and returns a NEW Graph — it never
// mutates the input. Pipelines compose transforms by feeding the
// output of step N into step N+1, so each stage sees a fresh graph
// representing the cumulative effect of the previous stages.
//
// Node and Edge instances may be shared between input and output
// graphs when a transform doesn't change them; share-vs-clone is the
// transform author's call. Mutating a shared Node/Edge after the fact
// would be visible in both graphs (they're Models with their own
// property state), which is why most transforms below produce new
// instances when they need to change content.
export interface GraphTransform
{
    Apply(graph: Graph): Graph;
}

// Chain of transforms applied left-to-right. Each Apply call runs the
// full chain against the supplied input and returns the final graph.
// The pipeline itself holds no per-run state, so the same instance can
// be reused across runs.
export class GraphPipeline
{
    public readonly transforms: GraphTransform[];

    constructor(transforms: GraphTransform[] = [])
    {
        this.transforms = transforms;
    }

    // Append a transform; returns this for fluent-chain construction:
    //   new GraphPipeline().Add(a).Add(b).Apply(g)
    public Add(transform: GraphTransform): this
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

// ── Built-in transforms ───────────────────────────────────────────

// Keeps only nodes the predicate returns true for. Edges whose
// endpoints no longer exist are dropped as well — otherwise the
// downstream scene builder would silently skip them, hiding the fact
// that the graph is inconsistent.
export class FilterNodesTransform implements GraphTransform
{
    constructor(public readonly predicate: (node: Node) => boolean) {}

    public Apply(graph: Graph): Graph
    {
        const keptNodes = graph.nodes.filter(this.predicate);
        const keptIds = new Set(keptNodes.map(n => n.Id));
        const keptEdges = graph.edges.filter(e => keptIds.has(e.From) && keptIds.has(e.To));
        return new Graph(keptNodes, keptEdges);
    }
}

// Keeps only edges the predicate returns true for. Nodes are
// untouched — even ones that become isolated.
export class FilterEdgesTransform implements GraphTransform
{
    constructor(public readonly predicate: (edge: Edge) => boolean) {}

    public Apply(graph: Graph): Graph
    {
        return new Graph(graph.nodes, graph.edges.filter(this.predicate));
    }
}

// Collapses parallel edges with the same (From, To). The first edge
// in source order wins; later duplicates are dropped. Doesn't merge
// (From, To) with (To, From) — edges are directed.
export class DedupEdgesTransform implements GraphTransform
{
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

// When both A→B and B→A exist, keeps whichever direction appears
// first in source order and drops the other. Useful for breaking
// request/response 2-cycles that scenario sequences create (e.g.
// command-bus → validator → command-bus), so downstream DAG-only
// algorithms (longest-path layering, topological sort) can run.
//
// Run AFTER DedupEdgesTransform if exact duplicates are also possible;
// the dedup pass guarantees each direction appears at most once,
// which keeps this transform's "first wins" rule deterministic.
export class CollapseAntiparallelEdgesTransform implements GraphTransform
{
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

// Drops nodes that have no incident edges (in or out). Useful after
// FilterEdgesTransform to clean up orphans.
export class DropIsolatedNodesTransform implements GraphTransform
{
    public Apply(graph: Graph): Graph
    {
        const referenced = new Set<string>();
        for (const e of graph.edges)
        {
            referenced.add(e.From);
            referenced.add(e.To);
        }
        return new Graph(
            graph.nodes.filter(n => referenced.has(n.Id)),
            graph.edges,
        );
    }
}

// Rewrites labels via the supplied function. Returning undefined
// clears the label. Produces new Node instances so the input graph's
// nodes are not modified.
export class MapLabelsTransform implements GraphTransform
{
    constructor(public readonly fn: (node: Node) => string | undefined) {}

    public Apply(graph: Graph): Graph
    {
        const newNodes = graph.nodes.map(n => new Node(n.Id, this.fn(n)));
        return new Graph(newNodes, graph.edges);
    }
}
