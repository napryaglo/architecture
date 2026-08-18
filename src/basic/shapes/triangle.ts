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

    // Hit / clip outline = the OUTER silhouette (inset 0), so the whole
    // shape including its stroke band is grabbable.
    protected override buildGeometry(size: Size): Geometry | undefined
    {
        return this.buildOutline(size, 0);
    }

    // The isoceles-triangle silhouette inset uniformly by `inset` px on every
    // edge. buildGeometry uses inset 0 (outer, for hit); RenderOverride paints
    // at inset = t/2 so a centred stroke lands fully inside the outline.
    private buildOutline(size: Size, inset: number): Geometry | undefined
    {
        if (size.Width <= 0 || size.Height <= 0) return undefined;

        const w    = Math.max(0, size.Width  - 2 * inset);
        const h    = Math.max(0, size.Height - 2 * inset);

        const top = new Point(inset + w / 2, inset);
        const bl  = new Point(inset,         inset + h);
        const br  = new Point(inset + w,     inset + h);
        const verts = [top, br, bl];

        const r = Math.max(0, Math.min(this.CornerRadius, maxCornerRadius(verts)));

        return new PathGeometry([buildRoundedPolygon(verts, r)]);
    }

    protected override RenderOverride(dc: DrawingContext): void
    {
        const geom = this.buildOutline(this.RenderSize, (this.Stroke?.Thickness ?? 0) / 2);
        if (geom === undefined) return;
        dc.DrawGeometry(this.Fill, this.Stroke, geom);
    }
}
