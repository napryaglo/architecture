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
// MetaData.Arrange on Left/Top — a write invalidates the child's
// arrange, which propagates up to the Canvas via InvalidateArrange's
// parent walk. The Canvas re-runs ArrangeOverride and re-reads the
// attached properties to re-place the child.
//
// Why not handle this in the Canvas instead by subscribing to each
// child's Canvas.Left / Top? Either path works; piggybacking on
// MetaData.Arrange is one line of metadata vs. a per-child
// subscription lifecycle, and the affectsArrange path is already
// well-tested for non-attached DPs.
//
// Negative Left / Top is tolerated but children at negative
// coordinates will paint to the left of / above the Canvas's own
// (0, 0). The bounding-box calculation includes them via max-with-0,
// so the Canvas's reported size never covers them — an upstream
// layout that produces negative positions should shift first.
export class Canvas extends Panel
{
    public static readonly LeftKey = Model.RegisterAttachedProperty<number>(Canvas, 'Left', 0, MetaData.Arrange);
    public static readonly TopKey  = Model.RegisterAttachedProperty<number>(Canvas, 'Top',  0, MetaData.Arrange);

    // Static accessors mirror WPF's Canvas.SetLeft / Canvas.GetLeft.
    // The typed keys carry the descriptor identity; the typed
    // get/set_property_value overloads look up the composite key
    // 'Canvas.Left' / 'Canvas.Top' on the target Visual under the hood.
    public static SetLeft(v: Visual, value: number): void
    {
        v.set_property_value(Canvas.LeftKey, value);
    }

    public static GetLeft(v: Visual): number
    {
        return v.get_property_value(Canvas.LeftKey);
    }

    public static SetTop(v: Visual, value: number): void
    {
        v.set_property_value(Canvas.TopKey, value);
    }

    public static GetTop(v: Visual): number
    {
        return v.get_property_value(Canvas.TopKey);
    }

    // Tolerate undefined / NaN Left/Top by falling back to 0. The
    // binding-side fix: `Canvas.Left = $X` on a container whose
    // DataContext doesn't expose `X` resolves to undefined; without
    // this fallback the arrange math would produce NaN and the renderer
    // would stamp `translate(NaN,NaN)`. WPF-equivalent semantics — an
    // unset Left reads as the registered default (0).
    private static coord(value: unknown): number
    {
        return typeof value === 'number' && !Number.isNaN(value) ? value : 0;
    }

    protected override MeasureOverride(_availableSize: Size): Size
    {
        let maxRight  = 0;
        let maxBottom = 0;
        const unbounded = new Size(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
        for (const child of this.Children)
        {
            child.Measure(unbounded);
            const left = Canvas.coord(Canvas.GetLeft(child));
            const top  = Canvas.coord(Canvas.GetTop(child));
            maxRight  = Math.max(maxRight,  left + child.DesiredSize.Width);
            maxBottom = Math.max(maxBottom, top  + child.DesiredSize.Height);
        }
        return new Size(maxRight, maxBottom);
    }

    protected override ArrangeOverride(finalSize: Size): Size
    {
        for (const child of this.Children)
        {
            const left = Canvas.coord(Canvas.GetLeft(child));
            const top  = Canvas.coord(Canvas.GetTop(child));
            child.Arrange(new Rect(left, top, child.DesiredSize.Width, child.DesiredSize.Height));
        }
        return finalSize;
    }
}
