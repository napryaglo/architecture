import {
    Element,
    MetaData,
    Model,
    Rect,
    Visual,
    type PointerEventArgs,
    type PropertyDescriptor,
} from '../../runtime/index.js';
import { Brush, type PathGeometry, Pen, SolidColorBrush } from '../../visual-engine/index.js';
import { Color } from '../../runtime/index.js';
import { Canvas } from '../../basic/panels/canvas.js';
import { ContentControl } from '../base/content-control.js';
import { ScrollViewer } from '../surfaces/scroll-viewer.js';
import { Selector } from '../list/selector.js';
import { SHAPE_CATALOG_MAP, scaleGeometry } from './shape-catalog.js';
import type { Group } from './group.js';

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
// Default size for a freshly-constructed Figure — matches the historical
// 80×80 dp the demo used. Overridable on a per-instance basis via the
// fromKind / fromSource factories.
export const FIGURE_DEFAULT_SIZE = 80;

// Default brushes for a fresh Figure. Tuned to read on @Surface in both
// Material light / dark schemes. Consumers replace by assignment.
const DEFAULT_FILL   = new SolidColorBrush(Color.FromHex('#bfdbfe'));
const DEFAULT_STROKE = new Pen(new SolidColorBrush(Color.FromHex('#1976d2')), 1.5);

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

    // Optional caption painted on top of the shape via the default
    // template. Empty by default.
    public static readonly LabelTextKey = Model.RegisterProperty<string>(
        Figure, 'LabelText', '', MetaData.None);

    // Stable identifier — used by serialize / deserialize and by external
    // consumers that need to refer back to a specific figure after Load.
    public static readonly IdKey = Model.RegisterProperty<string | undefined>(
        Figure, 'Id', undefined, MetaData.None);

    // Selection state — duck-typed by SelectionReflector when the
    // owning Diagram has ReflectSelectionToItems=true.
    public static readonly IsSelectedKey = Model.RegisterProperty<boolean>(
        Figure, 'IsSelected', false, MetaData.None);

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
        f.Width  = options?.width  ?? FIGURE_DEFAULT_SIZE;
        f.Height = options?.height ?? FIGURE_DEFAULT_SIZE;
        f._setKindFromCatalog(kind, entry.unit());
        return f;
    }

    public static fromSource(source: PathGeometry, left: number, top: number, options?: FigureFromSourceOptions): Figure
    {
        const f = new Figure();
        f.Left = left;
        f.Top  = top;
        f.Width  = options?.width  ?? FIGURE_DEFAULT_SIZE;
        f.Height = options?.height ?? FIGURE_DEFAULT_SIZE;
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

    constructor()
    {
        super();
        // Per-instance Stroke. The default DP value can't be shared
        // because PenEditor mutates Pens in place — each Figure needs
        // its own. Cloning the DEFAULT_STROKE here keeps the visual
        // default consistent without leaking edits across instances.
        this.set_property_value(Figure.StrokeKey, new Pen(DEFAULT_STROKE.Brush, DEFAULT_STROKE.Thickness));
        // Default size — gives a freshly-constructed Figure a visible
        // footprint even before fromKind / fromSource has run.
        if (Number.isNaN(this.Width))  this.Width  = FIGURE_DEFAULT_SIZE;
        if (Number.isNaN(this.Height)) this.Height = FIGURE_DEFAULT_SIZE;
        // Seed Canvas.Left / Canvas.Top from the registered defaults so
        // a freshly-constructed Figure placed into a Canvas without
        // any binding lands at (0,0) instead of inheriting whatever the
        // attached-property defaults happen to be on the parent path.
        Canvas.SetLeft(this, 0);
        Canvas.SetTop (this, 0);
        // Default Template flows from the bundled diagram theme entry
        // under TargetType=Figure (see diagram.template.mu): a Canvas
        // hosting a Shape primitive template-bound to this Figure's
        // Geometry / Fill / Stroke / Width / Height, plus a TextBlock
        // template-bound to LabelText.
        this.applyDefaultStyle();
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
    public get LabelText(): string             { return this.get_property_value(Figure.LabelTextKey); }
    public set LabelText(value: string)        { this.set_property_value(Figure.LabelTextKey, value); }
    public get Id(): string | undefined        { return this.get_property_value(Figure.IdKey); }
    public set Id(value: string | undefined)   { this.set_property_value(Figure.IdKey, value); }
    public get IsSelected(): boolean           { return this.get_property_value(Figure.IsSelectedKey); }
    public set IsSelected(value: boolean)      { this.set_property_value(Figure.IsSelectedKey, value); }

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
    }

    protected override OnPointerDown(args: PointerEventArgs): void
    {
        if (args.Handled) return;
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
