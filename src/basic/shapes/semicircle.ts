import {
    Point,
    Size,
    type DrawingContext,
} from '../../runtime/index.js';
import {
    ArcSegment,
    LineSegment,
    PathFigure,
    PathGeometry,
    SweepDirection,
    type Geometry,
} from '../../visual-engine/index.js';
import { Shape } from './shape.js';

// M3 Semicircle — upper half of an ellipse, closed by a base line. The
// curve fills the layout rect: rx = W/2, ry = H. The flat side sits on
// the bottom edge, the dome occupies the full height.
//
// Stroke insets by half-thickness.
export class Semicircle extends Shape
{
    // Hit / clip outline = the OUTER silhouette (inset 0), so the whole
    // shape including its stroke band is grabbable.
    protected override buildGeometry(size: Size): Geometry | undefined
    {
        return this.buildOutline(size, 0);
    }

    // The domed semicircle silhouette inset uniformly by `inset` px on every
    // edge. buildGeometry uses inset 0 (outer, for hit); RenderOverride paints
    // at inset = t/2 so a centred stroke lands fully inside the outline.
    private buildOutline(size: Size, inset: number): Geometry | undefined
    {
        if (size.Width <= 0 || size.Height <= 0) return undefined;

        const w    = Math.max(0, size.Width  - 2 * inset);
        const h    = Math.max(0, size.Height - 2 * inset);

        const xL      = inset;
        const xR      = inset + w;
        const yBottom = inset + h;

        const figure = new PathFigure(
            new Point(xL, yBottom),
            [
                new ArcSegment(
                    new Point(xR, yBottom),
                    new Size(w / 2, h),
                    0, false, SweepDirection.Clockwise),
                new LineSegment(new Point(xL, yBottom)),
            ],
            true);

        return new PathGeometry([figure]);
    }

    protected override RenderOverride(dc: DrawingContext): void
    {
        const geom = this.buildOutline(this.RenderSize, (this.Stroke?.Thickness ?? 0) / 2);
        if (geom === undefined) return;
        dc.DrawGeometry(this.Fill, this.Stroke, geom);
    }
}
