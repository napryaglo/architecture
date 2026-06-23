import {
    Color,
    CornerRadius,
    Point,
    Rect,
    Size,
    type Visual,
    type PointerEventArgs,
    type ObservableCollection,
    type Model,
} from '../../../runtime/index.js';
import { Adorner, AdornerLayer, SolidColorBrush } from '../../../visual-engine/index.js';
import { Border } from '../../../basic/index.js';
import { Connector } from '../connector.js';
import { ConnectorCreateBehavior } from './connector-create-behavior.js';
import { ConnectorEditAdorner } from './connector-edit-adorner.js';
import { Figure } from '../figure.js';
import { Port, PortResolver } from '../port.js';
import { ConnectorEnd } from '../routing/router.js';
import type { Diagram } from '../diagram.js';

// Demo-grade interactive layer that turns the connector primitives into
// a working drag-create + edit experience. Mounts two adorners in the
// Diagram's ItemsPanel AdornerLayer and brokers pointer events between
// them and the underlying state machines (ConnectorCreateBehavior +
// ConnectorEditAdorner). Owned by Diagram and gated by the
// ConnectorInteractionsEnabled DP — same opt-in pattern as
// AlignmentGuidesEnabled and SelectionResizeEnabled.
//
// Three concerns inside this one behavior so they can share state
// (gesture machine + coord translation + hit-test helpers):
//
//   1. PortHandlesAdorner — while the cursor hovers a Figure, paint a
//      dot at each of its Ports. Hit-testable; PointerDown on a dot
//      starts a create gesture against (Figure, Port).
//   2. EditHandlesAdorner — for every connector in
//      Diagram.SelectedConnectors, paint endpoint + waypoint dots.
//      PointerDown on a dot starts the matching ConnectorEditAdorner
//      gesture (endpoint re-anchor or waypoint move).
//   3. Pointer wiring — single Diagram-level PointerDown / Move / Up
//      bundle. PointerDown classifies the target (port handle vs edit
//      handle vs connector body vs empty) and starts the matching
//      gesture; Move drives the active gesture or, when idle, updates
//      hover; Up commits / aborts / clears selection.

// ── Visual constants ─────────────────────────────────────────────
const PORT_HANDLE_SIZE  = 10;
const PORT_HIT_RADIUS   = 9;
const EP_HANDLE_SIZE    = 11;
const WP_HANDLE_SIZE    = 9;
const POOL_PORTS = 16;
const POOL_EPS   = 8;
const POOL_WPS   = 16;
const HIDE_OFFSCREEN = -10000;

// Proximity buffer for figure hover + drop-target detection. Cursor
// within this many DIPs of a figure's bbox edge counts as "near" the
// figure: port handles show, and a release lands a connector on it.
// Hover-show and drop-pick share the same threshold so visual feedback
// and commit semantics stay in lockstep — what lights up is what gets
// connected.
const FIGURE_PROXIMITY = 24;

const PORT_FILL = new SolidColorBrush(Color.FromHex('#1976d2'));
const EP_FILL   = new SolidColorBrush(Color.FromHex('#ff5722'));
const WP_FILL   = new SolidColorBrush(Color.FromHex('#ff9800'));

// ── Handle tagging via WeakMap ───────────────────────────────────
// Each handle visual gets a tag describing (kind + payload) so the
// PointerDown classifier can read what was clicked. WeakMap-keyed so
// detaching the adorner garbage-collects entries without manual cleanup.

type HandleTag =
    | { readonly kind: 'port';     readonly figure: Figure;   readonly port: Port | undefined }
    | { readonly kind: 'endpoint'; readonly connector: Connector; readonly end: ConnectorEnd }
    | { readonly kind: 'waypoint'; readonly connector: Connector; readonly index: number };

const HANDLE_TAGS: WeakMap<Visual, HandleTag> = new WeakMap();

// ── Shared hover state, kept in a closure ───────────────────────
interface SharedState
{
    hoveredFigure:    Figure   | undefined;
    activeGesture:    'create' | 'edit' | undefined;
    activePointerId:  number   | undefined;
    editKind:         'endpoint' | 'waypoint' | undefined;
}

// ── PortHandlesAdorner ───────────────────────────────────────────
class PortHandlesAdorner extends Adorner
{
    private readonly _state: SharedState;
    private readonly _pool: Border[] = [];

    constructor(adornedElement: Visual, state: SharedState, onHandleDown: HandleDownCallback)
    {
        super(adornedElement);
        this._state = state;
        // Adorner pad MUST be transparent. The default Placement override
        // sizes us to the full adorned rect (the whole panel); a true
        // here makes the mural-hit pad pointer-events="all" and intercepts
        // every figure-body click before Figure.OnPointerDown gets it.
        // The individual handle Borders below keep their own explicit
        // hit pads, so dots remain clickable per
        // [svg-renderer.ts:488-491](../../../../visual-engine/drawing/svg-renderer.ts#L488-L491).
        this.IsHitTestVisible = false;
        for (let i = 0; i < POOL_PORTS; i++)
        {
            const v = makeDot(PORT_HANDLE_SIZE, PORT_FILL);
            wireHandle(v, onHandleDown);
            this.AttachVisual(v);
            this._pool.push(v);
        }
    }

    public override get visualChildren(): Visual[] { return this._pool.slice(); }

    public override MeasureOverride(_avail: Size): Size
    {
        const big = new Size(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
        for (const v of this._pool) v.Measure(big);
        return Size.Zero;
    }

    public override ArrangeOverride(finalSize: Size): Size
    {
        const fig = this._state.hoveredFigure;
        const ports = (fig?.Ports) ?? [];
        const used  = Math.min(ports.length, this._pool.length);
        for (let i = 0; i < used; i++)
        {
            const p = ports[i]!;
            const r = PortResolver.resolve(p, fig!);
            const v = this._pool[i]!;
            HANDLE_TAGS.set(v, { kind: 'port', figure: fig!, port: p });
            v.Arrange(new Rect(
                r.x - PORT_HANDLE_SIZE / 2,
                r.y - PORT_HANDLE_SIZE / 2,
                PORT_HANDLE_SIZE, PORT_HANDLE_SIZE));
        }
        for (let i = used; i < this._pool.length; i++)
        {
            const v = this._pool[i]!;
            HANDLE_TAGS.delete(v);
            v.Arrange(new Rect(HIDE_OFFSCREEN, HIDE_OFFSCREEN, 0, 0));
        }
        return finalSize;
    }
}

// ── EditHandlesAdorner ───────────────────────────────────────────
class EditHandlesAdorner extends Adorner
{
    private readonly _diagram: Diagram;
    private readonly _epPool: Border[] = [];
    private readonly _wpPool: Border[] = [];

    constructor(adornedElement: Visual, diagram: Diagram, onHandleDown: HandleDownCallback)
    {
        super(adornedElement);
        this._diagram = diagram;
        // Adorner pad transparent — same rationale as PortHandlesAdorner.
        // Handle Borders below keep their own explicit hit pads.
        this.IsHitTestVisible = false;
        for (let i = 0; i < POOL_EPS; i++)
        {
            const v = makeDot(EP_HANDLE_SIZE, EP_FILL);
            wireHandle(v, onHandleDown);
            this.AttachVisual(v);
            this._epPool.push(v);
        }
        for (let i = 0; i < POOL_WPS; i++)
        {
            const v = makeDot(WP_HANDLE_SIZE, WP_FILL);
            wireHandle(v, onHandleDown);
            this.AttachVisual(v);
            this._wpPool.push(v);
        }
    }

    public override get visualChildren(): Visual[] { return [...this._epPool, ...this._wpPool]; }

    public override MeasureOverride(_avail: Size): Size
    {
        const big = new Size(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
        for (const v of this._epPool) v.Measure(big);
        for (const v of this._wpPool) v.Measure(big);
        return Size.Zero;
    }

    public override ArrangeOverride(finalSize: Size): Size
    {
        const selected = this._diagram.SelectedConnectors;
        const live = this._diagram.Connectors;
        let epUsed = 0, wpUsed = 0;
        for (const conn of selected)
        {
            if (!collectionContains(live, conn)) continue;
            const src = conn.CurrentSourceAnchor;
            const tgt = conn.CurrentTargetAnchor;
            if (src === undefined || tgt === undefined) continue;

            if (epUsed < this._epPool.length)
            {
                const v = this._epPool[epUsed++]!;
                HANDLE_TAGS.set(v, { kind: 'endpoint', connector: conn, end: ConnectorEnd.Source });
                v.Arrange(new Rect(
                    src.x - EP_HANDLE_SIZE / 2,
                    src.y - EP_HANDLE_SIZE / 2,
                    EP_HANDLE_SIZE, EP_HANDLE_SIZE));
            }
            if (epUsed < this._epPool.length)
            {
                const v = this._epPool[epUsed++]!;
                HANDLE_TAGS.set(v, { kind: 'endpoint', connector: conn, end: ConnectorEnd.Target });
                v.Arrange(new Rect(
                    tgt.x - EP_HANDLE_SIZE / 2,
                    tgt.y - EP_HANDLE_SIZE / 2,
                    EP_HANDLE_SIZE, EP_HANDLE_SIZE));
            }
            const wps = conn.Waypoints ?? [];
            for (let i = 0; i < wps.length && wpUsed < this._wpPool.length; i++)
            {
                const v = this._wpPool[wpUsed++]!;
                HANDLE_TAGS.set(v, { kind: 'waypoint', connector: conn, index: i });
                const p = wps[i]!;
                v.Arrange(new Rect(
                    p.X - WP_HANDLE_SIZE / 2,
                    p.Y - WP_HANDLE_SIZE / 2,
                    WP_HANDLE_SIZE, WP_HANDLE_SIZE));
            }
        }
        for (let i = epUsed; i < this._epPool.length; i++)
        {
            const v = this._epPool[i]!;
            HANDLE_TAGS.delete(v);
            v.Arrange(new Rect(HIDE_OFFSCREEN, HIDE_OFFSCREEN, 0, 0));
        }
        for (let i = wpUsed; i < this._wpPool.length; i++)
        {
            const v = this._wpPool[i]!;
            HANDLE_TAGS.delete(v);
            v.Arrange(new Rect(HIDE_OFFSCREEN, HIDE_OFFSCREEN, 0, 0));
        }
        return finalSize;
    }
}

// ── Helpers ──────────────────────────────────────────────────────

function makeDot(size: number, fill: SolidColorBrush): Border
{
    const v = new Border();
    v.Width  = size;
    v.Height = size;
    const r = size / 2;
    v.CornerRadius = new CornerRadius(r, r, r, r);
    v.Background   = fill;
    v.IsHitTestVisible = true;
    return v;
}

// Wire a single handle Border so its OWN bubble-phase PointerDown starts
// the matching gesture. Handle-level listeners are immune to Figure's
// args.Handled = true because the handle isn't a Figure descendant; the
// bubble walk for the handle's PointerDown runs handle → adorner →
// layer → ... → diagram, with no Figure in the route to short-circuit
// it. The listener is permanent for the visual's lifetime; the WeakMap
// tag set in ArrangeOverride tells us which (figure, port) / (connector,
// end) / (connector, index) the click belongs to right now.
type HandleDownCallback = (tag: HandleTag, args: PointerEventArgs) => void;

function wireHandle(handle: Visual, onDown: HandleDownCallback): void
{
    handle.AddRoutedEventListener('PointerDown', (raw: unknown): void => {
        const args = raw as PointerEventArgs;
        const tag = HANDLE_TAGS.get(handle);
        if (tag === undefined) return;
        onDown(tag, args);
    });
}

function findFigureAncestor(visual: unknown): Figure | undefined
{
    let cur = visual as Visual | undefined;
    while (cur !== undefined && cur !== null)
    {
        if (cur instanceof Figure) return cur;
        cur = (cur as { GetVisualParent?(): Visual | undefined }).GetVisualParent?.();
    }
    return undefined;
}

function findConnectorAncestor(visual: unknown): Connector | undefined
{
    let cur = visual as Visual | undefined;
    while (cur !== undefined && cur !== null)
    {
        if (cur instanceof Connector) return cur;
        cur = (cur as { GetVisualParent?(): Visual | undefined }).GetVisualParent?.();
    }
    return undefined;
}

function localPosition(args: PointerEventArgs, diagram: Diagram): Point
{
    const panel = diagram.ItemsPanelInstance;
    if (panel === undefined) return new Point(0, 0);
    let ox = 0, oy = 0;
    let cur: Visual | undefined = panel;
    while (cur !== undefined)
    {
        const r = cur.ArrangedRect;
        ox += r.X;
        oy += r.Y;
        cur = cur.GetVisualParent();
    }
    let sx = 0, sy = 0;
    cur = panel.GetVisualParent();
    while (cur !== undefined)
    {
        const hx = (cur as unknown as { HorizontalOffset?: unknown }).HorizontalOffset;
        const vy = (cur as unknown as { VerticalOffset?:   unknown }).VerticalOffset;
        if (typeof hx === 'number' && typeof vy === 'number')
        {
            sx = hx; sy = vy;
            break;
        }
        cur = cur.GetVisualParent();
    }
    return new Point(args.HostX - ox + sx, args.HostY - oy + sy);
}

function findFigureAtCanvasPoint(diagram: Diagram, p: Point): Figure | undefined
{
    const items = diagram.ItemsSource;
    if (items === undefined) return undefined;
    // Prefer figures whose true bbox contains the cursor (z-order
    // wins). Fall back to the nearest figure within FIGURE_PROXIMITY
    // when the cursor is outside every bbox — that's the "near"
    // pick used during a drag so target port handles appear without
    // the user having to land precisely on the figure body.
    let bestInside: Figure | undefined = undefined;
    let bestInsideZ = -1;
    let bestNear: Figure | undefined = undefined;
    let bestNearDist = FIGURE_PROXIMITY;
    let z = 0;
    for (const item of items as Iterable<unknown>)
    {
        const container = diagram.Generator.ContainerFromItem(item);
        if (container instanceof Figure)
        {
            const r = container.ArrangedRect;
            if (r !== undefined)
            {
                const left   = container.Left;
                const top    = container.Top;
                const right  = left + r.Width;
                const bottom = top  + r.Height;
                if (p.X >= left && p.X <= right && p.Y >= top && p.Y <= bottom)
                {
                    if (z >= bestInsideZ) { bestInside = container; bestInsideZ = z; }
                }
                else
                {
                    const dx = Math.max(left - p.X, 0, p.X - right);
                    const dy = Math.max(top  - p.Y, 0, p.Y - bottom);
                    const d  = Math.hypot(dx, dy);
                    if (d <= bestNearDist) { bestNear = container; bestNearDist = d; }
                }
            }
        }
        z++;
    }
    return bestInside ?? bestNear;
}

function getPortAtCanvasPoint(figure: Figure, p: Point): Port | undefined
{
    const ports = figure.Ports;
    let best: Port | undefined = undefined;
    let bestD = PORT_HIT_RADIUS;
    for (const port of ports)
    {
        const r = PortResolver.resolve(port, figure);
        const d = Math.hypot(p.X - r.x, p.Y - r.y);
        if (d <= bestD) { best = port; bestD = d; }
    }
    return best;
}

function collectionContains(
    collection: ObservableCollection<Model> | undefined,
    item: Model,
): boolean
{
    if (collection === undefined) return false;
    for (let i = 0; i < collection.Count; i++)
    {
        if (collection.Get(i) === item) return true;
    }
    return false;
}

function mountAdorner(panel: Visual, adorner: Adorner): boolean
{
    const layer = AdornerLayer.GetAdornerLayer(panel);
    if (layer === undefined) return false;
    layer.Add(adorner);
    return true;
}

function unmountAdorner(panel: Visual | undefined, adorner: Adorner): void
{
    if (panel === undefined) return;
    const layer = AdornerLayer.GetAdornerLayer(panel);
    layer?.Remove(adorner);
}

// ── attachConnectorInteractions ──────────────────────────────────
// Returns a detach thunk. Called from Diagram's
// ConnectorInteractionsEnabled DP setter, not by consumers directly.

/** @internal */
export function attachConnectorInteractions(diagram: Diagram): () => void
{
    const state: SharedState = {
        hoveredFigure:   undefined,
        activeGesture:   undefined,
        activePointerId: undefined,
        editKind:        undefined,
    };

    const createBehavior = new ConnectorCreateBehavior(diagram);
    const editAdorner    = new ConnectorEditAdorner();

    let portAdornerVisual: PortHandlesAdorner | undefined = undefined;
    let editAdornerVisual: EditHandlesAdorner | undefined = undefined;
    let mountedPanel:      Visual             | undefined = undefined;

    // Per-handle PointerDown callback. Fired directly by each handle
    // Border's own bubble-phase listener (wired in wireHandle), so it
    // dodges Figure.OnPointerDown's Handled short-circuit — the handle
    // isn't a Figure descendant, so the route walks handle → adorner →
    // layer → … → Diagram with no Figure to intercept first.
    const onHandleDown = (tag: HandleTag, args: PointerEventArgs): void => {
        if (state.activeGesture !== undefined) return;
        const cursor = localPosition(args, diagram);
        if (tag.kind === 'port')
        {
            createBehavior.BeginCreate(tag.figure, tag.port, cursor);
            const transient = createBehavior.TransientConnector;
            const panel = diagram.ItemsPanelInstance;
            if (panel !== undefined && transient !== undefined)
            {
                (panel as unknown as { AddChild?(v: Visual): void }).AddChild?.(transient);
            }
            state.activeGesture   = 'create';
            state.activePointerId = args.PointerId;
            args.CapturePointer(diagram);
            args.Handled = true;
            return;
        }
        if (tag.kind === 'endpoint')
        {
            editAdorner.BeginEndpointDrag(tag.connector, tag.end, cursor);
            state.activeGesture   = 'edit';
            state.activePointerId = args.PointerId;
            state.editKind        = 'endpoint';
            args.CapturePointer(diagram);
            args.Handled = true;
            editAdornerVisual?.InvalidateArrange();
            return;
        }
        if (tag.kind === 'waypoint')
        {
            editAdorner.BeginWaypointDrag(tag.connector, tag.index);
            state.activeGesture   = 'edit';
            state.activePointerId = args.PointerId;
            state.editKind        = 'waypoint';
            args.CapturePointer(diagram);
            args.Handled = true;
            editAdornerVisual?.InvalidateArrange();
        }
    };

    const mountAdornersIfReady = (): void => {
        if (mountedPanel !== undefined) return;
        const panel = diagram.ItemsPanelInstance;
        if (panel === undefined) return;
        const portA = new PortHandlesAdorner(panel, state, onHandleDown);
        const editA = new EditHandlesAdorner(panel, diagram, onHandleDown);
        const ok1 = mountAdorner(panel, portA);
        const ok2 = mountAdorner(panel, editA);
        if (!ok1 || !ok2)
        {
            // Layer not in scope yet — drop both, try again later.
            return;
        }
        portAdornerVisual = portA;
        editAdornerVisual = editA;
        mountedPanel      = panel;
    };

    queueMicrotask(mountAdornersIfReady);

    const onPointerDown = (raw: unknown): void => {
        const args = raw as PointerEventArgs;
        mountAdornersIfReady();

        if (state.activeGesture !== undefined) return;

        // Handle clicks land via wireHandle's per-Border listener above,
        // not this Diagram-level path. Anything reaching here is a click
        // on a connector body, a figure body, or empty canvas space.

        // Connector body click → toggle / replace selection.
        const conn = findConnectorAncestor(args.Source);
        if (conn !== undefined)
        {
            const mods = args.Modifiers;
            const additive = mods?.Control === true || mods?.Meta === true;
            if (!additive) diagram.ClearConnectorSelection();
            if (additive && diagram.IsConnectorSelected(conn))
            {
                diagram.DeselectConnector(conn);
            }
            else
            {
                diagram.SelectConnector(conn);
            }
            editAdornerVisual?.InvalidateArrange();
            args.Handled = true;
            return;
        }

        // Truly empty space → clear connector selection. Clicks on
        // figures pass through so the Diagram's existing item-selection
        // logic runs; connector selection survives across figure picks.
        if (findFigureAncestor(args.Source) === undefined
            && diagram.SelectedConnectors.length > 0)
        {
            diagram.ClearConnectorSelection();
            editAdornerVisual?.InvalidateArrange();
        }
    };

    const onPointerMove = (raw: unknown): void => {
        const args = raw as PointerEventArgs;
        mountAdornersIfReady();
        const cursor = localPosition(args, diagram);

        if (state.activeGesture === 'create' && args.PointerId === state.activePointerId)
        {
            createBehavior.UpdateCursor(cursor);
        }
        else if (state.activeGesture === 'edit' && args.PointerId === state.activePointerId)
        {
            editAdorner.UpdateCursor(cursor);
            editAdornerVisual?.InvalidateArrange();
        }

        // Hover update runs ALSO during an active gesture — without it,
        // target figures' port handles would never appear while the user
        // is dragging a new connector or re-anchoring an endpoint, and
        // the user couldn't see where to land for a named port. Drop
        // target on EndCreate / EndDragOverTarget still uses cursor →
        // findFigureAtCanvasPoint + getPortAtCanvasPoint, so hover-show
        // and drop-pick stay in lockstep.
        const fig = findFigureAtCanvasPoint(diagram, cursor);
        if (fig !== state.hoveredFigure)
        {
            state.hoveredFigure = fig;
            portAdornerVisual?.InvalidateArrange();
        }
    };

    const onPointerUp = (raw: unknown): void => {
        const args = raw as PointerEventArgs;
        if (args.PointerId !== state.activePointerId) return;
        const cursor = localPosition(args, diagram);

        if (state.activeGesture === 'create')
        {
            const transient = createBehavior.TransientConnector;
            const panel = diagram.ItemsPanelInstance;
            if (panel !== undefined && transient !== undefined)
            {
                (panel as unknown as { RemoveChild?(v: Visual): void }).RemoveChild?.(transient);
            }
            const target = findFigureAtCanvasPoint(diagram, cursor);
            if (target !== undefined)
            {
                const targetPort = getPortAtCanvasPoint(target, cursor);
                createBehavior.EndCreate(target, targetPort);
            }
            else
            {
                createBehavior.Abort();
            }
        }
        else if (state.activeGesture === 'edit')
        {
            if (state.editKind === 'endpoint')
            {
                const target = findFigureAtCanvasPoint(diagram, cursor);
                if (target !== undefined)
                {
                    const targetPort = getPortAtCanvasPoint(target, cursor);
                    editAdorner.EndDragOverTarget(target, targetPort);
                }
                else
                {
                    editAdorner.EndDragOverEmpty();
                }
            }
            else if (state.editKind === 'waypoint')
            {
                editAdorner.EndDragOverEmpty();
            }
            editAdornerVisual?.InvalidateArrange();
        }

        args.ReleasePointerCapture();
        state.activeGesture   = undefined;
        state.activePointerId = undefined;
        state.editKind        = undefined;
        args.Handled = true;
    };

    const onPointerLeave = (_raw: unknown): void => {
        if (state.activeGesture !== undefined) return;
        if (state.hoveredFigure !== undefined)
        {
            state.hoveredFigure = undefined;
            portAdornerVisual?.InvalidateArrange();
        }
    };

    // Preview-phase delivery is non-negotiable: Figure.OnPointerDown /
    // Move / Up all set args.Handled = true, which short-circuits the
    // bubble walk before any Diagram-level routed listener runs. The
    // tunnel (preview) pass fires root → target with the same Handled
    // gate, so a Diagram-level preview handler reliably sees the event
    // BEFORE Figure consumes it. The Diagram exposes a framework-internal
    // slot for these handlers; we install on attach, withdraw on detach.
    diagram._setConnectorInteractionsHandlers({
        OnPreviewPointerDown: onPointerDown,
        OnPreviewPointerMove: onPointerMove,
        OnPreviewPointerUp:   onPointerUp,
        OnPointerLeave:       onPointerLeave,
    });

    return (): void => {
        diagram._setConnectorInteractionsHandlers(undefined);

        createBehavior.Abort();
        editAdorner.Abort();

        if (portAdornerVisual !== undefined) unmountAdorner(mountedPanel, portAdornerVisual);
        if (editAdornerVisual !== undefined) unmountAdorner(mountedPanel, editAdornerVisual);
        portAdornerVisual = undefined;
        editAdornerVisual = undefined;
        mountedPanel      = undefined;
    };
}

// Handler bundle the Diagram delegates its preview pointer virtuals to.
// Exported so connector-interactions-behavior and Diagram speak the
// same shape; the four method names match the framework's pointer
// virtual conventions for clarity at the dispatch site.
export interface ConnectorInteractionsHandlers
{
    OnPreviewPointerDown(args: unknown): void;
    OnPreviewPointerMove(args: unknown): void;
    OnPreviewPointerUp  (args: unknown): void;
    OnPointerLeave      (args: unknown): void;
}
