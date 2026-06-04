// Diagrammer — MVVM rewrite.
//
// Three Models live here:
//
//   * NodeVM             — one per node on the canvas. Owns Kind, X, Y,
//                          IsSelected, FillBrush, StrokeBrush, LabelText.
//                          Bound by the per-kind shape DataTemplate.
//   * EdgeVM             — one per connector. Owns X1/Y1/X2/Y2 (precomputed
//                          when nodes move) plus Stroke / StrokeThickness.
//                          Bound by the edge DataTemplate (a Line).
//   * ToolboxShapeVM     — one per toolbox tile. Owns Kind, Label, Swatch.
//                          Bound by the tile DataTemplate.
//
// DiagramVM holds three observable collections (Nodes, Edges,
// ToolboxShapes) plus a Status string. The diagram.mu template renders
// two ItemsControls — one for edges, one for nodes — both using Canvas
// as their ItemsPanel. ItemContainerStyle binds Canvas.Left / Canvas.Top
// to NodeVM.X / Y so a node moves on the canvas simply by mutating the
// VM's X/Y properties.
//
// Drag interactions ride on the framework D&D subsystem (DataObject +
// IsDraggable/OnDragStart + AllowDrop + DragOver/Drop). DiagramVM
// itself holds no gesture state; the framework owns the active
// session, and DragOver/Drop handlers on the canvas mutate the VMs.

import {
    Application, DataObject, DragDropEffects,
    MetaData, Model, ObservableCollection,
} from '@visualisation-sub/mural/runtime';
import { Button, Canvas, ItemsControl, Line, TextBlock } from '@visualisation-sub/mural/Controls';
import { SolidColorBrush } from '@visualisation-sub/mural/visual-engine';
import { Color } from '@visualisation-sub/mural/runtime';

// Drag-data format keys for the diagram demo:
//   * 'mural/node-kind' — toolbox tile → canvas (create a new node)
//   * 'mural/node-move' — existing node → canvas (move an existing node)
//   * 'mural/port'      — node port → another node (wire an edge)
// Receivers query Has(...) to decide what they accept.
const FMT_NODE_KIND = 'mural/node-kind';
const FMT_NODE_MOVE = 'mural/node-move';
const FMT_PORT      = 'mural/port';

const STORAGE_KEY = 'diagram-demo-state-v1';

// ── Visual constants ────────────────────────────────────────────────

const brush = (hex) => new SolidColorBrush(Color.FromHex(hex));

const BG_RECT     = brush('#bfdbfe');
const STROKE_RECT = brush('#1d4ed8');
const BG_ELLIPSE  = brush('#bbf7d0');
const STROKE_ELL  = brush('#15803d');
const BG_NOTE     = brush('#fde68a');
const STROKE_NOTE = brush('#a16207');

const SELECT_STROKE     = brush('#f97316');
const PORT_FILL_IDLE    = brush('#94a3b8');
const PORT_FILL_HOVER   = brush('#1976d2');
const CONNECTOR_STROKE  = brush('#1f2937');
const GHOST_STROKE      = brush('#1976d2');
const PORT_BG           = brush('#ffffff');

const PORT_HIDE_DELAY_MS = 80;

const NODE_W   = 130;
const NODE_H   = 60;
const PORT_HIT = 14;

const KIND_INFO = {
    rect:    { fill: BG_RECT,    stroke: STROKE_RECT, label: 'Rectangle' },
    ellipse: { fill: BG_ELLIPSE, stroke: STROKE_ELL,  label: 'Ellipse'   },
    note:    { fill: BG_NOTE,    stroke: STROKE_NOTE, label: 'Note'      },
};

// ── NodeVM ──────────────────────────────────────────────────────────

export class NodeVM extends Model
{
    static {
        Model.RegisterProperty(NodeVM, 'Id',          '',        MetaData.None);
        Model.RegisterProperty(NodeVM, 'Kind',        '',        MetaData.None);
        Model.RegisterProperty(NodeVM, 'X',           0,         MetaData.None);
        Model.RegisterProperty(NodeVM, 'Y',           0,         MetaData.None);
        // IsSelected drives the per-shape DataTemplate's `when($IsSelected)`
        // trigger — flipping it re-skins the chrome BorderBrush/Stroke
        // on the materialized container without any VM-side derivation.
        Model.RegisterProperty(NodeVM, 'IsSelected',  false,     MetaData.None);
        Model.RegisterProperty(NodeVM, 'PortsVisible',false,     MetaData.None);
        Model.RegisterProperty(NodeVM, 'FillBrush',   undefined, MetaData.None);
        Model.RegisterProperty(NodeVM, 'LabelText',   '',        MetaData.None);
    }

    constructor(id, kind, x, y) {
        super();
        const info = KIND_INFO[kind];
        this._set_property_value_by_name('Id',          id);
        this._set_property_value_by_name('Kind',        kind);
        this._set_property_value_by_name('X',           x);
        this._set_property_value_by_name('Y',           y);
        this._set_property_value_by_name('FillBrush',   info.fill);
        this._set_property_value_by_name('LabelText',   info.label);
        // Plain (non-DP) fields: structural references the gesture
        // engine reads. Edges live as IDs to avoid cycles in
        // serialization.
        this.attachedEdgeIds = new Set();
        this.bodyHovered = false;
        this.hoveredPortCount = 0;
        this.hideTimer = null;
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

    OnPropertyChanged(d, ov, nv) {
        super.OnPropertyChanged(d, ov, nv);
    }
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
        // Refs kept as plain fields so they don't ride the DP machinery.
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
    }

    constructor(kind, label, swatch) {
        super();
        this._set_property_value_by_name('Kind',   kind);
        this._set_property_value_by_name('Label',  label);
        this._set_property_value_by_name('Swatch', swatch);
    }

    get Kind()   { return this._get_property_value_by_name('Kind'); }
    get Label()  { return this._get_property_value_by_name('Label'); }
    get Swatch() { return this._get_property_value_by_name('Swatch'); }
}

// ── Helpers ─────────────────────────────────────────────────────────

function hostTopLeft(visual) {
    let x = 0, y = 0, cur = visual;
    while (cur !== undefined) {
        const r = cur.ArrangedRect;
        x += r.X;
        y += r.Y;
        cur = cur.GetVisualParent();
    }
    return { x, y };
}

function portPositions(node) {
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
        Model.RegisterProperty(DiagramVM, 'Nodes',         undefined,                                    MetaData.None);
        Model.RegisterProperty(DiagramVM, 'Edges',         undefined,                                    MetaData.None);
        Model.RegisterProperty(DiagramVM, 'ToolboxShapes', undefined,                                    MetaData.None);
        Model.RegisterProperty(DiagramVM, 'Status',        'drag a shape from the toolbox →',       MetaData.None);
    }

    constructor() {
        super();
        this._set_property_value_by_name('Nodes', new ObservableCollection());
        this._set_property_value_by_name('Edges', new ObservableCollection());
        this._set_property_value_by_name('ToolboxShapes', [
            new ToolboxShapeVM('rect',    'Rectangle', brush('#1976d2')),
            new ToolboxShapeVM('ellipse', 'Ellipse',   brush('#1976d2')),
            new ToolboxShapeVM('note',    'Note',      brush('#fde68a')),
        ]);
        this._nextId = 1;
    }

    get Nodes()         { return this._get_property_value_by_name('Nodes'); }
    get Edges()         { return this._get_property_value_by_name('Edges'); }
    get ToolboxShapes() { return this._get_property_value_by_name('ToolboxShapes'); }
    get Status()        { return this._get_property_value_by_name('Status'); }
    set Status(v)       { this._set_property_value_by_name('Status', v); }

    OnViewMounted(view) {
        const canvas  = view.FindName('canvas');
        const surface = view.FindName('surface');
        const toolbox = view.FindName('toolbox');
        const nodesIC = view.FindName('nodes');
        const edgesIC = view.FindName('edges');

        if (!(canvas instanceof Canvas))         throw new Error('diagram.mu missing x:name="canvas"');
        if (surface === undefined)               throw new Error('diagram.mu missing x:name="surface"');
        if (!(toolbox instanceof ItemsControl))  throw new Error('diagram.mu missing x:name="toolbox" ItemsControl');
        if (!(nodesIC instanceof ItemsControl))  throw new Error('diagram.mu missing x:name="nodes" ItemsControl');
        if (!(edgesIC instanceof ItemsControl))  throw new Error('diagram.mu missing x:name="edges" ItemsControl');

        // Tile + shape DataTemplate selection. Toolbox tiles share one
        // template; nodes dispatch by kind. Templates are merged into
        // Application.current.Resources by the demo's factory before VM
        // construction, so they're resolvable here.
        const res = Application.current.Resources;
        const tileTemplate    = res.Resolve('DiagramTileTemplate');
        const rectTemplate    = res.Resolve('DiagramRectTemplate');
        const ellipseTemplate = res.Resolve('DiagramEllipseTemplate');
        const noteTemplate    = res.Resolve('DiagramNoteTemplate');
        const edgeTemplate    = res.Resolve('DiagramEdgeTemplate');

        toolbox.ItemTemplate = tileTemplate;
        edgesIC.ItemTemplate = edgeTemplate;
        nodesIC.ItemTemplateSelector = (item) => {
            if (!(item instanceof NodeVM)) return undefined;
            switch (item.Kind) {
                case 'rect':    return rectTemplate;
                case 'ellipse': return ellipseTemplate;
                case 'note':    return noteTemplate;
                default:        return rectTemplate;
            }
        };

        // ── Canvas-local coordinate cache ─────────────────────────
        let canvasOrigin = null;
        const canvasLocal = (args) => {
            if (canvasOrigin === null) canvasOrigin = hostTopLeft(canvas);
            return { x: args.HostX - canvasOrigin.x, y: args.HostY - canvasOrigin.y };
        };
        const canvasLocalFromHost = (hostX, hostY) => {
            if (canvasOrigin === null) canvasOrigin = hostTopLeft(canvas);
            return { x: hostX - canvasOrigin.x, y: hostY - canvasOrigin.y };
        };
        const invalidateCanvasOrigin = () => { canvasOrigin = null; };

        // ── Selection ──────────────────────────────────────────────
        let selectedNode = null;
        const selectNode = (node) => {
            if (selectedNode === node) return;
            if (selectedNode !== null) selectedNode.IsSelected = false;
            selectedNode = node;
            if (node !== null) node.IsSelected = true;
        };

        // ── Hit test (in-canvas coords) ────────────────────────────
        const hitTestNode = (x, y) => {
            const nodes = this.Nodes;
            for (let i = nodes.Count - 1; i >= 0; i--) {
                const n = nodes.Get(i);
                if (x >= n.X && x <= n.X + NODE_W && y >= n.Y && y <= n.Y + NODE_H) return n;
            }
            return null;
        };

        // ── Edge layout (recompute endpoints) ──────────────────────
        const layoutEdge = (edge) => {
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
            edge.X1 = ap[ai].x;
            edge.Y1 = ap[ai].y;
            edge.X2 = bp[bi].x;
            edge.Y2 = bp[bi].y;
        };

        // Maintain edge endpoints when a node moves. Subscribe per node
        // when it's added, unsubscribe when it's removed.
        const edgesById = new Map();
        const nodeMoveSubs = new Map();   // node → unsubscribe fn
        const onNodeMoved = (node) => {
            for (const eid of node.attachedEdgeIds) {
                const edge = edgesById.get(eid);
                if (edge !== undefined) layoutEdge(edge);
            }
            // Move the node's ports too — they're materialized inside
            // the node container and inherit Canvas.Left/Top from the
            // container automatically, so nothing else to do for ports.
        };

        // True while a port→port wire drag is in flight. Used to
        // suppress hover-highlight on the source port and to gate the
        // node-container drop-target's accept logic (a wire-in-flight
        // doesn't accept body-move drops).
        let isPortBusy = false;

        // ── Port wiring (post-realize) ─────────────────────────────
        //
        // After a node is materialized inside the ItemsControl, the
        // shape DataTemplate's Canvas (x:root) owns a NameScope with
        // four ports registered as port0..port3. We walk the new
        // container, find each port, and wire pointer handlers + cache
        // a back-reference so PortsVisible/hover state can directly
        // mutate the port visuals.
        const portsByNode = new Map();    // node → [{ border, dot }, …]
        const setPortsVisible = (node, visible) => {
            const ports = portsByNode.get(node);
            if (ports === undefined) return;
            for (const p of ports) {
                if (visible) {
                    p.border.Background  = PORT_BG;
                    p.border.BorderBrush = PORT_FILL_IDLE;
                    p.dot.Fill           = PORT_FILL_IDLE;
                } else {
                    p.border.Background  = undefined;
                    p.border.BorderBrush = undefined;
                    p.dot.Fill           = undefined;
                }
            }
            node.PortsVisible = visible;
        };

        const refreshNodeActive = (node) => {
            const active = node.bodyHovered || node.hoveredPortCount > 0;
            if (active) {
                if (node.hideTimer !== null) {
                    clearTimeout(node.hideTimer);
                    node.hideTimer = null;
                }
                if (!node.PortsVisible) setPortsVisible(node, true);
            } else if (node.PortsVisible && node.hideTimer === null) {
                node.hideTimer = setTimeout(() => {
                    node.hideTimer = null;
                    if (!(node.bodyHovered || node.hoveredPortCount > 0)) {
                        setPortsVisible(node, false);
                    }
                }, PORT_HIDE_DELAY_MS);
            }
        };

        const wirePortsForNode = (node) => {
            // Container generated by nodesIC for this NodeVM is a
            // ContentPresenter; its visual child is the shape template's
            // root (a Canvas carrying the NameScope).
            const container = nodesIC.Generator.ContainerFromItem(node);
            if (container === undefined) return;
            const templateRoot = container.visualChildren[0];
            if (templateRoot === undefined) return;
            const ports = [];
            for (let i = 0; i < 4; i++) {
                const border = templateRoot.FindName('port' + i);
                const dot    = templateRoot.FindName('dot' + i);
                if (border === undefined || dot === undefined) continue;
                ports.push({ border, dot, side: i });

                border.AddRoutedEventListener('PointerEnter', () => {
                    node.hoveredPortCount++;
                    refreshNodeActive(node);
                    if (!isPortBusy && node.PortsVisible) {
                        border.BorderBrush = PORT_FILL_HOVER;
                        dot.Fill = PORT_FILL_HOVER;
                    }
                });
                border.AddRoutedEventListener('PointerLeave', () => {
                    if (node.hoveredPortCount > 0) node.hoveredPortCount--;
                    refreshNodeActive(node);
                    if (node.PortsVisible) {
                        border.BorderBrush = PORT_FILL_IDLE;
                        dot.Fill = PORT_FILL_IDLE;
                    }
                });
                border.AddRoutedEventListener('PointerDown', (args) => {
                    args.Handled = true;
                    // Port → port wire. We render the rubber-band line
                    // ourselves (mode B: preview=null) using the
                    // session.OnMove callback as the cursor-follow seam.
                    const positions = portPositions(node);
                    const origin = canvasLocal(args);
                    const ghost = new Line();
                    ghost.Stroke = GHOST_STROKE;
                    ghost.StrokeThickness = 2;
                    Canvas.SetLeft(ghost, 0);
                    Canvas.SetTop (ghost, 0);
                    canvas.AddChild(ghost);
                    ghost.X1 = positions[i].x;
                    ghost.Y1 = positions[i].y;
                    ghost.X2 = origin.x;
                    ghost.Y2 = origin.y;

                    const session = args.BeginDragDrop(
                        new DataObject().Set(FMT_PORT,
                            { nodeId: node.Id, side: i, fromX: positions[i].x, fromY: positions[i].y }),
                        DragDropEffects.Link,
                        { preview: null },                          // mode B
                    );
                    isPortBusy = true;
                    this.Status = 'Drop on a node to connect, or release outside to cancel.';
                    session.OnMove((hostX, hostY) => {
                        const p = canvasLocalFromHost(hostX, hostY);
                        ghost.X2 = p.x;
                        ghost.Y2 = p.y;
                    });
                    session.then((effect) => {
                        canvas.RemoveChild(ghost);
                        isPortBusy = false;
                        if (effect === DragDropEffects.None) {
                            this.Status = 'Connection cancelled.';
                        }
                    });
                });
            }
            portsByNode.set(node, ports);
            // Default state: hidden until hovered.
            setPortsVisible(node, false);

            // ── Container as drag source for body move ─────────────
            // IsDraggable makes the framework install the threshold
            // latch on PointerDown/Move/Up. A click without movement
            // stays a click (selection still fires from the canvas
            // PointerDown listener, which runs alongside the latch).
            container.IsDraggable = true;
            container.OnDragStart = () => ({
                data: new DataObject().Set(FMT_NODE_MOVE, { nodeId: node.Id }),
                effects: DragDropEffects.Move,
            });
        };

        // ── Edge-management ────────────────────────────────────────
        const addEdge = (fromNode, toNode) => {
            if (fromNode === toNode) return null;
            for (const eid of fromNode.attachedEdgeIds) {
                const e = edgesById.get(eid);
                if (e !== undefined && (e.fromNode === toNode || e.toNode === toNode)) return e;
            }
            const id = 'e' + this._nextId++;
            const edge = new EdgeVM(id, fromNode, toNode);
            layoutEdge(edge);
            edgesById.set(id, edge);
            this.Edges.Add(edge);
            return edge;
        };

        // ── Node-management ────────────────────────────────────────
        const addNode = (kind, x, y) => {
            const id = 'n' + this._nextId++;
            const node = new NodeVM(id, kind, x, y);
            // Subscribe to X/Y so attached edges re-layout when the node
            // moves. Stash the unsubscribe under the node for cleanup.
            const onChanged = (d) => {
                if (d.Name === 'X' || d.Name === 'Y') onNodeMoved(node);
            };
            node._add_property_changed_listener_by_name('X', onChanged);
            node._add_property_changed_listener_by_name('Y', onChanged);
            nodeMoveSubs.set(node, () => {
                node._remove_property_changed_listener_by_name('X', onChanged);
                node._remove_property_changed_listener_by_name('Y', onChanged);
            });
            this.Nodes.Add(node);
            // ItemsControl's incremental insert is synchronous — the
            // container exists by the time Add returns.
            wirePortsForNode(node);
            return node;
        };

        const removeEdge = (edge) => {
            edge.fromNode.attachedEdgeIds.delete(edge.Id);
            edge.toNode.attachedEdgeIds.delete(edge.Id);
            this.Edges.Remove(edge);
            edgesById.delete(edge.Id);
        };

        const removeNode = (node) => {
            if (node.hideTimer !== null) {
                clearTimeout(node.hideTimer);
                node.hideTimer = null;
            }
            for (const eid of [...node.attachedEdgeIds]) {
                const e = edgesById.get(eid);
                if (e !== undefined) removeEdge(e);
            }
            const unsub = nodeMoveSubs.get(node);
            if (unsub !== undefined) { unsub(); nodeMoveSubs.delete(node); }
            portsByNode.delete(node);
            this.Nodes.Remove(node);
            if (selectedNode === node) selectedNode = null;
        };

        const deleteSelected = () => {
            if (selectedNode === null) return;
            const kind = selectedNode.Kind;
            removeNode(selectedNode);
            this.Status = `Deleted ${kind}. ${this.Nodes.Count} nodes, ${this.Edges.Count} edges.`;
        };

        // ── Canvas hover-track for port reveal ─────────────────────
        //
        // Now decoupled from gestures — body hover only drives port
        // visibility. The drag pipeline (DragOver / Drop) handles
        // create / move / connect entirely.
        canvas.AddRoutedEventListener('PointerMove', (args) => {
            const p = canvasLocal(args);
            const overNode = hitTestNode(p.x, p.y);
            for (let i = 0; i < this.Nodes.Count; i++) {
                const node = this.Nodes.Get(i);
                const hovered = node === overNode;
                if (hovered !== node.bodyHovered) {
                    node.bodyHovered = hovered;
                    refreshNodeActive(node);
                }
            }
        });

        canvas.AddRoutedEventListener('PointerLeave', () => {
            for (let i = 0; i < this.Nodes.Count; i++) {
                const node = this.Nodes.Get(i);
                if (node.bodyHovered) {
                    node.bodyHovered = false;
                    refreshNodeActive(node);
                }
            }
        });

        // ── Click-to-select (no drag-move; that's now declarative) ─
        canvas.AddRoutedEventListener('PointerDown', (args) => {
            if (args.Handled) return;
            const p = canvasLocal(args);
            const hit = hitTestNode(p.x, p.y);
            if (hit === null) return;
            selectNode(hit);
            // Don't mark Handled — the declarative IsDraggable latch
            // on the node container also listens for PointerDown to
            // arm; we want both to fire.
        });

        surface.AddRoutedEventListener('PointerDown', (args) => {
            if (args.Source === surface) selectNode(null);
        });

        // ── Canvas as the single drop target ────────────────────────
        //
        // Canvas accepts all three drag formats:
        //   FMT_NODE_KIND — toolbox tile → place a new node
        //   FMT_NODE_MOVE — existing node → reposition
        //   FMT_PORT      — port → another node (uses hitTestNode to
        //                   find the target node under the cursor)
        // Keeping canvas as the only AllowDrop=true Visual avoids the
        // findAllowDropAncestor gotcha where a node container would
        // hijack create / move drops.
        canvas.AllowDrop = true;
        canvas.AddRoutedEventListener('DragOver', (args) => {
            const p = canvasLocal(args);
            if (args.Data.Has(FMT_NODE_KIND)) { args.Effect = DragDropEffects.Copy; return; }
            if (args.Data.Has(FMT_NODE_MOVE)) { args.Effect = DragDropEffects.Move; return; }
            if (args.Data.Has(FMT_PORT))
            {
                const port = args.Data.Get(FMT_PORT);
                const overNode = hitTestNode(p.x, p.y);
                // Accept Link only when over a different node — over
                // the source node or empty canvas the cursor reads
                // 'not-allowed'.
                if (overNode !== null && overNode.Id !== port.nodeId)
                {
                    args.Effect = DragDropEffects.Link;
                }
            }
        });
        canvas.AddRoutedEventListener('Drop', (args) => {
            const p = canvasLocal(args);
            if (args.Data.Has(FMT_NODE_KIND))
            {
                const kind = args.Data.Get(FMT_NODE_KIND);
                const node = addNode(kind, p.x - NODE_W / 2, p.y - NODE_H / 2);
                selectNode(node);
                this.Status = `Placed ${kind}. ${this.Nodes.Count} nodes, ${this.Edges.Count} edges.`;
                return;
            }
            if (args.Data.Has(FMT_NODE_MOVE))
            {
                const { nodeId } = args.Data.Get(FMT_NODE_MOVE);
                const node = this.Nodes.toArray().find((n) => n.Id === nodeId);
                if (node === undefined) return;
                node.X = p.x - NODE_W / 2;
                node.Y = p.y - NODE_H / 2;
                this.Status = `Moved ${node.Kind}. ${this.Nodes.Count} nodes, ${this.Edges.Count} edges.`;
                return;
            }
            if (args.Data.Has(FMT_PORT))
            {
                const port = args.Data.Get(FMT_PORT);
                const overNode = hitTestNode(p.x, p.y);
                if (overNode === null || overNode.Id === port.nodeId) return;
                const fromNode = this.Nodes.toArray().find((n) => n.Id === port.nodeId);
                if (fromNode === undefined) return;
                addEdge(fromNode, overNode);
                this.Status = `Connected. ${this.Nodes.Count} nodes, ${this.Edges.Count} edges.`;
            }
        });

        // ── Toolbox tiles as declarative drag sources ───────────────
        //
        // IsDraggable + OnDragStart replaces the old PointerDown
        // gesture-start. The framework reads the threshold (default
        // 4px) so a normal tap doesn't start a drag.
        for (let i = 0; i < this.ToolboxShapes.length; i++) {
            const shape = this.ToolboxShapes[i];
            const tile = toolbox.Generator.ContainerFromItem(shape);
            if (tile === undefined) continue;
            tile.IsDraggable = true;
            tile.OnDragStart = () => ({
                data:    new DataObject().Set(FMT_NODE_KIND, shape.Kind),
                effects: DragDropEffects.Copy,
            });
        }

        // ── Save / Load to localStorage ────────────────────────────
        const serialize = () => {
            const nodeRows = [];
            for (let i = 0; i < this.Nodes.Count; i++) {
                const n = this.Nodes.Get(i);
                nodeRows.push({ id: n.Id, kind: n.Kind, x: n.X, y: n.Y });
            }
            const edgeRows = [];
            for (let i = 0; i < this.Edges.Count; i++) {
                const e = this.Edges.Get(i);
                edgeRows.push({ id: e.Id, from: e.fromNode.Id, to: e.toNode.Id });
            }
            return { nodes: nodeRows, edges: edgeRows, nextId: this._nextId };
        };

        const clearAll = () => {
            for (let i = this.Nodes.Count - 1; i >= 0; i--) {
                removeNode(this.Nodes.Get(i));
            }
        };

        const deserialize = (payload) => {
            if (payload === null || typeof payload !== 'object') return;
            clearAll();
            const byOldId = new Map();
            for (const n of payload.nodes ?? []) {
                const node = addNode(n.kind, n.x, n.y);
                byOldId.set(n.id, node);
            }
            for (const e of payload.edges ?? []) {
                const from = byOldId.get(e.from);
                const to   = byOldId.get(e.to);
                if (from !== undefined && to !== undefined) addEdge(from, to);
            }
        };

        const save = () => {
            try {
                const json = JSON.stringify(serialize());
                window.localStorage.setItem(STORAGE_KEY, json);
                this.Status = `Saved ${this.Nodes.Count} nodes, ${this.Edges.Count} edges to localStorage.`;
            } catch (e) {
                this.Status = `Save failed: ${e?.message ?? String(e)}`;
            }
        };

        const load = () => {
            try {
                const json = window.localStorage.getItem(STORAGE_KEY);
                if (json === null) {
                    this.Status = 'Nothing saved yet — try Save first.';
                    return;
                }
                deserialize(JSON.parse(json));
                this.Status = `Loaded ${this.Nodes.Count} nodes, ${this.Edges.Count} edges from localStorage.`;
            } catch (e) {
                this.Status = `Load failed: ${e?.message ?? String(e)}`;
            }
        };

        const btnSave = view.FindName('btnSave');
        const btnLoad = view.FindName('btnLoad');
        if (btnSave instanceof Button) btnSave.AddClickHandler(save);
        if (btnLoad instanceof Button) btnLoad.AddClickHandler(load);

        const onKeyDown = (e) => {
            if (selectedNode === null) return;
            if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                deleteSelected();
            }
        };
        document.addEventListener('keydown', onKeyDown);

        // Seed two nodes + one connector so the demo isn't empty on open.
        queueMicrotask(() => {
            invalidateCanvasOrigin();
            const a = addNode('rect',    60, 60);
            const b = addNode('ellipse', 320, 180);
            const c = addNode('note',    160, 260);
            addEdge(a, b);
            addEdge(b, c);
            this.Status = `Ready. ${this.Nodes.Count} nodes, ${this.Edges.Count} edges. Drag a shape from the toolbox →`;
        });
    }
}

