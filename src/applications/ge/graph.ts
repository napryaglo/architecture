// Plain-data graph model. The visualization layer (NodeVisual /
// EdgeVisual / scene builder) reads this, but Graph itself knows
// nothing about rendering — keeping it pure makes it easy to load
// from JSON, generate algorithmically, or hand-author.

export class Node
{
    constructor(
        public readonly id: string,
        public readonly label?: string,
    ) {}
}

export class Edge
{
    constructor(
        public readonly from: string,  // Node.id
        public readonly to: string,    // Node.id
    ) {}
}

// Mutable graph — typical experiment flow is "build the graph, run a
// layout, render". For pre-built immutable graphs construct with the
// arrays directly via the constructor; for incremental building use
// AddNode / AddEdge.
export class Graph
{
    public readonly nodes: Node[];
    public readonly edges: Edge[];

    constructor(nodes: Node[] = [], edges: Edge[] = [])
    {
        this.nodes = nodes;
        this.edges = edges;
    }

    public AddNode(id: string, label?: string): Node
    {
        const n = new Node(id, label);
        this.nodes.push(n);
        return n;
    }

    public AddEdge(from: string, to: string): Edge
    {
        const e = new Edge(from, to);
        this.edges.push(e);
        return e;
    }
}
