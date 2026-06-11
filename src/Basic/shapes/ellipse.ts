import { MetaData, Model, Point, Size, Visual, type DrawingContext } from '../../runtime/index.js';
import { Brush, EllipseGeometry, Pen } from '../../visual-engine/index.js';

// Ellipse shape — fills its arranged rect with an ellipse, optionally
// stroked. WPF parity: same DPs (Fill, Stroke, StrokeThickness), same
// "stretch to slot" semantics. Use Width = Height for a circle.
//
// Layout: ellipse has no intrinsic size — it asks for the explicit
// Width/Height set on Visual when present, otherwise zero (caller
// constrains via parent slot or explicit sizing). RenderSize from
// Visual is the actual drawn rect.
//
// Render: composes EllipseGeometry centered in the rect with X/Y
// radii of half the rect's width/height (minus half-stroke so the
// stroke sits inside the layout rect, matching Border's convention).
export class Ellipse extends Visual
{
    public static readonly FillKey            = Model.RegisterProperty<Brush | undefined>(Ellipse, 'Fill',            undefined, MetaData.Render);
    public static readonly StrokeKey          = Model.RegisterProperty<Brush | undefined>(Ellipse, 'Stroke',          undefined, MetaData.Render);
    public static readonly StrokeThicknessKey = Model.RegisterProperty<number>(           Ellipse, 'StrokeThickness', 0,         MetaData.Render);

    public get Fill(): Brush | undefined { return this.get_property_value(Ellipse.FillKey); }
    public set Fill(value: Brush | undefined) { this.set_property_value(Ellipse.FillKey, value); }

    public get Stroke(): Brush | undefined { return this.get_property_value(Ellipse.StrokeKey); }
    public set Stroke(value: Brush | undefined) { this.set_property_value(Ellipse.StrokeKey, value); }

    public get StrokeThickness(): number { return this.get_property_value(Ellipse.StrokeThicknessKey); }
    public set StrokeThickness(value: number) { this.set_property_value(Ellipse.StrokeThicknessKey, value); }

    protected override MeasureOverride(_availableSize: Size): Size
    {
        // Shapes have no intrinsic size — explicit Width / Height (or
        // a Stretch-style parent slot) drives sizing. Reporting zero
        // here matches WPF's Shape.MeasureOverride when no explicit
        // size is given.
        return Size.Zero;
    }

    protected override ArrangeOverride(finalSize: Size): Size
    {
        return finalSize;
    }

    protected override RenderOverride(dc: DrawingContext): void
    {
        const size = this.RenderSize;
        if (size.Width <= 0 || size.Height <= 0) return;

        const t  = this.StrokeThickness;
        const half = t / 2;
        const rx = Math.max(0, size.Width  / 2 - half);
        const ry = Math.max(0, size.Height / 2 - half);
        const cx = size.Width  / 2;
        const cy = size.Height / 2;

        const pen = this.Stroke !== undefined && t > 0
            ? new Pen(this.Stroke, t)
            : undefined;

        const geom = new EllipseGeometry(new Point(cx, cy), rx, ry);
        dc.DrawGeometry(this.Fill, pen, geom);
    }
}
