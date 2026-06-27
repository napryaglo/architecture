import {
    Color,
    CornerRadius,
    Point,
    Rect,
    Size,
    Visual,
    type PointerEventArgs,
    type ObservableCollection,
    type Model,
    hasModifier,
    ModifierKeys,
} from '../../../runtime/index.js';
import {
    Adorner,
    AdornerLayer,
    LineCap,
    LineJoin,
    Pen,
    SolidColorBrush,
} from '../../../visual-engine/index.js';
import { Border, Shape } from '../../../basic/index.js';
import { SelectionMode } from '../../list/list-box.js';
import { Connector } from '../connector.js';
import { ConnectorCreateBehavior } from './connector-create-behavior.js';
import { ConnectorEditAdorner } from './connector-edit-adorner.js';
import { Figure } from '../figure.js';
import { PortSide, type ResolvedPortSide } from '../port.js';
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
const SIDE_BAR_THICKNESS = 3;
// Inset each end of a side bar by this fraction of the side length, so
// the bar visually occupies 90% of the side, centered.
const SIDE_BAR_INSET_RATIO = 0.05;
const EP_HANDLE_SIZE     = 11;
const WP_HANDLE_SIZE     = 9;
// Port marker — small circle drawn at each dynamic-slot position on a
// hovered figure's side. Pure visual indicator (not hit-testable); the
// side bar behind it owns the click. Sized small enough to read as
// "this is where this connector attaches" without crowding the side.
const PORT_MARKER_SIZE = 7;
// 4 sides per hovered figure (N, S, E, W) — pool sized to one figure
// at a time; on hover transitions the pool re-binds to the new figure.
const POOL_SIDES = 4;
const POOL_EPS   = 8;
const POOL_WPS   = 16;
// Per-side port-marker capacity. Each side rarely has more than a few
// connectors in practice; cap at 8 so the pool stays small while still
// supporting busy hubs (4 sides × 8 = 32 markers worst case).
const POOL_PORTS_PER_SIDE = 8;
const POOL_PORTS = POOL_SIDES * POOL_PORTS_PER_SIDE;
const HIDE_OFFSCREEN = -10000;

// Proximity buffer for figure hover + drop-target detection. Cursor
// within this many DIPs of a figure's bbox edge counts as "near" the
// figure: port handles show, and a release lands a connector on it.
// Hover-show and drop-pick share the same threshold so visual feedback
// and commit semantics stay in lockstep — what lights up is what gets
// connected.
const FIGURE_PROXIMITY = 24;

const SIDE_FILL = new SolidColorBrush(Color.FromHex('#ff9800'));
const EP_FILL   = new SolidColorBrush(Color.FromHex('#ff5722'));
const WP_FILL   = new SolidColorBrush(Color.FromHex('#ff9800'));
// Port markers are the same orange the side bar uses — they read as
// "this slot belongs to the side bar above me" without needing a
// second color in the palette.
const PORT_MARKER_FILL = new SolidColorBrush(Color.FromHex('#ff9800'));

// Hover halo: contrasting accent that mirrors the connector's geometry
// when the cursor hovers an UNSELECTED connector. Hit-testable; clicking
// it picks the connector and seeds the diagram's shared stroke editor.
// Color mirrors the @Primary material token used by other selection-
// affordance chrome (see diagram.template.mu's Group BorderBrush). The
// other adorners in this file hard-code their fills the same way, so
// consistency = same here; promote to a Diagram DP when the design
// system grows a runtime token resolver for code-only adorners.
const HOVER_HALO_COLOR     = Color.FromHex('#6750A4');
const HOVER_HALO_BRUSH     = (() => {
    // Lower-alpha overlay so the underlying connector reads through
    // the halo as the user lines up the click. Stroke-as-accent is
    // the affordance signal; full opacity would otherwise hide the
    // connector being targeted.
    const b = new SolidColorBrush(HOVER_HALO_COLOR);
    b.Opacity = 0.45;
    return b;
})();
// Minimum effective halo stroke thickness. Per the design ask:
// "minimum stroke width as 5px". Per-connector thickness can grow
// past this — the halo always sits at least 5 DIPs wide so the hit
// surface is reliable even on hair-thin connectors.
const HOVER_HALO_MIN_THICK = 5;

// Custom Visio-style "connect" cursor: a black crosshair (white-haloed
// for contrast on any background) with a small connector-line glyph in
// the bottom-right quadrant. Beats the OS `crosshair` keyword, which
// renders as the system theme's cursor and lands white-on-white on
// most light backgrounds.
//
// Data-URL encoding goes through encodeURIComponent so the SVG body
// reaches every browser's url() parser intact (Safari historically
// required this; modern Chrome / Firefox accept raw, but encoding
// costs nothing). Hotspot at (10, 10) — the center of the crosshair.
const CONNECTOR_CURSOR_SVG =
    "<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'>"
    + "<line x1='10' y1='3' x2='10' y2='17' stroke='white' stroke-width='3' stroke-linecap='round'/>"
    + "<line x1='3' y1='10' x2='17' y2='10' stroke='white' stroke-width='3' stroke-linecap='round'/>"
    + "<line x1='10' y1='3' x2='10' y2='17' stroke='black' stroke-width='1.5' stroke-linecap='round'/>"
    + "<line x1='3' y1='10' x2='17' y2='10' stroke='black' stroke-width='1.5' stroke-linecap='round'/>"
    + "<circle cx='10' cy='10' r='1.6' fill='black'/>"
    + "<path d='M 14 14 L 21 14 L 21 21' stroke='white' stroke-width='2.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/>"
    + "<path d='M 14 14 L 21 14 L 21 21' stroke='black' stroke-width='1.2' fill='none' stroke-linecap='round' stroke-linejoin='round'/>"
    + "<circle cx='21' cy='21' r='1.6' fill='black'/>"
    + "</svg>";
const CONNECTOR_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(CONNECTOR_CURSOR_SVG)}") 10 10, crosshair`;

const SIDE_CURSOR     = CONNECTOR_CURSOR;
const ENDPOINT_CURSOR = CONNECTOR_CURSOR;
const WAYPOINT_CURSOR = 'move';

// ── Handle tagging via WeakMap ───────────────────────────────────
// Each handle visual gets a tag describing (kind + payload) so the
// PointerDown classifier can read what was clicked. WeakMap-keyed so
// detaching the adorner garbage-collects entries without manual cleanup.

enum ConnectorGesture
{
    Create = 'create',
    Edit   = 'edit',
}

enum ConnectorEditKind
{
    Endpoint = 'endpoint',
    Waypoint = 'waypoint',
}

type HandleTag =
    | { readonly kind: 'side';     readonly figure: Figure; readonly side: ResolvedPortSide }
    | { readonly kind: 'endpoint'; readonly connector: Connector; readonly end: ConnectorEnd }
    | { readonly kind: 'waypoint'; readonly connector: Connector; readonly index: number };

const HANDLE_TAGS: WeakMap<Visual, HandleTag> = new WeakMap();

// ── Shared hover state, kept in a closure ───────────────────────
interface SharedState
{
    hoveredFigure:    Figure    | undefined;
    hoveredConnector: Connector | undefined;
    activeGesture:    ConnectorGesture | undefined;
    activePointerId:  number   | undefined;
    editKind:         ConnectorEditKind | undefined;
}

// ── SideBarsAdorner ──────────────────────────────────────────────
// 4 orange 3-DIP-thick lines hugging the N / S / E / W edges of the
// currently-hovered figure. Each bar is hit-testable; PointerDown on a
// bar starts a create gesture against (figure, side). When the user
// drags onto a target figure mid-gesture, the target's bars light up
// the same way, giving the user a clear release target. Bars are pooled
// at one set per adorner — only the currently-hovered figure has visible
// bars; transitions to a different figure re-bind the pool.
class SideBarsAdorner extends Adorner
{
    private readonly _state: SharedState;
    private readonly _pool:      Border[] = [];
    private readonly _portPool:  Border[] = [];
    private static readonly _SIDES: readonly ResolvedPortSide[] =
        [PortSide.N, PortSide.S, PortSide.E, PortSide.W];

    constructor(adornedElement: Visual, state: SharedState, onHandleDown: HandleDownCallback)
    {
        super(adornedElement);
        this._state = state;
        // Pad transparent so we don't intercept figure clicks; the
        // individual side-bar Borders keep their own explicit hit pads.
        // See [svg-renderer.ts:488-491](../../../../visual-engine/drawing/svg-renderer.ts#L488-L491).
        this.IsHitTestVisible = false;
        for (let i = 0; i < POOL_SIDES; i++)
        {
            const v = makeBar(SIDE_FILL, SIDE_CURSOR);
            wireHandle(v, onHandleDown);
            this.AttachVisual(v);
            this._pool.push(v);
        }
        // Port-marker dots — one per dynamic slot per side. Non-hit-
        // testable so clicks pass through to the side bar behind them
        // (the bar starts the create gesture; the dot is purely a "this
        // is where slot i sits" visualization).
        for (let i = 0; i < POOL_PORTS; i++)
        {
            const v = makePortMarker();
            this.AttachVisual(v);
            this._portPool.push(v);
        }
    }

    public override get visualChildren(): Visual[]
    {
        return [...this._pool, ...this._portPool];
    }

    public override MeasureOverride(_avail: Size): Size
    {
        const big = new Size(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
        for (const v of this._pool)     v.Measure(big);
        for (const v of this._portPool) v.Measure(big);
        return Size.Zero;
    }

    public override ArrangeOverride(finalSize: Size): Size
    {
        const fig = this._state.hoveredFigure;
        if (fig === undefined)
        {
            this._hideAll();
            return finalSize;
        }
        // Read Left / Top / Width / Height directly off the Figure
        // rather than its ArrangedRect — the DPs update synchronously on
        // any move / resize, while ArrangedRect only refreshes on the
        // next arrange pass. Without this, dragging or aligning a
        // figure repositions its body before the side bars catch up.
        const left   = fig.Left;
        const top    = fig.Top;
        const width  = fig.Width;
        const height = fig.Height;
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
        {
            this._hideAll();
            return finalSize;
        }
        const t      = SIDE_BAR_THICKNESS;
        const half   = t / 2;
        // Bars span 90% of the side, centered — 5% inset on each end
        // keeps them visually distinct from the corners and clarifies
        // which side the cursor is over near a vertex.
        const inX    = width  * SIDE_BAR_INSET_RATIO;
        const inY    = height * SIDE_BAR_INSET_RATIO;
        const barW   = width  - 2 * inX;
        const barH   = height - 2 * inY;
        for (let i = 0; i < SideBarsAdorner._SIDES.length; i++)
        {
            const side = SideBarsAdorner._SIDES[i]!;
            const v = this._pool[i]!;
            HANDLE_TAGS.set(v, { kind: 'side', figure: fig, side });
            switch (side)
            {
                case PortSide.N:
                    v.Arrange(new Rect(left + inX,         top - half,          barW, t)); break;
                case PortSide.S:
                    v.Arrange(new Rect(left + inX,         top + height - half, barW, t)); break;
                case PortSide.E:
                    v.Arrange(new Rect(left + width - half, top + inY,          t, barH)); break;
                case PortSide.W:
                    v.Arrange(new Rect(left - half,        top + inY,           t, barH)); break;
            }
        }

        // Port markers — one dot per dynamic-slot position on each
        // side. Slot i (zero-based) of N total sits at
        //   t = (i + 1) / (N + 1)
        // along the side (the same formula Path 3a uses in
        // [connector.ts](../connector.ts) — kept in lockstep so the
        // markers always match where connectors actually land).
        const m = PORT_MARKER_SIZE;
        const mHalf = m / 2;
        let portIdx = 0;
        for (const side of SideBarsAdorner._SIDES)
        {
            const count = Math.min(fig.GetSideEndpointCount(side), POOL_PORTS_PER_SIDE);
            for (let i = 0; i < count; i++)
            {
                if (portIdx >= this._portPool.length) break;
                const u = (i + 1) / (count + 1);
                let cx: number, cy: number;
                switch (side)
                {
                    case PortSide.N: cx = left + u * width;          cy = top;                  break;
                    case PortSide.S: cx = left + u * width;          cy = top + height;         break;
                    case PortSide.E: cx = left + width;              cy = top + u * height;     break;
                    case PortSide.W: cx = left;                      cy = top + u * height;     break;
                }
                this._portPool[portIdx]!.Arrange(new Rect(cx - mHalf, cy - mHalf, m, m));
                portIdx++;
            }
        }
        for (let i = portIdx; i < this._portPool.length; i++)
        {
            this._portPool[i]!.Arrange(new Rect(HIDE_OFFSCREEN, HIDE_OFFSCREEN, 0, 0));
        }
        return finalSize;
    }

    private _hideAll(): void
    {
        for (const v of this._pool)
        {
            HANDLE_TAGS.delete(v);
            v.Arrange(new Rect(HIDE_OFFSCREEN, HIDE_OFFSCREEN, 0, 0));
        }
        for (const v of this._portPool)
        {
            v.Arrange(new Rect(HIDE_OFFSCREEN, HIDE_OFFSCREEN, 0, 0));
        }
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
            const v = makeDot(EP_HANDLE_SIZE, EP_FILL, ENDPOINT_CURSOR);
            wireHandle(v, onHandleDown);
            this.AttachVisual(v);
            this._epPool.push(v);
        }
        for (let i = 0; i < POOL_WPS; i++)
        {
            const v = makeDot(WP_HANDLE_SIZE, WP_FILL, WAYPOINT_CURSOR);
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

// ── HoverHaloAdorner ─────────────────────────────────────────────
// Single Shape that mirrors the geometry of the currently-hovered
// (and not-yet-selected) connector. Painted with the @Primary accent
// at HOVER_HALO_OPACITY, stroke thickness clamped to ≥ HOVER_HALO_MIN_THICK
// so the halo reads as a clear affordance on hair-thin connectors.
//
// Halo is NOT hit-test visible — the mural-hit pad would otherwise
// span the adorner layer's full canvas extent (the halo is arranged
// at (0,0, W, H) so its Geometry coords land in canvas-local space),
// which would swallow every PointerMove regardless of cursor position
// and pin state.hoveredConnector forever. Instead the halo passes
// pointer events through to the underlying connector. Click-to-select
// flows through the existing connector-body PointerDown path in
// onPointerDown — that's where exclusive selection (clear figures)
// and ConnectorSelectionChanged are wired.
class HoverHaloAdorner extends Adorner
{
    private readonly _state: SharedState;
    private readonly _halo:  Shape;

    constructor(adornedElement: Visual, state: SharedState)
    {
        super(adornedElement);
        this._state = state;
        // Both the adorner pad AND the halo itself are non-hit-test.
        // See header comment for why.
        this.IsHitTestVisible = false;

        const halo = new Shape();
        halo.IsHitTestVisible = false;
        // No Fill — the halo is a stroked outline; Fill would paint
        // the closed path interior of a multi-segment connector as
        // a region, which is meaningless for line art.
        halo.Fill = undefined;
        this.AttachVisual(halo);
        this._halo = halo;
    }

    public override get visualChildren(): Visual[] { return [this._halo]; }

    public override MeasureOverride(_avail: Size): Size
    {
        const big = new Size(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
        this._halo.Measure(big);
        return Size.Zero;
    }

    public override ArrangeOverride(finalSize: Size): Size
    {
        const conn = this._state.hoveredConnector;
        if (conn === undefined || conn.Geometry === undefined)
        {
            this._halo.Geometry = undefined;
            this._halo.Stroke   = undefined;
            this._halo.Arrange(new Rect(HIDE_OFFSCREEN, HIDE_OFFSCREEN, 0, 0));
            return finalSize;
        }
        // Reuse the connector's Geometry instance — the SVG renderer
        // re-emits a path for each Visual independently, so two
        // Visuals sharing one Geometry reference render two distinct
        // <path> elements. Routing recomputes on the connector swap
        // its GeometryKey value; the syncHoverConnector subscription
        // catches that and re-runs this arrange.
        this._halo.Geometry = conn.Geometry;
        this._halo.Stroke   = makeHaloPen(conn);
        // Arrange spans the full adorner-layer extent so the halo's
        // Geometry coordinates land in the same canvas-local frame
        // the connector itself renders into.
        this._halo.Arrange(new Rect(0, 0, finalSize.Width, finalSize.Height));
        return finalSize;
    }
}

// Build a fresh Pen each arrange — Shape's subscribeAny would otherwise
// re-fire InvalidateVisual on every per-prop change of a long-lived halo
// pen. The pen carries the accent brush, the clamped thickness, and
// round caps / joins so wide halos meet at corners without ugly miter
// spikes (visible on tight-angle connector turns).
function makeHaloPen(conn: Connector): Pen
{
    const p = new Pen();
    p.Brush      = HOVER_HALO_BRUSH;
    p.Thickness  = Math.max(conn.Stroke?.Thickness ?? 0, HOVER_HALO_MIN_THICK);
    p.LineCap    = LineCap.Round;
    p.LineJoin   = LineJoin.Round;
    return p;
}

// ── Helpers ──────────────────────────────────────────────────────

function makeDot(size: number, fill: SolidColorBrush, cursor: string): Border
{
    const v = new Border();
    v.Width  = size;
    v.Height = size;
    const r = size / 2;
    v.CornerRadius = new CornerRadius(r, r, r, r);
    v.Background   = fill;
    v.IsHitTestVisible = true;
    v.Cursor = cursor;
    return v;
}

// Side bar: rectangular Border with no CornerRadius. Width and Height
// are set later in ArrangeOverride based on the figure's dimensions
// and the side orientation. We don't need a fixed measured size since
// our parent (the adorner) returns Size.Zero from MeasureOverride.
function makeBar(fill: SolidColorBrush, cursor: string): Border
{
    const v = new Border();
    v.Background       = fill;
    v.IsHitTestVisible = true;
    v.Cursor           = cursor;
    return v;
}

// Port marker dot — a fixed-size round Border the adorner positions at
// each dynamic-slot location on a hovered figure's side. Non-hit-test
// so clicks pass through to the side bar behind it (which owns the
// create gesture); the marker is purely a visual indicator.
function makePortMarker(): Border
{
    const v = new Border();
    v.Width  = PORT_MARKER_SIZE;
    v.Height = PORT_MARKER_SIZE;
    const r = PORT_MARKER_SIZE / 2;
    v.CornerRadius     = new CornerRadius(r, r, r, r);
    v.Background       = PORT_MARKER_FILL;
    v.IsHitTestVisible = false;
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
    // Sum ArrangedRect.X/Y from the panel up to the root. The SCP arranges
    // its content (ItemsPresenter) at (-offX, -offY) when in clip-and-
    // translate mode, so the scroll offset is already baked into the
    // ArrangedRect chain — adding HorizontalOffset / VerticalOffset on
    // top would double-count and shift cursor coords by an extra +offX
    // each scroll, which is why hovered side bars stopped appearing
    // after scrolling the canvas into a new page.
    let ox = 0, oy = 0;
    let cur: Visual | undefined = panel;
    while (cur !== undefined)
    {
        const r = cur.ArrangedRect;
        ox += r.X;
        oy += r.Y;
        cur = cur.GetVisualParent();
    }
    return new Point(args.HostX - ox, args.HostY - oy);
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

// Closest cardinal side of `figure` to point `p` in canvas-host coords.
// Returns the side whose edge is nearest the cursor — used when the
// user releases over a figure but not on a side bar (proximity fallback)
// or when picking among the four candidates on EndCreate /
// EndDragOverTarget. Returns East as the degenerate fallback when the
// figure has no ArrangedRect (should never happen post-layout).
function pickSideOfFigure(figure: Figure, p: Point): ResolvedPortSide
{
    const r = figure.ArrangedRect;
    if (r === undefined) return PortSide.E;
    const left   = figure.Left;
    const top    = figure.Top;
    const right  = left + r.Width;
    const bottom = top  + r.Height;
    const dL = Math.abs(p.X - left);
    const dR = Math.abs(p.X - right);
    const dT = Math.abs(p.Y - top);
    const dB = Math.abs(p.Y - bottom);
    const m = Math.min(dL, dR, dT, dB);
    if (m === dL) return PortSide.W;
    if (m === dR) return PortSide.E;
    if (m === dT) return PortSide.N;
    return PortSide.S;
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
        hoveredFigure:    undefined,
        hoveredConnector: undefined,
        activeGesture:    undefined,
        activePointerId:  undefined,
        editKind:         undefined,
    };

    const createBehavior = new ConnectorCreateBehavior(diagram);
    const editAdorner    = new ConnectorEditAdorner();

    let sideAdornerVisual: SideBarsAdorner   | undefined = undefined;
    let editAdornerVisual: EditHandlesAdorner | undefined = undefined;
    let haloAdornerVisual: HoverHaloAdorner  | undefined = undefined;
    let mountedPanel:      Visual             | undefined = undefined;

    // Anchor for Shift+click range-select on connectors. Mirrors
    // Selector._anchor for figures — set on every non-range click, used
    // as the "from" endpoint when Shift makes the next click extend a
    // range. Survives ClearConnectorSelection so a "click a, clear all,
    // Shift+click b" gesture still ranges from a→b; matches Selector's
    // semantics. Stale anchor (connector removed from Connectors) is
    // tolerated — Diagram.SelectConnectorRange no-ops on missing index.
    let connectorAnchor: Connector | undefined = undefined;

    // The side-bar adorner only re-arranges when InvalidateArrange is
    // called. Hovered-figure swap calls it; Left / Top mutation on the
    // SAME hovered figure (e.g. a drag) does not, so we subscribe to
    // the figure's position DPs and refresh the bars on every fire.
    // Width / Height covered too for the resize case. The
    // subscribedHoverFigure handle is kept separate from
    // state.hoveredFigure so detach can run after state has already
    // been cleared.
    let subscribedHoverFigure: Figure | undefined = undefined;
    const onHoveredFigureGeometryChanged = (): void => {
        sideAdornerVisual?.InvalidateArrange();
    };
    const syncHoverSubscription = (next: Figure | undefined): void => {
        if (subscribedHoverFigure === next) return;
        if (subscribedHoverFigure !== undefined)
        {
            subscribedHoverFigure.RemovePropertyChangedListener(Figure.LeftKey,   onHoveredFigureGeometryChanged);
            subscribedHoverFigure.RemovePropertyChangedListener(Figure.TopKey,    onHoveredFigureGeometryChanged);
            subscribedHoverFigure.RemovePropertyChangedListener(Visual.WidthKey,  onHoveredFigureGeometryChanged);
            subscribedHoverFigure.RemovePropertyChangedListener(Visual.HeightKey, onHoveredFigureGeometryChanged);
            subscribedHoverFigure.RemoveSideEndpointsChangedListener(onHoveredFigureGeometryChanged);
        }
        subscribedHoverFigure = next;
        if (next !== undefined)
        {
            next.AddPropertyChangedListener(Figure.LeftKey,   onHoveredFigureGeometryChanged);
            next.AddPropertyChangedListener(Figure.TopKey,    onHoveredFigureGeometryChanged);
            next.AddPropertyChangedListener(Visual.WidthKey,  onHoveredFigureGeometryChanged);
            next.AddPropertyChangedListener(Visual.HeightKey, onHoveredFigureGeometryChanged);
            // Re-arrange port markers when a connector registers /
            // unregisters on any side of the hovered figure — the slot
            // count drives the marker count.
            next.AddSideEndpointsChangedListener(onHoveredFigureGeometryChanged);
        }
    };

    // Parallel to syncHoverSubscription but for the connector hover halo.
    // The halo's arrange reads conn.Geometry, conn.Stroke?.Thickness on
    // every pass — so it must re-arrange whenever any of those change.
    //   * Shape.GeometryKey  — routing recompute swaps the Geometry DP.
    //   * Shape.StrokeKey    — user edits the pen-by-reference (FormatMirror
    //                          mutates in place, but a Stroke replacement
    //                          must still re-arm the ThicknessKey listener
    //                          against the new Pen instance).
    //   * Pen.ThicknessKey   — drives the clamp in makeHaloPen.
    let subscribedHoverConnector: Connector | undefined = undefined;
    let subscribedHoverPen:       Pen       | undefined = undefined;
    const onHoveredConnectorChanged = (): void => {
        // Stroke swap: rebind the thickness listener against the new pen.
        const conn = subscribedHoverConnector;
        if (conn !== undefined)
        {
            const nextPen = conn.Stroke;
            if (nextPen !== subscribedHoverPen)
            {
                if (subscribedHoverPen !== undefined)
                {
                    subscribedHoverPen.RemovePropertyChangedListener(Pen.ThicknessKey, onHoveredConnectorChanged);
                }
                subscribedHoverPen = nextPen;
                if (subscribedHoverPen !== undefined)
                {
                    subscribedHoverPen.AddPropertyChangedListener(Pen.ThicknessKey, onHoveredConnectorChanged);
                }
            }
        }
        haloAdornerVisual?.InvalidateArrange();
    };
    const syncHoverConnectorSubscription = (next: Connector | undefined): void => {
        if (subscribedHoverConnector === next) return;
        if (subscribedHoverConnector !== undefined)
        {
            subscribedHoverConnector.RemovePropertyChangedListener(Shape.GeometryKey, onHoveredConnectorChanged);
            subscribedHoverConnector.RemovePropertyChangedListener(Shape.StrokeKey,   onHoveredConnectorChanged);
            if (subscribedHoverPen !== undefined)
            {
                subscribedHoverPen.RemovePropertyChangedListener(Pen.ThicknessKey, onHoveredConnectorChanged);
                subscribedHoverPen = undefined;
            }
        }
        subscribedHoverConnector = next;
        if (next !== undefined)
        {
            next.AddPropertyChangedListener(Shape.GeometryKey, onHoveredConnectorChanged);
            next.AddPropertyChangedListener(Shape.StrokeKey,   onHoveredConnectorChanged);
            subscribedHoverPen = next.Stroke;
            if (subscribedHoverPen !== undefined)
            {
                subscribedHoverPen.AddPropertyChangedListener(Pen.ThicknessKey, onHoveredConnectorChanged);
            }
        }
    };

    // Per-handle PointerDown callback. Fired directly by each handle
    // Border's own bubble-phase listener (wired in wireHandle), so it
    // dodges Figure.OnPointerDown's Handled short-circuit — the handle
    // isn't a Figure descendant, so the route walks handle → adorner →
    // layer → … → Diagram with no Figure to intercept first.
    const onHandleDown = (tag: HandleTag, args: PointerEventArgs): void => {
        if (state.activeGesture !== undefined) return;
        const cursor = localPosition(args, diagram);
        if (tag.kind === 'side')
        {
            createBehavior.BeginCreate(tag.figure, tag.side, cursor);
            const transient = createBehavior.TransientConnector;
            const panel = diagram.ItemsPanelInstance;
            if (panel !== undefined && transient !== undefined)
            {
                (panel as unknown as { AddChild?(v: Visual): void }).AddChild?.(transient);
            }
            state.activeGesture   = ConnectorGesture.Create;
            state.activePointerId = args.PointerId;
            args.CapturePointer(diagram, SIDE_CURSOR);
            args.Handled = true;
            return;
        }
        if (tag.kind === 'endpoint')
        {
            editAdorner.BeginEndpointDrag(tag.connector, tag.end, cursor);
            state.activeGesture   = ConnectorGesture.Edit;
            state.activePointerId = args.PointerId;
            state.editKind        = ConnectorEditKind.Endpoint;
            args.CapturePointer(diagram, ENDPOINT_CURSOR);
            args.Handled = true;
            editAdornerVisual?.InvalidateArrange();
            return;
        }
        if (tag.kind === 'waypoint')
        {
            editAdorner.BeginWaypointDrag(tag.connector, tag.index);
            state.activeGesture   = ConnectorGesture.Edit;
            state.activePointerId = args.PointerId;
            state.editKind        = ConnectorEditKind.Waypoint;
            args.CapturePointer(diagram, WAYPOINT_CURSOR);
            args.Handled = true;
            editAdornerVisual?.InvalidateArrange();
            return;
        }
    };

    const mountAdornersIfReady = (): void => {
        if (mountedPanel !== undefined) return;
        const panel = diagram.ItemsPanelInstance;
        if (panel === undefined) return;
        const sideA = new SideBarsAdorner(panel, state, onHandleDown);
        const editA = new EditHandlesAdorner(panel, diagram, onHandleDown);
        // Halo mounts BEFORE EditHandles so the endpoint / waypoint dots
        // paint on top of the halo when both are visible mid-transition.
        // In steady state they're mutually exclusive (halo only on
        // unselected, dots only on selected), but a click that flips
        // the connector from hovered → selected re-arranges both
        // adorners in the same layout pass, and the dots should win
        // the overlap in case the halo lingers for a frame.
        const haloA = new HoverHaloAdorner(panel, state);
        const ok1 = mountAdorner(panel, haloA);
        const ok2 = mountAdorner(panel, sideA);
        const ok3 = mountAdorner(panel, editA);
        if (!ok1 || !ok2 || !ok3)
        {
            // Layer not in scope yet — drop all, try again later.
            return;
        }
        sideAdornerVisual = sideA;
        editAdornerVisual = editA;
        haloAdornerVisual = haloA;
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

        const mods    = args.Modifiers;
        const ctrl    = hasModifier(mods, ModifierKeys.Control) || hasModifier(mods, ModifierKeys.Windows);
        const shift   = hasModifier(mods, ModifierKeys.Shift);

        // Connector body click → SelectionMode-aware multi-select that
        // mirrors Selector.HandleContainerClick for figures, with one
        // cross-population rule layered on top:
        //   * Plain click          → exclusive (clear figure selection too).
        //   * Ctrl/Shift           → additive across populations (preserve
        //                            figure selection so Visio-style mixed
        //                            figure+connector selections build up).
        // FormatMirror's ConnectorSelectionChanged listener seeds the
        // shared editor off the freshly-selected connector(s); the editor
        // already broadcasts back to both populations via FormatMirror's
        // _strokeTargets union.
        const conn = findConnectorAncestor(args.Source);
        if (conn !== undefined)
        {
            const mode = diagram.SelectionMode;
            // Cross-population rule: only plain click clears figures.
            // Ctrl / Shift always preserve them.
            if (!ctrl && !shift) diagram.ClearSelection();

            if (mode === SelectionMode.Single)
            {
                // Single mode collapses every modifier onto "replace
                // with this one" — same as Selector.HandleContainerClick.
                diagram.ClearConnectorSelection();
                diagram.SelectConnector(conn);
                connectorAnchor = conn;
            }
            else if (mode === SelectionMode.Multiple)
            {
                // Multiple mode: every click toggles. Plain click in
                // Multiple ALSO clears the connector track first (it
                // already cleared figures above) — matches Selector.
                if (!ctrl && !shift) diagram.ClearConnectorSelection();
                if (diagram.IsConnectorSelected(conn))
                {
                    diagram.DeselectConnector(conn);
                }
                else
                {
                    diagram.SelectConnector(conn);
                }
                connectorAnchor = conn;
            }
            else // Extended
            {
                const shiftActive = shift && connectorAnchor !== undefined;
                if (shiftActive)
                {
                    diagram.SelectConnectorRange(connectorAnchor!, conn);
                    // Anchor stays put on shift+click — matches Selector.
                }
                else if (ctrl)
                {
                    if (diagram.IsConnectorSelected(conn))
                    {
                        diagram.DeselectConnector(conn);
                    }
                    else
                    {
                        diagram.SelectConnector(conn);
                    }
                    connectorAnchor = conn;
                }
                else
                {
                    diagram.ClearConnectorSelection();
                    diagram.SelectConnector(conn);
                    connectorAnchor = conn;
                }
            }

            // Halo disappears immediately — the just-selected connector
            // no longer qualifies for hover (selected ⇒ no halo per the
            // scope decision), so clear hover state and re-arrange both
            // adorners.
            state.hoveredConnector = undefined;
            syncHoverConnectorSubscription(undefined);
            haloAdornerVisual?.InvalidateArrange();
            editAdornerVisual?.InvalidateArrange();
            args.Handled = true;
            return;
        }

        // Figure body click → clear connector selection on plain click;
        // additive modifiers (Ctrl / Shift) preserve the connector track
        // so the user can build mixed figure+connector selections from
        // either end. Don't set args.Handled — Figure.OnPointerDown still
        // runs to actually update the figure-side selection through the
        // Selector base.
        if (findFigureAncestor(args.Source) !== undefined)
        {
            if (!ctrl && !shift && diagram.SelectedConnectors.length > 0)
            {
                diagram.ClearConnectorSelection();
                editAdornerVisual?.InvalidateArrange();
            }
            return;
        }

        // Truly empty space → clear connector selection (figure-side
        // empty-space handling stays with the Selector base).
        if (diagram.SelectedConnectors.length > 0)
        {
            diagram.ClearConnectorSelection();
            editAdornerVisual?.InvalidateArrange();
        }
    };

    const onPointerMove = (raw: unknown): void => {
        const args = raw as PointerEventArgs;
        mountAdornersIfReady();
        const cursor = localPosition(args, diagram);

        if (state.activeGesture === ConnectorGesture.Create && args.PointerId === state.activePointerId)
        {
            createBehavior.UpdateCursor(cursor);
        }
        else if (state.activeGesture === ConnectorGesture.Edit && args.PointerId === state.activePointerId)
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
            syncHoverSubscription(fig);
            sideAdornerVisual?.InvalidateArrange();
        }

        // Connector hover for the halo. Skip during active gestures and
        // when the cursor is over a Figure (figures sit on top of
        // connectors in z-order; the user is clearly targeting the
        // figure, not whichever connector happens to pass underneath).
        // Halo is non-hit-test, so args.Source is the connector itself
        // when the cursor is over its painted path — no halo-tag
        // fallback needed, and a cursor that leaves the connector
        // immediately reverts conn → undefined which hides the halo.
        let conn: Connector | undefined = undefined;
        if (state.activeGesture === undefined && fig === undefined)
        {
            conn = findConnectorAncestor(args.Source);
            // Suppress halo on already-selected connectors — the
            // EditHandlesAdorner endpoint / waypoint dots already
            // signal "selected"; stacking a halo on top would read
            // as noise.
            if (conn !== undefined && diagram.IsConnectorSelected(conn)) conn = undefined;
        }
        if (conn !== state.hoveredConnector)
        {
            state.hoveredConnector = conn;
            syncHoverConnectorSubscription(conn);
            haloAdornerVisual?.InvalidateArrange();
        }
    };

    const onPointerUp = (raw: unknown): void => {
        const args = raw as PointerEventArgs;
        if (args.PointerId !== state.activePointerId) return;
        const cursor = localPosition(args, diagram);

        if (state.activeGesture === ConnectorGesture.Create)
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
                createBehavior.EndCreate(target, pickSideOfFigure(target, cursor));
            }
            else
            {
                createBehavior.Abort();
            }
        }
        else if (state.activeGesture === ConnectorGesture.Edit)
        {
            if (state.editKind === ConnectorEditKind.Endpoint)
            {
                const target = findFigureAtCanvasPoint(diagram, cursor);
                if (target !== undefined)
                {
                    editAdorner.EndDragOverTarget(target, pickSideOfFigure(target, cursor));
                }
                else
                {
                    editAdorner.EndDragOverEmpty();
                }
            }
            else if (state.editKind === ConnectorEditKind.Waypoint)
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
            syncHoverSubscription(undefined);
            sideAdornerVisual?.InvalidateArrange();
        }
        if (state.hoveredConnector !== undefined)
        {
            state.hoveredConnector = undefined;
            syncHoverConnectorSubscription(undefined);
            haloAdornerVisual?.InvalidateArrange();
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
        syncHoverSubscription(undefined);
        syncHoverConnectorSubscription(undefined);

        if (sideAdornerVisual !== undefined) unmountAdorner(mountedPanel, sideAdornerVisual);
        if (editAdornerVisual !== undefined) unmountAdorner(mountedPanel, editAdornerVisual);
        if (haloAdornerVisual !== undefined) unmountAdorner(mountedPanel, haloAdornerVisual);
        sideAdornerVisual = undefined;
        editAdornerVisual = undefined;
        haloAdornerVisual = undefined;
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
