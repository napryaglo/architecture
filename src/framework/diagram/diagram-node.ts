import {
    MetaData,
    Model,
    type PointerEventArgs,
    type PropertyDescriptor,
    type Visual,
} from '../../runtime/index.js';
import { Canvas } from '../../basic/panels/canvas.js';
import { ContentControl } from '../content-control.js';
import { ContentPresenter } from '../../basic/templates/content-presenter.js';
import { ControlTemplate } from '../../basic/templates/control-template.js';
import { ScrollViewer } from '../scroll-viewer.js';
import { Selector } from '../list/selector.js';

// A movable, content-hosting control intended as the container shape
// inside the diagrammer's ItemsControl (see Diagram). DiagramNode owns
// two things internally so the demo bootstrap doesn't need a behavior:
//
//   * Position — X / Y DPs flagged BindsTwoWayByDefault so a `$X` /
//     `$Y` binding in the container Style threads through to the data
//     context (the node VM). Changes to X / Y mirror onto this control's
//     own Canvas.Left / Canvas.Top, so a parent Canvas places it.
//
//   * Drag-to-move — OnPointerDown captures the pointer and stores the
//     press offset; OnPointerMove writes back to X / Y; OnPointerUp
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
// resolution does the rest — when DiagramNode.Content is set to a Model
// (the per-item NodeVM data), ContentControl looks up the matching
// [DataType=…] DataTemplate via Application resources and slots the
// produced Visual into the presenter. Consumers who want chrome around
// the content (selection rings, drop shadows, …) can replace Template.
export class DiagramNode extends ContentControl
{
    public static readonly XKey = Model.RegisterProperty<number>(
        DiagramNode, 'X', 0, MetaData.Arrange | MetaData.BindsTwoWayByDefault);
    public static readonly YKey = Model.RegisterProperty<number>(
        DiagramNode, 'Y', 0, MetaData.Arrange | MetaData.BindsTwoWayByDefault);

    // Below CLICK_THRESHOLD_PX of movement the gesture stays in
    // "click" mode (no X / Y writes happen and OnPointerUp routes
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
    // applies the same X / Y delta to each partner so the whole
    // selection translates together (PowerPoint / Figma convention).
    // undefined when the press wasn't on a selected container — that
    // case drags only `this` and leaves the existing selection alone.
    private _dragPartners: DiagramNode[] | undefined;

    constructor()
    {
        super();
        // Minimal default template — a single ContentPresenter. The
        // ContentControl base routes Content into this presenter; the
        // ContentPresenter's implicit DataTemplate fallback resolves
        // shape chrome by `Content.constructor` identity.
        this.Template = new ControlTemplate(() => new ContentPresenter());
        // Seed Canvas.Left / Canvas.Top from the registered defaults so
        // a freshly-constructed DiagramNode placed into a Canvas without
        // any binding lands at (0,0) instead of inheriting whatever the
        // attached-property defaults happen to be on the parent path.
        Canvas.SetLeft(this, 0);
        Canvas.SetTop (this, 0);
    }

    public get X(): number       { return this.get_property_value(DiagramNode.XKey); }
    public set X(value: number)  { this.set_property_value(DiagramNode.XKey, value); }
    public get Y(): number       { return this.get_property_value(DiagramNode.YKey); }
    public set Y(value: number)  { this.set_property_value(DiagramNode.YKey, value); }

    protected override OnPropertyChanged(
        descriptor: PropertyDescriptor,
        oldValue:   unknown,
        newValue:   unknown,
    ): void
    {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        // Mirror X / Y onto Canvas.Left / Canvas.Top so the enclosing
        // Canvas re-positions us on its next Arrange pass. MetaData.Arrange
        // on the DP triggers an InvalidateArrange on this Visual; the
        // Canvas's own Arrange re-reads the attached properties and
        // re-places its children, so position changes propagate without
        // any per-child Canvas subscription.
        if (descriptor.Name === 'X' && typeof newValue === 'number')
        {
            Canvas.SetLeft(this, newValue);
        }
        else if (descriptor.Name === 'Y' && typeof newValue === 'number')
        {
            Canvas.SetTop(this, newValue);
        }
    }

    protected override OnPointerDown(args: PointerEventArgs): void
    {
        if (args.Handled) return;
        // Press offset = where inside the node the cursor landed. Stored
        // in host (canvas) coordinates against the node's current X / Y
        // — moving the node is then "wherever the cursor goes, subtract
        // the grab offset to place the top-left."
        this._dragging    = true;
        this._moved       = false;
        this._pressHostX  = args.HostX;
        this._pressHostY  = args.HostY;
        this._grabOffsetX = args.HostX - this.X;
        this._grabOffsetY = args.HostY - this.Y;
        // Snapshot the enclosing ScrollViewer (if any) + its press-time
        // offsets — auto-scroll pulses + scroll-delta compensation in
        // OnPointerMove read these.
        this._dragScrollViewer   = DiagramNode.findScrollViewer(this);
        this._pressScrollOffsetX = this._dragScrollViewer?.HorizontalOffset ?? 0;
        this._pressScrollOffsetY = this._dragScrollViewer?.VerticalOffset   ?? 0;
        // Snapshot group-drag partners. The press-time snapshot pins
        // the partner set for the whole gesture — selection mutations
        // mid-drag (rare, but routed-event ordering is finicky) won't
        // peel partners off mid-translation. `this` is excluded from
        // the partner list and moved separately in OnPointerMove —
        // keeps the delta-from-cursor formula honest (it reads / writes
        // `this.X` / `this.Y` directly).
        this._dragPartners = undefined;
        if (Selector.GetIsSelected(this))
        {
            const selector = Selector.FromContainer<Selector>(
                this, (v: Visual): v is Selector => v instanceof Selector);
            if (selector !== undefined)
            {
                const partners: DiagramNode[] = [];
                for (const c of selector.SelectedContainers)
                {
                    if (c !== this && c instanceof DiagramNode) partners.push(c);
                }
                if (partners.length > 0) this._dragPartners = partners;
            }
        }
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
            if (Math.hypot(dx, dy) < DiagramNode.CLICK_THRESHOLD_PX) return;
            this._moved = true;
        }
        // Compensate for any mid-drag scrolling so the cursor stays
        // "on" the same point of the node. ScrollViewer translates its
        // content by -Offset; when the viewport scrolls right by Δ, the
        // canvas content shifts LEFT by Δ in host coords, so the node
        // must shift RIGHT by Δ in canvas-local coords to keep its
        // screen position under the cursor. Without this the node would
        // lag the cursor by exactly the scroll delta during auto-scroll.
        const sv = this._dragScrollViewer;
        const scrollDx = sv !== undefined ? sv.HorizontalOffset - this._pressScrollOffsetX : 0;
        const scrollDy = sv !== undefined ? sv.VerticalOffset   - this._pressScrollOffsetY : 0;
        // Target position for THIS node in canvas-local coords.
        const newX = args.HostX - this._grabOffsetX + scrollDx;
        const newY = args.HostY - this._grabOffsetY + scrollDy;
        // Group-drag delta: every partner shifts by the same vector
        // `this` does this frame. Read deltas BEFORE the X / Y writes
        // below so the formula remains delta-from-previous-position
        // regardless of how many incremental frames have elapsed since
        // press — a press-time absolute snapshot would accumulate
        // floating-point drift across long drags.
        const dx = newX - this.X;
        const dy = newY - this.Y;
        if (this._dragPartners !== undefined && (dx !== 0 || dy !== 0))
        {
            for (const partner of this._dragPartners)
            {
                partner.X = partner.X + dx;
                partner.Y = partner.Y + dy;
                // Same Local-tier teardown as the self-move below —
                // each partner needs Local cleared so subsequent Align
                // / Distribute writes reach the container through the
                // Style binding without Local shadowing.
                partner.ClearValue(DiagramNode.XKey);
                partner.ClearValue(DiagramNode.YKey);
            }
        }
        this.X = newX;
        this.Y = newY;
        // Local-tier teardown after the round-trip. Writing X / Y above
        // landed a LocalValue on the container's EVD; that fired the
        // apply_setter writeback (X / Y are BindsTwoWayByDefault), which
        // pushed the new values back to the source VM, which in turn
        // pushed them onto the Style tier through the binding's source-
        // change subscription. The Style tier now holds the same value
        // as Local, but Local shadows it — and Local shadows any FUTURE
        // Style push too, so a later VM-side write (Align / Distribute
        // commands writing VM.X from outside the drag pipeline) would
        // update VM + Style but the container wouldn't move. Clearing
        // Local here drops the Local slot so the Style tier becomes
        // effective; visual position is unchanged (same value) but
        // subsequent VM-driven writes flow through unobstructed.
        this.ClearValue(DiagramNode.XKey);
        this.ClearValue(DiagramNode.YKey);
        // Edge auto-scroll — the SV starts / continues / stops a tick
        // timer based on cursor proximity to its viewport edges. The
        // pulse re-evaluates on every move; the timer keeps scrolling
        // even when the cursor sits still near an edge.
        sv?.EvaluateEdgeAutoScroll(args.HostX, args.HostY);
        args.Handled = true;
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
            selector?.HandleContainerClick(this, args.Modifiers);
        }
        args.Handled = true;
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
