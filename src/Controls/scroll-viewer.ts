import {
    MetaData,
    Model,
    Rect,
    Size,
    Visual,
    isScrollInfo,
    type DrawingContext,
    type IScrollInfo,
    type PropertyDescriptor,
    type WheelEventArgs,
} from '../runtime/index.js';
import { RectangleGeometry } from '../visual-engine/index.js';
import { ScrollBar } from './scroll-bar.js';
import { Orientation } from './stack-panel.js';
import { VirtualizingStackPanel } from './virtualizing-stack-panel.js';

// Reserved cross-axis space for an active scrollbar. Mirrors the
// ScrollBar control's own SCROLLBAR_THICKNESS constant — kept locally
// here to avoid an import cycle.
const SCROLLBAR_GUTTER = 10;

// A scrollable viewport that shows a portion of its Content. Two
// scrolling modes:
//
//   * Delegate mode — Content implements IScrollInfo (today: a
//     VirtualizingPanel). The ScrollViewer drives the panel's
//     Viewport / offsets; the panel decides which items to realize.
//     No clip / translate on this side — the panel only emits the
//     visible portion of its content.
//
//   * Clip-and-translate mode — Content is anything else. The
//     ScrollViewer measures Content with infinite available size
//     (so it reports its natural extent), arranges it offset by
//     (-HorizontalOffset, -VerticalOffset), and clips itself to the
//     viewport rect so the off-viewport portion stays invisible.
//
// In both modes the ScrollViewer reports ExtentWidth / ExtentHeight
// (full content size) and ViewportWidth / ViewportHeight (visible
// area). ScrollableWidth / ScrollableHeight are the max offsets
// (Extent - Viewport, never negative).
//
// Offsets are NOT clamped on assignment — the raw value stays
// queryable so binding sources see what they wrote. The effective
// offset used during Arrange is the clamped value. Programmatic-only
// scrolling for now: no mouse wheel, no keyboard input (no event
// system yet).
export class ScrollViewer extends Visual
{
    static {
        Model.RegisterProperty(ScrollViewer, 'Content',          undefined, MetaData.Measure);
        // Offsets are Measure | Arrange: MeasureOverride uses them
        // to drive the IScrollInfo provider's viewport (delegate
        // mode), so a re-measure must run when they change.
        // ArrangeOverride also depends on them (clip-and-translate
        // mode's content translation), so flag both.
        Model.RegisterProperty(ScrollViewer, 'HorizontalOffset', 0,         MetaData.Measure | MetaData.Arrange);
        Model.RegisterProperty(ScrollViewer, 'VerticalOffset',   0,         MetaData.Measure | MetaData.Arrange);
    }

    // Set by MeasureOverride; read by the public getters and by
    // ArrangeOverride. Initialized to zero so a pre-measure read
    // returns sensible defaults.
    private _extentWidth:    number = 0;
    private _extentHeight:   number = 0;
    private _viewportWidth:  number = 0;
    private _viewportHeight: number = 0;

    // Default-template scrollbars. Always present so the consumer
    // doesn't compose them manually; auto-show when extent exceeds
    // viewport on the matching axis. ValueChanged from a drag or a
    // track-click writes back through the corresponding offset DP;
    // the OnPropertyChanged hook on Vertical / HorizontalOffset
    // pushes external changes (wheel, programmatic) the other way.
    // The `_suppressOffsetSync` guard breaks the obvious feedback
    // loop (Visual.set_property_value already short-circuits on
    // equal values, but the guard makes the intent explicit).
    private readonly _vScrollBar: ScrollBar;
    private readonly _hScrollBar: ScrollBar;
    private _suppressOffsetSync = false;

    constructor()
    {
        super();
        this._vScrollBar = new ScrollBar();
        this._vScrollBar.Orientation = Orientation.Vertical;
        this._vScrollBar.AddValueChangedListener((v) => {
            if (this._suppressOffsetSync) return;
            this.VerticalOffset = v;
        });

        this._hScrollBar = new ScrollBar();
        this._hScrollBar.Orientation = Orientation.Horizontal;
        this._hScrollBar.AddValueChangedListener((v) => {
            if (this._suppressOffsetSync) return;
            this.HorizontalOffset = v;
        });

        // Visual children only — neither bar is a logical child of the
        // ScrollViewer, so a DataContext bound on consumer Content
        // doesn't accidentally propagate into them. AttachVisual cascades
        // the host target the same way the existing Content path does.
        this.AttachVisual(this._vScrollBar);
        this.AttachVisual(this._hScrollBar);
    }

    public get Content(): Visual | undefined { return this.get_property_value('Content'); }
    public set Content(value: Visual | undefined)
    {
        const old = this.Content;
        if (old === value) return;
        if (old !== undefined) this.Detach(old);
        this.set_property_value('Content', value);
        if (value !== undefined) this.Attach(value);
    }

    public get HorizontalOffset(): number { return this.get_property_value('HorizontalOffset'); }
    public set HorizontalOffset(value: number) { this.set_property_value('HorizontalOffset', value); }

    public get VerticalOffset(): number { return this.get_property_value('VerticalOffset'); }
    public set VerticalOffset(value: number) { this.set_property_value('VerticalOffset', value); }

    public get ExtentWidth():    number { return this._extentWidth; }
    public get ExtentHeight():   number { return this._extentHeight; }
    public get ViewportWidth():  number { return this._viewportWidth; }
    public get ViewportHeight(): number { return this._viewportHeight; }

    // Maximum useful offset values: any larger gets clamped at
    // Arrange time. Clamped to >= 0 so an extent smaller than the
    // viewport doesn't yield a negative scrollable area.
    public get ScrollableWidth():  number { return Math.max(0, this._extentWidth  - this._viewportWidth); }
    public get ScrollableHeight(): number { return Math.max(0, this._extentHeight - this._viewportHeight); }

    // Convenience scroll methods — mirror WPF's ScrollViewer surface.
    // Each just sets the offset; the clamping happens at Arrange.
    public ScrollToTop():    void { this.VerticalOffset   = 0; }
    public ScrollToBottom(): void { this.VerticalOffset   = this.ScrollableHeight; }
    public ScrollToLeft():   void { this.HorizontalOffset = 0; }
    public ScrollToRight():  void { this.HorizontalOffset = this.ScrollableWidth; }

    public override get visualChildren(): readonly Visual[]
    {
        // Order: Content first so the scrollbars paint on top of any
        // edge-aligned content. Hidden bars (no scrollable extent on
        // their axis) still appear here but Arrange collapses them to
        // a zero-size rect so they don't paint or hit.
        const c = this.Content;
        if (c === undefined) return [this._vScrollBar, this._hScrollBar];
        return [c, this._vScrollBar, this._hScrollBar];
    }

    public override get logicalChildren(): readonly Visual[]
    {
        const c = this.Content;
        return c !== undefined ? [c] : [];
    }

    protected override propagate_target_to_visual_children(): void
    {
        const t = this['target'];
        this.Content?.['SetTarget'](t);
        this._vScrollBar['SetTarget'](t);
        this._hScrollBar['SetTarget'](t);
    }

    protected override propagate_inheritance_to_logical_children(): void
    {
        this.Content?.['refresh_inheritance_subtree']();
    }

    protected override propagate_inheritance_for_logical_children(descriptor: PropertyDescriptor): void
    {
        this.Content?.['refresh_inherited'](descriptor);
    }

    // Detect an IScrollInfo provider. Currently checks the Content
    // directly; a future enhancement would walk visual descendants
    // (so ScrollViewer wrapping an ItemsControl whose ItemsPanel is
    // a VirtualizingStackPanel would auto-delegate). Not done here
    // because it requires ItemsControl to expose the panel through
    // a stable lookup.
    private resolveScrollInfo(): IScrollInfo | undefined
    {
        const c = this.Content;
        if (c === undefined) return undefined;
        return isScrollInfo(c) ? c : undefined;
    }

    protected override MeasureOverride(availableSize: Size): Size
    {
        // Viewport size = the area our parent gave us. Always set,
        // so ScrollableWidth/Height are usable immediately after
        // Measure even with no content.
        this._viewportWidth  = availableSize.Width;
        this._viewportHeight = availableSize.Height;

        // Default-template scrollbars are always measured so each one
        // has a valid DesiredSize before Arrange picks its rect. The
        // measure is cheap (no nested children) and the bars carry their
        // own cross-axis thickness regardless of input.
        this._vScrollBar.Measure(availableSize);
        this._hScrollBar.Measure(availableSize);

        const c = this.Content;
        if (c === undefined)
        {
            this._extentWidth  = 0;
            this._extentHeight = 0;
            return Size.Zero;
        }

        const scrollInfo = this.resolveScrollInfo();
        if (scrollInfo !== undefined)
        {
            // Delegate mode — drive the panel's viewport (position +
            // size) and read its extent back. Read extent FIRST so
            // ScrollableWidth / ScrollableHeight are correct when we
            // clamp the offsets; otherwise the clamp would see
            // ScrollableHeight=0 (stale) and pin VerticalOffset to 0
            // before any extent is known. Contract: IScrollInfo
            // implementations must compute Extent without requiring a
            // prior Measure (VirtualizingStackPanel does this from
            // itemCount × ItemHeight).
            this._extentWidth  = scrollInfo.ExtentWidth;
            this._extentHeight = scrollInfo.ExtentHeight;

            if (c instanceof VirtualizingStackPanel)
            {
                c.Viewport = new Rect(
                    this.effectiveHorizontalOffset(),
                    this.effectiveVerticalOffset(),
                    availableSize.Width,
                    availableSize.Height,
                );
            }
            c.Measure(availableSize);
            // Re-read extent in case the measure pass changed it
            // (e.g., future variable-height panels). For
            // VirtualizingStackPanel this is the same value as above.
            this._extentWidth  = scrollInfo.ExtentWidth;
            this._extentHeight = scrollInfo.ExtentHeight;
        }
        else
        {
            // Clip-and-translate mode — measure with no upper bound
            // so content reports its natural extent. The Infinity
            // values clamp through Min/Max in Visual.Measure to the
            // child's own max constraints (typically +Infinity).
            c.Measure(new Size(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY));
            this._extentWidth  = c.DesiredSize.Width;
            this._extentHeight = c.DesiredSize.Height;
        }
        // Desired size = whatever fits in the parent, never more than
        // the content's extent. Returning `availableSize` verbatim
        // would propagate Infinity up the tree any time we sit in an
        // unbounded axis (vertical StackPanel — the natural host for
        // a TreeView's default ScrollViewer template). Infinity then
        // poisons the Arrange pass: the clip RectangleGeometry SVG
        // can't paint a `height=Infinity` <rect>, and the visible
        // tree disappears entirely.
        return new Size(
            Math.min(availableSize.Width,  this._extentWidth),
            Math.min(availableSize.Height, this._extentHeight),
        );
    }

    protected override ArrangeOverride(finalSize: Size): Size
    {
        // Decide which bars are active for THIS arrange pass — the
        // measure step above already wrote ExtentWidth/Height, so the
        // visible-axis check is just `extent > viewport_along_axis`.
        // Re-running it here (cheap) means a re-arrange with a new
        // finalSize honours the new viewport without waiting for the
        // next measure.
        const wantsV = this._extentHeight > finalSize.Height;
        const wantsH = this._extentWidth  > finalSize.Width;
        const vGutter = wantsV ? SCROLLBAR_GUTTER : 0;
        const hGutter = wantsH ? SCROLLBAR_GUTTER : 0;

        // Adjust the available content slot once we know what each bar
        // is reserving.
        const contentW = Math.max(0, finalSize.Width  - vGutter);
        const contentH = Math.max(0, finalSize.Height - hGutter);

        // Re-publish viewport size from the slot the content actually
        // occupies (NOT the full finalSize). Public ViewportWidth /
        // ViewportHeight now reflect the painted area.
        this._viewportWidth  = contentW;
        this._viewportHeight = contentH;

        // ScrollViewer's outer <g> stays unclipped — otherwise the
        // viewport-shaped clip would also clip the scrollbar children
        // (they sit at x >= contentW, beyond the viewport rect). The
        // clip lives on the Content visual instead, in its own local
        // coord space, where it cuts only the content's overflow.
        this.Clip = undefined;

        const c = this.Content;
        if (c !== undefined)
        {
            const scrollInfo = this.resolveScrollInfo();
            if (scrollInfo !== undefined)
            {
                // Panel only emits visible items — no clip needed.
                c.Arrange(new Rect(0, 0, contentW, contentH));
                c.Clip = undefined;
            }
            else
            {
                // Clip-and-translate: place the (full-extent) content
                // at negative offset so the visible portion lands at
                // (0, 0); clip the content in its own local space so
                // only the viewport-sized window paints. (offsetX,
                // offsetY) is the local rect's top-left because the
                // content's outer carries a translate of -(offset).
                const offX = this.effectiveHorizontalOffset();
                const offY = this.effectiveVerticalOffset();
                c.Arrange(new Rect(-offX, -offY, this._extentWidth, this._extentHeight));
                c.Clip = new RectangleGeometry(new Rect(offX, offY, contentW, contentH));
            }
        }

        // Sync scrollbar DPs to the now-final viewport sizes, BEFORE
        // arranging the bars so each thumb lands at the correct length
        // / offset. _suppressOffsetSync guards the ValueChanged loop —
        // we're writing scroll position into the bar, not the other
        // way around.
        this._suppressOffsetSync = true;
        this._vScrollBar.Minimum      = 0;
        this._vScrollBar.Maximum      = this.ScrollableHeight;
        this._vScrollBar.ViewportSize = this._viewportHeight;
        this._vScrollBar.Value        = this.effectiveVerticalOffset();
        this._hScrollBar.Minimum      = 0;
        this._hScrollBar.Maximum      = this.ScrollableWidth;
        this._hScrollBar.ViewportSize = this._viewportWidth;
        this._hScrollBar.Value        = this.effectiveHorizontalOffset();
        this._suppressOffsetSync = false;

        // Position the bars: vertical on the right edge of the viewport,
        // horizontal on the bottom. A hidden bar arranges to a zero-size
        // rect so the renderer paints nothing and pointer events miss.
        if (wantsV)
        {
            this._vScrollBar.Arrange(new Rect(contentW, 0, vGutter, contentH));
        }
        else
        {
            this._vScrollBar.Arrange(new Rect(0, 0, 0, 0));
        }
        if (wantsH)
        {
            this._hScrollBar.Arrange(new Rect(0, contentH, contentW, hGutter));
        }
        else
        {
            this._hScrollBar.Arrange(new Rect(0, 0, 0, 0));
        }

        return finalSize;
    }

    // Nothing of our own to paint — the clip / translate is
    // installed by ArrangeOverride; Content paints inside it.
    protected override RenderOverride(_dc: DrawingContext): void { }

    // Mouse / trackpad scrolling. Default WPF behaviour: the wheel
    // adjusts VerticalOffset (Shift+wheel routes to HorizontalOffset,
    // matching most browsers). DeltaMode scales pixel-mode events
    // directly, line-mode through a 16 DIP heuristic, and page-mode
    // through the viewport height.
    //
    // The event is marked Handled only when the offset actually moves
    // — at the top/bottom edge the wheel falls through to an outer
    // ScrollViewer (if any), matching browser nested-scroll semantics.
    protected override OnPointerWheel(args: WheelEventArgs): void
    {
        const scale = args.DeltaMode === 'line' ? 16
                    : args.DeltaMode === 'page' ? this._viewportHeight
                    : 1;
        const dy = args.DeltaY * scale;
        const dx = args.DeltaX * scale;

        const horizontal = args.Modifiers.Shift && dy !== 0 && dx === 0;
        if (horizontal)
        {
            const nextX = clamp(this.HorizontalOffset + dy, 0, this.ScrollableWidth);
            if (nextX !== this.HorizontalOffset)
            {
                this.HorizontalOffset = nextX;
                args.Handled = true;
            }
            return;
        }

        if (dy !== 0)
        {
            const nextY = clamp(this.VerticalOffset + dy, 0, this.ScrollableHeight);
            if (nextY !== this.VerticalOffset)
            {
                this.VerticalOffset = nextY;
                args.Handled = true;
            }
        }
        if (dx !== 0)
        {
            const nextX = clamp(this.HorizontalOffset + dx, 0, this.ScrollableWidth);
            if (nextX !== this.HorizontalOffset)
            {
                this.HorizontalOffset = nextX;
                args.Handled = true;
            }
        }
    }

    private effectiveHorizontalOffset(): number
    {
        return Math.max(0, Math.min(this.HorizontalOffset, this.ScrollableWidth));
    }

    private effectiveVerticalOffset(): number
    {
        return Math.max(0, Math.min(this.VerticalOffset, this.ScrollableHeight));
    }
}

function clamp(value: number, min: number, max: number): number
{
    return Math.max(min, Math.min(max, value));
}
