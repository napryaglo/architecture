import { MetaData, MuralBase, Rect, Size, type DrawingContext } from '../../runtime/index.js';
import { RectangleGeometry, type Geometry } from '../../visual-engine/index.js';
import { Shape } from './shape.js';

// Rectangle shape — fills its arranged rect, optionally stroked, with
// optional corner radii. Inherits Fill / Stroke / Geometry from Shape;
// declares its own RadiusX / RadiusY as the geometry-shape input.
//
// Stroke insets by half-thickness so the entire stroke sits inside the
// layout rect, matching Border's convention. Setting Stroke alone (no
// Fill) draws an outlined rectangle; setting Fill alone draws a solid
// fill; both together draws fill + stroke.
//
// Layout: shapes have no intrinsic size — sizing comes from explicit
// Width/Height on Visual or from a Stretch-style parent slot.
export class Rectangle extends Shape
{
    public static readonly RadiusXKey = MuralBase.RegisterProperty<number>(Rectangle, 'RadiusX', 0, MetaData.Render);
    public static readonly RadiusYKey = MuralBase.RegisterProperty<number>(Rectangle, 'RadiusY', 0, MetaData.Render);

    public get RadiusX(): number { return this.get_property_value(Rectangle.RadiusXKey); }
    public set RadiusX(value: number) { this.set_property_value(Rectangle.RadiusXKey, value); }

    public get RadiusY(): number { return this.get_property_value(Rectangle.RadiusYKey); }
    public set RadiusY(value: number) { this.set_property_value(Rectangle.RadiusYKey, value); }

    // Hit outline: the UN-inset full-slot rect (with the same corner radii),
    // so the stroke is grabbable. RenderOverride draws the inset rect.
    protected override buildGeometry(size: Size): Geometry | undefined
    {
        return new RectangleGeometry(
            new Rect(0, 0, size.Width, size.Height),
            this.RadiusX, this.RadiusY);
    }

    protected override RenderOverride(dc: DrawingContext): void
    {
        const size = this.RenderSize;
        if (size.Width <= 0 || size.Height <= 0) return;

        const stroke = this.Stroke;
        const t = stroke?.Thickness ?? 0;
        const half = t / 2;
        // Inset the geometry by half-stroke on every side so the stroke
        // sits inside the layout rect (matches Border / Ellipse).
        const geom = new RectangleGeometry(
            new Rect(half, half,
                     Math.max(0, size.Width  - t),
                     Math.max(0, size.Height - t)),
            this.RadiusX,
            this.RadiusY,
        );
        dc.DrawGeometry(this.Fill, stroke, geom);
    }
}
