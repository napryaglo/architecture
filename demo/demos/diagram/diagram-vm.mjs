// DiagramVM — Visio-/drawio-style diagrammer state. All gesture logic
// lives here; OnViewMounted resolves the canvas / surface / status /
// toolbox visuals from the freshly-applied template and wires the
// pointer pipeline. Storage (localStorage save/load) hangs off the
// toolbar Save / Load buttons.
//
// The original demo set this up imperatively from the platform shell;
// hoisting it onto the VM lets the platform stay pure-MVVM (Content =
// vmInstance; everything else flows through the bound view).
import { Model } from '@visualisation-sub/mural/runtime';
import {
    Border, Button, Canvas, DataTemplate, Ellipse, ItemsControl, Line, Orientation,
    StackPanel, TextBlock,
} from '@visualisation-sub/mural/Controls';
import { SolidColorBrush } from '@visualisation-sub/mural/visual-engine';
import { Color, Setter, Style, Thickness } from '@visualisation-sub/mural/runtime';

const STORAGE_KEY = 'diagram-demo-state-v1';

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
// Transparent fill used as a hit-test catcher on the ellipse node's
// outer Border. Fill alpha = 0 still paints an SVG <rect fill="…"/>,
// which elementsFromPoint counts as hit-testable under the default
// pointer-events="visiblePainted" rule. The result: the entire 130×60
// node bbox catches clicks, even outside the visible ellipse's curve.
const HIT_CATCHER       = new SolidColorBrush(new Color(0, 0, 0, 0));

const PORT_HIDE_DELAY_MS = 80;

const NODE_W = 130;
const NODE_H = 60;
const PORT_R = 5;
const PORT_HIT = 14;

const KIND_INFO = {
    rect:    { bg: BG_RECT,    stroke: STROKE_RECT, corner: 4,   label: 'Rectangle' },
    ellipse: { bg: BG_ELLIPSE, stroke: STROKE_ELL,  corner: 0,   label: 'Ellipse'   },
    note:    { bg: BG_NOTE,    stroke: STROKE_NOTE, corner: 2,   label: 'Note'      },
};

const TOOLBOX_SHAPES = [
    { kind: 'rect',    label: 'Rectangle', swatch: brush('#1976d2') },
    { kind: 'ellipse', label: 'Ellipse',   swatch: brush('#1976d2') },
    { kind: 'note',    label: 'Note',      swatch: brush('#fde68a') },
];

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

export class DiagramVM extends Model
{
    OnViewMounted(view) {
        const canvas    = view.FindName('canvas');
        const surface   = view.FindName('surface');
        const status    = view.FindName('status');
        const toolbox   = view.FindName('toolbox');

        if (!(canvas instanceof Canvas))        throw new Error('diagram.mu missing x:name="canvas"');
        if (surface === undefined)              throw new Error('diagram.mu missing x:name="surface"');
        if (!(toolbox instanceof ItemsControl)) throw new Error('diagram.mu missing x:name="toolbox" ItemsControl');

        let gesture = null;

        const nodes = new Map();
        const edges = new Map();
        let   nextId = 1;
        let   selectedNode = null;

        function setStatus(text) {
            if (status instanceof TextBlock) status.Text = text;
        }

        function makeNodeVisual(kind) {
            const info = KIND_INFO[kind];
            const label = new TextBlock();
            label.Text = info.label;
            label.FontSize = 13;
            label.Foreground = INK;
            label.HorizontalAlignment = 'center';
            label.VerticalAlignment = 'center';

            if (kind === 'ellipse') {
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

                const outer = new Border();
                outer.Background = HIT_CATCHER;
                outer.Width  = NODE_W;
                outer.Height = NODE_H;
                outer.SetChild(inner);
                return { container: outer, fill: e, stroke: e };
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

        function setPortsVisible(node, visible) {
            for (const p of node.ports) {
                if (visible) {
                    p.visual.Background  = PORT_BG;
                    p.visual.BorderBrush = PORT_FILL_IDLE;
                    p.dot.Fill           = PORT_FILL_IDLE;
                } else {
                    p.visual.Background  = undefined;
                    p.visual.BorderBrush = undefined;
                    p.dot.Fill           = undefined;
                }
            }
            node.portsVisible = visible;
        }

        function refreshNodeActive(node) {
            const active = node.bodyHovered || node.hoveredPortCount > 0;
            if (active) {
                if (node.hideTimer !== null) {
                    clearTimeout(node.hideTimer);
                    node.hideTimer = null;
                }
                if (!node.portsVisible) setPortsVisible(node, true);
            } else if (node.portsVisible && node.hideTimer === null) {
                node.hideTimer = setTimeout(() => {
                    node.hideTimer = null;
                    if (!(node.bodyHovered || node.hoveredPortCount > 0)) {
                        setPortsVisible(node, false);
                    }
                }, PORT_HIDE_DELAY_MS);
            }
        }

        function placePortsForNode(node) {
            const positions = portPositions(node);
            for (let i = 0; i < 4; i++) {
                const port = new Border();
                port.Width = PORT_HIT;
                port.Height = PORT_HIT;
                port.CornerRadius = PORT_HIT / 2;
                port.BorderThickness = new Thickness(2);
                const dot = new Ellipse();
                dot.Width  = PORT_R * 2;
                dot.Height = PORT_R * 2;
                port.SetChild(dot);
                Canvas.SetLeft(port, positions[i].x - PORT_HIT / 2);
                Canvas.SetTop (port, positions[i].y - PORT_HIT / 2);
                canvas.AddChild(port);

                node.ports.push({ visual: port, dot, side: i });

                port.AddRoutedEventListener('PointerEnter', () => {
                    node.hoveredPortCount++;
                    refreshNodeActive(node);
                    if (gesture === null && node.portsVisible) {
                        port.BorderBrush = PORT_FILL_HOVER;
                        dot.Fill = PORT_FILL_HOVER;
                    }
                });
                port.AddRoutedEventListener('PointerLeave', () => {
                    if (node.hoveredPortCount > 0) node.hoveredPortCount--;
                    refreshNodeActive(node);
                    if (node.portsVisible) {
                        port.BorderBrush = PORT_FILL_IDLE;
                        dot.Fill = PORT_FILL_IDLE;
                    }
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
                    updateGhostLine(origin.x, origin.y);
                    setStatus('Drop on a node to connect, or release outside to cancel.');
                });
            }
        }

        function portPositions(node) {
            const x = node.x, y = node.y, w = node.w, h = node.h;
            return [
                { x: x + w / 2, y: y         },
                { x: x + w,     y: y + h / 2 },
                { x: x + w / 2, y: y + h     },
                { x: x,         y: y + h / 2 },
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
                bodyHovered: false,
                hoveredPortCount: 0,
                portsVisible: false,
                hideTimer: null,
            };
            canvas.AddChild(built.container);
            Canvas.SetLeft(built.container, x);
            Canvas.SetTop (built.container, y);
            nodes.set(id, node);
            commitNode(node);
            return node;
        }

        function hitTestNode(x, y) {
            const arr = [...nodes.values()];
            for (let i = arr.length - 1; i >= 0; i--) {
                const n = arr[i];
                if (x >= n.x && x <= n.x + n.w && y >= n.y && y <= n.y + n.h) return n;
            }
            return null;
        }

        function layoutEdge(edge) {
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
        }

        function addEdge(fromNode, toNode) {
            if (fromNode === toNode) return null;
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
            canvas.AddChild(line);
            const edge = { id, fromNode, toNode, line };
            edges.set(id, edge);
            fromNode.edges.add(id);
            toNode.edges.add(id);
            layoutEdge(edge);
            return edge;
        }

        let canvasOrigin = null;
        function canvasLocal(args) {
            if (canvasOrigin === null) canvasOrigin = hostTopLeft(canvas);
            return { x: args.HostX - canvasOrigin.x, y: args.HostY - canvasOrigin.y };
        }
        function invalidateCanvasOrigin() { canvasOrigin = null; }

        canvas.AddRoutedEventListener('PointerMove', (args) => {
            const p = canvasLocal(args);
            const overNode = hitTestNode(p.x, p.y);
            for (const node of nodes.values()) {
                const hovered = node === overNode;
                if (hovered !== node.bodyHovered) {
                    node.bodyHovered = hovered;
                    refreshNodeActive(node);
                }
            }

            if (gesture === null) return;
            args.Handled = true;
            if (gesture.kind === 'create') {
                placeNodeAt(gesture.node, p.x - gesture.dragOffsetX, p.y - gesture.dragOffsetY);
            } else if (gesture.kind === 'move') {
                placeNodeAt(gesture.node, p.x - gesture.pointerOffsetX, p.y - gesture.pointerOffsetY);
            } else if (gesture.kind === 'connect') {
                updateGhostLine(p.x, p.y);
            }
        });

        canvas.AddRoutedEventListener('PointerLeave', () => {
            for (const node of nodes.values()) {
                if (node.bodyHovered) {
                    node.bodyHovered = false;
                    refreshNodeActive(node);
                }
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

        canvas.AddRoutedEventListener('PointerDown', (args) => {
            if (gesture !== null || args.Handled) return;
            const p = canvasLocal(args);
            const hit = hitTestNode(p.x, p.y);
            if (hit === null) return;
            args.Handled = true;
            args.CapturePointer(canvas);
            selectNode(hit);
            gesture = {
                kind: 'move',
                node: hit,
                pointerOffsetX: p.x - hit.x,
                pointerOffsetY: p.y - hit.y,
            };
            setStatus(`Moving ${hit.kind}`);
        });

        surface.AddRoutedEventListener('PointerDown', (args) => {
            if (gesture !== null) return;
            if (args.Source === surface) selectNode(null);
        });

        // ── Toolbox ItemsControl wiring ────────────────────────────────
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

        // ── Delete + Save/Load ─────────────────────────────────────────

        function removeEdge(edge) {
            edge.fromNode.edges.delete(edge.id);
            edge.toNode.edges.delete(edge.id);
            canvas.RemoveChild(edge.line);
            edges.delete(edge.id);
        }

        function removeNode(node) {
            if (node.hideTimer !== null) {
                clearTimeout(node.hideTimer);
                node.hideTimer = null;
            }
            for (const eid of [...node.edges]) {
                const e = edges.get(eid);
                if (e !== undefined) removeEdge(e);
            }
            for (const port of node.ports) {
                canvas.RemoveChild(port.visual);
            }
            canvas.RemoveChild(node.container);
            nodes.delete(node.id);
            if (selectedNode === node) selectedNode = null;
        }

        function deleteSelected() {
            if (selectedNode === null) return;
            const kind = selectedNode.kind;
            removeNode(selectedNode);
            setStatus(`Deleted ${kind}. ${nodes.size} nodes, ${edges.size} edges.`);
        }

        function serialize() {
            const nodeRows = [];
            for (const n of nodes.values()) {
                nodeRows.push({ id: n.id, kind: n.kind, x: n.x, y: n.y });
            }
            const edgeRows = [];
            for (const e of edges.values()) {
                edgeRows.push({ id: e.id, from: e.fromNode.id, to: e.toNode.id });
            }
            return { nodes: nodeRows, edges: edgeRows, nextId };
        }

        function clearAll() {
            for (const n of [...nodes.values()]) removeNode(n);
        }

        function deserialize(payload) {
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
        }

        function save() {
            try {
                const json = JSON.stringify(serialize());
                window.localStorage.setItem(STORAGE_KEY, json);
                setStatus(`Saved ${nodes.size} nodes, ${edges.size} edges to localStorage.`);
            } catch (e) {
                setStatus(`Save failed: ${e?.message ?? String(e)}`);
            }
        }

        function load() {
            try {
                const json = window.localStorage.getItem(STORAGE_KEY);
                if (json === null) {
                    setStatus('Nothing saved yet — try Save first.');
                    return;
                }
                deserialize(JSON.parse(json));
                setStatus(`Loaded ${nodes.size} nodes, ${edges.size} edges from localStorage.`);
            } catch (e) {
                setStatus(`Load failed: ${e?.message ?? String(e)}`);
            }
        }

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
            setStatus(`Ready. ${nodes.size} nodes, ${edges.size} edges. Drag a shape from the toolbox →`);
        });
    }
}
