import {
    MetaData,
    Model,
    Point,
    Size,
    Visual,
    type DrawingContext,
} from '../../runtime/index.js';
import { Brush, PathGeometry, Pen } from '../../visual-engine/index.js';
import { buildRoundedPolygon, maxCornerRadius } from './polygon-helpers.js';

// M3 Triangle — point-up isoceles triangle inscribed in the layout rect.
// Vertices: (W/2, 0), (0, H), (W, H). Corners can be rounded via
// `CornerRadius` — each vertex gets a quadratic-Bezier round-off whose
// control point IS the sharp vertex and whose endpoints sit `CornerRadius`
// away along each incident edge.
//
// Equilateral isn't enforced — the triangle stretches to fit the rect.
// A consumer who wants a strict equilateral picks W : H = 2 : √3 (the
// inscribed equilateral aspect).
//
// Stroke insets by half-thickness.
export class Triangle extends Visual
{
    public static readonly FillKey            = Model.RegisterProperty<Brush | undefined>(Triangle, 'Fill',            undefined, MetaData.Render);
    public static readonly StrokeKey          = Model.RegisterProperty<Brush | undefined>(Triangle, 'Stroke',          undefined, MetaData.Render);
    public static readonly StrokeThicknessKey = Model.RegisterProperty<number>(           Triangle, 'StrokeThickness', 0,         MetaData.Render);
    public static readonly CornerRadiusKey    = Model.RegisterProperty<number>(           Triangle, 'CornerRadius',    0,         MetaData.Render);

    public get Fill(): Brush | undefined { return this.get_property_value(Triangle.FillKey); }
    public set Fill(v: Brush | undefined) { this.set_property_value(Triangle.FillKey, v); }

    public get Stroke(): Brush | undefined { return this.get_property_value(Triangle.StrokeKey); }
    public set Stroke(v: Brush | undefined) { this.set_property_value(Triangle.StrokeKey, v); }

    public get StrokeThickness(): number { return this.get_property_value(Triangle.StrokeThicknessKey); }
    public set StrokeThickness(v: number) { this.set_property_value(Triangle.StrokeThicknessKey, v); }

    public get CornerRadius(): number { return this.get_property_value(Triangle.CornerRadiusKey); }
    public set CornerRadius(v: number) { this.set_property_value(Triangle.CornerRadiusKey, v); }

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

        const top = new Point(half + w / 2, half);
        const bl  = new Point(half,         half + h);
        const br  = new Point(half + w,     half + h);
        const verts = [top, br, bl];

        const r = Math.max(0, Math.min(this.CornerRadius, maxCornerRadius(verts)));

        const pen = this.Stroke !== undefined && t > 0
            ? new Pen(this.Stroke, t)
            : undefined;

        dc.DrawGeometry(this.Fill, pen, new PathGeometry([buildRoundedPolygon(verts, r)]));
    }
}
