import { MetaData, Model } from '../../runtime/index.js';

// Plain-data graph model. Node and Edge are Model descendants so they
// participate in the property/binding system — property-change
// notifications, attached properties from transforms, etc. — without
// any layout / render machinery (that's Visual's job).
//
// Properties are registered in static blocks the same way Visual's are
// (see runtime/visual.ts); accessors below are thin wrappers over
// get_property_value / set_property_value so external code can read and
// write fields naturally.

export class Node extends Model
{
    static {
        Model.RegisterProperty(Node, 'Id',    '',        MetaData.None);
        Model.RegisterProperty(Node, 'Label', undefined, MetaData.None);
    }

    constructor(id: string, label?: string)
    {
        super();
        this.Id = id;
        if (label !== undefined) this.Label = label;
    }

    public get Id(): string { return this.get_property_value('Id'); }
    public set Id(value: string) { this.set_property_value('Id', value); }

    public get Label(): string | undefined { return this.get_property_value('Label'); }
    public set Label(value: string | undefined) { this.set_property_value('Label', value); }
}

export class Edge extends Model
{
    static {
        Model.RegisterProperty(Edge, 'From', '', MetaData.None);
        Model.RegisterProperty(Edge, 'To',   '', MetaData.None);
    }

    constructor(from: string, to: string)
    {
        super();
        this.From = from;
        this.To = to;
    }

    public get From(): string { return this.get_property_value('From'); }
    public set From(value: string) { this.set_property_value('From', value); }

    public get To(): string { return this.get_property_value('To'); }
    public set To(value: string) { this.set_property_value('To', value); }
}

// Mutable graph — typical experiment flow is "build the graph, run a
// pipeline of transforms, run a layout, render". Transforms produce
// new Graph instances rather than mutating in place (see pipeline.ts).
// For pre-built graphs construct with arrays directly via the
// constructor; for incremental building use AddNode / AddEdge.
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

    // DFS-based cycle detection using the classic three-color scheme:
    //   white (0) = not yet visited
    //   gray  (1) = on the current recursion stack
    //   black (2) = fully explored and recursion returned
    // Encountering a gray neighbor means we found a back-edge — a
    // cycle. Self-loops (edge from a node to itself) count as cycles.
    public IsDirectedAcyclic(): boolean
    {
        const adj = new Map<string, string[]>();
        for (const n of this.nodes) adj.set(n.Id, []);
        for (const e of this.edges) adj.get(e.From)?.push(e.To);

        const color = new Map<string, number>();
        for (const n of this.nodes) color.set(n.Id, 0);

        const visit = (u: string): boolean =>
        {
            color.set(u, 1);
            for (const v of adj.get(u) ?? [])
            {
                const c = color.get(v) ?? 0;
                if (c === 1) return false;
                if (c === 0 && !visit(v)) return false;
            }
            color.set(u, 2);
            return true;
        };

        for (const n of this.nodes)
        {
            if (color.get(n.Id) === 0 && !visit(n.Id)) return false;
        }
        return true;
    }

    // Returns every cycle DFS discovers via a back-edge. Each cycle is
    // a list of node Ids in traversal order; the implicit closing edge
    // goes from the last entry back to the first (so a cycle like
    // a → b → a is reported as ["a", "b"], and a self-loop a → a as
    // ["a"]).
    //
    // This is the "back-edge" enumeration: one cycle is reported for
    // every back-edge found, which means n back-edges in the DFS tree
    // produce n cycle entries. It is NOT a complete enumeration of all
    // elementary (simple) cycles — graphs with multiple elementary
    // cycles that share nodes may have some hidden by DFS ordering.
    // For full enumeration use Johnson's algorithm; for diagnostics
    // ("which edges close cycles so I can break them?") this is
    // sufficient and runs in O(V + E).
    public FindCycles(): string[][]
    {
        const adj = new Map<string, string[]>();
        for (const n of this.nodes) adj.set(n.Id, []);
        for (const e of this.edges) adj.get(e.From)?.push(e.To);

        const color = new Map<string, number>();
        for (const n of this.nodes) color.set(n.Id, 0);

        const stack: string[] = [];
        const stackIndex = new Map<string, number>();
        const cycles: string[][] = [];

        const visit = (u: string): void =>
        {
            color.set(u, 1);
            stackIndex.set(u, stack.length);
            stack.push(u);
            for (const v of adj.get(u) ?? [])
            {
                const c = color.get(v) ?? 0;
                if (c === 1)
                {
                    const start = stackIndex.get(v)!;
                    cycles.push(stack.slice(start));
                }
                else if (c === 0)
                {
                    visit(v);
                }
            }
            color.set(u, 2);
            stack.pop();
            stackIndex.delete(u);
        };

        for (const n of this.nodes)
        {
            if (color.get(n.Id) === 0) visit(n.Id);
        }
        return cycles;
    }
}
