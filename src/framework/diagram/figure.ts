import {
    Element,
    MetaData,
    Model,
    Rect,
    Size,
    Visual,
    type PointerEventArgs,
    type PropertyDescriptor,
} from '../../runtime/index.js';
import { Brush, type Geometry, type PathGeometry, type Point, Pen, SolidColorBrush } from '../../visual-engine/index.js';
import { Color } from '../../runtime/index.js';
import { Canvas } from '../../basic/panels/canvas.js';
import { Border } from '../../basic/border.js';
import { ShapeText, TextAutoFit } from './shape-text.js';
import { FieldKind, resolveFields } from './shape-text-field.js';
import { ContentControl } from '../base/content-control.js';
import { ScrollViewer } from '../surfaces/scroll-viewer.js';
import { Selector } from '../list/selector.js';
import { SHAPE_CATALOG_MAP, scaleGeometry } from './shape-catalog.js';
import type { Group } from './group.js';
import { PortSide, type Port, type ResolvedPortSide } from './port.js';
import type { IPortProvider } from './port-providers/port-provider.js';
import { resolveDefaultPortProvider } from './port-providers/default-port-providers.js';
import type { ConnectorEndpoint } from './connector-endpoint.js';
import type { RigidConnectorDragHost, RigidConnectorDragSession } from './rigid-connector-drag.js';
import { DiagramSettings } from './diagram-settings.js';

// A movable, content-hosting control intended as the container shape
// inside the diagrammer's ItemsControl (see Diagram). Figure owns
// two things internally so the demo bootstrap doesn't need a behavior:
//
//   * Position — Left / Top DPs flagged BindsTwoWayByDefault so a
//     `$Left` / `$Top` binding in the container Style threads through
//     to the data context (the node VM). Changes to Left / Top mirror
//     onto this control's own Canvas.Left / Canvas.Top, so a parent
//     Canvas places it.
//
//   * Drag-to-move — OnPointerDown captures the pointer and stores the
//     press offset; OnPointerMove writes back to Left / Top; OnPointerUp
//     releases capture. Capture means the drag survives the cursor
//     leaving the node's hit area, so no per-canvas listener wiring is
//     needed. The handler also distinguishes click-vs-drag: any move
//     past CLICK_THRESHOLD_PX commits to drag mode; if the gesture
//     ends without ever crossing the threshold, OnPointerUp calls the
//     owning Selector's HandleContainerClick — same path ListBoxItem
//     uses — so single-click / Ctrl-click / Shift-click on a node go
//     through the standard Selector machinery (anchor-relative range
//     selection, modifier modes, SelectionChanged batching).
//
// Default Template: a single ContentPresenter. ContentControl's content
// resolution does the rest — when Figure.Content is set to a Model
// (the per-item NodeVM data), ContentControl looks up the matching
// [DataType=…] DataTemplate via Application resources and slots the
// produced Visual into the presenter. Consumers who want chrome around
// the content (selection rings, drop shadows, …) can replace Template.
// Default size for a freshly-constructed Figure sourced from
// DiagramSettings.ShapeDefaultSize() — historically 80×80 dp. Overridable on a
// per-instance basis via the fromKind / fromSource factories.

// Figure DP names whose change should re-resolve the label's {field} tokens.
const FIELD_SOURCE_NAMES: ReadonlySet<string> = new Set(['Left', 'Top', 'Width', 'Height', 'Kind', 'Id']);

// Default fill for a fresh Figure. Tuned to read on @Surface in both Material
// light / dark schemes. Consumers replace by assignment. Stroke width comes
// from DiagramSettings.ShapeStrokeWidth(); the default stroke colour is fixed.
const DEFAULT_FILL         = new SolidColorBrush(Color.FromHex('#bfdbfe'));
const DEFAULT_STROKE_BRUSH = new SolidColorBrush(Color.FromHex('#1976d2'));

export interface FigureFromKindOptions
{
    readonly width?:  number;
    readonly height?: number;
}

export interface FigureFromSourceOptions
{
    readonly width?:  number;
    readonly height?: number;
    /** Optional kind label for serialization round-trip. */
    readonly kind?:   string;
}

export class Figure extends ContentControl
{
    static {
        Model.OverrideMetadata(Figure, Element.DefaultStyleKeyKey, { default_value: Figure });
    }

    public static readonly LeftKey = Model.RegisterProperty<number>(
        Figure, 'Left', 0, MetaData.Arrange | MetaData.BindsTwoWayByDefault);
    public static readonly TopKey = Model.RegisterProperty<number>(
        Figure, 'Top', 0, MetaData.Arrange | MetaData.BindsTwoWayByDefault);

    // Catalog key — populated when the figure was constructed via
    // fromKind() or when a catalog-known kind was passed to fromSource().
    // Empty string for combined-geometry figures (boolean ops).
    public static readonly KindKey = Model.RegisterProperty<string>(
        Figure, 'Kind', '', MetaData.None);

    // The rendered PathGeometry — built from the catalog (kind-based) or
    // parsed from a saved unit-1 source. Resize rebuilds it via
    // scaleGeometry against the cached _source.
    public static readonly GeometryKey = Model.RegisterProperty<PathGeometry | undefined>(
        Figure, 'Geometry', undefined, MetaData.None);

    // Fill brush + stroke pen. Per-instance Pen (PenEditor mutates in
    // place, so sharing across figures would leak edits).
    public static readonly FillKey = Model.RegisterProperty<Brush | undefined>(
        Figure, 'Fill', DEFAULT_FILL, MetaData.None);
    public static readonly StrokeKey = Model.RegisterProperty<Pen | undefined>(
        Figure, 'Stroke', undefined, MetaData.None);

    // The shape's text block (the Visio "text block") — a first-class
    // ShapeText sub-control created per-instance in the ctor and hosted in
    // the default template's PART_LabelHost. It renders itself reactively;
    // `LabelText` below is sugar over `Text.Content`. Measure-affecting so a
    // whole-block swap relays out (Content edits invalidate via ShapeText).
    public static readonly TextKey = Model.RegisterProperty<ShapeText | undefined>(
        Figure, 'Text', undefined, MetaData.Measure);

    // Stable identifier — used by serialize / deserialize and by external
    // consumers that need to refer back to a specific figure after Load.
    public static readonly IdKey = Model.RegisterProperty<string | undefined>(
        Figure, 'Id', undefined, MetaData.None);

    // Selection state — duck-typed by SelectionReflector when the
    // owning Diagram has ReflectSelectionToItems=true.
    public static readonly IsSelectedKey = Model.RegisterProperty<boolean>(
        Figure, 'IsSelected', false, MetaData.None);

    // Per-Figure port-provider override. When set, the `Ports` getter
    // routes through this provider's GetPorts() instead of the
    // framework's kind→provider default table — used for shapes that
    // need a non-default topology for a specific instance (a
    // workflow-style node on a generic rectangle, etc.). Leaving it
    // undefined falls through to resolveDefaultPortProvider() per § 3.8
    // of [docs/connectors.md](../../../docs/connectors.md).
    public static readonly PortProviderKey = Model.RegisterProperty<IPortProvider | undefined>(
        Figure, 'PortProvider', undefined, MetaData.None);

    // Explicit hand-listed Ports. When set, wins over BOTH PortProvider
    // and the kind→provider default — used for shapes whose ports
    // carry semantic data-model meaning (workflow "in" / "out", schema
    // entities). The two-DP shape mirrors the § 3.8 sketch; the
    // ExplicitPorts ?? PortProvider precedence is intentional per
    // § 7.13 (lifting to a concat strategy is the v2 follow-up).
    public static readonly ExplicitPortsKey = Model.RegisterProperty<readonly Port[] | undefined>(
        Figure, 'ExplicitPorts', undefined, MetaData.None);

    // Unit-1 source path for this figure. Cached source-of-truth; resize
    // rebuilds the visible Geometry by scaling this. Combined-geometry
    // figures store the merge result here. View-invisible structural
    // state, so a plain field instead of a DP.
    private _source: PathGeometry | undefined = undefined;

    // Group back-reference. undefined ≡ "top-level". Set by Group when a
    // Figure is added to its Members. Typed via a type-only import to
    // break the figure ↔ group module cycle at runtime; structurally
    // the field is always a Group instance.
    public Parent: Group | undefined = undefined;

    // ── Static factories ─────────────────────────────────────────────
    //
    // Three construction paths mirror the historical ShapeNodeVM:
    //
    //   * fromKind(kind, …)      — toolbox drop / CreateNode. Pulls the
    //                              unit-1 source from the catalog.
    //   * fromSource(source, …)  — combined-geometry path (boolean ops,
    //                              custom paths). Caller is responsible
    //                              for normalizing `source` to unit-1.
    //   * fromSource(source, { kind })
    //                            — catalog-derived but pre-extracted by
    //                              the caller (Load with cached d-string).
    //
    // In every case the Figure holds `_source` (a unit-1 PathGeometry)
    // as the source of truth. The visible `Geometry` DP is the scaled
    // copy at (Width, Height).

    public static fromKind(kind: string, left: number, top: number, options?: FigureFromKindOptions): Figure
    {
        const entry = SHAPE_CATALOG_MAP.get(kind);
        if (entry === undefined)
        {
            throw new Error(`Figure.fromKind: unknown kind '${kind}'`);
        }
        const f = new Figure();
        f.Left = left;
        f.Top  = top;
        f.Width  = options?.width  ?? DiagramSettings.ShapeDefaultSize();
        f.Height = options?.height ?? DiagramSettings.ShapeDefaultSize();
        f._setKindFromCatalog(kind, entry.unit());
        return f;
    }

    public static fromSource(source: PathGeometry, left: number, top: number, options?: FigureFromSourceOptions): Figure
    {
        const f = new Figure();
        f.Left = left;
        f.Top  = top;
        f.Width  = options?.width  ?? DiagramSettings.ShapeDefaultSize();
        f.Height = options?.height ?? DiagramSettings.ShapeDefaultSize();
        f._source = source;
        if (options?.kind !== undefined) f.set_property_value(Figure.KindKey, options.kind);
        f._rebuildGeometry();
        return f;
    }

    /** @internal — used by fromKind and by Load paths that have a cached source. */
    public _setKindFromCatalog(kind: string, source: PathGeometry): void
    {
        this.set_property_value(Figure.KindKey, kind);
        this._source = source;
        this._rebuildGeometry();
    }

    /** Subclass-friendly catalog wiring. Sets the Kind DP and the unit-1
     *  source geometry by looking up `kind` in the shape catalog, then
     *  rebuilds the visible Geometry against the current Width / Height.
     *  Throws when the kind isn't in the catalog — symmetric with
     *  Figure.fromKind. Use from a subclass ctor when the per-kind Fill /
     *  LabelText defaults ride on `OverrideMetadata` and the constructor
     *  only needs to point the figure at its catalog geometry. */
    public ApplyCatalogKind(kind: string): void
    {
        const entry = SHAPE_CATALOG_MAP.get(kind);
        if (entry === undefined)
        {
            throw new Error(`Figure.ApplyCatalogKind: unknown kind '${kind}'`);
        }
        this._setKindFromCatalog(kind, entry.unit());
    }

    /** @internal — exposes the unit-1 source for serialize() consumers. */
    public _getSource(): PathGeometry | undefined { return this._source; }

    // Below CLICK_THRESHOLD_PX of movement the gesture stays in
    // "click" mode (no Left / Top writes happen and OnPointerUp routes
    // through Selector.HandleContainerClick). Cross the threshold
    // once and the gesture commits to drag mode for the rest of the
    // session — even if the cursor wobbles back inside the threshold,
    // we keep dragging.
    private static readonly CLICK_THRESHOLD_PX = 4;

    private _dragging:    boolean = false;
    private _moved:       boolean = false;
    private _pressHostX:  number  = 0;
    private _pressHostY:  number  = 0;
    private _grabOffsetX: number  = 0;
    private _grabOffsetY: number  = 0;

    // Drag-time ScrollViewer state — populated at PointerDown with the
    // nearest enclosing ScrollViewer and its scroll offsets at press
    // time. Used by PointerMove to (a) feed the cursor position into
    // the SV's auto-scroll evaluator (the canvas pulls along when the
    // cursor approaches the viewport edge) and (b) compensate the node
    // position for any scroll delta that happened mid-drag so the node
    // tracks the cursor instead of lagging behind by the scroll amount.
    // undefined when the node lives outside a ScrollViewer — both
    // features no-op in that case.
    private _dragScrollViewer:     ScrollViewer | undefined;
    private _pressScrollOffsetX:   number = 0;
    private _pressScrollOffsetY:   number = 0;

    // Group-drag partners — snapshotted at PointerDown when `this` is
    // part of the enclosing Selector's multi-selection. PointerMove
    // applies the same Left / Top delta to each partner so the whole
    // selection translates together (PowerPoint / Figma convention).
    // undefined when the press wasn't on a selected container — that
    // case drags only `this` and leaves the existing selection alone.
    private _dragPartners: Figure[] | undefined;

    // Rigid-translate session for the connectors INTERNAL to a multi-drag
    // (both endpoints among the moving figures). Opened at PointerDown
    // against the enclosing Diagram, fed the net delta each PointerMove,
    // closed at PointerUp. undefined when no internal connector carries
    // user waypoints (nothing to preserve). See [rigid-connector-drag.ts].
    private _rigidConnectors: RigidConnectorDragSession | undefined;

    constructor()
    {
        super();
        // Per-instance Stroke. The default DP value can't be shared
        // because PenEditor mutates Pens in place — each Figure needs
        // its own. Cloning keeps the visual default consistent without
        // leaking edits across instances; width comes from settings.
        this.set_property_value(Figure.StrokeKey, new Pen(DEFAULT_STROKE_BRUSH, DiagramSettings.ShapeStrokeWidth()));
        // Default size — gives a freshly-constructed Figure a visible
        // footprint even before fromKind / fromSource has run.
        if (Number.isNaN(this.Width))  this.Width  = DiagramSettings.ShapeDefaultSize();
        if (Number.isNaN(this.Height)) this.Height = DiagramSettings.ShapeDefaultSize();
        // Seed Canvas.Left / Canvas.Top from the registered defaults so
        // a freshly-constructed Figure placed into a Canvas without
        // any binding lands at (0,0) instead of inheriting whatever the
        // attached-property defaults happen to be on the parent path.
        Canvas.SetLeft(this, 0);
        Canvas.SetTop (this, 0);
        // The shape's text block — one per Figure so edits (and the coming
        // in-place editor) don't leak across instances. Set on the Text DP
        // before applyDefaultStyle so anything reading it during style
        // resolution sees the instance.
        this.set_property_value(Figure.TextKey, new ShapeText());
        // Default Template flows from the bundled diagram theme entry
        // under TargetType=Figure (see diagram.template.mu): a Canvas
        // hosting a Shape primitive template-bound to this Figure's
        // Geometry / Fill / Stroke / Width / Height, plus a PART_LabelHost
        // into which the ShapeText is slotted below.
        this.applyDefaultStyle();
        // Host the text block in the template's PART_LabelHost (a Border
        // sized to the shape footprint). The block renders itself; a
        // re-template that omits PART_LabelHost simply drops the label.
        const labelHost = this.GetTemplateChild('PART_LabelHost') as Border | undefined;
        labelHost?.SetChild(this.Text);
        // Keep live {field} tokens resolved (§ Slice 6) and honour GrowShape
        // auto-fit (§ Slice 7) when the label's text / document / mode change;
        // geometry-driven field refresh rides OnPropertyChanged below.
        this.Text.AddPropertyChangedListener(ShapeText.DocumentKey, this._onLabelChanged);
        this.Text.AddPropertyChangedListener(ShapeText.ContentKey,  this._onLabelChanged);
        this.Text.AddPropertyChangedListener(ShapeText.AutoFitKey,  this._onLabelChanged);
        this._refreshLabelFields();
        this._applyAutoFit();
    }

    private readonly _onLabelChanged = (): void => { this._refreshLabelFields(); this._applyAutoFit(); };

    // TextAutoFit.GrowShape: grow this figure so the label's natural size
    // fits (plus a margin). Grow-only — never shrinks the shape below its
    // current size. No-op for the other modes. Growing Width/Height rebuilds
    // the geometry and reroutes connectors through the usual DP path; the
    // label re-measures to the same natural size, so the fit converges.
    private _applyAutoFit(): void
    {
        const label = this.Text;
        if (label === undefined || label.AutoFit !== TextAutoFit.GrowShape) return;
        label.Measure(new Size(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY));
        const d = label.DesiredSize;
        const margin = DiagramSettings.ShapeLabelMargin();
        const needW = d.Width  + margin * 2;
        const needH = d.Height + margin * 2;
        if (needW > this.Width)  this.Width  = needW;
        if (needH > this.Height) this.Height = needH;
    }

    // Resolve every {field} in the label against this figure's live values.
    private _refreshLabelFields(): void
    {
        const doc = this.Text?.Document;
        if (doc !== undefined) resolveFields(doc, (k) => this._resolveField(k));
    }

    private _resolveField(key: FieldKind): string | undefined
    {
        switch (key)
        {
            case FieldKind.Width:  return String(Math.round(this.Width));
            case FieldKind.Height: return String(Math.round(this.Height));
            case FieldKind.Left:   return String(Math.round(this.Left));
            case FieldKind.Top:    return String(Math.round(this.Top));
            case FieldKind.Kind:   return this.Kind;
            case FieldKind.Id:     return this.Id ?? '';
            default:               return undefined;
        }
    }

    public get Left(): number       { return this.get_property_value(Figure.LeftKey); }
    public set Left(value: number)  { this.set_property_value(Figure.LeftKey, value); }
    public get Top(): number        { return this.get_property_value(Figure.TopKey); }
    public set Top(value: number)   { this.set_property_value(Figure.TopKey, value); }

    public get Kind(): string                  { return this.get_property_value(Figure.KindKey); }
    public set Kind(value: string)             { this.set_property_value(Figure.KindKey, value); }
    public get Geometry(): PathGeometry | undefined  { return this.get_property_value(Figure.GeometryKey); }
    public set Geometry(value: PathGeometry | undefined) { this.set_property_value(Figure.GeometryKey, value); }
    public get Fill(): Brush | undefined       { return this.get_property_value(Figure.FillKey); }
    public set Fill(value: Brush | undefined)  { this.set_property_value(Figure.FillKey, value); }
    public get Stroke(): Pen | undefined       { return this.get_property_value(Figure.StrokeKey); }
    public set Stroke(value: Pen | undefined)  { this.set_property_value(Figure.StrokeKey, value); }
    // The text block itself. Always present (seeded in the ctor).
    public get Text(): ShapeText               { return this.get_property_value(Figure.TextKey)!; }
    // LabelText — sugar over Text.Content for the common "just set a caption"
    // path (and back-compat with the old flat string DP).
    public get LabelText(): string             { return this.Text?.Content ?? ''; }
    public set LabelText(value: string)        { if (this.Text !== undefined) this.Text.Content = value; }
    public get Id(): string | undefined        { return this.get_property_value(Figure.IdKey); }
    public set Id(value: string | undefined)   { this.set_property_value(Figure.IdKey, value); }
    public get IsSelected(): boolean           { return this.get_property_value(Figure.IsSelectedKey); }
    public set IsSelected(value: boolean)      { this.set_property_value(Figure.IsSelectedKey, value); }

    public get PortProvider(): IPortProvider | undefined { return this.get_property_value(Figure.PortProviderKey); }
    public set PortProvider(value: IPortProvider | undefined) { this.set_property_value(Figure.PortProviderKey, value); }
    public get ExplicitPorts(): readonly Port[] | undefined { return this.get_property_value(Figure.ExplicitPortsKey); }
    public set ExplicitPorts(value: readonly Port[] | undefined) { this.set_property_value(Figure.ExplicitPortsKey, value); }

    // Unified port read surface — explicit list wins; otherwise
    // delegate to the per-Figure provider; otherwise the framework's
    // kind→provider default. § 7.13 of
    // [docs/connectors.md](../../../docs/connectors.md) tracks
    // the open question on lifting "either-or" to a concat-with-name-collision
    // strategy; v1 ships with the simple precedence below.
    public get Ports(): readonly Port[]
    {
        const explicit = this.ExplicitPorts;
        if (explicit !== undefined) return explicit;
        const provider = this.PortProvider ?? resolveDefaultPortProvider(this);
        return provider.GetPorts(this);
    }

    // ── Side-anchored endpoint registry ──────────────────────────────
    //
    // Per-side lists of ConnectorEndpoints whose Node references THIS
    // Figure and whose PortSide pins them to that side. The framework's
    // side-slot resolver (path 3a in connector.ts's resolveEndpoint)
    // reads these lists to compute each endpoint's position along its
    // side via the even-distribution rule:
    //
    //   slot N of M endpoints on a side sits at fractional offset
    //   (N + 1) / (M + 1) along the side's length
    //
    // — symmetric around the side's centre, with the centre slot
    // occupied for odd M and left empty for even M (e.g. M=2 →
    // 1/3, 2/3; M=3 → 1/4, 1/2, 3/4).
    //
    // Connectors register their endpoints with `_registerSideEndpoint`
    // when an endpoint settles on a (this Figure, side) pair and
    // unregister via `_unregisterSideEndpoint` when it moves off, gets
    // freed, or the connector is torn down. The rebalance callback is
    // invoked for every endpoint on a side whenever the list changes,
    // so connectors re-resolve and re-render at the new slot positions.
    private readonly _sideEndpoints: Map<ResolvedPortSide, ConnectorEndpoint[]> = new Map();
    private readonly _sideRebalanceCallbacks: Map<ConnectorEndpoint, () => void> = new Map();
    // Endpoint → owning Connector (duck-typed). The side-intersection
    // optimizer reads the owner's Geometry to detect crossings between
    // pairs of connectors on the same side; storing the back-reference
    // here avoids a quadratic scan through diagram.Connectors at every
    // optimize pass.
    private readonly _sideEndpointOwners: Map<ConnectorEndpoint, ISideAnchoredConnector> = new Map();
    // Re-entry guard for _optimizeSideIntersections. The optimizer calls
    // _fireSideRebalance to re-route after each swap; the re-route
    // cascades back through Connector recompute paths that themselves
    // call _optimizeSideIntersections. Without the guard the optimizer
    // recurses indefinitely.
    private _optimizing: boolean = false;

    /** @internal — called by Connector when an endpoint settles on this Figure + side. */
    public _registerSideEndpoint(
        side: ResolvedPortSide,
        endpoint: ConnectorEndpoint,
        onRebalance: () => void,
        owner?: ISideAnchoredConnector,
    ): void
    {
        let list = this._sideEndpoints.get(side);
        if (list === undefined) { list = []; this._sideEndpoints.set(side, list); }
        if (list.includes(endpoint)) return;
        list.push(endpoint);
        this._sideRebalanceCallbacks.set(endpoint, onRebalance);
        if (owner !== undefined) this._sideEndpointOwners.set(endpoint, owner);
        this._fireSideRebalance(side);
    }

    /** @internal — called by Connector when an endpoint moves off / clears. */
    public _unregisterSideEndpoint(side: ResolvedPortSide, endpoint: ConnectorEndpoint): void
    {
        const list = this._sideEndpoints.get(side);
        if (list === undefined) return;
        const idx = list.indexOf(endpoint);
        if (idx < 0) return;
        list.splice(idx, 1);
        this._sideRebalanceCallbacks.delete(endpoint);
        this._sideEndpointOwners.delete(endpoint);
        this._fireSideRebalance(side);
    }

    /** Slot index + total count for `endpoint` on `side`, or undefined
     *  if the endpoint isn't registered on that side. The slot index is
     *  insertion-order based, which keeps positions stable across
     *  unrelated additions to OTHER sides. */
    public GetSideSlot(
        endpoint: ConnectorEndpoint,
        side: ResolvedPortSide,
    ): { index: number; count: number } | undefined
    {
        const list = this._sideEndpoints.get(side);
        if (list === undefined) return undefined;
        const idx = list.indexOf(endpoint);
        if (idx < 0) return undefined;
        return { index: idx, count: list.length };
    }

    /** Number of side-anchored endpoints currently registered on `side`.
     *  The dynamic-port distribution lays this many slots along the side
     *  via `t = (i + 1) / (count + 1)`; the SideBarsAdorner uses this
     *  count to paint a port-marker dot per slot. */
    public GetSideEndpointCount(side: ResolvedPortSide): number
    {
        return this._sideEndpoints.get(side)?.length ?? 0;
    }

    /** Slot index whose dynamic position is nearest `cursor` along the
     *  side's distribution axis (Y for E/W, X for N/S), inverting the
     *  same Left/Top/Width/Height slot layout the resolver lays out in
     *  [connector.ts]'s tryResolveSideSlot. Returns undefined when the
     *  side is empty or the figure is unsized. */
    public SlotIndexForPosition(side: ResolvedPortSide, cursor: Point): number | undefined
    {
        const list = this._sideEndpoints.get(side);
        if (list === undefined || list.length === 0) return undefined;
        const count = list.length;
        const vertical = side === PortSide.E || side === PortSide.W;   // distributes along Y
        const start = vertical ? this.Top    : this.Left;
        const len   = vertical ? this.Height : this.Width;
        if (len <= 0) return undefined;
        const pos = vertical ? cursor.Y : cursor.X;
        // slotCenter(i) = start + (i + 1) / (count + 1) * len  →  invert for i.
        let idx = Math.round((pos - start) / len * (count + 1) - 1);
        if (idx < 0) idx = 0;
        if (idx > count - 1) idx = count - 1;
        return idx;
    }

    /** Move `endpoint` to slot `toIndex` on `side`, firing a rebalance so
     *  every connector on the side re-routes at its new slot. The index is
     *  clamped to the list; a no-op move (same index) skips the rebalance.
     *  Backs the position-based segment-drag reorder + its abort restore. */
    public MoveSideEndpoint(side: ResolvedPortSide, endpoint: ConnectorEndpoint, toIndex: number): void
    {
        const list = this._sideEndpoints.get(side);
        if (list === undefined) return;
        const from = list.indexOf(endpoint);
        if (from < 0) return;
        let to = toIndex;
        if (to < 0) to = 0;
        if (to > list.length - 1) to = list.length - 1;
        if (to === from) return;
        list.splice(from, 1);
        list.splice(to, 0, endpoint);
        this._fireSideRebalance(side);
    }

    /** Reorder `endpoint` on `side` to the slot nearest `cursor` —
     *  SlotIndexForPosition + MoveSideEndpoint. No-op when the side is
     *  empty or the figure is unsized. */
    public ReorderSideEndpoint(side: ResolvedPortSide, endpoint: ConnectorEndpoint, cursor: Point): void
    {
        const idx = this.SlotIndexForPosition(side, cursor);
        if (idx === undefined) return;
        this.MoveSideEndpoint(side, endpoint, idx);
    }

    private _fireSideRebalance(side: ResolvedPortSide): void
    {
        const list = this._sideEndpoints.get(side);
        if (list === undefined) return;
        // Snapshot — listener may unregister mid-fire (a rebalance can
        // cascade through a Connector that detaches its previous side).
        for (const ep of [...list])
        {
            this._sideRebalanceCallbacks.get(ep)?.();
        }
        // Notify external observers (the SideBarsAdorner port-marker
        // overlay) that the side-endpoint count for at least one side
        // changed. Connectors react via the per-endpoint rebalance
        // callbacks above; this channel is for visual indicators that
        // need to redraw without owning a connector endpoint themselves.
        for (const l of [...this._sideEndpointsChangedListeners]) l();
    }

    private readonly _sideEndpointsChangedListeners: Set<() => void> = new Set();
    public AddSideEndpointsChangedListener   (listener: () => void): void { this._sideEndpointsChangedListeners.add(listener); }
    public RemoveSideEndpointsChangedListener(listener: () => void): void { this._sideEndpointsChangedListeners.delete(listener); }

    /** @internal — greedy pairwise swap pass that re-orders the side's
     *  endpoint list to eliminate intersections between connectors that
     *  both attach to `side`. Triggered by Connector._scheduleRecompute
     *  after every recompute (registration changes AND figure moves both
     *  reach this entry point). Bounded iteration so an unbreakable
     *  intersection topology (e.g., a waypoint pinning the route through
     *  another connector's path) doesn't loop forever. */
    public _optimizeSideIntersections(side: ResolvedPortSide): void
    {
        if (this._optimizing) return;
        const list = this._sideEndpoints.get(side);
        if (list === undefined || list.length < 2) return;
        const owners: ISideAnchoredConnector[] = [];
        for (const ep of list)
        {
            const o = this._sideEndpointOwners.get(ep);
            if (o === undefined) return;  // mixed-ownership side — skip
            owners.push(o);
        }
        this._optimizing = true;
        try
        {
            let improved = true;
            let iter = 0;
            // Per-iteration cap: a full pairwise sweep already restores
            // invariants for typical N ≤ 4. The outer cap of 4 iterations
            // gives the algorithm room to converge if a swap that helped
            // pair (i, j) accidentally breaks pair (i, k); rarely needed
            // in practice but bounds worst-case work.
            while (improved && iter++ < 4)
            {
                improved = false;
                for (let i = 0; i < list.length - 1; i++)
                {
                    for (let j = i + 1; j < list.length; j++)
                    {
                        if (!connectorsConflict(owners[i]!, owners[j]!)) continue;
                        // Try the swap. _fireSideRebalance re-routes
                        // every endpoint on the side at the new slot
                        // positions.
                        [list[i], list[j]] = [list[j]!, list[i]!];
                        [owners[i], owners[j]] = [owners[j]!, owners[i]!];
                        this._fireSideRebalance(side);
                        if (connectorsConflict(owners[i]!, owners[j]!))
                        {
                            // Didn't help — revert.
                            [list[i], list[j]] = [list[j]!, list[i]!];
                            [owners[i], owners[j]] = [owners[j]!, owners[i]!];
                            this._fireSideRebalance(side);
                        }
                        else
                        {
                            improved = true;
                        }
                    }
                }
            }
        }
        finally
        {
            this._optimizing = false;
        }
    }

    private _rebuildGeometry(): void
    {
        if (this._source === undefined) return;
        this.set_property_value(Figure.GeometryKey, scaleGeometry(this._source, this.Width, this.Height));
    }

    protected override OnPropertyChanged(
        descriptor: PropertyDescriptor,
        oldValue:   unknown,
        newValue:   unknown,
    ): void
    {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        // Mirror Left / Top onto Canvas.Left / Canvas.Top so the enclosing
        // Canvas re-positions us on its next Arrange pass. MetaData.Arrange
        // on the DP triggers an InvalidateArrange on this Visual; the
        // Canvas's own Arrange re-reads the attached properties and
        // re-places its children, so position changes propagate without
        // any per-child Canvas subscription.
        //
        // Match by descriptor identity (not by `Name`) since both Figure's
        // own Left/Top DPs and the Canvas.Left/Canvas.Top attached props
        // share the names — comparing strings would loop infinitely as
        // each Canvas.Set re-fires OnPropertyChanged with the same name.
        if (descriptor === Figure.LeftKey.descriptor && typeof newValue === 'number')
        {
            Canvas.SetLeft(this, newValue);
        }
        else if (descriptor === Figure.TopKey.descriptor && typeof newValue === 'number')
        {
            Canvas.SetTop(this, newValue);
        }
        // Resize rebuilds the rendered Geometry from the cached unit-1
        // source. Skipped when _source is undefined (a freshly-constructed
        // Figure without a kind/source assignment yet).
        else if ((descriptor.Name === 'Width' || descriptor.Name === 'Height')
                 && this._source !== undefined)
        {
            this._rebuildGeometry();
        }
        // Slice 6: re-resolve live {field} tokens when a source value changes.
        if (FIELD_SOURCE_NAMES.has(descriptor.Name)) this._refreshLabelFields();
    }

    protected override OnPointerDown(args: PointerEventArgs): void
    {
        if (args.Handled) return;
        // Double-click begins in-place label editing (Visio). Skip the
        // drag / click-select machinery entirely for this gesture — the
        // editor takes the pointer from here.
        if (args.IsDoubleClick)
        {
            this.Text?.BeginEdit();
            args.Handled = true;
            return;
        }
        // Press offset = where inside the node the cursor landed. Stored
        // in host (canvas) coordinates against the node's current Left /
        // Top — moving the node is then "wherever the cursor goes,
        // subtract the grab offset to place the top-left."
        this._dragging    = true;
        this._moved       = false;
        this._pressHostX  = args.HostX;
        this._pressHostY  = args.HostY;
        this._grabOffsetX = args.HostX - this.Left;
        this._grabOffsetY = args.HostY - this.Top;
        // Snapshot the enclosing ScrollViewer (if any) + its press-time
        // offsets — auto-scroll pulses + scroll-delta compensation in
        // OnPointerMove read these.
        this._dragScrollViewer   = Figure.findScrollViewer(this);
        // Snapshot the EFFECTIVE (clamped) offsets, not the raw DP values.
        // The raw HorizontalOffset / VerticalOffset DPs are never auto-
        // clamped on assignment (raw stays queryable so two-way bindings
        // see what they wrote). The canvas-origin-in-host is driven by
        // the effective offset, so OnPointerMove's scroll compensation
        // must be in the same frame.
        this._pressScrollOffsetX = this._dragScrollViewer?.effectiveHorizontalOffset() ?? 0;
        this._pressScrollOffsetY = this._dragScrollViewer?.effectiveVerticalOffset()   ?? 0;
        // Snapshot group-drag partners. The press-time snapshot pins
        // the partner set for the whole gesture — selection mutations
        // mid-drag (rare, but routed-event ordering is finicky) won't
        // peel partners off mid-translation. `this` is excluded from
        // the partner list and moved separately in OnPointerMove —
        // keeps the delta-from-cursor formula honest (it reads / writes
        // `this.Left` / `this.Top` directly).
        this._dragPartners = undefined;
        const selector = Selector.FromContainer<Selector>(
            this, (v: Visual): v is Selector => v instanceof Selector);
        const partners: Figure[] = [];
        // Selection-based partners — if `this` is selected, every other
        // selected container drags along with it (PowerPoint multi-select
        // semantics). Drag from a NON-selected node ignores the existing
        // selection; only `this` moves.
        if (selector !== undefined && Selector.GetIsSelected(this))
        {
            for (const c of selector.SelectedContainers)
            {
                if (c !== this && c instanceof Figure) partners.push(c);
            }
        }
        // Group-membership partners — if the bound data exposes a
        // hierarchical Parent / Members structure (Visio-style groups),
        // every other leaf in `this`'s TOP-LEVEL ancestor drags along
        // regardless of selection state. That matches Visio / PowerPoint:
        // grabbing any member of a group moves the whole group, even
        // when the selection didn't pre-cover it.
        //
        // Structural duck-typing on DataContext — `Parent` (chained up to
        // the root) and `Members` (with `.Count` + `.Get(i)` on the root)
        // are the only contract. Any data shape that fits gets group-drag
        // for free; this framework class doesn't import the demo's
        // GroupVM.
        if (selector !== undefined)
        {
            // Items-are-Figures: the Figure IS the data entity, so the
            // Parent chain lives directly on `this` (a `Parent: Group |
            // undefined` field set by DiagramDocument.Group when the
            // figure is wrapped). The earlier shape read `this.DataContext`,
            // which the framework Diagram no longer sets when items are
            // already Figure instances — so the partner block silently
            // never ran and a member's drag moved it solo.
            //
            // Fallback to DataContext keeps the duck-type contract intact
            // for the legacy ItemsSource-of-VMs path (Diagram.bindContainer
            // sets DataContext when wrapping a non-Figure Model).
            const entity = (this as unknown as { Parent?: unknown }).Parent !== undefined
                ? (this as unknown as { Parent?: unknown })
                : this.DataContext as { Parent?: unknown } | undefined;
            if (entity !== undefined)
            {
                // Walk up to the outermost ancestor. For a leaf with no
                // Parent, root === entity and collectHierarchicalLeaves
                // returns just [entity] — the loop body then degenerates
                // to a no-op (we skip self). For a leaf inside a group,
                // root is the top-level group and the loop adds every
                // other leaf.
                let root: { Parent?: unknown } = entity;
                while (root.Parent !== undefined) root = root.Parent as { Parent?: unknown };
                const leaves: unknown[] = [];
                Figure.collectHierarchicalLeaves(root, leaves);
                for (const leaf of leaves)
                {
                    if (leaf === this) continue;
                    // Items-are-Figures: the leaf already IS its container.
                    // Fall back to the Generator lookup for legacy VM-as-
                    // items consumers, where leaf is a data row and the
                    // container is a wrapping Figure.
                    const container = leaf instanceof Figure
                        ? leaf
                        : selector.Generator.ContainerFromItem(leaf);
                    if (container instanceof Figure && container !== this
                        && !partners.includes(container))
                    {
                        partners.push(container);
                    }
                }
            }
        }
        if (partners.length > 0) this._dragPartners = partners;
        args.CapturePointer(this);
        args.Handled = true;
    }

    // Open the rigid-translate session for connectors internal to the
    // moving set (both endpoints among these figures) so their hand-bent
    // waypoints slide with the selection instead of being cleared by the
    // per-figure reroute. Deferred to the drag-threshold crossing (not
    // PointerDown) so a plain click never scans the connector list. The
    // enclosing Selector IS the Diagram (the connector store); duck-type it
    // to the host interface to avoid the diagram → figure import cycle
    // (same pattern as PositionSnap).
    private beginRigidConnectorDrag(): void
    {
        const movingSet = new Set<Model>([this, ...(this._dragPartners ?? [])]);
        const selector = Selector.FromContainer<Selector>(
            this, (v: Visual): v is Selector => v instanceof Selector);
        const dragHost = selector as unknown as Partial<RigidConnectorDragHost> | undefined;
        this._rigidConnectors = dragHost?.BeginRigidConnectorDrag?.(movingSet);
    }

    protected override OnPointerMove(args: PointerEventArgs): void
    {
        if (!this._dragging) return;
        // Stay in click mode under the threshold so a normal click
        // doesn't drag the node by 1px and turn off the click-to-
        // select path.
        if (!this._moved)
        {
            const dx = args.HostX - this._pressHostX;
            const dy = args.HostY - this._pressHostY;
            if (Math.hypot(dx, dy) < Figure.CLICK_THRESHOLD_PX) return;
            this._moved = true;
            // The gesture is now a drag — snapshot the internal connectors
            // before the first position write clears their waypoints.
            this.beginRigidConnectorDrag();
        }
        const sv = this._dragScrollViewer;

        // Snapshot pre-move position — partners get ONE net delta per
        // pointer-move event, after any cascade-driven re-corrections
        // below have settled.
        const preMoveLeft = this.Left;
        const preMoveTop  = this.Top;

        // First pass: write this.Left / this.Top using the current effective
        // scroll offset.
        this.moveSelfToCursor(args.HostX, args.HostY, sv);

        // Cascade-correct loop. When the canvas (PaginatedCanvas) shrinks
        // because our write reduced the union extent, the ScrollViewer's
        // effective offset clamps to a smaller value at the next layout
        // pass. The canvas-origin-in-host shifts; the position we just
        // wrote now lands a screen-pixel off the cursor by the clamp
        // delta. The fix: force a layout flush, re-read effective
        // offsets, re-compute the target Left / Top, write again. Iterate
        // until offsets stop changing (or a safety cap is hit — a
        // cyclic shrink/grow scenario shouldn't exist but cap anyway).
        const host = this.FindAncestorPresentationTarget() as
            unknown as { Flush?(): void } | undefined;
        if (sv !== undefined && host?.Flush !== undefined)
        {
            let lastEffX = sv.effectiveHorizontalOffset();
            let lastEffY = sv.effectiveVerticalOffset();
            for (let iter = 0; iter < 4; iter++)
            {
                host.Flush();
                const curEffX = sv.effectiveHorizontalOffset();
                const curEffY = sv.effectiveVerticalOffset();
                if (curEffX === lastEffX && curEffY === lastEffY) break;
                lastEffX = curEffX;
                lastEffY = curEffY;
                this.moveSelfToCursor(args.HostX, args.HostY, sv);
            }
        }

        // Group-drag delta: every partner shifts by the NET vector this
        // ended up moving (initial + any cascade corrections). Applying
        // partners AFTER the converge loop keeps them in lockstep with
        // the final this.Left / this.Top rather than the pre-correction
        // intermediate.
        const netDx = this.Left - preMoveLeft;
        const netDy = this.Top  - preMoveTop;
        if (this._dragPartners !== undefined && (netDx !== 0 || netDy !== 0))
        {
            for (const partner of this._dragPartners)
            {
                partner.Left = partner.Left + netDx;
                partner.Top  = partner.Top  + netDy;
            }
        }

        // Slide the internal connectors' waypoints by the same net delta.
        // Runs AFTER self + partners moved (whose Left/Top writes cleared
        // those waypoints) and re-lays them at snapshot + running total —
        // overwriting the clear within this synchronous tick, so the route
        // never paints in its torn-down state.
        if (this._rigidConnectors !== undefined && (netDx !== 0 || netDy !== 0))
        {
            this._rigidConnectors.Translate(netDx, netDy);
        }

        // Edge auto-scroll — the SV starts / continues / stops a tick
        // timer based on cursor proximity to its viewport edges. The
        // pulse re-evaluates on every move; the timer keeps scrolling
        // even when the cursor sits still near an edge.
        sv?.EvaluateEdgeAutoScroll(args.HostX, args.HostY);
        args.Handled = true;
    }

    // Single self-move sub-step used by OnPointerMove. Reads the
    // ScrollViewer's EFFECTIVE (post-clamp) offsets so a shrink-driven
    // canvas-origin shift gets compensated correctly. Writes Left / Top
    // at the Local tier — the Figure IS the data now (no Style binding
    // sitting underneath), so the write stays at Local and the value
    // sticks for the next Arrange pass.
    private moveSelfToCursor(hostX: number, hostY: number, sv: ScrollViewer | undefined): void
    {
        const effX = sv?.effectiveHorizontalOffset() ?? 0;
        const effY = sv?.effectiveVerticalOffset()   ?? 0;
        const scrollDx = sv !== undefined ? effX - this._pressScrollOffsetX : 0;
        const scrollDy = sv !== undefined ? effY - this._pressScrollOffsetY : 0;
        let candidateLeft = hostX - this._grabOffsetX + scrollDx;
        let candidateTop  = hostY - this._grabOffsetY + scrollDy;
        // §19.3 — apply the enclosing Diagram's PositionSnap callback
        // before writing. The callback returns a snapped rect; we
        // honour its X / Y (the rect's top-left in canvas coords) but
        // keep the candidate's Width / Height (snap is positional, not
        // dimensional). Imports the Diagram class lazily to avoid the
        // diagram.ts → figure.ts cycle visible to TS.
        const ar = this.ArrangedRect;
        const w = ar?.Width  ?? 0;
        const h = ar?.Height ?? 0;
        const selector = Selector.FromContainer<Selector>(
            this, (v: Visual): v is Selector => v instanceof Selector);
        const snap = (selector as unknown as { PositionSnap?: (r: Rect) => Rect } | undefined)?.PositionSnap;
        if (snap !== undefined)
        {
            const snapped = snap(new Rect(candidateLeft, candidateTop, w, h));
            candidateLeft = snapped.X;
            candidateTop  = snapped.Y;
        }
        this.Left = candidateLeft;
        this.Top  = candidateTop;
    }

    protected override OnPointerUp(args: PointerEventArgs): void
    {
        if (!this._dragging) return;
        const wasDrag = this._moved;
        this._dragging = false;
        this._moved    = false;
        // Drop the press-time partner snapshot — gesture is over.
        this._dragPartners = undefined;
        // Close the rigid-translate session — waypoints already sit at their
        // final translated positions.
        this._rigidConnectors?.End();
        this._rigidConnectors = undefined;
        // Stop any auto-scroll tick we kicked off, regardless of whether
        // the gesture was a drag or a click — StopEdgeAutoScroll is a
        // no-op when no timer is active.
        this._dragScrollViewer?.StopEdgeAutoScroll();
        this._dragScrollViewer = undefined;
        args.ReleasePointerCapture();
        if (!wasDrag)
        {
            const selector = Selector.FromContainer<Selector>(
                this, (v: Visual): v is Selector => v instanceof Selector);
            // Visio / PowerPoint-style: clicking a member of a Group
            // selects the outermost Group, not the leaf. Walk up the
            // Parent chain to find the top-level entity (a Figure with
            // no Parent, or a Group with no Parent). The Selector takes
            // it as the selected container; SelectionBoundsAdorner /
            // SelectionResize wire bounds around the group bbox, and
            // ALL members move together when the user starts dragging
            // (group-drag partners in OnPointerDown collect siblings
            // anyway, but the selection-bounds adorner needs the Group
            // as a SelectedItems entry to draw around the union).
            let target: Visual = this;
            let parent: unknown = (this as unknown as { Parent?: unknown }).Parent;
            while (parent instanceof Visual)
            {
                target = parent;
                parent = (parent as unknown as { Parent?: unknown }).Parent;
            }
            selector?.HandleContainerClick(target, args.Modifiers);
        }
        args.Handled = true;
    }

    // Recursive descent on a hierarchical DataContext, structurally typed.
    // A node with a `Members` collection (anything exposing `.Count` and
    // `.Get(i)` — ObservableCollection or duck-equivalent) recurses into
    // its members; anything else is a leaf and gets appended. Used by
    // OnPointerDown to gather group-drag partners for any node whose
    // bound data sits inside a Visio-/PowerPoint-style group hierarchy.
    // Defined as a static helper so the OnPointerDown body stays linear.
    private static collectHierarchicalLeaves(entity: unknown, out: unknown[]): void
    {
        const members = (entity as { Members?: { Count?: number; Get?(i: number): unknown } }).Members;
        if (members !== undefined
            && typeof members.Count === 'number'
            && typeof members.Get   === 'function')
        {
            for (let i = 0; i < members.Count; i++)
            {
                Figure.collectHierarchicalLeaves(members.Get(i), out);
            }
            return;
        }
        out.push(entity);
    }

    // Walk up the visual tree to find the closest enclosing ScrollViewer
    // (if any). Used at PointerDown so the auto-scroll / scroll-delta
    // compensation logic in OnPointerMove can read offsets without re-
    // walking on every move.
    private static findScrollViewer(start: Visual): ScrollViewer | undefined
    {
        let cur: Visual | undefined = start.GetVisualParent();
        while (cur !== undefined)
        {
            if (cur instanceof ScrollViewer) return cur;
            cur = cur.GetVisualParent();
        }
        return undefined;
    }
}

// Duck-typed shape of a Connector for the side-intersection optimizer.
// Avoids a hard import of Connector into figure.ts (Connector already
// imports Figure — the reverse would close the cycle). The optimizer
// only needs the resolved Geometry to extract a polyline; anything
// else stays out of the contract.
export interface ISideAnchoredConnector
{
    readonly Geometry: Geometry | undefined;
}

// Polyline-vs-polyline crossing detector for the side optimizer. Walks
// each PathFigure of both connectors' Geometry, pairwise-checks every
// segment for a proper crossing (no shared endpoint counts as crossing,
// matching the "do they visually intersect mid-route" question the
// user is solving). Returns false on undefined Geometry — a connector
// with no resolved route can't intersect anything.
// Two connectors "conflict" on a shared side when their routes either
// cross transversally OR run collinearly on top of each other. The side
// optimizer treats both as a swap trigger — a crossing reads as an X, an
// overlap reads as a single stacked line hiding a second route; both are
// fixed by reordering the slots so the routes fan out cleanly.
function connectorsConflict(a: ISideAnchoredConnector, b: ISideAnchoredConnector): boolean
{
    return connectorsCross(a, b) || connectorsOverlap(a, b);
}

function connectorsCross(a: ISideAnchoredConnector, b: ISideAnchoredConnector): boolean
{
    return anySegmentPair(a, b, segmentsProperlyCross);
}

// Collinear-overlap sibling of connectorsCross — true iff any segment of A
// shares a positive-length collinear span with any segment of B (the two
// routes paint over each other). segmentsProperlyCross explicitly excludes
// this case (its `o !== 0` guards), so it needs its own predicate.
function connectorsOverlap(a: ISideAnchoredConnector, b: ISideAnchoredConnector): boolean
{
    return anySegmentPair(a, b, segmentsOverlap);
}

// Shared driver: run `pred` over every (A-segment, B-segment) pair and
// short-circuit on the first hit. Both crossing and overlap walk the two
// polylines identically — only the per-pair predicate differs.
function anySegmentPair(
    a: ISideAnchoredConnector,
    b: ISideAnchoredConnector,
    pred: (ax: number, ay: number, bx: number, by: number,
           cx: number, cy: number, dx: number, dy: number) => boolean,
): boolean
{
    const polyA = polylineOf(a.Geometry);
    const polyB = polylineOf(b.Geometry);
    if (polyA.length < 2 || polyB.length < 2) return false;
    for (let i = 0; i < polyA.length - 1; i++)
    {
        for (let j = 0; j < polyB.length - 1; j++)
        {
            if (pred(
                polyA[i]!.x, polyA[i]!.y, polyA[i + 1]!.x, polyA[i + 1]!.y,
                polyB[j]!.x, polyB[j]!.y, polyB[j + 1]!.x, polyB[j + 1]!.y,
            )) return true;
        }
    }
    return false;
}

// Extract a flat sequence of points from a PathGeometry. The orthogonal
// router emits one PathFigure with LineSegment children; bezier emits
// PathFigure with BezierSegment children (we treat the segment's anchor
// endpoint as the polyline vertex — adequate for the crossing question
// since adjacent bezier arcs share endpoints with their neighbours).
function polylineOf(geo: Geometry | undefined): readonly { x: number; y: number }[]
{
    if (geo === undefined) return [];
    // Duck-type the PathGeometry interface — avoids importing the
    // concrete class while staying type-checked at use sites below.
    const pg = geo as unknown as Partial<PathGeometry>;
    if (pg.Figures === undefined) return [];
    const out: { x: number; y: number }[] = [];
    for (const fig of pg.Figures)
    {
        out.push({ x: fig.StartPoint.X, y: fig.StartPoint.Y });
        for (const seg of fig.Segments)
        {
            // LineSegment exposes .Point; BezierSegment exposes
            // .Point3 (the arc endpoint). Tolerate either via duck
            // typing.
            const p = (seg as unknown as { Point?: { X: number; Y: number }; Point3?: { X: number; Y: number } });
            const tip = p.Point ?? p.Point3;
            if (tip !== undefined) out.push({ x: tip.X, y: tip.Y });
        }
    }
    return out;
}

// Classic 2D "proper" segment-segment crossing — returns true iff the
// segments share a single point that is strictly interior to BOTH (no
// shared endpoint, no collinear overlap). The cross-product orientation
// check is faster than computing intersection coordinates and avoids
// the floating-point edge case where two segments touch at exactly one
// endpoint (which doesn't visually read as a "crossing").
function segmentsProperlyCross(
    ax: number, ay: number, bx: number, by: number,
    cx: number, cy: number, dx: number, dy: number,
): boolean
{
    const o1 = orient(ax, ay, bx, by, cx, cy);
    const o2 = orient(ax, ay, bx, by, dx, dy);
    const o3 = orient(cx, cy, dx, dy, ax, ay);
    const o4 = orient(cx, cy, dx, dy, bx, by);
    // Both orientation pairs must differ in sign (strict crossing).
    // Zero on either side means a shared endpoint or collinear case —
    // not a proper crossing.
    return (o1 > 0) !== (o2 > 0)
        && (o3 > 0) !== (o4 > 0)
        && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0;
}

function orient(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number
{
    return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

// True iff segment AB and segment CD are COLLINEAR and their overlap along
// that shared line has strictly positive length (i.e. they paint over one
// another, not merely touch at an endpoint). Complements
// segmentsProperlyCross, which rejects the collinear case outright.
//
//   1. Both endpoints of CD must lie on the infinite line through AB
//      (orientation ≈ 0), and both segments must be non-degenerate.
//   2. Project all four points onto AB's dominant axis (X for a mostly-
//      horizontal segment, Y for a mostly-vertical one — robust when one
//      axis span is zero, as it is for axis-aligned orthogonal routes) and
//      test the 1-D intervals for a positive-length intersection.
function segmentsOverlap(
    ax: number, ay: number, bx: number, by: number,
    cx: number, cy: number, dx: number, dy: number,
): boolean
{
    const EPS = 1e-6;
    const abx = bx - ax;
    const aby = by - ay;
    // Degenerate segments (a point) can't overlap a span.
    if (Math.abs(abx) < EPS && Math.abs(aby) < EPS) return false;
    if (Math.abs(dx - cx) < EPS && Math.abs(dy - cy) < EPS) return false;
    // C and D must both sit on line AB → all four collinear.
    if (Math.abs(orient(ax, ay, bx, by, cx, cy)) > EPS) return false;
    if (Math.abs(orient(ax, ay, bx, by, dx, dy)) > EPS) return false;
    // Project onto the dominant axis and intersect the intervals.
    const useX = Math.abs(abx) >= Math.abs(aby);
    const a1 = useX ? ax : ay, b1 = useX ? bx : by;
    const c1 = useX ? cx : cy, d1 = useX ? dx : dy;
    const lo = Math.max(Math.min(a1, b1), Math.min(c1, d1));
    const hi = Math.min(Math.max(a1, b1), Math.max(c1, d1));
    return hi - lo > EPS;
}

