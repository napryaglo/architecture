// diagram demo — Visio-/drawio-/lucidchart-style diagrammer.
//
// The shell lives in diagram.mu (toolbox + canvas). All gesture state
// is here: drag-from-toolbox to create nodes, drag-on-canvas to move
// nodes, drag-from-port to wire connectors.
//
// Gesture state machine (one active gesture at a time, via pointer
// capture):
//
//   * 'create'  — toolbox tile PointerDown spawned a ghost node;
//                 PointerMove on the canvas tracks it under the
//                 cursor; PointerUp commits it as a permanent node.
//   * 'move'    — PointerDown on an existing node grabbed it;
//                 PointerMove updates its Canvas.Left/Top; PointerUp
//                 releases.
//   * 'connect' — PointerDown on a port spawned a ghost connector
//                 line; PointerMove rerouts it under the cursor;
//                 PointerUp wires it to the target node if the
//                 cursor is over one, else drops it.
//
// Coordinates: pointer events carry HostX/HostY in the
// PresentationTarget's content space. We translate to canvas-local
// coords by summing the canvas's ArrangedRect chain up to the root
// once per gesture (its position is stable for the lifetime of the
// gesture). Node positions are stored in canvas-local space.

import { app } from '../../diagram.mu.js';
import {
    Border, Canvas, DataTemplate, Ellipse, ItemsControl, Line, Orientation,
    StackPanel, TextBlock,
} from '@visualisation-sub/mural/Controls';
import { SolidColorBrush } from '@visualisation-sub/mural/visual-engine';
import { Color, Setter, Style, Thickness } from '@visualisation-sub/mural/runtime';
import { register } from '../registry.mjs';

// ── Visual constants ────────────────────────────────────────────────

const brush = (hex) => new SolidColorBrush(Color.FromHex(hex));

const BG_RECT      = brush('#bfdbfe');
const STROKE_RECT  = brush('#1d4ed8');
const BG_ELLIPSE   = brush('#bbf7d0');
const STROKE_ELL   = brush('#15803d');
const BG_NOTE      = brush('#fde68a');
const STROKE_NOTE  = brush('#a16207');
const INK          = brush('#1f2937');

const SELECT_STROKE     = brush('#f97316');
const PORT_FILL_IDLE    = brush('#94a3b8');
const PORT_FILL_HOVER   = brush('#1976d2');
const CONNECTOR_STROKE  = brush('#1f2937');
const GHOST_STROKE      = brush('#1976d2');
const PORT_BG           = brush('#ffffff');

const NODE_W = 130;
const NODE_H = 60;
const PORT_R = 5;           // visible port radius
const PORT_HIT = 14;        // hit-area side length

// Per-kind visual config.
const KIND_INFO = {
    rect:    { bg: BG_RECT,    stroke: STROKE_RECT, corner: 4,   label: 'Rectangle' },
    ellipse: { bg: BG_ELLIPSE, stroke: STROKE_ELL,  corner: 0,   label: 'Ellipse'   },
    note:    { bg: BG_NOTE,    stroke: STROKE_NOTE, corner: 2,   label: 'Note'      },
};

// Toolbox shape definitions. Each row is one tile in the left strip,
// driven through the ItemsControl bound to `toolbox`. Adding a fourth
// kind is a one-line push here (plus an entry in KIND_INFO + an
// addNode branch).
const TOOLBOX_SHAPES = [
    { kind: 'rect',    label: 'Rectangle', swatch: brush('#1976d2') },
    { kind: 'ellipse', label: 'Ellipse',   swatch: brush('#1976d2') },
    { kind: 'note',    label: 'Note',      swatch: brush('#fde68a') },
];

// ── Coord helpers ───────────────────────────────────────────────────

// Sum each ancestor's ArrangedRect offset up to the root — gives the
// visual's top-left in host (PresentationTarget) space. Used once per
// gesture to anchor canvas-local coords.
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

// ── Demo factory ────────────────────────────────────────────────────

let initialized = false;

register({
    id:       'diagram',
    group:    'Demos',
    title:    'Diagrammer',
    subtitle: 'Drag shapes from the toolbox; drag a node to move; drag a port to another node to wire them.',
    factory: () => {
        if (initialized) return app.Root;
        initialized = true;
        wireDiagram();
        return app.Root;
    },
});

// ── Wiring ──────────────────────────────────────────────────────────

function wireDiagram() {
    const canvas    = app.Root.FindName('canvas');
    const surface   = app.Root.FindName('surface');
    const status    = app.Root.FindName('status');
    const toolbox   = app.Root.FindName('toolbox');

    if (!(canvas instanceof Canvas))      throw new Error('diagram.mu missing x:name="canvas"');
    if (surface === undefined)            throw new Error('diagram.mu missing x:name="surface"');
    if (!(toolbox instanceof ItemsControl)) throw new Error('diagram.mu missing x:name="toolbox" ItemsControl');

    // Gesture state — at most one active at a time.
    let gesture = null;

    // Diagram data model.
    const nodes = new Map();    // id → NodeRecord
    const edges = new Map();    // id → EdgeRecord
    let   nextId = 1;
    let   selectedNode = null;

    function setStatus(text) {
        if (status instanceof TextBlock) status.Text = text;
    }

    // ── Node creation ──────────────────────────────────────────────

    function makeNodeVisual(kind) {
        const info = KIND_INFO[kind];
        const label = new TextBlock();
        label.Text = info.label;
        label.FontSize = 13;
        label.Foreground = INK;
        label.HorizontalAlignment = 'center';
        label.VerticalAlignment = 'center';

        if (kind === 'ellipse') {
            // For an Ellipse node, host the label inside a Border whose
            // background is transparent and place an Ellipse beneath via
            // sibling order in a Canvas — but a single Border with high
            // corner radius is a much simpler fake-ellipse. We use a true
            // Ellipse + label stacked in a tiny Canvas so the geometry
            // is actually elliptical and hit-tests roughly elliptical.
            const inner = new Canvas();
            const e = new Ellipse();
            e.Fill = info.bg;
            e.Stroke = info.stroke;
            e.StrokeThickness = 1.5;
            e.Width = NODE_W;
            e.Height = NODE_H;
            Canvas.SetLeft(e, 0);
            Canvas.SetTop(e, 0);
            inner.AddChild(e);
            label.Width = NODE_W;
            label.Height = NODE_H;
            Canvas.SetLeft(label, 0);
            Canvas.SetTop(label, 0);
            inner.AddChild(label);
            inner.Width = NODE_W;
            inner.Height = NODE_H;
            return { container: inner, fill: e, stroke: e };
        }

        const b = new Border();
        b.Background = info.bg;
        b.BorderBrush = info.stroke;
        b.BorderThickness = new Thickness(1.5);
        b.CornerRadius = info.corner;
        b.Width = NODE_W;
        b.Height = NODE_H;
        b.SetChild(label);
        return { container: b, fill: b, stroke: b };
    }

    function applySelection(node, selected) {
        if (node.stroke instanceof Border) {
            node.stroke.BorderBrush = selected ? SELECT_STROKE : node.kindInfo.stroke;
            node.stroke.BorderThickness = new Thickness(selected ? 2.5 : 1.5);
        } else if (node.stroke instanceof Ellipse) {
            node.stroke.Stroke = selected ? SELECT_STROKE : node.kindInfo.stroke;
            node.stroke.StrokeThickness = selected ? 2.5 : 1.5;
        }
    }

    function selectNode(node) {
        if (selectedNode === node) return;
        if (selectedNode !== null) applySelection(selectedNode, false);
        selectedNode = node;
        if (node !== null) applySelection(node, true);
    }

    function placePortsForNode(node) {
        // 4 ports at the midpoints of each edge. Stored as canvas
        // siblings (not node children) so they remain pickable when the
        // pointer leaves the node's body.
        const positions = portPositions(node);
        for (let i = 0; i < 4; i++) {
            const port = new Border();
            port.Width = PORT_HIT;
            port.Height = PORT_HIT;
            port.CornerRadius = PORT_HIT / 2;
            port.Background = PORT_BG;
            port.BorderBrush = PORT_FILL_IDLE;
            port.BorderThickness = new Thickness(2);
            const dot = new Ellipse();
            dot.Width = PORT_R * 2;
            dot.Height = PORT_R * 2;
            dot.Fill = PORT_FILL_IDLE;
            port.SetChild(dot);
            Canvas.SetLeft(port, positions[i].x - PORT_HIT / 2);
            Canvas.SetTop (port, positions[i].y - PORT_HIT / 2);
            canvas.AddChild(port);

            // PortRecord: side index (0=top,1=right,2=bottom,3=left)
            node.ports.push({ visual: port, dot, side: i });

            port.AddRoutedEventListener('PointerEnter', () => {
                if (gesture === null) {
                    port.BorderBrush = PORT_FILL_HOVER;
                    dot.Fill = PORT_FILL_HOVER;
                }
            });
            port.AddRoutedEventListener('PointerLeave', () => {
                port.BorderBrush = PORT_FILL_IDLE;
                dot.Fill = PORT_FILL_IDLE;
            });
            port.AddRoutedEventListener('PointerDown', (args) => {
                if (gesture !== null) return;
                args.Handled = true;
                args.CapturePointer(canvas);
                const origin = canvasLocal(args);
                const ghost = new Line();
                ghost.Stroke = GHOST_STROKE;
                ghost.StrokeThickness = 2;
                Canvas.SetLeft(ghost, 0);
                Canvas.SetTop(ghost, 0);
                canvas.AddChild(ghost);
                gesture = {
                    kind: 'connect',
                    fromNode: node,
                    fromSide: i,
                    ghost,
                    fromX: positions[i].x,
                    fromY: positions[i].y,
                };
                // Reset position-based fields each move (line covers
                // whole canvas in local space).
                updateGhostLine(origin.x, origin.y);
                setStatus('Drop on a node to connect, or release outside to cancel.');
            });
        }
    }

    function portPositions(node) {
        const x = node.x, y = node.y, w = node.w, h = node.h;
        return [
            { x: x + w / 2, y: y         },      // top
            { x: x + w,     y: y + h / 2 },      // right
            { x: x + w / 2, y: y + h     },      // bottom
            { x: x,         y: y + h / 2 },      // left
        ];
    }

    function refreshPorts(node) {
        const positions = portPositions(node);
        for (let i = 0; i < 4; i++) {
            const p = node.ports[i];
            Canvas.SetLeft(p.visual, positions[i].x - PORT_HIT / 2);
            Canvas.SetTop (p.visual, positions[i].y - PORT_HIT / 2);
        }
    }

    function refreshEdgesForNode(node) {
        for (const edgeId of node.edges) {
            const edge = edges.get(edgeId);
            if (edge !== undefined) layoutEdge(edge);
        }
    }

    function updateGhostLine(toX, toY) {
        if (gesture === null || gesture.kind !== 'connect') return;
        const g = gesture.ghost;
        g.X1 = gesture.fromX;
        g.Y1 = gesture.fromY;
        g.X2 = toX;
        g.Y2 = toY;
    }

    function commitNode(node) {
        // Wire node-level interactivity.
        node.container.AddRoutedEventListener('PointerDown', (args) => {
            if (gesture !== null) return;
            args.Handled = true;
            args.CapturePointer(canvas);
            const p = canvasLocal(args);
            selectNode(node);
            gesture = {
                kind: 'move',
                node,
                pointerOffsetX: p.x - node.x,
                pointerOffsetY: p.y - node.y,
            };
            setStatus(`Moving ${node.kind}`);
        });
        // Port handles (siblings of node on the canvas).
        node.ports = [];
        placePortsForNode(node);
    }

    function placeNodeAt(node, x, y) {
        node.x = x;
        node.y = y;
        Canvas.SetLeft(node.container, x);
        Canvas.SetTop (node.container, y);
        refreshPorts(node);
        refreshEdgesForNode(node);
    }

    function addNode(kind, x, y) {
        const id = `n${nextId++}`;
        const info = KIND_INFO[kind];
        const built = makeNodeVisual(kind);
        const node = {
            id, kind, kindInfo: info,
            container: built.container, fill: built.fill, stroke: built.stroke,
            x, y, w: NODE_W, h: NODE_H,
            ports: [], edges: new Set(),
        };
        canvas.AddChild(built.container);
        Canvas.SetLeft(built.container, x);
        Canvas.SetTop (built.container, y);
        nodes.set(id, node);
        commitNode(node);
        return node;
    }

    function hitTestNode(x, y) {
        // Last-added node wins (top of z-order) — iterate in reverse
        // insertion order.
        const arr = [...nodes.values()];
        for (let i = arr.length - 1; i >= 0; i--) {
            const n = arr[i];
            if (x >= n.x && x <= n.x + n.w && y >= n.y && y <= n.y + n.h) return n;
        }
        return null;
    }

    // ── Edges ──────────────────────────────────────────────────────

    function layoutEdge(edge) {
        // Pick the two closest port midpoints between fromNode and
        // toNode and draw a straight line. Line covers the whole canvas
        // in local space so we don't have to fiddle with positioning.
        const a = edge.fromNode;
        const b = edge.toNode;
        const ap = portPositions(a);
        const bp = portPositions(b);
        let best = Infinity, ai = 0, bi = 0;
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                const dx = ap[i].x - bp[j].x;
                const dy = ap[i].y - bp[j].y;
                const d = dx * dx + dy * dy;
                if (d < best) { best = d; ai = i; bi = j; }
            }
        }
        edge.line.X1 = ap[ai].x;
        edge.line.Y1 = ap[ai].y;
        edge.line.X2 = bp[bi].x;
        edge.line.Y2 = bp[bi].y;
        // Line's MeasureOverride sizes to max(X1,X2) × max(Y1,Y2) plus
        // stroke. Letting it size naturally avoids depending on the
        // canvas's ArrangedRect, which is 0×0 during the initial
        // seed pass (factory runs before layout has measured anything).
    }

    function addEdge(fromNode, toNode) {
        if (fromNode === toNode) return null;
        // No duplicate edges (either direction).
        for (const id of fromNode.edges) {
            const e = edges.get(id);
            if (e !== undefined && (e.fromNode === toNode || e.toNode === toNode)) return e;
        }
        const id = `e${nextId++}`;
        const line = new Line();
        line.Stroke = CONNECTOR_STROKE;
        line.StrokeThickness = 2;
        Canvas.SetLeft(line, 0);
        Canvas.SetTop(line, 0);
        // Insert connectors UNDER nodes by removing then re-adding nodes
        // on top. For simplicity we just add lines after nodes — visual
        // order in the Canvas is insertion order; later children paint
        // ON TOP of earlier ones. So connectors painted last appear
        // above nodes. That's fine for v1 (visible wiring); a later
        // pass can split layers via two Canvases stacked in a Border.
        canvas.AddChild(line);
        const edge = { id, fromNode, toNode, line };
        edges.set(id, edge);
        fromNode.edges.add(id);
        toNode.edges.add(id);
        layoutEdge(edge);
        return edge;
    }

    // ── Pointer plumbing on the canvas ─────────────────────────────

    let canvasOrigin = null;    // host-space top-left of the canvas
    function canvasLocal(args) {
        if (canvasOrigin === null) canvasOrigin = hostTopLeft(canvas);
        return { x: args.HostX - canvasOrigin.x, y: args.HostY - canvasOrigin.y };
    }
    function invalidateCanvasOrigin() { canvasOrigin = null; }

    canvas.AddRoutedEventListener('PointerMove', (args) => {
        if (gesture === null) return;
        args.Handled = true;
        const p = canvasLocal(args);
        if (gesture.kind === 'create') {
            placeNodeAt(gesture.node, p.x - gesture.dragOffsetX, p.y - gesture.dragOffsetY);
        } else if (gesture.kind === 'move') {
            placeNodeAt(gesture.node, p.x - gesture.pointerOffsetX, p.y - gesture.pointerOffsetY);
        } else if (gesture.kind === 'connect') {
            updateGhostLine(p.x, p.y);
        }
    });

    canvas.AddRoutedEventListener('PointerUp', (args) => {
        if (gesture === null) return;
        args.Handled = true;
        args.ReleasePointerCapture();
        const p = canvasLocal(args);
        if (gesture.kind === 'create') {
            setStatus(`Placed ${gesture.node.kind}. ${nodes.size} nodes, ${edges.size} edges.`);
        } else if (gesture.kind === 'move') {
            setStatus(`Moved ${gesture.node.kind}. ${nodes.size} nodes, ${edges.size} edges.`);
        } else if (gesture.kind === 'connect') {
            canvas.RemoveChild(gesture.ghost);
            const target = hitTestNode(p.x, p.y);
            if (target !== null && target !== gesture.fromNode) {
                addEdge(gesture.fromNode, target);
                setStatus(`Connected. ${nodes.size} nodes, ${edges.size} edges.`);
            } else {
                setStatus('Connection cancelled.');
            }
        }
        gesture = null;
    });

    // Click on the background grid (the `surface` Border behind the
    // Canvas) clears the selection. Empty Canvas areas don't paint, so
    // the hit-test surfaces the backdrop Border there — not the Canvas
    // itself. Node and port PointerDown handlers run first and set
    // args.Handled=true, so this only fires for genuine background hits.
    surface.AddRoutedEventListener('PointerDown', (args) => {
        if (gesture !== null) return;
        if (args.Source === surface) selectNode(null);
    });

    // ── Toolbox ItemsControl wiring ────────────────────────────────
    //
    // Each tile is a data-driven ItemsControl container. The outer
    // tile chrome (background, border, padding, margin) comes from
    // ItemContainerStyle so we don't repeat it across rows; the
    // DataTemplate fills the inside (swatch + label). After items
    // assignment, we walk the generator once to attach the create-
    // gesture PointerDown listener per container.

    toolbox.ItemsPanel = () => {
        const sp = new StackPanel();
        sp.Orientation = Orientation.Vertical;
        return sp;
    };

    toolbox.ItemContainerStyle = new Style(Border, [
        new Setter(Border, 'Background',      brush('#ffffff')),
        new Setter(Border, 'BorderBrush',     brush('#e2e8f0')),
        new Setter(Border, 'BorderThickness', new Thickness(1)),
        new Setter(Border, 'Padding',         new Thickness(8)),
        new Setter(Border, 'Margin',          new Thickness(0, 0, 0, 8)),
    ]);

    toolbox.ItemTemplate = new DataTemplate((shape) => {
        const tile = new Border();
        const row = new StackPanel();
        row.Orientation = Orientation.Horizontal;
        const swatch = new Border();
        swatch.Width = 28;
        swatch.Height = 18;
        swatch.Background = shape.swatch;
        swatch.Margin = new Thickness(0, 4, 8, 0);
        const label = new TextBlock();
        label.Text = shape.label;
        label.FontSize = 12;
        label.Foreground = brush('#1f2937');
        label.Margin = new Thickness(0, 6, 0, 0);
        row.AddChild(swatch);
        row.AddChild(label);
        tile.SetChild(row);
        return tile;
    });

    toolbox.Items = TOOLBOX_SHAPES;

    // Attach a create-gesture PointerDown listener per realized tile.
    // The ItemsControl materialized one container per shape on Items
    // assignment; we walk the generator's forward map to pair each
    // shape with its container without subclassing.
    for (const shape of TOOLBOX_SHAPES) {
        const tile = toolbox.Generator.ContainerFromItem(shape);
        if (tile === undefined) continue;
        tile.AddRoutedEventListener('PointerDown', (args) => {
            if (gesture !== null) return;
            args.Handled = true;
            args.CapturePointer(canvas);
            invalidateCanvasOrigin();
            const p = canvasLocal(args);
            const x = p.x - NODE_W / 2;
            const y = p.y - NODE_H / 2;
            const node = addNode(shape.kind, x, y);
            selectNode(node);
            gesture = {
                kind: 'create',
                node,
                dragOffsetX: NODE_W / 2,
                dragOffsetY: NODE_H / 2,
            };
            setStatus(`Creating ${shape.kind}…`);
        });
    }

    // Seed two nodes + one connector so the demo isn't empty on open.
    queueMicrotask(() => {
        invalidateCanvasOrigin();
        const a = addNode('rect',    60, 60);
        const b = addNode('ellipse', 320, 180);
        const c = addNode('note',    160, 260);
        addEdge(a, b);
        addEdge(b, c);
        setStatus(`Ready. ${nodes.size} nodes, ${edges.size} edges. Drag a shape from the toolbox →`);
    });
}
