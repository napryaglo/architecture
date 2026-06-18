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
} from '../../visual-engine/index.js';
import { Shape } from './shape.js';

// M3 Semicircle — upper half of an ellipse, closed by a base line. The
// curve fills the layout rect: rx = W/2, ry = H. The flat side sits on
// the bottom edge, the dome occupies the full height.
//
// Stroke insets by half-thickness.
export class Semicircle extends Shape
{
    protected override RenderOverride(dc: DrawingContext): void
    {
        const size = this.RenderSize;
        if (size.Width <= 0 || size.Height <= 0) return;

        const stroke = this.Stroke;
        const t      = stroke?.Thickness ?? 0;
        const half = t / 2;
        const w    = Math.max(0, size.Width  - t);
        const h    = Math.max(0, size.Height - t);

        const xL      = half;
        const xR      = half + w;
        const yBottom = half + h;

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

        dc.DrawGeometry(this.Fill, stroke, new PathGeometry([figure]));
    }
}
