import { Point, Size, Visual, type DrawingContext } from '../../runtime/index.js';
import { EllipseGeometry, Pen } from '../../visual-engine/index.js';

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
        dc.DrawGeometry(this.Background, pen, geom);
    }
}
