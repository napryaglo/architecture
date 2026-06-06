import {
    Rect,
    Size,
    type Visual,
    isScrollInfo,
    type IScrollInfo,
} from '../runtime/index.js';
import { RectangleGeometry } from '../visual-engine/index.js';
import { ContentPresenter } from './content-presenter.js';
import type { ScrollViewer } from './scroll-viewer.js';
import { VirtualizingStackPanel } from './virtualizing-stack-panel.js';

// The presentation surface a ScrollViewer's default template wraps its
// consumer Content in — WPF parity with ScrollContentPresenter. Lives
// inside the ScrollViewer's ControlTemplate as PART_ContentSite and is
// auto-discovered by ControlTemplate.Apply's first-ContentPresenter walk,
// so the consumer's Content lands here without explicit wiring on the
// ScrollViewer side.
//
// Two scrolling modes (same shape the ScrollViewer used to implement
// inline before the split):
//
//   * Delegate mode — slotted child implements IScrollInfo
//     (today: VirtualizingStackPanel). The presenter drives its
//     Viewport (offset + size) from the host ScrollViewer's offset DPs
//     and reads ExtentWidth / ExtentHeight back. No clip / translate is
//     installed — the panel only emits items intersecting the viewport.
//
//   * Clip-and-translate mode — anything else. The presenter measures
//     the child with +Infinity on each scroll-enabled axis (so it
//     reports its natural extent), arranges it offset by
//     (-HorizontalOffset, -VerticalOffset), and installs a
//     RectangleGeometry clip on the child in its OWN local coordinate
//     space so the off-viewport portion stays invisible.
//
// In both modes the presenter exposes ExtentWidth / ExtentHeight (full
// content size) and ViewportWidth / ViewportHeight (visible area) as
// plain getters. The host ScrollViewer reads these to publish the
// matching DPs on its public surface.
//
// `host` is the back-pointer to the owning ScrollViewer, written by
// ScrollViewer after Apply (same pattern ScrollBar/ScrollBarLayout use).
// When `host` is undefined (a presenter constructed standalone, in tests
// or for diagnostic markup), the presenter degrades to a non-scrolling
// ContentPresenter — Extent matches Viewport, no clip, no translate.
export class ScrollContentPresenter extends ContentPresenter
{
    // Set by ScrollViewer's constructor immediately after fishing the
    // presenter out of the template via GetTemplateChild. The presenter
    // reads `host.HorizontalOffset`/`VerticalOffset`/`HorizontalScrollEnabled`/
    // etc. each layout pass — without the back-pointer it can't know
    // which axis to feed +Infinity to during measure.
    public host: ScrollViewer | undefined;

    // Populated by MeasureOverride; read by the host's public Extent /
    // Viewport getters and by ArrangeOverride for the clip rect.
    private _extentWidth:    number = 0;
    private _extentHeight:   number = 0;
    private _viewportWidth:  number = 0;
    private _viewportHeight: number = 0;

    public get ExtentWidth():    number { return this._extentWidth; }
    public get ExtentHeight():   number { return this._extentHeight; }
    public get ViewportWidth():  number { return this._viewportWidth; }
    public get ViewportHeight(): number { return this._viewportHeight; }

    protected override MeasureOverride(availableSize: Size): Size
    {
        // Viewport size = the slot our parent (the template's layout
        // panel) gave us. Always set so a pre-measure read returns
        // sensible defaults even when there's no content yet.
        this._viewportWidth  = availableSize.Width;
        this._viewportHeight = availableSize.Height;

        const content = this.visualChildren[0];
        if (content === undefined)
        {
            this._extentWidth  = 0;
            this._extentHeight = 0;
            return Size.Zero;
        }

        const host = this.host;
        const scrollInfo = resolveScrollInfo(content);
        if (scrollInfo !== undefined)
        {
            // Delegate mode. Read extent BEFORE measuring so the host's
            // ScrollableWidth / ScrollableHeight (= ExtentX - ViewportX)
            // see the right value when we ask it for its effective
            // offsets to push into the panel's Viewport. Contract:
            // IScrollInfo implementations must compute Extent without
            // requiring a prior Measure — VirtualizingStackPanel does
            // this from itemCount × ItemHeight.
            this._extentWidth  = scrollInfo.ExtentWidth;
            this._extentHeight = scrollInfo.ExtentHeight;

            if (content instanceof VirtualizingStackPanel)
            {
                const offX = host !== undefined ? host['effectiveHorizontalOffset']() : 0;
                const offY = host !== undefined ? host['effectiveVerticalOffset']()   : 0;
                content.Viewport = new Rect(
                    offX,
                    offY,
                    availableSize.Width,
                    availableSize.Height,
                );
            }
            content.Measure(availableSize);
            // Re-read extent in case the measure pass mutated it (e.g.,
            // future variable-height panels). For VirtualizingStackPanel
            // this is the same value as above.
            this._extentWidth  = scrollInfo.ExtentWidth;
            this._extentHeight = scrollInfo.ExtentHeight;
        }
        else
        {
            // Clip-and-translate mode. Measure with no upper bound on
            // axes the host enables for scrolling — content reports its
            // natural extent. On a host-disabled axis (TextBox in Wrap
            // mode opts out of horizontal scroll so the editor wraps to
            // width), pass the BOUNDED viewport size on that axis so
            // the child sees its real budget and shapes its content to
            // fit.
            const hEnabled = host?.HorizontalScrollEnabled ?? true;
            const vEnabled = host?.VerticalScrollEnabled   ?? true;
            const measureW = hEnabled ? Number.POSITIVE_INFINITY : availableSize.Width;
            const measureH = vEnabled ? Number.POSITIVE_INFINITY : availableSize.Height;
            content.Measure(new Size(measureW, measureH));
            this._extentWidth  = content.DesiredSize.Width;
            this._extentHeight = content.DesiredSize.Height;
        }

        // DesiredSize: fit-in-parent, never larger than extent. Same
        // shape the old ScrollViewer.MeasureOverride returned — returning
        // availableSize verbatim would propagate Infinity up the tree any
        // time we sit in an unbounded axis (vertical StackPanel hosting
        // a TreeView's default ScrollViewer template).
        return new Size(
            Math.min(availableSize.Width,  this._extentWidth),
            Math.min(availableSize.Height, this._extentHeight),
        );
    }

    protected override ArrangeOverride(finalSize: Size): Size
    {
        // Re-publish viewport from the final slot we were arranged in
        // (the host's layout panel reduces this by the scrollbar gutter
        // when bars are non-overlay). Public ViewportWidth /
        // ViewportHeight now reflect the painted viewport.
        this._viewportWidth  = finalSize.Width;
        this._viewportHeight = finalSize.Height;

        const content = this.visualChildren[0];
        if (content === undefined) return finalSize;

        const host = this.host;
        const scrollInfo = resolveScrollInfo(content);
        if (scrollInfo !== undefined)
        {
            // Delegate mode: panel only emits visible items — no clip
            // or translate needed.
            content.Arrange(new Rect(0, 0, finalSize.Width, finalSize.Height));
            content.Clip = undefined;
        }
        else
        {
            // Clip-and-translate. Place the full-extent content at
            // negative offset so the visible portion lands at (0, 0);
            // clip the content in its own local space so only the
            // viewport-sized window paints. (offsetX, offsetY) is the
            // local rect's top-left because the content's outer carries
            // a translate of -(offset).
            const offX = host !== undefined ? host['effectiveHorizontalOffset']() : 0;
            const offY = host !== undefined ? host['effectiveVerticalOffset']()   : 0;
            content.Arrange(new Rect(-offX, -offY, this._extentWidth, this._extentHeight));
            content.Clip = new RectangleGeometry(new Rect(offX, offY, finalSize.Width, finalSize.Height));
        }
        return finalSize;
    }
}

// Walk to the first IScrollInfo provider. Today this only checks the
// direct child; a future enhancement could walk visual descendants so
// `ScrollViewer wrapping ItemsControl whose ItemsPanel is a
// VirtualizingStackPanel` auto-delegates without the consumer setting
// Content to the panel directly. Not done here because it would require
// ItemsControl to expose its panel through a stable lookup.
function resolveScrollInfo(content: Visual): IScrollInfo | undefined
{
    return isScrollInfo(content) ? content : undefined;
}
