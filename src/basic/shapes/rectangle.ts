import { MetaData, Model, Rect, Size, Visual, type DrawingContext } from '../../runtime/index.js';
import { Pen, RectangleGeometry } from '../../visual-engine/index.js';

// Rectangle shape — fills its arranged rect, optionally stroked, with
// optional corner radii. WPF parity: same DPs (Fill, Stroke,
// StrokeThickness, RadiusX, RadiusY), same "stretch to slot" semantics.
//
// Stroke insets by half-thickness so the entire stroke sits inside the
// layout rect, matching Border's convention. Setting Stroke alone (no
// Fill) draws an outlined rectangle; setting Fill alone draws a solid
// fill; both together draws fill + stroke.
//
// Layout: shapes have no intrinsic size — sizing comes from explicit
// Width/Height on Visual or from a Stretch-style parent slot.
export class Rectangle extends Visual
{
    // Background / Stroke / StrokeThickness live on Visual — every shape
    // inherits them, so the DPs aren't re-declared per primitive.
    public static readonly RadiusXKey = Model.RegisterProperty<number>(Rectangle, 'RadiusX', 0, MetaData.Render);
    public static readonly RadiusYKey = Model.RegisterProperty<number>(Rectangle, 'RadiusY', 0, MetaData.Render);

    public get RadiusX(): number { return this.get_property_value(Rectangle.RadiusXKey); }
    public set RadiusX(value: number) { this.set_property_value(Rectangle.RadiusXKey, value); }

    public get RadiusY(): number { return this.get_property_value(Rectangle.RadiusYKey); }
    public set RadiusY(value: number) { this.set_property_value(Rectangle.RadiusYKey, value); }

    protected override MeasureOverride(_availableSize: Size): Size
    {
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

        const t = this.StrokeThickness;
        const half = t / 2;
        // Inset the geometry by half-stroke on every side so the stroke
        // sits inside the layout rect (matches Border / Ellipse).
        const x = half;
        const y = half;
        const w = Math.max(0, size.Width  - t);
        const h = Math.max(0, size.Height - t);

        const pen = this.Stroke !== undefined && t > 0
            ? new Pen(this.Stroke, t)
            : undefined;

        const geom = new RectangleGeometry(
            new Rect(x, y, w, h),
            this.RadiusX,
            this.RadiusY,
        );
        dc.DrawGeometry(this.Background, pen, geom);
    }
}
