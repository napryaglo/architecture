import {
    MetaData,
    Model,
    ObservableCollection,
    RelayCommand,
} from '../../runtime/index.js';
import { pathGeometryFromSvgD, pathGeometryToSvgD, Point } from '../../visual-engine/index.js';
import { Figure } from './figure.js';
import { Group } from './group.js';
import { ToolboxShape } from './toolbox-shape.js';
import { SHAPE_CATALOG, SHAPE_CATALOG_MAP, mergeShapes } from './shape-catalog.js';
import { GeometryCombineMode } from './commands/combine.js';
import type { DiagramMutator } from './behaviors/attach-standard-mutations.js';
import { Connector } from './connector.js';
import { ConnectorEndpoint } from './connector-endpoint.js';

// Minimal storage contract Diagram.Save / Load wire against. Subset of
// the Web Storage API (localStorage / sessionStorage). Demos plug in
// whichever backend suits.
export interface DiagramStorage
{
    GetItem(key: string): string | null;
    SetItem(key: string, value: string): void;
}

interface SerializedNode
{
    readonly id:   string;
    readonly kind: string;
    readonly left: number;
    readonly top:  number;
    readonly w:    number;
    readonly h:    number;
    readonly d:    string;
}

interface SerializedConnectorEndpoint
{
    readonly nodeId?:   string;
    readonly portName?: string;
    readonly freeX?:    number;
    readonly freeY?:    number;
}

interface SerializedConnector
{
    readonly source:      SerializedConnectorEndpoint;
    readonly target:      SerializedConnectorEndpoint;
    readonly waypoints?:  ReadonlyArray<{ readonly x: number; readonly y: number }>;
    readonly routingMode?: string;
}

interface SerializedDiagram
{
    readonly nodes:       readonly SerializedNode[];
    readonly connectors?: readonly SerializedConnector[];
    readonly nextId:      number;
}

const STORAGE_KEY = 'mural-diagram-state-v1';

// Top-level Document for a diagrammer-style workspace. Owns the flat
// `Nodes` collection (Figures + Groups), the `ToolboxShapes` palette,
// status feedback, Save / Load commands, and the structural mutation
// methods (Group / Ungroup / Combine / Delete / Place) the framework
// Diagram routes its gesture events to.
//
// DiagramDocument IS a `DiagramMutator` structurally — set it as the
// Diagram's DataContext and the Diagram auto-wires Mutator off the
// DC (no explicit `Mutator=…` binding needed). GroupRequested /
// UngroupRequested / CombineRequested / DeleteRequested / ItemDropped
// then route directly here.
//
// Customise by subclassing (override CreateNode for custom Figure
// shapes, override ToolboxShapes default to expose a different
// palette, etc.) or by composing — the Document doesn't lock methods
// down.
export class DiagramDocument extends Model implements DiagramMutator
{
    public static readonly NodesKey         = Model.RegisterProperty<ObservableCollection<Figure | Group>>(
        DiagramDocument, 'Nodes',         undefined as unknown as ObservableCollection<Figure | Group>, MetaData.None);
    public static readonly ConnectorsKey    = Model.RegisterProperty<ObservableCollection<Connector>>(
        DiagramDocument, 'Connectors',    undefined as unknown as ObservableCollection<Connector>, MetaData.None);
    public static readonly ToolboxShapesKey = Model.RegisterProperty<ObservableCollection<ToolboxShape>>(
        DiagramDocument, 'ToolboxShapes', undefined as unknown as ObservableCollection<ToolboxShape>, MetaData.None);
    public static readonly StatusKey        = Model.RegisterProperty<string>(
        DiagramDocument, 'Status',        '', MetaData.None);
    public static readonly StorageKey       = Model.RegisterProperty<DiagramStorage | undefined>(
        DiagramDocument, 'Storage',       undefined, MetaData.None);
    public static readonly SaveCommandKey   = Model.RegisterProperty<RelayCommand | undefined>(
        DiagramDocument, 'SaveCommand',   undefined, MetaData.None);
    public static readonly LoadCommandKey   = Model.RegisterProperty<RelayCommand | undefined>(
        DiagramDocument, 'LoadCommand',   undefined, MetaData.None);

    private _nextId = 1;

    constructor(storage?: DiagramStorage)
    {
        super();
        this.set_property_value(DiagramDocument.NodesKey,         new ObservableCollection<Figure | Group>());
        this.set_property_value(DiagramDocument.ConnectorsKey,    new ObservableCollection<Connector>());
        this.set_property_value(DiagramDocument.StorageKey,       storage);
        const toolbox = new ObservableCollection<ToolboxShape>();
        for (const e of SHAPE_CATALOG) toolbox.Add(new ToolboxShape(e.kind, e.label));
        this.set_property_value(DiagramDocument.ToolboxShapesKey, toolbox);

        // Save / Load RelayCommands — gated on Storage presence.
        const canPersist = (): boolean => this.Storage !== undefined;
        this.set_property_value(DiagramDocument.SaveCommandKey,
            new RelayCommand(() => this.Save(), canPersist,
                { Text: 'Save',
                  Description: 'Serialize the current canvas to the configured storage.' }));
        this.set_property_value(DiagramDocument.LoadCommandKey,
            new RelayCommand(() => this.Load(), canPersist,
                { Text: 'Load',
                  Description: 'Restore the most recently saved canvas.' }));
    }

    public get Nodes():         ObservableCollection<Figure | Group> { return this.get_property_value(DiagramDocument.NodesKey); }
    public get Connectors():    ObservableCollection<Connector>      { return this.get_property_value(DiagramDocument.ConnectorsKey); }
    public get ToolboxShapes(): ObservableCollection<ToolboxShape>   { return this.get_property_value(DiagramDocument.ToolboxShapesKey); }
    public get Status():        string                               { return this.get_property_value(DiagramDocument.StatusKey); }
    public set Status(v: string)                                     { this.set_property_value(DiagramDocument.StatusKey, v); }
    public get Storage():       DiagramStorage | undefined           { return this.get_property_value(DiagramDocument.StorageKey); }
    public set Storage(v: DiagramStorage | undefined)                { this.set_property_value(DiagramDocument.StorageKey, v); }
    public get SaveCommand():   RelayCommand | undefined             { return this.get_property_value(DiagramDocument.SaveCommandKey); }
    public get LoadCommand():   RelayCommand | undefined             { return this.get_property_value(DiagramDocument.LoadCommandKey); }

    // ── Mutation API (DiagramMutator surface) ──────────────────────

    public CreateNode(kind: string, x: number, y: number): Figure | null
    {
        if (!SHAPE_CATALOG_MAP.has(kind)) return null;
        const fig = Figure.fromKind(kind, x, y);
        fig.Id = 'n' + this._nextId++;
        this.Nodes.Add(fig);
        this.Status = `Placed ${kind}. ${this.Nodes.Count} nodes.`;
        return fig;
    }

    public DeleteNodes(items: readonly unknown[]): void
    {
        if (items.length === 0) return;
        let removed = 0;
        for (const item of items)
        {
            if (!(item instanceof Figure || item instanceof Group)) continue;
            // Detach from parent group bookkeeping first if any.
            if (item.Parent !== undefined) item.Parent._removeMember(item);
            const idx = this.Nodes.IndexOf(item);
            if (idx < 0) continue;
            this.Nodes.RemoveAt(idx);
            removed++;
        }
        // Cascade: drop any connector whose endpoint references a
        // removed node. Without this, a Figure deletion leaves the
        // connector pointing at a detached Visual.
        if (removed > 0)
        {
            const orphaned: Connector[] = [];
            for (let i = 0; i < this.Connectors.Count; i++)
            {
                const c = this.Connectors.Get(i)!;
                const sn = c.Source?.Node, tn = c.Target?.Node;
                if ((sn !== undefined && items.includes(sn))
                 || (tn !== undefined && items.includes(tn)))
                {
                    orphaned.push(c);
                }
            }
            for (const o of orphaned)
            {
                const idx = this.Connectors.IndexOf(o);
                if (idx >= 0) this.Connectors.RemoveAt(idx);
            }
            const orphanSuffix = orphaned.length > 0
                ? ` + ${orphaned.length} orphaned connector${orphaned.length === 1 ? '' : 's'}`
                : '';
            this.Status = `Deleted ${removed} node${removed === 1 ? '' : 's'}${orphanSuffix}. `
                        + `${this.Nodes.Count} remain.`;
        }
    }

    public CreateConnector(source: ConnectorEndpoint, target: ConnectorEndpoint): Connector | null
    {
        // items-are-Connectors convention. The materializer in
        // [collaborators/diagram-connectors-materializer.ts] recognizes
        // a Connector entry as already-a-Visual and skips template
        // application, so the freshly-constructed instance below IS
        // what renders on the diagram.
        const c = new Connector();
        c.Source = source;
        c.Target = target;
        this.Connectors.Add(c);
        this.Status = `Added connector. ${this.Connectors.Count} connectors total.`;
        return c;
    }

    public DeleteConnectors(connectors: readonly Connector[]): void
    {
        if (connectors.length === 0) return;
        let removed = 0;
        for (const c of connectors)
        {
            const idx = this.Connectors.IndexOf(c);
            if (idx < 0) continue;
            this.Connectors.RemoveAt(idx);
            removed++;
        }
        if (removed > 0)
        {
            this.Status = `Deleted ${removed} connector${removed === 1 ? '' : 's'}. ${this.Connectors.Count} remain.`;
        }
    }

    /** Wrap the top-level entries of `items` in a new Group.
     *  The new Group is inserted at the LOWEST index of any selected
     *  member so its bbox renders BEHIND its members in z-order. */
    public Group(items: readonly unknown[]): void
    {
        const selection = this._topLevel(items);
        if (selection.length < 2) return;
        const grp = new Group();
        let minIdx = this.Nodes.Count;
        for (const m of selection)
        {
            const idx = this.Nodes.IndexOf(m);
            if (idx >= 0 && idx < minIdx) minIdx = idx;
        }
        for (const m of selection)
        {
            if (m.Parent !== undefined) m.Parent._removeMember(m);
            m.Parent = grp;
            grp.Members.Add(m);
        }
        this.Nodes.Insert(minIdx, grp);
        grp.IsSelected = true;
        for (const leaf of grp.EnumerateLeaves()) leaf.IsSelected = false;
        for (const sub  of grp.EnumerateSubGroups()) sub.IsSelected = false;
        this.Status = `Grouped ${selection.length} items.`;
    }

    /** Dissolve every Group-shaped entry in `items`. Members lift to
     *  the dissolved group's parent (or to no-parent if top-level). */
    public Ungroup(items: readonly unknown[]): void
    {
        const groups: Group[] = [];
        for (const item of this._topLevel(items))
        {
            if (item instanceof Group) groups.push(item);
        }
        if (groups.length === 0) return;
        for (const g of groups)
        {
            const parent = g.Parent;
            const members: (Figure | Group)[] = [];
            for (let i = 0; i < g.Members.Count; i++) members.push(g.Members.Get(i)!);
            for (const m of members)
            {
                g._removeMember(m);
                m.Parent = parent;
                if (parent !== undefined) parent.Members.Add(m);
            }
            if (parent !== undefined) parent._removeMember(g);
            const idx = this.Nodes.IndexOf(g);
            if (idx >= 0) this.Nodes.RemoveAt(idx);
        }
        this.Status = `Ungrouped ${groups.length} group${groups.length === 1 ? '' : 's'}.`;
    }

    /** PowerPoint Merge-Shapes counterpart. Folds the geometric subset
     *  of `items` via `mergeShapes` and replaces the inputs with a single
     *  combined-source Figure. */
    public CombineSelection(items: readonly unknown[], mode: GeometryCombineMode): void
    {
        const leaves: Figure[] = [];
        for (const item of items)
        {
            if (item instanceof Figure) leaves.push(item);
            else if (item instanceof Group)
            {
                for (const leaf of item.EnumerateLeaves()) leaves.push(leaf);
            }
        }
        if (leaves.length < 2) return;
        const merged = mergeShapes(leaves, mode);
        if (merged === undefined)
        {
            this.Status = 'Combine produced an empty geometry.';
            return;
        }
        const template = leaves[0]!;
        const result = Figure.fromSource(merged.source, merged.x, merged.y, {
            width:  merged.w,
            height: merged.h,
        });
        result.Id   = 'n' + this._nextId++;
        result.Fill = template.Fill;
        if (template.Stroke !== undefined)
        {
            const PenCtor = template.Stroke.constructor as new (...args: unknown[]) => typeof template.Stroke;
            result.Stroke = new PenCtor(template.Stroke.Brush, template.Stroke.Thickness);
        }
        for (const leaf of leaves)
        {
            if (leaf.Parent !== undefined) leaf.Parent._removeMember(leaf);
            const idx = this.Nodes.IndexOf(leaf);
            if (idx >= 0) this.Nodes.RemoveAt(idx);
        }
        this.Nodes.Add(result);
        result.IsSelected = true;
        this.Status = `Combined ${leaves.length} shapes (${combineModeName(mode)}).`;
    }

    // ── Save / Load ──────────────────────────────────────────────────

    public Save(): void
    {
        const storage = this.Storage;
        if (storage === undefined) return;
        try
        {
            storage.SetItem(STORAGE_KEY, JSON.stringify(this._serialize()));
            this.Status = `Saved ${this.Nodes.Count} nodes.`;
        }
        catch (e)
        {
            this.Status = `Save failed: ${e instanceof Error ? e.message : String(e)}`;
        }
    }

    public Load(): void
    {
        const storage = this.Storage;
        if (storage === undefined) return;
        try
        {
            const json = storage.GetItem(STORAGE_KEY);
            if (json === null)
            {
                this.Status = 'Nothing saved yet — try Save first.';
                return;
            }
            this._deserialize(JSON.parse(json) as SerializedDiagram);
            this.Status = `Loaded ${this.Nodes.Count} nodes.`;
        }
        catch (e)
        {
            this.Status = `Load failed: ${e instanceof Error ? e.message : String(e)}`;
        }
    }

    private _serialize(): SerializedDiagram
    {
        const nodes: SerializedNode[] = [];
        for (let i = 0; i < this.Nodes.Count; i++)
        {
            const v = this.Nodes.Get(i)!;
            if (!(v instanceof Figure)) continue;     // groups not persisted in v1
            const source = v._getSource();
            const d = source !== undefined ? pathGeometryToSvgD(source) : '';
            nodes.push({
                id:   v.Id ?? '',
                kind: v.Kind,
                left: v.Left,
                top:  v.Top,
                w:    v.Width,
                h:    v.Height,
                d,
            });
        }
        const connectors: SerializedConnector[] = [];
        for (let i = 0; i < this.Connectors.Count; i++)
        {
            const c = this.Connectors.Get(i)!;
            const src = c.Source, tgt = c.Target;
            if (src === undefined || tgt === undefined) continue;   // half-set connectors are not persisted
            connectors.push({
                source:      serializeEndpoint(src),
                target:      serializeEndpoint(tgt),
                waypoints:   c.Waypoints !== undefined && c.Waypoints.length > 0
                    ? c.Waypoints.map(p => ({ x: p.X, y: p.Y }))
                    : undefined,
                routingMode: c.RoutingMode,
            });
        }
        return { nodes, connectors, nextId: this._nextId };
    }

    private _deserialize(payload: SerializedDiagram): void
    {
        this.Nodes.Clear();
        this.Connectors.Clear();

        // Round-trip nodes first so connectors can resolve their
        // endpoint nodeIds against the freshly-rehydrated Nodes set.
        const byId = new Map<string, Figure>();
        for (const n of payload.nodes ?? [])
        {
            const id = n.id !== '' ? n.id : 'n' + this._nextId++;
            let fig: Figure;
            if (n.kind !== '' && SHAPE_CATALOG_MAP.has(n.kind))
            {
                fig = Figure.fromKind(n.kind, n.left, n.top, { width: n.w, height: n.h });
            }
            else if (typeof n.d === 'string' && n.d.length > 0)
            {
                fig = Figure.fromSource(pathGeometryFromSvgD(n.d), n.left, n.top, {
                    width:  n.w,
                    height: n.h,
                    kind:   n.kind,
                });
            }
            else
            {
                continue;
            }
            fig.Id = id;
            this.Nodes.Add(fig);
            byId.set(id, fig);
        }
        for (const sc of payload.connectors ?? [])
        {
            const c = new Connector();
            if (typeof sc.routingMode === 'string') c.RoutingMode = sc.routingMode;
            c.Source = rehydrateEndpoint(sc.source, byId);
            c.Target = rehydrateEndpoint(sc.target, byId);
            if (sc.waypoints !== undefined && sc.waypoints.length > 0)
            {
                c.Waypoints = sc.waypoints.map(p => new Point(p.x, p.y));
            }
            this.Connectors.Add(c);
        }
        if (typeof payload.nextId === 'number') this._nextId = Math.max(this._nextId, payload.nextId);
    }

    // Reduce items to the unique set of outermost ancestors (walks
    // Parent chains, dedupes). Match the framework's `selectedTopLevel`
    // semantics so Group / Ungroup respect Visio-style "selecting a
    // member ≡ selecting its outermost group" elevation.
    private _topLevel(items: readonly unknown[]): (Figure | Group)[]
    {
        const out = new Set<Figure | Group>();
        for (const item of items)
        {
            if (item instanceof Figure || item instanceof Group)
            {
                let cur: Figure | Group = item;
                while (cur.Parent !== undefined) cur = cur.Parent;
                out.add(cur);
            }
        }
        return [...out];
    }
}

function serializeEndpoint(ep: ConnectorEndpoint): SerializedConnectorEndpoint
{
    const node = ep.Node;
    if (node instanceof Figure && node.Id !== undefined && node.Id !== '')
    {
        const out: SerializedConnectorEndpoint = { nodeId: node.Id };
        if (ep.PortName !== undefined) return { ...out, portName: ep.PortName };
        return out;
    }
    const fp = ep.FreePoint;
    if (fp !== undefined) return { freeX: fp.X, freeY: fp.Y };
    // Endpoint without a usable anchor — serialize as empty; rehydrate
    // will produce a default endpoint with FreePoint(0,0).
    return {};
}

function rehydrateEndpoint(
    s: SerializedConnectorEndpoint,
    byId: ReadonlyMap<string, Figure>,
): ConnectorEndpoint
{
    if (s.nodeId !== undefined)
    {
        const node = byId.get(s.nodeId);
        if (node !== undefined)
        {
            return new ConnectorEndpoint({
                Node:     node,
                PortName: s.portName,
            });
        }
        // Dangling reference — fall through to FreePoint(0,0) so the
        // connector still materializes (without crashing) and the
        // consumer can observe the orphan.
    }
    if (typeof s.freeX === 'number' && typeof s.freeY === 'number')
    {
        return new ConnectorEndpoint({ FreePoint: new Point(s.freeX, s.freeY) });
    }
    return new ConnectorEndpoint({ FreePoint: new Point(0, 0) });
}

function combineModeName(mode: GeometryCombineMode): string
{
    switch (mode)
    {
        case GeometryCombineMode.Union:     return 'Union';
        case GeometryCombineMode.Intersect: return 'Intersect';
        case GeometryCombineMode.Xor:       return 'Exclude';
        case GeometryCombineMode.Exclude:   return 'Subtract';
        default: return String(mode);
    }
}
