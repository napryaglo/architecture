import {
    Point,
    Size,
    Visual,
    type DrawingContext,
} from '../../runtime/index.js';
import {
    ArcSegment,
    LineSegment,
    PathFigure,
    PathGeometry,
    Pen,
    SweepDirection,
} from '../../visual-engine/index.js';

// M3 Arch — doorway silhouette. The top of the layout rect is a
// half-ellipse; the bottom is square. Arch height (the vertical span the
// curve occupies) is `min(W/2, H)`: when H ≥ W/2 the arch is a perfect
// half-circle of radius W/2 with straight sides below; when H < W/2 the
// arch flattens into a wide half-ellipse that fills the full height.
//
// Stroke insets by half-thickness (Border / Ellipse convention).
export class Arch extends Visual
{

    protected override MeasureOverride(_availableSize: Size): Size { return Size.Zero; }
    protected override ArrangeOverride(finalSize: Size): Size { return finalSize; }

    protected override RenderOverride(dc: DrawingContext): void
    {
        const size = this.RenderSize;
        if (size.Width <= 0 || size.Height <= 0) return;

        const t    = this.StrokeThickness;
        const half = t / 2;
        const w    = Math.max(0, size.Width  - t);
        const h    = Math.max(0, size.Height - t);
        const archHeight = Math.min(w / 2, h);

        const xL          = half;
        const xR          = half + w;
        const yTopOfSides = half + archHeight;
        const yBottom     = half + h;

        const figure = new PathFigure(
            new Point(xL, yTopOfSides),
            [
                // Arc over the top — half-ellipse, clockwise sweep on
                // screen coords means "up and over to the right".
                new ArcSegment(
                    new Point(xR, yTopOfSides),
                    new Size(w / 2, archHeight),
                    0, false, SweepDirection.Clockwise),
                new LineSegment(new Point(xR, yBottom)),
                new LineSegment(new Point(xL, yBottom)),
            ],
            true);

        const pen = this.Stroke !== undefined && t > 0
            ? new Pen(this.Stroke, t)
            : undefined;

        dc.DrawGeometry(this.Background, pen, new PathGeometry([figure]));
    }
}
