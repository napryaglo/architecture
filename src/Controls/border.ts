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
//   * CornerRadius is registered but not yet honored — DrawingContext
//     gets a DrawRoundedRectangle helper later (see visual-engine §5).
//   * Non-uniform BorderThickness is rendered as uniform using
//     BorderThickness.Top — per-side stroke needs a custom path
//     geometry (deferred).
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

        // Background fills the entire border rect (under the stroke).
        if (this.Background !== undefined)
        {
            dc.DrawRectangle(this.Background, undefined, new Rect(0, 0, size.Width, size.Height));
        }

        // Stroked border. Uniform thickness only for v1 — uses BorderThickness.Top.
        // Stroke is centered on the path, so inset by half-thickness to keep it inside size.
        const thickness = this.BorderThickness.Top;
        if (this.BorderBrush !== undefined && thickness > 0)
        {
            const pen = new Pen(this.BorderBrush, thickness);
            const half = thickness / 2;
            dc.DrawRectangle(
                undefined,
                pen,
                new Rect(half, half, Math.max(0, size.Width - thickness), Math.max(0, size.Height - thickness)),
            );
        }
    }
}
