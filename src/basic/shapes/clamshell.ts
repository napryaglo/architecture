import {
    MetaData,
    Model,
    Point,
    Size,
    type DrawingContext,
} from '../../runtime/index.js';
import { PathGeometry, type Geometry } from '../../visual-engine/index.js';
import { Shape } from './shape.js';
import { buildRoundedPolygon } from './polygon-helpers.js';

// M3 Clamshell — flat-top hexagonal silhouette. Six vertices placed at
// (W·0.25, 0), (W·0.75, 0), (W, H/2), (W·0.75, H), (W·0.25, H),
// (0, H/2). Walks clockwise from the top-left vertex.
//
// `CornerRadius` rounds each vertex via quadratic Beziers (same
// round-corner trick used by `Triangle`): the vertex is the Bezier
// control point, the endpoints sit `CornerRadius` away along each
// incident edge.
//
// Stroke insets by half-thickness.
export class Clamshell extends Shape
{
    public static readonly CornerRadiusKey    = Model.RegisterProperty<number>(           Clamshell, 'CornerRadius',    0,         MetaData.Render);

    public get CornerRadius(): number { return this.get_property_value(Clamshell.CornerRadiusKey); }
    public set CornerRadius(v: number) { this.set_property_value(Clamshell.CornerRadiusKey, v); }

    // Hit / clip outline = the OUTER silhouette (inset 0), so the whole
    // shape including its stroke band is grabbable.
    protected override buildGeometry(size: Size): Geometry | undefined
    {
        return this.buildOutline(size, 0);
    }

    // The clamshell silhouette inset uniformly by `inset` px on every edge.
    // buildGeometry uses inset 0 (outer, for hit); RenderOverride paints at
    // inset = t/2 so a centred stroke lands fully inside the outline.
    private buildOutline(size: Size, inset: number): Geometry | undefined
    {
        if (size.Width <= 0 || size.Height <= 0) return undefined;

        const w    = Math.max(0, size.Width  - 2 * inset);
        const h    = Math.max(0, size.Height - 2 * inset);

        // Six vertices walking clockwise from top-left.
        const tl = new Point(inset + w * 0.25, inset);
        const tr = new Point(inset + w * 0.75, inset);
        const rt = new Point(inset + w,        inset + h / 2);
        const br = new Point(inset + w * 0.75, inset + h);
        const bl = new Point(inset + w * 0.25, inset + h);
        const lt = new Point(inset,            inset + h / 2);
        const verts = [tl, tr, rt, br, bl, lt];

        // Shortest edge / 2 is the corner-radius upper bound. The
        // top/bottom edges are W·0.5 long; the four diagonals are
        // hypot(W·0.25, H/2).
        const diag    = Math.hypot(w * 0.25, h / 2);
        const minEdge = Math.min(w * 0.5, diag);
        const rMax    = Math.max(0, minEdge / 2 - 0.001);
        const r       = Math.max(0, Math.min(this.CornerRadius, rMax));

        const figure = buildRoundedPolygon(verts, r);

        return new PathGeometry([figure]);
    }

    protected override RenderOverride(dc: DrawingContext): void
    {
        // Paint the outline inset by half the pen so a centred stroke stays
        // inside the outer (hit) silhouette. Render is unchanged from when
        // buildGeometry itself insetted.
        const geom = this.buildOutline(this.RenderSize, (this.Stroke?.Thickness ?? 0) / 2);
        if (geom === undefined) return;
        dc.DrawGeometry(this.Fill, this.Stroke, geom);
    }
}
