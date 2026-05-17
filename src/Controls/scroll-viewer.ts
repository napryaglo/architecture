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
} from '../runtime/index.js';
import { RectangleGeometry } from '../visual-engine/index.js';
import { VirtualizingStackPanel } from './virtualizing-stack-panel.js';

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
        const c = this.Content;
        return c !== undefined ? [c] : [];
    }

    public override get logicalChildren(): readonly Visual[]
    {
        const c = this.Content;
        return c !== undefined ? [c] : [];
    }

    protected override propagate_target_to_visual_children(): void
    {
        this.Content?.['SetTarget'](this['target']);
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
        return availableSize;
    }

    protected override ArrangeOverride(finalSize: Size): Size
    {
        // Re-publish viewport size from finalSize — Arrange may be
        // called with a different rect than Measure (alignment /
        // explicit-size cases).
        this._viewportWidth  = finalSize.Width;
        this._viewportHeight = finalSize.Height;

        const c = this.Content;
        if (c === undefined)
        {
            this.Clip = undefined;
            return finalSize;
        }

        const scrollInfo = this.resolveScrollInfo();
        if (scrollInfo !== undefined)
        {
            // Panel only emits visible items — no clip needed; arrange
            // it to the full viewport.
            c.Arrange(new Rect(0, 0, finalSize.Width, finalSize.Height));
            this.Clip = undefined;
        }
        else
        {
            // Clip-and-translate: place the (full-extent) content at
            // negative offset so the visible portion lands at (0, 0);
            // set a clip on ourselves so off-viewport content doesn't
            // draw past the ScrollViewer's bounds.
            c.Arrange(new Rect(
                -this.effectiveHorizontalOffset(),
                -this.effectiveVerticalOffset(),
                this._extentWidth,
                this._extentHeight,
            ));
            this.Clip = new RectangleGeometry(new Rect(0, 0, finalSize.Width, finalSize.Height));
        }
        return finalSize;
    }

    // Nothing of our own to paint — the clip / translate is
    // installed by ArrangeOverride; Content paints inside it.
    protected override RenderOverride(_dc: DrawingContext): void { }

    private effectiveHorizontalOffset(): number
    {
        return Math.max(0, Math.min(this.HorizontalOffset, this.ScrollableWidth));
    }

    private effectiveVerticalOffset(): number
    {
        return Math.max(0, Math.min(this.VerticalOffset, this.ScrollableHeight));
    }
}
