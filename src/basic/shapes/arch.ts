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

// M3 Arch — doorway silhouette. The top of the layout rect is a
// half-ellipse; the bottom is square. Arch height (the vertical span the
// curve occupies) is `min(W/2, H)`: when H ≥ W/2 the arch is a perfect
// half-circle of radius W/2 with straight sides below; when H < W/2 the
// arch flattens into a wide half-ellipse that fills the full height.
//
// Stroke insets by half-thickness (Border / Ellipse convention).
export class Arch extends Shape
{
    // Hit / clip outline = the OUTER silhouette (inset 0).
    protected override buildGeometry(size: Size): Geometry | undefined
    {
        return this.buildOutline(size, 0);
    }

    // The silhouette inset uniformly by `inset` px per edge.
    private buildOutline(size: Size, inset: number): Geometry | undefined
    {
        if (size.Width <= 0 || size.Height <= 0) return undefined;

        const w    = Math.max(0, size.Width  - 2 * inset);
        const h    = Math.max(0, size.Height - 2 * inset);
        const archHeight = Math.min(w / 2, h);

        const xL          = inset;
        const xR          = inset + w;
        const yTopOfSides = inset + archHeight;
        const yBottom     = inset + h;

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

        return new PathGeometry([figure]);
    }

    protected override RenderOverride(dc: DrawingContext): void
    {
        const geom = this.buildOutline(this.RenderSize, (this.Stroke?.Thickness ?? 0) / 2);
        if (geom === undefined) return;
        dc.DrawGeometry(this.Fill, this.Stroke, geom);
    }
}
