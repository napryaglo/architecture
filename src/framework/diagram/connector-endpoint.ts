import { MetaData, Model } from '../../runtime/index.js';
import type { Point } from '../../visual-engine/index.js';
import type { PortSide } from './port.js';

// Init-object shape mirrors the Port pattern in [port.ts](./port.ts) —
// any omitted field stays at the DP's registered default.
export interface ConnectorEndpointInit
{
    readonly Node?:      Model;
    readonly PortName?:  string;
    readonly PortSide?:  PortSide;
    readonly PortIndex?: number;
    readonly FreePoint?: Point;
}

// One end of a Connector. The 5 DPs describe a single endpoint via
// FIVE different addressing schemes covered by § 3.2 of
// [src/document/connectors.md](../../document/connectors.md); the
// resolver (in [connector.ts](./connector.ts)) picks the most-specific
// path that applies on every re-route:
//
//   1. Node === undefined          → FreePoint
//   2. Node + PortName             → named port lookup
//   3. Node + PortSide+PortIndex   → positional port lookup
//   4. Node + non-empty Ports list → closest-to-other auto-pick
//   5. Node + empty/missing Ports  → geometric clip
//
// The Node DP is typed Model rather than Figure so a consumer-authored
// item Model that satisfies the duck-typed Left / Top / Width / Height
// + Ports surface participates as an endpoint target without inheriting
// from Figure.
export class ConnectorEndpoint extends Model
{
    public static readonly NodeKey      = Model.RegisterProperty<Model | undefined>(
        ConnectorEndpoint, 'Node',      undefined, MetaData.None);
    public static readonly PortNameKey  = Model.RegisterProperty<string | undefined>(
        ConnectorEndpoint, 'PortName',  undefined, MetaData.None);
    public static readonly PortSideKey  = Model.RegisterProperty<PortSide | undefined>(
        ConnectorEndpoint, 'PortSide',  undefined, MetaData.None);
    public static readonly PortIndexKey = Model.RegisterProperty<number | undefined>(
        ConnectorEndpoint, 'PortIndex', undefined, MetaData.None);
    public static readonly FreePointKey = Model.RegisterProperty<Point | undefined>(
        ConnectorEndpoint, 'FreePoint', undefined, MetaData.None);

    public get Node():      Model | undefined    { return this.get_property_value(ConnectorEndpoint.NodeKey); }
    public set Node(v:      Model | undefined)   { this.set_property_value(ConnectorEndpoint.NodeKey, v); }
    public get PortName():  string | undefined   { return this.get_property_value(ConnectorEndpoint.PortNameKey); }
    public set PortName(v:  string | undefined)  { this.set_property_value(ConnectorEndpoint.PortNameKey, v); }
    public get PortSide():  PortSide | undefined { return this.get_property_value(ConnectorEndpoint.PortSideKey); }
    public set PortSide(v:  PortSide | undefined){ this.set_property_value(ConnectorEndpoint.PortSideKey, v); }
    public get PortIndex(): number | undefined   { return this.get_property_value(ConnectorEndpoint.PortIndexKey); }
    public set PortIndex(v: number | undefined)  { this.set_property_value(ConnectorEndpoint.PortIndexKey, v); }
    public get FreePoint(): Point | undefined    { return this.get_property_value(ConnectorEndpoint.FreePointKey); }
    public set FreePoint(v: Point | undefined)   { this.set_property_value(ConnectorEndpoint.FreePointKey, v); }

    constructor(init?: ConnectorEndpointInit)
    {
        super();
        if (init === undefined) return;
        if (init.Node      !== undefined) this.Node      = init.Node;
        if (init.PortName  !== undefined) this.PortName  = init.PortName;
        if (init.PortSide  !== undefined) this.PortSide  = init.PortSide;
        if (init.PortIndex !== undefined) this.PortIndex = init.PortIndex;
        if (init.FreePoint !== undefined) this.FreePoint = init.FreePoint;
    }
}
