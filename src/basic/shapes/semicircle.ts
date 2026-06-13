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
    Brush,
    LineSegment,
    PathFigure,
    PathGeometry,
    Pen,
    SweepDirection,
} from '../../visual-engine/index.js';

// M3 Semicircle — upper half of an ellipse, closed by a base line. The
// curve fills the layout rect: rx = W/2, ry = H. The flat side sits on
// the bottom edge, the dome occupies the full height.
//
// Stroke insets by half-thickness.
export class Semicircle extends Visual
{
    public static readonly FillKey            = Model.RegisterProperty<Brush | undefined>(Semicircle, 'Fill',            undefined, MetaData.Render);
    public static readonly StrokeKey          = Model.RegisterProperty<Brush | undefined>(Semicircle, 'Stroke',          undefined, MetaData.Render);
    public static readonly StrokeThicknessKey = Model.RegisterProperty<number>(           Semicircle, 'StrokeThickness', 0,         MetaData.Render);

    public get Fill(): Brush | undefined { return this.get_property_value(Semicircle.FillKey); }
    public set Fill(v: Brush | undefined) { this.set_property_value(Semicircle.FillKey, v); }

    public get Stroke(): Brush | undefined { return this.get_property_value(Semicircle.StrokeKey); }
    public set Stroke(v: Brush | undefined) { this.set_property_value(Semicircle.StrokeKey, v); }

    public get StrokeThickness(): number { return this.get_property_value(Semicircle.StrokeThicknessKey); }
    public set StrokeThickness(v: number) { this.set_property_value(Semicircle.StrokeThicknessKey, v); }

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

        const pen = this.Stroke !== undefined && t > 0
            ? new Pen(this.Stroke, t)
            : undefined;

        dc.DrawGeometry(this.Fill, pen, new PathGeometry([figure]));
    }
}
