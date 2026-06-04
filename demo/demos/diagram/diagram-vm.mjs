// Diagrammer — MVVM rewrite (strict rules).
//
// This file is a "VM" per CLAUDE.md's MVVM rules. It exposes:
//   * NodeVM        — one per node (DPs: Id, Kind, X, Y, IsSelected, PortsVisible, FillBrush, LabelText)
//   * EdgeVM        — one per connector (DPs: Id, X1/Y1/X2/Y2, Stroke, StrokeThickness)
//   * ToolboxShapeVM— one per toolbox tile (DPs: Kind, Label, Swatch)
//   * DiagramVM     — the host (DPs + ICommands; no view reaches)
//
// Strict compliance with rules:
//   * Rule 1 (no view reaches): no FindName, no visualChildren, no
//     Generator.ContainerFromItem. The bootstrap (`diagram.mjs`) wires
//     behaviors; the VM stays oblivious to template structure.
//   * Rule 3 (DPs over locals): SelectedNode is a DP — not a closure.
//   * Rule 4 (no Visual mutation): NodeVM/EdgeVM/etc. mutate only their
//     own DPs. Visual feedback rides through Style triggers in .mu and
//     Behaviors in `./behaviors/`.
//   * Rule 5 (no host globals): IStorageService injected via DiagramVM
//     constructor; document/window are never touched.
//   * Rule 6 (no Visual construction): rubber-band Line for the port
//     wire is built by `port-wire-behavior`, not here.
//
// Transitional rule-2 (no view imports) carve-out: `SolidColorBrush` +
// `Color` are still imported because per-kind FillBrush is a DP value
// the view binds via `Background=$FillBrush`. Removing this requires
// moving per-kind chrome to the DataTemplates (Phase 3b) so the VM
// only publishes Kind. Tagged with TODO[rule-2] below.

import {
    Application, DataObject, DragDropEffects,
    MetaData, Model, ObservableCollection, RelayCommand,
} from '@visualisation-sub/mural/runtime';
// TODO[rule-2]: SolidColorBrush + Color leave this file when Phase 3b
// moves per-kind fill into the shape DataTemplates.
import { SolidColorBrush } from '@visualisation-sub/mural/visual-engine';
import { Color } from '@visualisation-sub/mural/runtime';
// Application is imported above for symmetry with other demos; the VM
// itself never reaches into Application.current.
void Application;

const STORAGE_KEY = 'diagram-demo-state-v1';

const brush = (hex) => new SolidColorBrush(Color.FromHex(hex));

const BG_RECT     = brush('#bfdbfe');
const STROKE_RECT = brush('#1d4ed8');
const BG_ELLIPSE  = brush('#bbf7d0');
const STROKE_ELL  = brush('#15803d');
const BG_NOTE     = brush('#fde68a');
const STROKE_NOTE = brush('#a16207');
const CONNECTOR_STROKE = brush('#1f2937');

export const NODE_W = 130;
export const NODE_H = 60;

const KIND_INFO = {
    rect:    { fill: BG_RECT,    stroke: STROKE_RECT, label: 'Rectangle' },
    ellipse: { fill: BG_ELLIPSE, stroke: STROKE_ELL,  label: 'Ellipse'   },
    note:    { fill: BG_NOTE,    stroke: STROKE_NOTE, label: 'Note'      },
};

// ── NodeVM ──────────────────────────────────────────────────────────

export class NodeVM extends Model
{
    static {
        Model.RegisterProperty(NodeVM, 'Id',           '',        MetaData.None);
        Model.RegisterProperty(NodeVM, 'Kind',         '',        MetaData.None);
        Model.RegisterProperty(NodeVM, 'X',            0,         MetaData.None);
        Model.RegisterProperty(NodeVM, 'Y',            0,         MetaData.None);
        Model.RegisterProperty(NodeVM, 'IsSelected',   false,     MetaData.None);
        Model.RegisterProperty(NodeVM, 'PortsVisible', false,     MetaData.None);
        Model.RegisterProperty(NodeVM, 'FillBrush',    undefined, MetaData.None);
        Model.RegisterProperty(NodeVM, 'LabelText',    '',        MetaData.None);
        // BeginMoveDragData — used by the framework's declarative
        // IsDraggable/OnDragStart latch. Bound from .mu as
        // `OnDragStart=$BeginMoveDragData`. Returns the move payload or
        // null. Stored as a DP so .mu binding pushes the function value
        // to the framework's OnDragStart slot.
        Model.RegisterProperty(NodeVM, 'BeginMoveDragData', undefined, MetaData.None);
    }

    constructor(id, kind, x, y) {
        super();
        const info = KIND_INFO[kind];
        this._set_property_value_by_name('Id',         id);
        this._set_property_value_by_name('Kind',       kind);
        this._set_property_value_by_name('X',          x);
        this._set_property_value_by_name('Y',          y);
        this._set_property_value_by_name('FillBrush',  info.fill);
        this._set_property_value_by_name('LabelText',  info.label);
        // The drag-start callback. Arrow so `this` stays bound when the
        // framework invokes it. Imported by the IsDraggable latch via
        // an OnDragStart binding in the node template.
        this._set_property_value_by_name('BeginMoveDragData', () => ({
            data: makeMoveData(this.Id),
            effects: DragDropEffects.Move,
        }));
        // Plain (non-DP) fields — internal bookkeeping the view never
        // reads or binds to. AttachedEdgeIds is a Set; behavior code
        // (e.g. edge-layout-behavior) reads it to recompute endpoints.
        this.attachedEdgeIds = new Set();
    }

    get Id()           { return this._get_property_value_by_name('Id'); }
    get Kind()         { return this._get_property_value_by_name('Kind'); }
    get X()            { return this._get_property_value_by_name('X'); }
    set X(v)           { this._set_property_value_by_name('X', v); }
    get Y()            { return this._get_property_value_by_name('Y'); }
    set Y(v)           { this._set_property_value_by_name('Y', v); }
    get IsSelected()   { return this._get_property_value_by_name('IsSelected'); }
    set IsSelected(v)  { this._set_property_value_by_name('IsSelected', v); }
    get PortsVisible() { return this._get_property_value_by_name('PortsVisible'); }
    set PortsVisible(v){ this._set_property_value_by_name('PortsVisible', v); }
    get FillBrush()    { return this._get_property_value_by_name('FillBrush'); }
    get LabelText()    { return this._get_property_value_by_name('LabelText'); }
    get BeginMoveDragData() { return this._get_property_value_by_name('BeginMoveDragData'); }
}

// ── EdgeVM ──────────────────────────────────────────────────────────

export class EdgeVM extends Model
{
    static {
        Model.RegisterProperty(EdgeVM, 'Id',              '',                MetaData.None);
        Model.RegisterProperty(EdgeVM, 'X1',              0,                 MetaData.None);
        Model.RegisterProperty(EdgeVM, 'Y1',              0,                 MetaData.None);
        Model.RegisterProperty(EdgeVM, 'X2',              0,                 MetaData.None);
        Model.RegisterProperty(EdgeVM, 'Y2',              0,                 MetaData.None);
        Model.RegisterProperty(EdgeVM, 'Stroke',          CONNECTOR_STROKE,  MetaData.None);
        Model.RegisterProperty(EdgeVM, 'StrokeThickness', 2,                 MetaData.None);
    }

    constructor(id, fromNode, toNode) {
        super();
        this._set_property_value_by_name('Id', id);
        this.fromNode = fromNode;
        this.toNode   = toNode;
        fromNode.attachedEdgeIds.add(id);
        toNode.attachedEdgeIds.add(id);
    }

    get Id() { return this._get_property_value_by_name('Id'); }
    get X1() { return this._get_property_value_by_name('X1'); }
    get Y1() { return this._get_property_value_by_name('Y1'); }
    get X2() { return this._get_property_value_by_name('X2'); }
    get Y2() { return this._get_property_value_by_name('Y2'); }
    set X1(v) { this._set_property_value_by_name('X1', v); }
    set Y1(v) { this._set_property_value_by_name('Y1', v); }
    set X2(v) { this._set_property_value_by_name('X2', v); }
    set Y2(v) { this._set_property_value_by_name('Y2', v); }
}

// ── ToolboxShapeVM ──────────────────────────────────────────────────

export class ToolboxShapeVM extends Model
{
    static {
        Model.RegisterProperty(ToolboxShapeVM, 'Kind',   '',        MetaData.None);
        Model.RegisterProperty(ToolboxShapeVM, 'Label',  '',        MetaData.None);
        Model.RegisterProperty(ToolboxShapeVM, 'Swatch', undefined, MetaData.None);
        // Bound from .mu via OnDragStart=$BeginKindDragData on the
        // tile root. Same convention as NodeVM.BeginMoveDragData.
        Model.RegisterProperty(ToolboxShapeVM, 'BeginKindDragData', undefined, MetaData.None);
    }

    constructor(kind, label, swatch) {
        super();
        this._set_property_value_by_name('Kind',   kind);
        this._set_property_value_by_name('Label',  label);
        this._set_property_value_by_name('Swatch', swatch);
        this._set_property_value_by_name('BeginKindDragData', () => ({
            data: makeKindData(this.Kind),
            effects: DragDropEffects.Copy,
        }));
    }

    get Kind()   { return this._get_property_value_by_name('Kind'); }
    get Label()  { return this._get_property_value_by_name('Label'); }
    get Swatch() { return this._get_property_value_by_name('Swatch'); }
    get BeginKindDragData() { return this._get_property_value_by_name('BeginKindDragData'); }
}

// ── Drag-data builders ──────────────────────────────────────────────

function makeKindData(kind) {
    return new DataObject().Set('mural/node-kind', kind);
}

function makeMoveData(nodeId) {
    return new DataObject().Set('mural/node-move', { nodeId });
}

// ── port positions (canvas-local; behavior-side coord helpers also
//     use this so kept here as a shared pure function) ─────────────

export function portPositions(node)
{
    const x = node.X, y = node.Y, w = NODE_W, h = NODE_H;
    return [
        { x: x + w / 2, y: y         },
        { x: x + w,     y: y + h / 2 },
        { x: x + w / 2, y: y + h     },
        { x: x,         y: y + h / 2 },
    ];
}

// ── DiagramVM ───────────────────────────────────────────────────────

export class DiagramVM extends Model
{
    static {
        Model.RegisterProperty(DiagramVM, 'Nodes',         undefined,                            MetaData.None);
        Model.RegisterProperty(DiagramVM, 'Edges',         undefined,                            MetaData.None);
        Model.RegisterProperty(DiagramVM, 'ToolboxShapes', undefined,                            MetaData.None);
        Model.RegisterProperty(DiagramVM, 'Status',        'drag a shape from the toolbox →',   MetaData.None);
        Model.RegisterProperty(DiagramVM, 'SelectedNode',  null,                                 MetaData.None);
        // ICommand surface — bound from .mu via Command=$Foo.
        Model.RegisterProperty(DiagramVM, 'SaveCommand',           undefined, MetaData.None);
        Model.RegisterProperty(DiagramVM, 'LoadCommand',           undefined, MetaData.None);
        Model.RegisterProperty(DiagramVM, 'KeyDownCommand',        undefined, MetaData.None);
        Model.RegisterProperty(DiagramVM, 'SelectNodeCommand',     undefined, MetaData.None);
        Model.RegisterProperty(DiagramVM, 'ClearSelectionCommand', undefined, MetaData.None);
    }

    // `storage` is an IStorageService — { GetItem(key): string|null,
    // SetItem(key, value: string): void }. The bootstrap injects a
    // localStorage-backed implementation; tests can pass an in-memory
    // mock. Rule 5: VMs don't touch host globals; the abstraction is
    // the seam.
    constructor(storage) {
        super();
        this._storage = storage;
        this._set_property_value_by_name('Nodes', new ObservableCollection());
        this._set_property_value_by_name('Edges', new ObservableCollection());
        this._set_property_value_by_name('ToolboxShapes', [
            new ToolboxShapeVM('rect',    'Rectangle', brush('#1976d2')),
            new ToolboxShapeVM('ellipse', 'Ellipse',   brush('#1976d2')),
            new ToolboxShapeVM('note',    'Note',      brush('#fde68a')),
        ]);
        this._nextId = 1;
        // Internal lookup for edge management — view never reads this.
        this._edgesById = new Map();

        // ── Commands ──────────────────────────────────────────────
        this._set_property_value_by_name('SaveCommand',
            new RelayCommand(() => this.Save()));
        this._set_property_value_by_name('LoadCommand',
            new RelayCommand(() => this.Load()));
        this._set_property_value_by_name('KeyDownCommand',
            new RelayCommand((args) => this.HandleKeyDown(args)));
        this._set_property_value_by_name('SelectNodeCommand',
            new RelayCommand((nodeOrArgs) => {
                // The command may receive either a NodeVM (when invoked
                // by a behavior that already resolved the data context)
                // or the raw PointerEventArgs (when invoked declaratively
                // via `on PointerDown { InvokeCommand[Command=$SelectNodeCommand] }`
                // on a container). For args, the NodeVM lives at
                // args.Source.DataContext.
                if (nodeOrArgs instanceof NodeVM) {
                    this.Select(nodeOrArgs);
                    return;
                }
                const node = nodeOrArgs?.Source?.DataContext;
                if (node instanceof NodeVM) this.Select(node);
            }));
        this._set_property_value_by_name('ClearSelectionCommand',
            new RelayCommand(() => this.Select(null)));
    }

    get Nodes()         { return this._get_property_value_by_name('Nodes'); }
    get Edges()         { return this._get_property_value_by_name('Edges'); }
    get ToolboxShapes() { return this._get_property_value_by_name('ToolboxShapes'); }
    get Status()        { return this._get_property_value_by_name('Status'); }
    set Status(v)       { this._set_property_value_by_name('Status', v); }
    get SelectedNode()  { return this._get_property_value_by_name('SelectedNode'); }
    set SelectedNode(v) { this._set_property_value_by_name('SelectedNode', v); }
    get SaveCommand()           { return this._get_property_value_by_name('SaveCommand'); }
    get LoadCommand()           { return this._get_property_value_by_name('LoadCommand'); }
    get KeyDownCommand()        { return this._get_property_value_by_name('KeyDownCommand'); }
    get SelectNodeCommand()     { return this._get_property_value_by_name('SelectNodeCommand'); }
    get ClearSelectionCommand() { return this._get_property_value_by_name('ClearSelectionCommand'); }

    // ── Domain operations (called by behaviors and commands) ──────

    // Selection — flips IsSelected on the old and new nodes alongside
    // updating the SelectedNode DP, so per-node DataTemplate triggers
    // continue to work (they watch IsSelected, not the parent DP).
    Select(node) {
        const prev = this.SelectedNode;
        if (prev === node) return;
        if (prev !== null) prev.IsSelected = false;
        this.SelectedNode = node;
        if (node !== null) node.IsSelected = true;
    }

    // Create a new node at canvas-local coords. Called by the canvas
    // drop behavior on FMT_NODE_KIND drops.
    CreateNode(kind, x, y) {
        const id = 'n' + this._nextId++;
        const node = new NodeVM(id, kind, x, y);
        this.Nodes.Add(node);
        return node;
    }

    // Reposition an existing node. Called by the canvas drop behavior
    // on FMT_NODE_MOVE drops. Edge endpoints are recomputed by the
    // edge-layout subscription (set up in the constructor via per-node
    // property listeners — see below).
    MoveNode(nodeId, x, y) {
        const node = this.findNode(nodeId);
        if (node === undefined) return;
        node.X = x;
        node.Y = y;
        // Trigger edge re-layout for any edges touching this node.
        this.relayoutEdgesFor(node);
    }

    AddEdge(fromNodeId, toNodeId) {
        if (fromNodeId === toNodeId) return null;
        const from = this.findNode(fromNodeId);
        const to   = this.findNode(toNodeId);
        if (from === undefined || to === undefined) return null;
        // Reject duplicates.
        for (const eid of from.attachedEdgeIds) {
            const e = this._edgesById.get(eid);
            if (e !== undefined && (e.fromNode === to || e.toNode === to)) return e;
        }
        const id = 'e' + this._nextId++;
        const edge = new EdgeVM(id, from, to);
        this.layoutEdge(edge);
        this._edgesById.set(id, edge);
        this.Edges.Add(edge);
        return edge;
    }

    DeleteSelected() {
        const node = this.SelectedNode;
        if (node === null) return;
        const kind = node.Kind;
        this.removeNode(node);
        this.Status = `Deleted ${kind}. ${this.Nodes.Count} nodes, ${this.Edges.Count} edges.`;
    }

    // ── Save / Load (via injected storage service) ────────────────

    Save() {
        try {
            const json = JSON.stringify(this.serialize());
            this._storage.SetItem(STORAGE_KEY, json);
            this.Status = `Saved ${this.Nodes.Count} nodes, ${this.Edges.Count} edges.`;
        } catch (e) {
            this.Status = `Save failed: ${e?.message ?? String(e)}`;
        }
    }

    Load() {
        try {
            const json = this._storage.GetItem(STORAGE_KEY);
            if (json === null) {
                this.Status = 'Nothing saved yet — try Save first.';
                return;
            }
            this.deserialize(JSON.parse(json));
            this.Status = `Loaded ${this.Nodes.Count} nodes, ${this.Edges.Count} edges.`;
        } catch (e) {
            this.Status = `Load failed: ${e?.message ?? String(e)}`;
        }
    }

    // ── Keyboard handler (KeyEventArgs from the view's KeyDown) ───

    HandleKeyDown(args) {
        if (this.SelectedNode === null) return;
        if (args?.Key === 'Delete' || args?.Key === 'Backspace') {
            this.DeleteSelected();
            args.Handled = true;
        }
    }

    // ── Internal helpers ──────────────────────────────────────────

    findNode(nodeId) {
        for (let i = 0; i < this.Nodes.Count; i++) {
            const n = this.Nodes.Get(i);
            if (n.Id === nodeId) return n;
        }
        return undefined;
    }

    removeNode(node) {
        for (const eid of [...node.attachedEdgeIds]) {
            const e = this._edgesById.get(eid);
            if (e !== undefined) this.removeEdge(e);
        }
        this.Nodes.Remove(node);
        if (this.SelectedNode === node) this.SelectedNode = null;
    }

    removeEdge(edge) {
        edge.fromNode.attachedEdgeIds.delete(edge.Id);
        edge.toNode.attachedEdgeIds.delete(edge.Id);
        this.Edges.Remove(edge);
        this._edgesById.delete(edge.Id);
    }

    relayoutEdgesFor(node) {
        for (const eid of node.attachedEdgeIds) {
            const edge = this._edgesById.get(eid);
            if (edge !== undefined) this.layoutEdge(edge);
        }
    }

    layoutEdge(edge) {
        const ap = portPositions(edge.fromNode);
        const bp = portPositions(edge.toNode);
        let best = Infinity, ai = 0, bi = 0;
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                const dx = ap[i].x - bp[j].x;
                const dy = ap[i].y - bp[j].y;
                const d = dx * dx + dy * dy;
                if (d < best) { best = d; ai = i; bi = j; }
            }
        }
        edge.X1 = ap[ai].x; edge.Y1 = ap[ai].y;
        edge.X2 = bp[bi].x; edge.Y2 = bp[bi].y;
    }

    // ── Serialization ─────────────────────────────────────────────

    serialize() {
        const nodes = [];
        for (let i = 0; i < this.Nodes.Count; i++) {
            const n = this.Nodes.Get(i);
            nodes.push({ id: n.Id, kind: n.Kind, x: n.X, y: n.Y });
        }
        const edges = [];
        for (let i = 0; i < this.Edges.Count; i++) {
            const e = this.Edges.Get(i);
            edges.push({ id: e.Id, from: e.fromNode.Id, to: e.toNode.Id });
        }
        return { nodes, edges, nextId: this._nextId };
    }

    deserialize(payload) {
        if (payload === null || typeof payload !== 'object') return;
        // Clear current state.
        for (let i = this.Nodes.Count - 1; i >= 0; i--) {
            this.removeNode(this.Nodes.Get(i));
        }
        const byOldId = new Map();
        for (const n of payload.nodes ?? []) {
            const created = this.CreateNode(n.kind, n.x, n.y);
            byOldId.set(n.id, created);
        }
        for (const e of payload.edges ?? []) {
            const from = byOldId.get(e.from);
            const to   = byOldId.get(e.to);
            if (from !== undefined && to !== undefined) {
                this.AddEdge(from.Id, to.Id);
            }
        }
    }
}

