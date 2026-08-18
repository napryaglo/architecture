import {
    MetaData,
    Model,
    Point,
    Size,
    type DrawingContext,
} from '../../runtime/index.js';
import { PathGeometry, type Geometry } from '../../visual-engine/index.js';
import { Shape } from './shape.js';
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
export class Triangle extends Shape
{
    public static readonly CornerRadiusKey    = Model.RegisterProperty<number>(           Triangle, 'CornerRadius',    0,         MetaData.Render);

    public get CornerRadius(): number { return this.get_property_value(Triangle.CornerRadiusKey); }
    public set CornerRadius(v: number) { this.set_property_value(Triangle.CornerRadiusKey, v); }

    // Outline = the drawn silhouette; single source for paint + hit.
    protected override buildGeometry(size: Size): Geometry | undefined
    {
        if (size.Width <= 0 || size.Height <= 0) return undefined;

        const stroke = this.Stroke;
        const t      = stroke?.Thickness ?? 0;
        const half = t / 2;
        const w    = Math.max(0, size.Width  - t);
        const h    = Math.max(0, size.Height - t);

        const top = new Point(half + w / 2, half);
        const bl  = new Point(half,         half + h);
        const br  = new Point(half + w,     half + h);
        const verts = [top, br, bl];

        const r = Math.max(0, Math.min(this.CornerRadius, maxCornerRadius(verts)));

        return new PathGeometry([buildRoundedPolygon(verts, r)]);
    }

    protected override RenderOverride(dc: DrawingContext): void
    {
        const geom = this.buildGeometry(this.RenderSize);
        if (geom === undefined) return;
        dc.DrawGeometry(this.Fill, this.Stroke, geom);
    }
}
