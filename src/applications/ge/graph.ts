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
}
