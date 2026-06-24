import {
    MetaData,
    Model,
    Rect,
    type PropertyDescriptor,
} from '../../runtime/index.js';
import { resolveKey } from '../../runtime/model-internals.js';
import {
    type Geometry,
    Color,
    Pen,
    Point,
    RotateTransform,
    SolidColorBrush,
    type Visual,
} from '../../visual-engine/index.js';
import { Shape } from '../../basic/shapes/shape.js';
import { Canvas } from '../../basic/panels/canvas.js';
import { DataTemplate } from '../../basic/templates/data-template.js';
import { ConnectorEndpoint } from './connector-endpoint.js';
import { Figure } from './figure.js';
import {
    type IPortHost,
    Port,
    PortResolver,
    PortSide,
    type ResolvedPortSide,
} from './port.js';
import {
    ConnectorEnd,
    type ResolvedAnchor,
    type RouteSpec,
    RouterRegistry,
    RoutingMode,
} from './routing/router.js';
import {
    pathGeometryToPolyline,
    polylineToPathGeometry,
    shortenPolyline,
} from './caps/cap-inset.js';

// Self-register the three default routers so a consumer that imports a
// Connector — or anything that transitively imports Connector — gets
// a working RouterRegistry without an explicit side-effect import per
// routing mode. Tests that explicitly import a single router still
// work; the register() calls are idempotent (Map.set). Consumers wanting
// a fully custom routing surface can call RouterRegistry.register again
// after this module loads to override.
import './routing/straight-router.js';
import './routing/orthogonal-router.js';
import './routing/bezier-router.js';

// Per-instance Stroke seed. Cloned in the ctor so PenEditor's in-place
// mutation can't leak across instances — same convention as
// [figure.ts:58](./figure.ts#L58)'s DEFAULT_STROKE.
const DEFAULT_STROKE = new Pen(new SolidColorBrush(Color.FromHex('#475569')), 1.5);

// How the geometric-clip fallback (resolution path 5 of § 3.2) treats
// the host's footprint. Bbox is fast — clip against ArrangedRect.
// Geometry is precise but expensive (full path clipping). v1 ships
// Bbox only; Geometry mode lands when a demo motivates it.
export enum AnchorClip
{
    Bbox     = 'Bbox',
    Geometry = 'Geometry',
}

// Skeleton Connector — DPs + endpoint resolution + route compute +
// reactivity. Cap visuals (§ 3.6), HitTestGeometry widening, and
// interactive edit (§ 4) land in later steps. Inherits Stroke / Fill /
// StrokeThickness / Geometry from Shape; the route compute writes the
// resolved PathGeometry onto Shape.Geometry, and Shape's RenderOverride
// paints it.
//
// MeasureOverride stays as Shape's `=> Size.Zero` — the route is
// reactively computed via OnPropertyChanged on the input DPs and on
// the source / target nodes' position changes, not from the measure
// pass. See "Why not MeasureOverride" in § 3.4 of
// [src/document/connectors.md](../../document/connectors.md).
export class Connector extends Shape
{
    public static readonly SourceKey      = Model.RegisterProperty<ConnectorEndpoint | undefined>(
        Connector, 'Source',      undefined,             MetaData.None);
    public static readonly TargetKey      = Model.RegisterProperty<ConnectorEndpoint | undefined>(
        Connector, 'Target',      undefined,             MetaData.None);
    public static readonly WaypointsKey   = Model.RegisterProperty<readonly Point[] | undefined>(
        Connector, 'Waypoints',   undefined,             MetaData.None);
    public static readonly RoutingModeKey = Model.RegisterProperty<string>(
        Connector, 'RoutingMode', RoutingMode.Orthogonal, MetaData.None);
    public static readonly AnchorClipKey  = Model.RegisterProperty<AnchorClip>(
        Connector, 'AnchorClip',  AnchorClip.Bbox,       MetaData.None);

    // Per-end cap template DPs. When set, the connector instantiates
    // the template's visual at construction-of-the-cap time, reads
    // CapInset off the materialized root, shortens the route polyline
    // by that amount, and rotates the cap by tangentAt(end). Default
    // undefined = no cap at that end. § 3.4 + § 3.6 of
    // [src/document/connectors.md](../../document/connectors.md).
    public static readonly SourceCapTemplateKey = Model.RegisterProperty<DataTemplate | undefined>(
        Connector, 'SourceCapTemplate', undefined, MetaData.None);
    public static readonly TargetCapTemplateKey = Model.RegisterProperty<DataTemplate | undefined>(
        Connector, 'TargetCapTemplate', undefined, MetaData.None);

    // CapInset is an attached property on Visual — set by the cap
    // template author on the cap's template root to tell the connector
    // how far back to shorten the painted line. Registered here with
    // Connector as the owner so markup `[Connector.CapInset]=12` resolves.
    public static readonly CapInsetKey = Model.RegisterAttachedProperty<number>(
        Connector, 'CapInset', 0, MetaData.None);

    public static GetCapInset(v: Visual): number { return v.get_property_value(Connector.CapInsetKey); }
    public static SetCapInset(v: Visual, value: number): void { v.set_property_value(Connector.CapInsetKey, value); }

    public get Source():       ConnectorEndpoint | undefined { return this.get_property_value(Connector.SourceKey); }
    public set Source(v:       ConnectorEndpoint | undefined) { this.set_property_value(Connector.SourceKey, v); }
    public get Target():       ConnectorEndpoint | undefined { return this.get_property_value(Connector.TargetKey); }
    public set Target(v:       ConnectorEndpoint | undefined) { this.set_property_value(Connector.TargetKey, v); }
    public get Waypoints():    readonly Point[] | undefined  { return this.get_property_value(Connector.WaypointsKey); }
    public set Waypoints(v:    readonly Point[] | undefined) { this.set_property_value(Connector.WaypointsKey, v); }
    public get RoutingMode():  string                        { return this.get_property_value(Connector.RoutingModeKey); }
    public set RoutingMode(v:  string)                       { this.set_property_value(Connector.RoutingModeKey, v); }
    public get AnchorClip():   AnchorClip                    { return this.get_property_value(Connector.AnchorClipKey); }
    public set AnchorClip(v:   AnchorClip)                   { this.set_property_value(Connector.AnchorClipKey, v); }
    public get SourceCapTemplate(): DataTemplate | undefined { return this.get_property_value(Connector.SourceCapTemplateKey); }
    public set SourceCapTemplate(v: DataTemplate | undefined) { this.set_property_value(Connector.SourceCapTemplateKey, v); }
    public get TargetCapTemplate(): DataTemplate | undefined { return this.get_property_value(Connector.TargetCapTemplateKey); }
    public set TargetCapTemplate(v: DataTemplate | undefined) { this.set_property_value(Connector.TargetCapTemplateKey, v); }

    // Materialized cap visuals. Lifetime: created when the
    // corresponding *CapTemplate DP is set, replaced when it flips,
    // dropped when it clears. Tests inspect these to verify the
    // cap pipeline produced the expected visual + transform.
    //
    // Not wired into Connector's visual tree in v1 — the overlay-child
    // attachment that puts the cap visually on the diagram is a
    // follow-up step (along with the connectors-layer in the
    // DiagramLayersPanel). For now the pipeline computes the
    // shortened Geometry, the cap's RenderTransform, and the cap's
    // Canvas.Left / Top — but doesn't mount the cap anywhere.
    private _sourceCapInstance: Visual | undefined = undefined;
    private _targetCapInstance: Visual | undefined = undefined;
    public get SourceCapInstance(): Visual | undefined { return this._sourceCapInstance; }
    public get TargetCapInstance(): Visual | undefined { return this._targetCapInstance; }

    // Last resolved anchors from _scheduleRecompute. Edit-mode handle
    // adorners read these to position endpoint dots in canvas-host
    // coords without redoing the 5-path resolution dance themselves.
    // undefined when either endpoint is missing (Geometry is also
    // undefined in that state, so nothing to adorn).
    private _currentSrcAnchor: ResolvedAnchor | undefined = undefined;
    private _currentTgtAnchor: ResolvedAnchor | undefined = undefined;
    public get CurrentSourceAnchor(): ResolvedAnchor | undefined { return this._currentSrcAnchor; }
    public get CurrentTargetAnchor(): ResolvedAnchor | undefined { return this._currentTgtAnchor; }

    // Tracked previous endpoint references so OnPropertyChanged can
    // detach listeners from the OLD endpoint before re-attaching to
    // the NEW one. _trackedSourceNode / _trackedTargetNode play the
    // same role for the inner Node DP.
    private _trackedSource:     ConnectorEndpoint | undefined = undefined;
    private _trackedTarget:     ConnectorEndpoint | undefined = undefined;
    private _trackedSourceNode: Model | undefined = undefined;
    private _trackedTargetNode: Model | undefined = undefined;

    // Side-anchored endpoint registration on the host Figure. When an
    // endpoint settles on (Figure F, PortSide S) with no PortName /
    // PortIndex / FreePoint set, the connector registers it in F's
    // side-endpoint list so its slot index participates in the
    // distribution rule. Subsequent endpoint changes re-register; teardown
    // (Source/Target swap, ctor cleanup) unregisters.
    private _trackedSourceFigure: Figure | undefined = undefined;
    private _trackedSourceSide:   ResolvedPortSide | undefined = undefined;
    private _trackedTargetFigure: Figure | undefined = undefined;
    private _trackedTargetSide:   ResolvedPortSide | undefined = undefined;

    // Re-entry guard. _scheduleRecompute writes to ep.PortSide during
    // the bake step (bare-Node endpoint legacy path), which fires
    // OnPropertyChanged → _on*EndpointInputChanged → _scheduleRecompute
    // RECURSIVELY. Without the guard, the nested call would resolve +
    // route with the freshly-baked side (correct, centered via path 3a)
    // and assign Geometry — and then the outer call would continue with
    // its STALE pre-bake anchors and clobber that Geometry with the
    // off-center first-pass route. The guard skips nested calls; the
    // outer call detects the bake and re-resolves locally to keep the
    // recompute coherent.
    private _recomputing: boolean = false;

    // Bound callbacks — required for symmetric Add/Remove on the
    // Model PropertyChangedListener API.
    private readonly _onSourceEndpointInputChanged = (): void => {
        this._reattachSourceNodeListener();
        this._reregisterSourceSide();
        this._scheduleRecompute();
    };
    private readonly _onTargetEndpointInputChanged = (): void => {
        this._reattachTargetNodeListener();
        this._reregisterTargetSide();
        this._scheduleRecompute();
    };
    private readonly _onSourceNodeMoved = (): void => { this._scheduleRecompute(); };
    private readonly _onTargetNodeMoved = (): void => { this._scheduleRecompute(); };
    private readonly _onSourceSideRebalance = (): void => { this._scheduleRecompute(); };
    private readonly _onTargetSideRebalance = (): void => { this._scheduleRecompute(); };

    constructor()
    {
        super();
        // Per-instance default Stroke. Connector inherits Shape's
        // Stroke=undefined default — DrawGeometry treats that as "paint
        // nothing", which makes every freshly-constructed connector
        // invisible. Same per-instance allocation pattern as Figure so
        // PenEditor's in-place mutation can't leak across connectors.
        this.set_property_value(
            Connector.StrokeKey,
            new Pen(DEFAULT_STROKE.Brush, DEFAULT_STROKE.Thickness));
    }

    protected override OnPropertyChanged(
        descriptor: PropertyDescriptor,
        oldValue:   unknown,
        newValue:   unknown,
    ): void
    {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        if (descriptor === Connector.SourceKey.descriptor)
        {
            // Reregister BEFORE reattach. _reregisterSourceSide unregisters
            // via this._trackedSource (the OLD endpoint instance, set by
            // the prior _reattachSourceEndpoint); _reattachSourceEndpoint
            // then updates _trackedSource to the NEW instance. Swapping
            // the order would have _reregisterSourceSide call
            // _unregisterSideEndpoint with the NEW endpoint, which the
            // side list doesn't know about (no-op), leaving the OLD
            // endpoint stuck in the registry and starving the rebalance
            // fan-out — sibling connectors on the same side wouldn't
            // shift when this connector's endpoint is reassigned to
            // a FreePoint, breaking the dynamic-port rebalance promise.
            this._reregisterSourceSide();
            this._reattachSourceEndpoint();
            this._scheduleRecompute();
        }
        else if (descriptor === Connector.TargetKey.descriptor)
        {
            this._reregisterTargetSide();
            this._reattachTargetEndpoint();
            this._scheduleRecompute();
        }
        else if (descriptor === Connector.WaypointsKey.descriptor
              || descriptor === Connector.RoutingModeKey.descriptor
              || descriptor === Connector.AnchorClipKey.descriptor)
        {
            this._scheduleRecompute();
        }
        else if (descriptor === Connector.SourceCapTemplateKey.descriptor)
        {
            this._sourceCapInstance = instantiateCap(this.SourceCapTemplate);
            this._scheduleRecompute();
        }
        else if (descriptor === Connector.TargetCapTemplateKey.descriptor)
        {
            this._targetCapInstance = instantiateCap(this.TargetCapTemplate);
            this._scheduleRecompute();
        }
    }

    // Per-property subscription bundle. Each Connector tracks ONE
    // source endpoint and ONE target endpoint at a time; the bundle
    // detaches en masse when the endpoint reference flips.
    private _reattachSourceEndpoint(): void
    {
        const prev = this._trackedSource;
        if (prev !== undefined)
        {
            prev.RemovePropertyChangedListener(ConnectorEndpoint.NodeKey,      this._onSourceEndpointInputChanged);
            prev.RemovePropertyChangedListener(ConnectorEndpoint.FreePointKey, this._onSourceEndpointInputChanged);
            prev.RemovePropertyChangedListener(ConnectorEndpoint.PortNameKey,  this._onSourceEndpointInputChanged);
            prev.RemovePropertyChangedListener(ConnectorEndpoint.PortSideKey,  this._onSourceEndpointInputChanged);
            prev.RemovePropertyChangedListener(ConnectorEndpoint.PortIndexKey, this._onSourceEndpointInputChanged);
        }
        this._trackedSource = this.Source;
        const cur = this._trackedSource;
        if (cur !== undefined)
        {
            cur.AddPropertyChangedListener(ConnectorEndpoint.NodeKey,      this._onSourceEndpointInputChanged);
            cur.AddPropertyChangedListener(ConnectorEndpoint.FreePointKey, this._onSourceEndpointInputChanged);
            cur.AddPropertyChangedListener(ConnectorEndpoint.PortNameKey,  this._onSourceEndpointInputChanged);
            cur.AddPropertyChangedListener(ConnectorEndpoint.PortSideKey,  this._onSourceEndpointInputChanged);
            cur.AddPropertyChangedListener(ConnectorEndpoint.PortIndexKey, this._onSourceEndpointInputChanged);
        }
        this._reattachSourceNodeListener();
    }

    private _reattachTargetEndpoint(): void
    {
        const prev = this._trackedTarget;
        if (prev !== undefined)
        {
            prev.RemovePropertyChangedListener(ConnectorEndpoint.NodeKey,      this._onTargetEndpointInputChanged);
            prev.RemovePropertyChangedListener(ConnectorEndpoint.FreePointKey, this._onTargetEndpointInputChanged);
            prev.RemovePropertyChangedListener(ConnectorEndpoint.PortNameKey,  this._onTargetEndpointInputChanged);
            prev.RemovePropertyChangedListener(ConnectorEndpoint.PortSideKey,  this._onTargetEndpointInputChanged);
            prev.RemovePropertyChangedListener(ConnectorEndpoint.PortIndexKey, this._onTargetEndpointInputChanged);
        }
        this._trackedTarget = this.Target;
        const cur = this._trackedTarget;
        if (cur !== undefined)
        {
            cur.AddPropertyChangedListener(ConnectorEndpoint.NodeKey,      this._onTargetEndpointInputChanged);
            cur.AddPropertyChangedListener(ConnectorEndpoint.FreePointKey, this._onTargetEndpointInputChanged);
            cur.AddPropertyChangedListener(ConnectorEndpoint.PortNameKey,  this._onTargetEndpointInputChanged);
            cur.AddPropertyChangedListener(ConnectorEndpoint.PortSideKey,  this._onTargetEndpointInputChanged);
            cur.AddPropertyChangedListener(ConnectorEndpoint.PortIndexKey, this._onTargetEndpointInputChanged);
        }
        this._reattachTargetNodeListener();
    }

    // Node-move reactivity per § 7.2 option (a): hardcoded
    // subscription on 'Left' / 'Top'. Skip silently for nodes without
    // those DPs — the duck-typed contract from
    // [src/document/connectors.md](../../document/connectors.md) treats
    // non-Figure item Models as "supplies position somehow" but does
    // not require Left / Top by name.
    private _reattachSourceNodeListener(): void
    {
        const prev = this._trackedSourceNode;
        if (prev !== undefined && Model.HasProperty(prev.constructor, 'Left'))
        {
            prev.RemovePropertyChangedListener(resolveKey(prev, undefined, 'Left'), this._onSourceNodeMoved);
            prev.RemovePropertyChangedListener(resolveKey(prev, undefined, 'Top'),  this._onSourceNodeMoved);
        }
        const node = this.Source?.Node;
        this._trackedSourceNode = node;
        if (node !== undefined
            && Model.HasProperty(node.constructor, 'Left')
            && Model.HasProperty(node.constructor, 'Top'))
        {
            node.AddPropertyChangedListener(resolveKey(node, undefined, 'Left'), this._onSourceNodeMoved);
            node.AddPropertyChangedListener(resolveKey(node, undefined, 'Top'),  this._onSourceNodeMoved);
        }
    }

    private _reattachTargetNodeListener(): void
    {
        const prev = this._trackedTargetNode;
        if (prev !== undefined && Model.HasProperty(prev.constructor, 'Left'))
        {
            prev.RemovePropertyChangedListener(resolveKey(prev, undefined, 'Left'), this._onTargetNodeMoved);
            prev.RemovePropertyChangedListener(resolveKey(prev, undefined, 'Top'),  this._onTargetNodeMoved);
        }
        const node = this.Target?.Node;
        this._trackedTargetNode = node;
        if (node !== undefined
            && Model.HasProperty(node.constructor, 'Left')
            && Model.HasProperty(node.constructor, 'Top'))
        {
            node.AddPropertyChangedListener(resolveKey(node, undefined, 'Left'), this._onTargetNodeMoved);
            node.AddPropertyChangedListener(resolveKey(node, undefined, 'Top'),  this._onTargetNodeMoved);
        }
    }

    // Side-endpoint registration: the endpoint registers with its host
    // Figure's side list iff it's pinned to (Figure, ResolvedPortSide)
    // with no PortName / PortIndex / FreePoint set (path 3a's gate).
    // Any input change re-checks the gate and re-attaches.
    private _reregisterSourceSide(): void
    {
        if (this._trackedSourceFigure !== undefined && this._trackedSourceSide !== undefined && this._trackedSource !== undefined)
        {
            this._trackedSourceFigure._unregisterSideEndpoint(this._trackedSourceSide, this._trackedSource);
        }
        this._trackedSourceFigure = undefined;
        this._trackedSourceSide   = undefined;
        const ep = this.Source;
        if (ep === undefined) return;
        const slot = endpointSideSlot(ep);
        if (slot === undefined) return;
        const [figure, side] = slot;
        this._trackedSourceFigure = figure;
        this._trackedSourceSide   = side;
        figure._registerSideEndpoint(side, ep, this._onSourceSideRebalance, this);
    }

    private _reregisterTargetSide(): void
    {
        if (this._trackedTargetFigure !== undefined && this._trackedTargetSide !== undefined && this._trackedTarget !== undefined)
        {
            this._trackedTargetFigure._unregisterSideEndpoint(this._trackedTargetSide, this._trackedTarget);
        }
        this._trackedTargetFigure = undefined;
        this._trackedTargetSide   = undefined;
        const ep = this.Target;
        if (ep === undefined) return;
        const slot = endpointSideSlot(ep);
        if (slot === undefined) return;
        const [figure, side] = slot;
        this._trackedTargetFigure = figure;
        this._trackedTargetSide   = side;
        figure._registerSideEndpoint(side, ep, this._onTargetSideRebalance, this);
    }

    // Synchronous recompute — § 7.4 ("throttle?") is a separate
    // open question. V1 ships sync; rAF-coalescing lands when the
    // first interactive demo flags a measurable cost.
    private _scheduleRecompute(): void
    {
        // Re-entry guard. Bake (below) writes ep.PortSide, which fires
        // OnPropertyChanged → _on*EndpointInputChanged → _scheduleRecompute
        // recursively. If we let that nested call run, it would route
        // with the freshly-baked side (correct) and assign Geometry,
        // then the OUTER call would continue, route with its stale
        // pre-bake anchors, and clobber the correct Geometry. The guard
        // suppresses the nested re-entry; the outer call re-resolves
        // locally after bake to pick up the new sides. _reregister*Side
        // / _reattach*NodeListener still run from the listener — they're
        // not gated, only the Geometry recompute is.
        if (this._recomputing) return;
        this._recomputing = true;
        try
        {
            this._scheduleRecomputeBody();
        }
        finally
        {
            this._recomputing = false;
        }
    }

    private _scheduleRecomputeBody(): void
    {
        const src = this.Source;
        const tgt = this.Target;
        if (src === undefined || tgt === undefined)
        {
            this.Geometry = undefined;
            this._currentSrcAnchor = undefined;
            this._currentTgtAnchor = undefined;
            return;
        }
        const waypoints = this.Waypoints ?? EMPTY_WAYPOINTS;

        let srcAnchor: ResolvedAnchor;
        let tgtAnchor: ResolvedAnchor;
        ({ srcAnchor, tgtAnchor } = this._resolveAnchors(src, tgt, waypoints));

        // Auto-bake PortSide for legacy bare-{Node} endpoints (no port
        // refs, no FreePoint, no PortSide). The resolved anchor's `side`
        // becomes the endpoint's pinned side; subsequent resolves go
        // through path 3a and join the side-slot distribution. When
        // either bake fires, re-resolve in-line — the first-pass anchor
        // came from path 4 / 5 (closest port or bbox-centroid geometric
        // clip) and would otherwise stick as an off-center end on a
        // connector the demo wired up as `new ConnectorEndpoint({ Node })`
        // without an explicit PortSide.
        const srcBaked = bakeSideIfBare(src, srcAnchor.side);
        const tgtBaked = bakeSideIfBare(tgt, tgtAnchor.side);
        if (srcBaked || tgtBaked)
        {
            ({ srcAnchor, tgtAnchor } = this._resolveAnchors(src, tgt, waypoints));
        }
        this._currentSrcAnchor = srcAnchor;
        this._currentTgtAnchor = tgtAnchor;

        const router = RouterRegistry.resolve(this.RoutingMode);
        const sourceRect = nodeRect(src.Node) ?? Rect.Zero;
        const targetRect = nodeRect(tgt.Node) ?? Rect.Zero;
        const spec: RouteSpec = {
            sourceRect,
            sourceAnchor: srcAnchor,
            targetRect,
            targetAnchor: tgtAnchor,
            waypoints,
        };
        const routeGeom = router.compute(spec);

        // Cap insets — only applied to line-polyline routes (Straight +
        // Orthogonal). Bezier output stays untouched; caps overlap the
        // cubic endpoint. § 3.6 + cap-inset.ts documented gap.
        const sourceInset = this._sourceCapInstance !== undefined
            ? Connector.GetCapInset(this._sourceCapInstance) : 0;
        const targetInset = this._targetCapInstance !== undefined
            ? Connector.GetCapInset(this._targetCapInstance) : 0;

        if (sourceInset > 0 || targetInset > 0)
        {
            const polyline = pathGeometryToPolyline(routeGeom);
            if (polyline !== undefined)
            {
                const shortened = shortenPolyline(polyline, sourceInset, targetInset);
                this.Geometry = polylineToPathGeometry(shortened) as unknown as Geometry;
            }
            else
            {
                this.Geometry = routeGeom as unknown as Geometry;
            }
        }
        else
        {
            this.Geometry = routeGeom as unknown as Geometry;
        }

        // Cap visual placement: Canvas.Left / Top to the anchor position
        // in diagram-host coords; RenderTransform = RotateTransform with
        // the per-end tangent. Cap orientation contract from
        // [routing/router.ts] tangentAt: source = first-segment direction,
        // target = last-segment-into-target direction.
        placeCap(this._sourceCapInstance, srcAnchor, router.tangentAt(spec, ConnectorEnd.Source));
        placeCap(this._targetCapInstance, tgtAnchor, router.tangentAt(spec, ConnectorEnd.Target));

        // Side-intersection optimization. Now that this connector's
        // Geometry is current, ask each side it's anchored to whether
        // a slot swap between its registered connectors would clear up
        // a crossing. Figure._optimizeSideIntersections is guarded
        // against re-entry: when the optimizer's swap fires
        // _fireSideRebalance, every connector on the side calls back
        // into this method, but the figure's `_optimizing` flag short-
        // circuits the recursive optimize calls. Same flag covers the
        // figure-move trigger (move → connector re-route → this point)
        // and the registration trigger (register → _fireSideRebalance
        // → connector recompute → this point).
        if (this._trackedSourceFigure !== undefined && this._trackedSourceSide !== undefined)
        {
            this._trackedSourceFigure._optimizeSideIntersections(this._trackedSourceSide);
        }
        if (this._trackedTargetFigure !== undefined && this._trackedTargetSide !== undefined)
        {
            this._trackedTargetFigure._optimizeSideIntersections(this._trackedTargetSide);
        }
    }

    // Two-pass anchor resolve. The pass with the Node-pinned endpoint
    // runs FIRST so the FreePoint endpoint's deriveFreeSide sees a real
    // side from the other end (per § 10.2 + § 10.3's perpendicular-
    // respecting derivation). When both endpoints are free or both are
    // Node, default to source-first. Pulled out as a helper so the
    // recompute can call it twice — once for the initial route, again
    // after bake to pick up the freshly-pinned PortSide.
    private _resolveAnchors(
        src: ConnectorEndpoint,
        tgt: ConnectorEndpoint,
        waypoints: readonly Point[],
    ): { srcAnchor: ResolvedAnchor; tgtAnchor: ResolvedAnchor }
    {
        const srcIsFree = src.Node === undefined;
        const tgtIsFree = tgt.Node === undefined;
        let srcAnchor: ResolvedAnchor;
        let tgtAnchor: ResolvedAnchor;
        if (srcIsFree && !tgtIsFree)
        {
            const srcApprox = endpointApproxAnchor(src);
            tgtAnchor = resolveEndpoint(tgt, srcApprox, waypoints, false, this.AnchorClip, false);
            srcAnchor = resolveEndpoint(src, tgtAnchor, waypoints, true,  this.AnchorClip, true);
        }
        else
        {
            const tgtApprox = endpointApproxAnchor(tgt);
            srcAnchor = resolveEndpoint(src, tgtApprox, waypoints, true,  this.AnchorClip, false);
            tgtAnchor = resolveEndpoint(tgt, srcAnchor, waypoints, false, this.AnchorClip, !srcIsFree);
        }
        return { srcAnchor, tgtAnchor };
    }
}

function instantiateCap(template: DataTemplate | undefined): Visual | undefined
{
    if (template === undefined) return undefined;
    // V1: cap DataContext is undefined — caps in the default catalog
    // are static (no per-instance bindings). ConnectorCapDataContext
    // lands when the first dynamic cap (data-driven colors / sizes)
    // surfaces. § 3.6 of [src/document/connectors.md](../../document/connectors.md).
    return template.Apply(undefined);
}

function placeCap(cap: Visual | undefined, anchor: ResolvedAnchor, tangentRadians: number): void
{
    if (cap === undefined) return;
    Canvas.SetLeft(cap, anchor.x);
    Canvas.SetTop(cap, anchor.y);
    // RotateTransform.Angle is in DEGREES (per
    // [drawing/transform.ts:137](../../visual-engine/drawing/transform.ts#L137)
    // — the matrix builder converts to radians internally). Reuse the
    // existing transform when present so a re-route doesn't churn
    // a fresh allocation per tick.
    const degrees = (tangentRadians * 180) / Math.PI;
    const existing = cap.RenderTransform;
    if (existing instanceof RotateTransform)
    {
        existing.Angle = degrees;
    }
    else
    {
        cap.RenderTransform = new RotateTransform(degrees);
    }
}

const EMPTY_WAYPOINTS: readonly Point[] = Object.freeze([]) as readonly Point[];

// ── Endpoint resolution (§ 3.2 paths 1–5) ────────────────────────────

function resolveEndpoint(
    ep:          ConnectorEndpoint,
    otherAnchor: ResolvedAnchor,
    waypoints:   readonly Point[],
    isSource:    boolean,
    anchorClip:  AnchorClip,
    otherIsReal: boolean,
): ResolvedAnchor
{
    // Path 1 — free-floating.
    if (ep.Node === undefined)
    {
        const fp = ep.FreePoint ?? Point.Zero;
        return {
            x:    fp.X,
            y:    fp.Y,
            side: deriveFreeSide({ x: fp.X, y: fp.Y }, otherAnchor, waypoints, isSource, otherIsReal),
        };
    }

    const host  = nodeAsPortHost(ep.Node);
    const ports = nodePorts(ep.Node);

    // Path 2 — named lookup.
    if (ep.PortName !== undefined && ports.length > 0)
    {
        const named = ports.find(p => p.Name === ep.PortName);
        if (named !== undefined) return PortResolver.resolve(named, host);
    }

    // Path 3 — positional lookup (PortSide, PortIndex) against the
    // static provider's port list. Used by consumers that addressed a
    // specific provider-emitted port via its index in a side bucket.
    if (ep.PortSide !== undefined && ep.PortIndex !== undefined && ports.length > 0)
    {
        const positional = lookupPositional(ports, host, ep.PortSide, ep.PortIndex);
        if (positional !== undefined) return PortResolver.resolve(positional, host);
        // Out-of-range → fall through to path 4.
    }

    // Path 3a — side-slot dynamic distribution. When endpoint is pinned
    // to (Figure, PortSide) with no static-port reference (no PortName,
    // no PortIndex, no FreePoint), the figure's side-endpoint registry
    // assigns a slot index; the position is (slot+1)/(count+1) along
    // the side. This is the path side-bar gestures land on; existing
    // connectors registered with the figure participate in distribution.
    const sideSlotAnchor = tryResolveSideSlot(ep);
    if (sideSlotAnchor !== undefined) return sideSlotAnchor;

    // Path 4 — auto-pick closest port to the OTHER endpoint.
    if (ports.length > 0)
    {
        const closest = pickClosestPort(ports, host, otherAnchor);
        return PortResolver.resolve(closest, host);
    }

    // Path 5 — geometric clip.
    return geometricClip(host.ArrangedRect, otherAnchor, anchorClip);
}

// Path 3a gate. Returns a resolved anchor when the endpoint qualifies
// for side-slot resolution: Node is a Figure registered in the
// side-endpoint registry, PortSide is set, and no PortName / PortIndex /
// FreePoint competes. Otherwise undefined — the caller falls through to
// path 4. The slot info (index + count) comes from Figure.GetSideSlot,
// which Connector keeps in sync via _reregister*Side.
//
// Distribution rule — DYNAMIC slot positions sized to the live connector
// count on the side. Each side hosts exactly `count` slots, distributed
// at t = (i + 1) / (count + 1). The formula yields:
//   * odd count  — one slot lands exactly at t = 0.5 (centered).
//   * even count — slots straddle the center symmetrically (no slot at
//                  t = 0.5).
// Cross-connector reactivity is wired through Figure._fireSideRebalance:
// adding or removing a connector on a side fires every existing
// endpoint's rebalance callback (Connector._on*SideRebalance →
// _scheduleRecompute), so the rest of the connectors on the side shift
// to their new t and the orthogonal router re-runs (including the
// perpendicular-beam intersection optimization) with the updated anchors.
//
// Static Port instances declared on the figure (via ExplicitPorts or a
// PortProvider) deliberately DO NOT capture this path — they're for the
// named / positional addressing in Path 2 / 3. Side-only resolution is
// purely dynamic so the centered / symmetric guarantee holds regardless
// of what the designer happened to bake into Ports.
function tryResolveSideSlot(ep: ConnectorEndpoint): ResolvedAnchor | undefined
{
    const slot = endpointSideSlot(ep);
    if (slot === undefined) return undefined;
    const [figure, side] = slot;
    const info = figure.GetSideSlot(ep, side);
    if (info === undefined) return undefined;
    // Use nodeRect so figures without a live Arrange pass (early ctor /
    // tests) still pick up positions from Left / Top / Width / Height.
    // Figure.ArrangedRect defaults to Rect.Zero, which would collapse
    // every slot onto the origin and silently break unit-test fixtures.
    const r = nodeRect(figure);
    if (r === undefined || r.Width === 0 || r.Height === 0) return undefined;
    const t = (info.index + 1) / (info.count + 1);
    switch (side)
    {
        case PortSide.N: return { x: r.X + t * r.Width,  y: r.Y,                side };
        case PortSide.S: return { x: r.X + t * r.Width,  y: r.Y + r.Height,     side };
        case PortSide.E: return { x: r.X + r.Width,      y: r.Y + t * r.Height, side };
        case PortSide.W: return { x: r.X,                y: r.Y + t * r.Height, side };
    }
}

// Endpoint qualifies for the side-anchored registry when its Node is a
// Figure, its PortSide is a cardinal (not Auto), and no competing port
// reference (PortName / PortIndex) or FreePoint is set. Same gate used
// by Connector's `_reregister*Side` registration and by path 3a.
function endpointSideSlot(ep: ConnectorEndpoint): [Figure, ResolvedPortSide] | undefined
{
    if (!(ep.Node instanceof Figure)) return undefined;
    if (ep.PortName  !== undefined) return undefined;
    if (ep.PortIndex !== undefined) return undefined;
    if (ep.FreePoint !== undefined) return undefined;
    const side = ep.PortSide;
    if (side === undefined || side === PortSide.Auto) return undefined;
    return [ep.Node, side];
}

// Bake PortSide into a legacy bare-{Node} endpoint so it joins the
// side-slot distribution on the next resolve. The check mirrors
// endpointSideSlot's gate minus the PortSide test — we only bake if no
// side is set yet, otherwise the assignment would no-op and risk
// triggering an unnecessary OnPropertyChanged loop (set_property_value
// short-circuits on equal values, but the equality check happens after
// any user-installed converters; cheaper to skip altogether).
//
// Returns true iff the gate matched and PortSide was actually written.
// The caller uses this to decide whether to re-resolve anchors inside
// the same _scheduleRecompute call (the side just baked turns the
// endpoint from "bare → path 4/5 off-center" into "side-anchored →
// path 3a side-center"; without a re-resolve the outer call would route
// against stale anchors).
function bakeSideIfBare(ep: ConnectorEndpoint, side: ResolvedPortSide): boolean
{
    if (!(ep.Node instanceof Figure)) return false;
    if (ep.PortName  !== undefined) return false;
    if (ep.PortIndex !== undefined) return false;
    if (ep.FreePoint !== undefined) return false;
    if (ep.PortSide  !== undefined && ep.PortSide !== PortSide.Auto) return false;
    ep.PortSide = side;
    return true;
}

function deriveFreeSide(
    myPos:       { x: number; y: number },
    other:       ResolvedAnchor,
    waypoints:   readonly Point[],
    isSource:    boolean,
    otherIsReal: boolean,
): ResolvedPortSide
{
    // Waypoint-aware: read direction from the adjacent waypoint when
    // one exists. The first / last segments around the waypoint dominate
    // the visible side semantics; the OTHER endpoint's resolved side
    // doesn't matter for derivation in this branch.
    if (waypoints.length > 0)
    {
        const wp = isSource ? waypoints[0]! : waypoints[waypoints.length - 1]!;
        const dx = isSource ? wp.X - myPos.x : myPos.x - wp.X;
        const dy = isSource ? wp.Y - myPos.y : myPos.y - wp.Y;
        return dominantSide(dx, dy);
    }

    // Real-other path: the other endpoint has a pinned side
    // (Node-resolved). Pick our side to produce the minimum-corner
    // perpendicular-preserving route per § 10.2 + § 10.3.
    if (otherIsReal)
    {
        return pickFreeSideForRoute(other.side, { x: other.x, y: other.y }, myPos);
    }

    // Both endpoints free (Case C): no real side anywhere. Fall back to
    // the geometric "toward the other end" derivation. Mostly used for
    // hand-authored free-floating Orthogonal connectors; gives a
    // reasonable side without needing a third reference point.
    const dx = isSource ? other.x - myPos.x : myPos.x - other.x;
    const dy = isSource ? other.y - myPos.y : myPos.y - other.y;
    return dominantSide(dx, dy);
}

function dominantSide(dx: number, dy: number): ResolvedPortSide
{
    if (dx === 0 && dy === 0) return PortSide.E;
    if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? PortSide.E : PortSide.W;
    return dy >= 0 ? PortSide.S : PortSide.N;
}

// Pick the free endpoint's side relative to the pinned other endpoint
// such that an orthogonal route honoring both perpendicularity
// invariants (§ 10.2) has the minimum corner count. The derived side
// determines what the router treats as the free end's outward direction:
//
//   * Free in the pinned end's outward half-plane — L-shape (1 corner)
//     or straight line (0 corners) works. Pick the cardinal that puts
//     the L's last leg perpendicular to the pinned side.
//   * Free at or behind the pinned outward direction — needs a U-shape
//     (2 corners). Pick the SAME side as the pinned end so the route
//     overshoots and comes back in matching direction.
function pickFreeSideForRoute(
    pinnedSide: ResolvedPortSide,
    pinnedPos:  { x: number; y: number },
    freePos:    { x: number; y: number },
): ResolvedPortSide
{
    const dx = freePos.x - pinnedPos.x;
    const dy = freePos.y - pinnedPos.y;
    if (pinnedSide === PortSide.E || pinnedSide === PortSide.W)
    {
        const outward = pinnedSide === PortSide.E ? 1 : -1;
        if (dx * outward > 0)
        {
            if (dy === 0) return pinnedSide === PortSide.E ? PortSide.W : PortSide.E;
            return dy > 0 ? PortSide.N : PortSide.S;
        }
        return pinnedSide;
    }
    const outward = pinnedSide === PortSide.S ? 1 : -1;
    if (dy * outward > 0)
    {
        if (dx === 0) return pinnedSide === PortSide.N ? PortSide.S : PortSide.N;
        return dx > 0 ? PortSide.W : PortSide.E;
    }
    return pinnedSide;
}

// Bucket ports by their RESOLVED side, sort each bucket by primary
// axis (X for N/S, Y for E/W), look up bucket[side][index]. Returns
// undefined when the requested index is out of range — the caller
// falls through to path 4.
function lookupPositional(
    ports: readonly Port[],
    host:  IPortHost,
    side:  PortSide,
    index: number,
): Port | undefined
{
    if (side === PortSide.Auto) return undefined;
    const sideCardinal = side as ResolvedPortSide;
    const bucket: { port: Port; primary: number }[] = [];
    for (const p of ports)
    {
        const a = PortResolver.resolve(p, host);
        if (a.side !== sideCardinal) continue;
        const primary = (sideCardinal === PortSide.N || sideCardinal === PortSide.S) ? a.x : a.y;
        bucket.push({ port: p, primary });
    }
    if (index < 0 || index >= bucket.length) return undefined;
    bucket.sort((a, b) => a.primary - b.primary);
    return bucket[index]!.port;
}

// Closest port to `other` by Euclidean distance (line-of-sight from
// the OTHER endpoint per § 3.2). Tie-break by smaller (Side, Index)
// lex order — implemented as smaller resolved-position-string compare
// so ties between equidistant ports give a deterministic winner
// independent of provider emit order.
function pickClosestPort(
    ports: readonly Port[],
    host:  IPortHost,
    other: ResolvedAnchor,
): Port
{
    let best: { port: Port; dist: number; sideRank: number; idx: number } | undefined;
    for (let i = 0; i < ports.length; i++)
    {
        const p = ports[i]!;
        const a = PortResolver.resolve(p, host);
        const dx = a.x - other.x;
        const dy = a.y - other.y;
        const d  = dx * dx + dy * dy;
        const sideRank = SIDE_RANK[a.side];
        if (best === undefined
            || d < best.dist
            || (d === best.dist && (sideRank < best.sideRank || (sideRank === best.sideRank && i < best.idx))))
        {
            best = { port: p, dist: d, sideRank, idx: i };
        }
    }
    return best!.port;
}

const SIDE_RANK: { readonly [k in ResolvedPortSide]: number } = {
    [PortSide.N]: 0,
    [PortSide.E]: 1,
    [PortSide.S]: 2,
    [PortSide.W]: 3,
};

// Path 5 — clip a line from rect centroid toward `other` against
// rect's bbox. Bbox-mode only in v1; Geometry-clip throws per § 3.5.
function geometricClip(
    rect:       Rect,
    other:      ResolvedAnchor,
    anchorClip: AnchorClip,
): ResolvedAnchor
{
    if (anchorClip === AnchorClip.Geometry)
    {
        throw new Error(
            'Connector: AnchorClip.Geometry mode not implemented in v1; '
            + 'use AnchorClip.Bbox or attach a PortProvider to the host.',
        );
    }
    const cx = rect.X + rect.Width  / 2;
    const cy = rect.Y + rect.Height / 2;
    const dx = other.x - cx;
    const dy = other.y - cy;
    if (dx === 0 && dy === 0) return { x: cx, y: cy, side: PortSide.E };

    let best: { t: number; side: ResolvedPortSide } | undefined;
    const consider = (t: number, side: ResolvedPortSide): void => {
        if (t < 0) return;
        if (best === undefined || t < best.t) best = { t, side };
    };
    if (dx > 0) consider((rect.Right  - cx) / dx, PortSide.E);
    if (dx < 0) consider((rect.Left   - cx) / dx, PortSide.W);
    if (dy > 0) consider((rect.Bottom - cy) / dy, PortSide.S);
    if (dy < 0) consider((rect.Top    - cy) / dy, PortSide.N);
    if (best === undefined) return { x: cx, y: cy, side: PortSide.E };
    return { x: cx + best.t * dx, y: cy + best.t * dy, side: best.side };
}

// ── Node duck-typing helpers ─────────────────────────────────────────

// Node IS a Model; we read its bbox + ports through narrow duck-typed
// interfaces so non-Figure item Models still work as endpoint targets.
// See § 3.5 / § 7.2 of
// [src/document/connectors.md](../../document/connectors.md).

function nodeRect(node: Model | undefined): Rect | undefined
{
    if (node === undefined) return undefined;
    // Prefer Left / Top / Width / Height (always fresh on the next DP
    // tick) over ArrangedRect, which only updates on the next Arrange
    // pass. Without this order, alignment commands and other batch
    // Left / Top mutations recompute the route using the *previous*
    // ArrangedRect — connectors would render at the figure's old
    // position until something else triggers a re-arrange.
    const obj = node as unknown as { Left?: number; Top?: number; Width?: number; Height?: number };
    if (typeof obj.Left === 'number' && typeof obj.Top === 'number'
        && typeof obj.Width === 'number' && !Number.isNaN(obj.Width)
        && typeof obj.Height === 'number' && !Number.isNaN(obj.Height))
    {
        return new Rect(obj.Left, obj.Top, obj.Width, obj.Height);
    }
    // Non-Figure item Models without Left / Top fall back to
    // ArrangedRect (computed by their presenter).
    const ar = (node as unknown as { ArrangedRect?: Rect }).ArrangedRect;
    if (ar !== undefined && ar.Width > 0 && ar.Height > 0) return ar;
    if (typeof obj.Left === 'number' && typeof obj.Top === 'number')
    {
        const w = (typeof obj.Width  === 'number' && !Number.isNaN(obj.Width))  ? obj.Width  : 0;
        const h = (typeof obj.Height === 'number' && !Number.isNaN(obj.Height)) ? obj.Height : 0;
        return new Rect(obj.Left, obj.Top, w, h);
    }
    return undefined;
}

function nodeAsPortHost(node: Model): IPortHost
{
    return {
        ArrangedRect: nodeRect(node) ?? Rect.Zero,
        Geometry:     (node as unknown as { Geometry?: Geometry }).Geometry,
    };
}

function nodePorts(node: Model): readonly Port[]
{
    return (node as unknown as { Ports?: readonly Port[] }).Ports ?? [];
}

// Approx position used as "other" placeholder when source resolves
// before target. Centroid for Node-bearing endpoints, FreePoint
// otherwise.
function endpointApproxAnchor(ep: ConnectorEndpoint): ResolvedAnchor
{
    if (ep.Node !== undefined)
    {
        const r = nodeRect(ep.Node);
        if (r !== undefined)
        {
            return { x: r.X + r.Width / 2, y: r.Y + r.Height / 2, side: PortSide.W };
        }
    }
    const fp = ep.FreePoint;
    if (fp !== undefined) return { x: fp.X, y: fp.Y, side: PortSide.W };
    return { x: 0, y: 0, side: PortSide.W };
}
