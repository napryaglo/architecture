import { Point, type DrawingContext } from '../../runtime/index.js';
import { EllipseGeometry } from '../../visual-engine/index.js';
import { Shape } from './shape.js';

// Ellipse shape — fills its arranged rect with an ellipse, optionally
// stroked. Inherits Fill / Stroke / Geometry from Shape. Use Width =
// Height for a circle.
//
// Layout: ellipse has no intrinsic size — sizing comes from explicit
// Width / Height on Visual or from a Stretch-style parent slot.
// RenderSize from Visual is the actual drawn rect.
//
// Render: composes EllipseGeometry centered in the rect with X/Y
// radii of half the rect's width/height (minus half-stroke so the
// stroke sits inside the layout rect, matching Border's convention).
export class Ellipse extends Shape
{
    protected override RenderOverride(dc: DrawingContext): void
    {
        const size = this.RenderSize;
        if (size.Width <= 0 || size.Height <= 0) return;

        const stroke = this.Stroke;
        const t  = stroke?.Thickness ?? 0;
        const half = t / 2;
        const rx = Math.max(0, size.Width  / 2 - half);
        const ry = Math.max(0, size.Height / 2 - half);
        const cx = size.Width  / 2;
        const cy = size.Height / 2;

        const geom = new EllipseGeometry(new Point(cx, cy), rx, ry);
        dc.DrawGeometry(this.Fill, stroke, geom);
    }
}
