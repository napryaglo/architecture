import {
    MetaData,
    Model,
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

// M3 Fan — quarter-circle wedge anchored at the bottom-left corner of
// the layout rect. The straight edges run along the left and bottom of
// the rect; the curve sweeps from the top-left corner to the bottom-right
// corner.
//
// Pivot can be flipped via `Pivot` DP to anchor the wedge at one of the
// four corners. (Default `BottomLeft` — matches the M3 named shape's
// "fan opening to the upper-right" orientation.)
//
// Stroke insets by half-thickness.
export enum FanPivot
{
    TopLeft     = 'TopLeft',
    TopRight    = 'TopRight',
    BottomLeft  = 'BottomLeft',
    BottomRight = 'BottomRight',
}

export class Fan extends Visual
{
    public static readonly PivotKey           = Model.RegisterProperty<FanPivot>(         Fan, 'Pivot',           FanPivot.BottomLeft, MetaData.Render);

    public get Pivot(): FanPivot { return this.get_property_value(Fan.PivotKey); }
    public set Pivot(v: FanPivot) { this.set_property_value(Fan.PivotKey, v); }

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

        // Three points per pivot: the pivot itself + the two arc endpoints.
        // Pick the SVG sweep direction so the arc takes the "outer" path
        // (concave-toward-the-pivot), giving the wedge shape rather than
        // the rest of the ellipse.
        const xL = half,     xR = half + w;
        const yT = half,     yB = half + h;

        let pivot:    Point;
        let arcStart: Point;
        let arcEnd:   Point;
        let sweep:    SweepDirection;
        switch (this.Pivot)
        {
            case FanPivot.TopLeft:
                pivot    = new Point(xL, yT);
                arcStart = new Point(xR, yT);  // along the top edge
                arcEnd   = new Point(xL, yB);  // along the left edge
                sweep    = SweepDirection.Clockwise;
                break;
            case FanPivot.TopRight:
                pivot    = new Point(xR, yT);
                arcStart = new Point(xR, yB);  // along the right edge
                arcEnd   = new Point(xL, yT);  // along the top edge
                sweep    = SweepDirection.Clockwise;
                break;
            case FanPivot.BottomRight:
                pivot    = new Point(xR, yB);
                arcStart = new Point(xL, yB);  // along the bottom edge
                arcEnd   = new Point(xR, yT);  // along the right edge
                sweep    = SweepDirection.Clockwise;
                break;
            case FanPivot.BottomLeft:
            default:
                pivot    = new Point(xL, yB);
                arcStart = new Point(xL, yT);  // along the left edge
                arcEnd   = new Point(xR, yB);  // along the bottom edge
                sweep    = SweepDirection.Clockwise;
                break;
        }

        const figure = new PathFigure(
            pivot,
            [
                new LineSegment(arcStart),
                new ArcSegment(arcEnd, new Size(w, h), 0, false, sweep),
                new LineSegment(pivot),
            ],
            true);

        const pen = this.Stroke !== undefined && t > 0
            ? new Pen(this.Stroke, t)
            : undefined;

        dc.DrawGeometry(this.Background, pen, new PathGeometry([figure]));
    }
}
