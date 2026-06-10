import {
    MetaData,
    Model,
    Rect,
    Single,
    Size,
    Thickness,
    type DrawingContext,
} from '../runtime/index.js';
import type { Visual } from '../runtime/index.js';
import { Brush, Pen } from '../visual-engine/index.js';

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
    public static readonly CornerRadiusKey = Model.RegisterProperty<number>(
        Border, 'CornerRadius', 0,
        MetaData.Render);
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

    public get CornerRadius(): number { return this.get_property_value(Border.CornerRadiusKey); }
    public set CornerRadius(value: number) { this.set_property_value(Border.CornerRadiusKey, value); }

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
        const radius = this.CornerRadius;

        // Background fills the entire border rect (under the stroke).
        if (this.Background !== undefined)
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
