import { MetaData, Model, Panel, Rect, Size, Visual } from '../runtime/index.js';

// Layout panel that places each child at an absolute (Left, Top)
// position read from attached properties. Children measure with no
// upper bound; the Canvas's own DesiredSize is the union bounding box
// of every placed child.
//
// WPF parity — same name, same attached-property model, same
// semantics: `Canvas.SetLeft(visual, 10)` / `Canvas.GetLeft(visual)`.
// Any Visual can be placed in a Canvas; no interface to implement.
//
// MetaData.None on Left/Top: changing them on a child does NOT
// auto-invalidate either the child or the Canvas — the Canvas
// re-reads the current values during its next Arrange pass.
// HeadlessTarget always runs a full Measure+Arrange on every Render,
// so this works for the static-experiment flow. Incremental layout
// (when SvgRenderer lands) will need the Canvas to subscribe to its
// children's Left/Top via AddPropertyChangedListener so it can
// invalidate its own Arrange on change.
//
// Negative Left / Top is tolerated but children at negative
// coordinates will paint to the left of / above the Canvas's own
// (0, 0). The bounding-box calculation includes them via max-with-0,
// so the Canvas's reported size never covers them — an upstream
// layout that produces negative positions should shift first.
export class Canvas extends Panel
{
    static {
        Model.RegisterAttachedProperty(Canvas, 'Left', 0, MetaData.None);
        Model.RegisterAttachedProperty(Canvas, 'Top',  0, MetaData.None);
    }

    // Static accessors mirror WPF's Canvas.SetLeft / Canvas.GetLeft.
    // They route through Model's explicit-owner overloads, which look
    // up the descriptor on Canvas and store under the composite key
    // 'Canvas.Left' / 'Canvas.Top' on the target Visual.
    public static SetLeft(v: Visual, value: number): void
    {
        v.set_property_value(Canvas, 'Left', value);
    }

    public static GetLeft(v: Visual): number
    {
        return v.get_property_value(Canvas, 'Left');
    }

    public static SetTop(v: Visual, value: number): void
    {
        v.set_property_value(Canvas, 'Top', value);
    }

    public static GetTop(v: Visual): number
    {
        return v.get_property_value(Canvas, 'Top');
    }

    protected override MeasureOverride(_availableSize: Size): Size
    {
        let maxRight  = 0;
        let maxBottom = 0;
        const unbounded = new Size(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
        for (const child of this.Children)
        {
            child.Measure(unbounded);
            const left = Canvas.GetLeft(child);
            const top  = Canvas.GetTop(child);
            maxRight  = Math.max(maxRight,  left + child.DesiredSize.Width);
            maxBottom = Math.max(maxBottom, top  + child.DesiredSize.Height);
        }
        return new Size(maxRight, maxBottom);
    }

    protected override ArrangeOverride(finalSize: Size): Size
    {
        for (const child of this.Children)
        {
            const left = Canvas.GetLeft(child);
            const top  = Canvas.GetTop(child);
            child.Arrange(new Rect(left, top, child.DesiredSize.Width, child.DesiredSize.Height));
        }
        return finalSize;
    }
}
