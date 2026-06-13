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

// M3 Arch — doorway silhouette. The top of the layout rect is a
// half-ellipse; the bottom is square. Arch height (the vertical span the
// curve occupies) is `min(W/2, H)`: when H ≥ W/2 the arch is a perfect
// half-circle of radius W/2 with straight sides below; when H < W/2 the
// arch flattens into a wide half-ellipse that fills the full height.
//
// Stroke insets by half-thickness (Border / Ellipse convention).
export class Arch extends Visual
{
    public static readonly FillKey            = Model.RegisterProperty<Brush | undefined>(Arch, 'Fill',            undefined, MetaData.Render);
    public static readonly StrokeKey          = Model.RegisterProperty<Brush | undefined>(Arch, 'Stroke',          undefined, MetaData.Render);
    public static readonly StrokeThicknessKey = Model.RegisterProperty<number>(           Arch, 'StrokeThickness', 0,         MetaData.Render);

    public get Fill(): Brush | undefined { return this.get_property_value(Arch.FillKey); }
    public set Fill(v: Brush | undefined) { this.set_property_value(Arch.FillKey, v); }

    public get Stroke(): Brush | undefined { return this.get_property_value(Arch.StrokeKey); }
    public set Stroke(v: Brush | undefined) { this.set_property_value(Arch.StrokeKey, v); }

    public get StrokeThickness(): number { return this.get_property_value(Arch.StrokeThicknessKey); }
    public set StrokeThickness(v: number) { this.set_property_value(Arch.StrokeThicknessKey, v); }

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

        dc.DrawGeometry(this.Fill, pen, new PathGeometry([figure]));
    }
}
