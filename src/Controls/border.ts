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
    static {
        Model.RegisterProperty(Border, 'Background',      undefined,
            MetaData.Render);
        Model.RegisterProperty(Border, 'BorderBrush',     undefined,
            MetaData.Render);
        Model.RegisterProperty(Border, 'BorderThickness', Thickness.Zero,
            MetaData.Measure | MetaData.Arrange | MetaData.Render);
        Model.RegisterProperty(Border, 'CornerRadius',    0,
            MetaData.Render);
        Model.RegisterProperty(Border, 'Padding',         Thickness.Zero,
            MetaData.Measure | MetaData.Arrange);
    }

    constructor(child?: Visual)
    {
        super();
        if (child !== undefined) this.SetChild(child);
    }

    public get Background(): Brush | undefined { return this.get_property_value('Background'); }
    public set Background(value: Brush | undefined) { this.set_property_value('Background', value); }

    public get BorderBrush(): Brush | undefined { return this.get_property_value('BorderBrush'); }
    public set BorderBrush(value: Brush | undefined) { this.set_property_value('BorderBrush', value); }

    public get BorderThickness(): Thickness { return this.get_property_value('BorderThickness'); }
    public set BorderThickness(value: Thickness) { this.set_property_value('BorderThickness', value); }

    public get CornerRadius(): number { return this.get_property_value('CornerRadius'); }
    public set CornerRadius(value: number) { this.set_property_value('CornerRadius', value); }

    public get Padding(): Thickness { return this.get_property_value('Padding'); }
    public set Padding(value: Thickness) { this.set_property_value('Padding', value); }

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
