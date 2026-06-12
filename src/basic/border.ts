import {
    CornerRadius,
    MetaData,
    Model,
    Point,
    Rect,
    Single,
    Size,
    Thickness,
    type DrawingContext,
} from '../runtime/index.js';
import type { Visual } from '../runtime/index.js';
import {
    ArcSegment,
    Brush,
    LineSegment,
    PathFigure,
    PathGeometry,
    Pen,
    SweepDirection,
} from '../visual-engine/index.js';

// A Single that paints a background fill, an optional stroked border,
// and pads its child inward by BorderThickness + Padding on every side.
// Modeled on WPF System.Windows.Controls.Border — the canonical "first
// useful container" of a WPF-style framework.
//
// Margin (outer space) is NOT handled here — Visual's base Measure /
// Arrange already subtract Margin from the slot and inflate the
// reported DesiredSize, so any Border (like any other Visual) honours
// `border.Margin = ...` automatically without code in this file.
//
// Layout:
//   * MeasureOverride shrinks the child's available size by
//     (BorderThickness + Padding) on each axis, measures the child,
//     then reports a desired size of child.DesiredSize + insets.
//   * ArrangeOverride positions the child at (BorderThickness.Left +
//     Padding.Left, BorderThickness.Top + Padding.Top) with the
//     remaining size after subtracting the insets.
//
// Render:
//   * Background fills the entire Border rect (under the stroke).
//   * BorderBrush + BorderThickness produce a stroked rectangle inset
//     by half the thickness so the stroke sits inside the layout rect.
//   * CornerRadius rounds both the background fill and the stroke.
//     The stroke's inner radius is `CornerRadius - StrokeThickness/2`
//     (clamped to zero) so the stroke sits exactly on the rounded
//     outline. Applies to UNIFORM thickness only; the asymmetric
//     four-rect path below renders sharp corners regardless of radius
//     (a single mitered path would need DrawPathGeometry, which the
//     DC doesn't have today).
//   * A non-finite CornerRadius (e.g. `CornerRadius.Full`) is the
//     M3 "Full" shape-family sentinel — the render path treats it as
//     `min(width, height) / 2`, producing a stadium / pill on a wide
//     rect and a circle on a square one.
//   * Non-uniform BorderThickness paints four filled rectangles (top,
//     bottom, left, right) whose union forms the frame. Top and Bottom
//     span the full width; Left and Right fit between them. Each side
//     respects its own thickness independently. CornerRadius is
//     ignored for this case.
export class Border extends Single
{
    // Typed-key DPs. The `T` on each key flows through the typed
    // get/set_property_value overloads so the accessors below need no
    // `as` casts and a typo on the key name is a compile error rather
    // than a silent `undefined` at runtime. The string name is still the
    // binding-path identity ('Background' etc.) — that's what the µ-mural
    // parser / `Binding(t, 'Background')` resolves against.
    //
    // Inline static initializers run in declaration order at class-load
    // time, so by the time the first Border instance is constructed every
    // key is registered and slotted. Self-reference to `Border` as the
    // owner class is fine — class declarations are hoisted, only their
    // statics aren't filled in yet, and only the class identity matters
    // to RegisterProperty.
    public static readonly BackgroundKey = Model.RegisterProperty<Brush | undefined>(
        Border, 'Background', undefined,
        MetaData.Render);
    public static readonly BorderBrushKey = Model.RegisterProperty<Brush | undefined>(
        Border, 'BorderBrush', undefined,
        MetaData.Render);
    public static readonly BorderThicknessKey = Model.RegisterProperty<Thickness>(
        Border, 'BorderThickness', Thickness.Zero,
        MetaData.Measure | MetaData.Arrange | MetaData.Render);
    // CornerRadius accepts either a plain `number` (uniform radius —
    // `border.CornerRadius = 8`, `CornerRadius = 4` in markup) or a
    // CornerRadius instance for per-corner asymmetric corners (the
    // connected-bar shape ToolBar's First/Last buttons use). A `Thickness`
    // (the lowered form of `(a, b, c, d)` tuple syntax in .mu source —
    // the compiler always emits Thickness for tuples regardless of
    // target type) is also coerced: positional Left → TopLeft,
    // Top → TopRight, Right → BottomRight, Bottom → BottomLeft, so
    // `CornerRadius = (@ShapeFull, 0, 0, @ShapeFull)` in markup
    // produces the rounded-left / square-right shape one would expect.
    public static readonly CornerRadiusKey = Model.RegisterProperty<number | CornerRadius>(
        Border, 'CornerRadius', 0,
        MetaData.Render,
        (_model, base_value) =>
        {
            if (base_value instanceof Thickness)
            {
                return new CornerRadius(
                    base_value.Left, base_value.Top, base_value.Right, base_value.Bottom);
            }
            return base_value;
        });
    public static readonly PaddingKey = Model.RegisterProperty<Thickness>(
        Border, 'Padding', Thickness.Zero,
        MetaData.Measure | MetaData.Arrange);

    constructor(child?: Visual)
    {
        super();
        if (child !== undefined) this.SetChild(child);
    }

    public get Background(): Brush | undefined { return this.get_property_value(Border.BackgroundKey); }
    public set Background(value: Brush | undefined) { this.set_property_value(Border.BackgroundKey, value); }

    public get BorderBrush(): Brush | undefined { return this.get_property_value(Border.BorderBrushKey); }
    public set BorderBrush(value: Brush | undefined) { this.set_property_value(Border.BorderBrushKey, value); }

    public get BorderThickness(): Thickness { return this.get_property_value(Border.BorderThicknessKey); }
    public set BorderThickness(value: Thickness) { this.set_property_value(Border.BorderThicknessKey, value); }

    public get CornerRadius(): number | CornerRadius { return this.get_property_value(Border.CornerRadiusKey); }
    public set CornerRadius(value: number | CornerRadius) { this.set_property_value(Border.CornerRadiusKey, value); }

    public get Padding(): Thickness { return this.get_property_value(Border.PaddingKey); }
    public set Padding(value: Thickness) { this.set_property_value(Border.PaddingKey, value); }

    protected override MeasureOverride(availableSize: Size): Size
    {
        const insetH = this.BorderThickness.Horizontal + this.Padding.Horizontal;
        const insetV = this.BorderThickness.Vertical   + this.Padding.Vertical;

        const childAvailable = new Size(
            Math.max(0, availableSize.Width  - insetH),
            Math.max(0, availableSize.Height - insetV),
        );

        let childDesired = Size.Zero;
        if (this.child !== undefined)
        {
            this.child.Measure(childAvailable);
            childDesired = this.child.DesiredSize;
        }

        return new Size(
            childDesired.Width  + insetH,
            childDesired.Height + insetV,
        );
    }

    protected override ArrangeOverride(finalSize: Size): Size
    {
        if (this.child !== undefined)
        {
            const bt = this.BorderThickness;
            const pd = this.Padding;
            const childRect = new Rect(
                bt.Left + pd.Left,
                bt.Top  + pd.Top,
                Math.max(0, finalSize.Width  - bt.Horizontal - pd.Horizontal),
                Math.max(0, finalSize.Height - bt.Vertical   - pd.Vertical),
            );
            this.child.Arrange(childRect);
        }
        return finalSize;
    }

    protected override RenderOverride(dc: DrawingContext): void
    {
        const size = this.RenderSize;
        // Widen `number` to all-equal corners so the paint paths below
        // see a single shape regardless of how the consumer authored
        // the value. A non-finite per-corner radius is the M3 "Full"
        // sentinel — folded down to half the shorter side at paint
        // time so a wide rect renders as a stadium / pill, a square
        // as a circle. Each corner is clamped independently so an
        // asymmetric CornerRadius mixing Full + 0 (the connected-bar
        // shape) produces sharp inner corners and rounded outer caps.
        const raw = this.CornerRadius;
        const rawCorners = raw instanceof CornerRadius
            ? raw
            : new CornerRadius(raw, raw, raw, raw);
        const fold = Math.min(size.Width, size.Height) / 2;
        const tl = Number.isFinite(rawCorners.TopLeft)     ? rawCorners.TopLeft     : fold;
        const tr = Number.isFinite(rawCorners.TopRight)    ? rawCorners.TopRight    : fold;
        const br = Number.isFinite(rawCorners.BottomRight) ? rawCorners.BottomRight : fold;
        const bl = Number.isFinite(rawCorners.BottomLeft)  ? rawCorners.BottomLeft  : fold;
        const isUniformRadius = tl === tr && tr === br && br === bl;
        const radius = tl;  // only meaningful when isUniformRadius

        // Background fills the entire border rect (under the stroke).
        if (this.Background !== undefined)
        {
            if (isUniformRadius)
            {
                if (radius > 0)
                {
                    dc.DrawRoundedRectangle(
                        this.Background, undefined,
                        new Rect(0, 0, size.Width, size.Height),
                        radius, radius);
                }
                else
                {
                    dc.DrawRectangle(this.Background, undefined, new Rect(0, 0, size.Width, size.Height));
                }
            }
            else
            {
                // Non-uniform corners can't lower to a primitive rect —
                // build a path with arc corners and emit via DrawGeometry.
                const path = buildRoundedRectPath(0, 0, size.Width, size.Height, tl, tr, br, bl);
                dc.DrawGeometry(this.Background, undefined, path);
            }
        }

        // Stroked border. Uniform thickness uses a single stroked rect
        // (rounded or square); asymmetric thickness uses four filled
        // rects forming the frame.
        const bt = this.BorderThickness;
        if (this.BorderBrush === undefined) return;
        const isUniform = bt.Left === bt.Top && bt.Top === bt.Right && bt.Right === bt.Bottom;

        if (isUniform)
        {
            const thickness = bt.Top;
            if (thickness <= 0) return;
            const pen = new Pen(this.BorderBrush, thickness);
            const half = thickness / 2;
            const innerRect = new Rect(
                half, half,
                Math.max(0, size.Width  - thickness),
                Math.max(0, size.Height - thickness),
            );
            if (isUniformRadius)
            {
                if (radius > 0)
                {
                    // Inset the corner radius by the same half-thickness so
                    // the stroke sits exactly on the rounded outline. Clamp
                    // to zero so very thick borders with small radii degrade
                    // to a sharp inner corner instead of going negative.
                    const innerR = Math.max(0, radius - half);
                    dc.DrawRoundedRectangle(undefined, pen, innerRect, innerR, innerR);
                }
                else
                {
                    dc.DrawRectangle(undefined, pen, innerRect);
                }
            }
            else
            {
                // Stroke a per-corner path inset by half the thickness on
                // every side; each corner's effective radius shrinks by
                // the same amount (clamped to zero).
                const innerTl = Math.max(0, tl - half);
                const innerTr = Math.max(0, tr - half);
                const innerBr = Math.max(0, br - half);
                const innerBl = Math.max(0, bl - half);
                const path = buildRoundedRectPath(
                    half, half,
                    innerRect.Width, innerRect.Height,
                    innerTl, innerTr, innerBr, innerBl);
                dc.DrawGeometry(undefined, pen, path);
            }
            return;
        }

        // Asymmetric path — fill one rect per side. Top and Bottom span
        // the full width; Left and Right sit between Top and Bottom so
        // corner pixels are owned by Top/Bottom (a single deterministic
        // assignment instead of overlapping corners that double up the
        // alpha when the brush is translucent).
        const innerY = bt.Top;
        const innerH = Math.max(0, size.Height - bt.Top - bt.Bottom);
        if (bt.Top > 0)
        {
            dc.DrawRectangle(this.BorderBrush, undefined,
                new Rect(0, 0, size.Width, bt.Top));
        }
        if (bt.Bottom > 0)
        {
            dc.DrawRectangle(this.BorderBrush, undefined,
                new Rect(0, size.Height - bt.Bottom, size.Width, bt.Bottom));
        }
        if (bt.Left > 0)
        {
            dc.DrawRectangle(this.BorderBrush, undefined,
                new Rect(0, innerY, bt.Left, innerH));
        }
        if (bt.Right > 0)
        {
            dc.DrawRectangle(this.BorderBrush, undefined,
                new Rect(size.Width - bt.Right, innerY, bt.Right, innerH));
        }
    }
}

// Build a closed PathGeometry tracing a rounded rectangle with INDEPENDENT
// per-corner radii. Walks clockwise starting at the top edge just past
// the top-left arc, then: top-line → top-right arc → right-line →
// bottom-right arc → bottom-line → bottom-left arc → left-line →
// top-left arc → close.
//
// Each radius is clamped to half the shorter shared side so neighbouring
// arcs don't overlap — a corner with radius bigger than the rect can
// hold collapses to the largest fitting circle. Negative radii (the
// stroke path can produce them via `outer - half-thickness`) are
// pre-clamped to zero by the caller, but a final Math.max guards
// against caller bugs.
function buildRoundedRectPath(
    x: number, y: number, w: number, h: number,
    tlRaw: number, trRaw: number, brRaw: number, blRaw: number,
): PathGeometry
{
    const maxRH = w / 2;
    const maxRV = h / 2;
    const clamp = (r: number): number => Math.max(0, Math.min(r, maxRH, maxRV));
    const tl = clamp(tlRaw);
    const tr = clamp(trRaw);
    const br = clamp(brRaw);
    const bl = clamp(blRaw);

    // Start past the top-left arc on the top edge.
    const start = new Point(x + tl, y);
    const segments = [
        // Top edge → top-right arc start
        new LineSegment(new Point(x + w - tr, y)),
        // Top-right arc → right edge top
        new ArcSegment(
            new Point(x + w, y + tr),
            new Size(tr, tr), 0, false, SweepDirection.Clockwise),
        // Right edge → bottom-right arc start
        new LineSegment(new Point(x + w, y + h - br)),
        // Bottom-right arc → bottom edge right
        new ArcSegment(
            new Point(x + w - br, y + h),
            new Size(br, br), 0, false, SweepDirection.Clockwise),
        // Bottom edge → bottom-left arc start
        new LineSegment(new Point(x + bl, y + h)),
        // Bottom-left arc → left edge bottom
        new ArcSegment(
            new Point(x, y + h - bl),
            new Size(bl, bl), 0, false, SweepDirection.Clockwise),
        // Left edge → top-left arc start
        new LineSegment(new Point(x, y + tl)),
        // Top-left arc → back to start point
        new ArcSegment(
            new Point(x + tl, y),
            new Size(tl, tl), 0, false, SweepDirection.Clockwise),
    ];
    return new PathGeometry([new PathFigure(start, segments, true)]);
}
