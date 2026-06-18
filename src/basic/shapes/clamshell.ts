import {
    MetaData,
    Model,
    Point,
    type DrawingContext,
} from '../../runtime/index.js';
import { PathGeometry } from '../../visual-engine/index.js';
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

    protected override RenderOverride(dc: DrawingContext): void
    {
        const size = this.RenderSize;
        if (size.Width <= 0 || size.Height <= 0) return;

        const stroke = this.Stroke;
        const t      = stroke?.Thickness ?? 0;
        const half = t / 2;
        const w    = Math.max(0, size.Width  - t);
        const h    = Math.max(0, size.Height - t);

        // Six vertices walking clockwise from top-left.
        const tl = new Point(half + w * 0.25, half);
        const tr = new Point(half + w * 0.75, half);
        const rt = new Point(half + w,        half + h / 2);
        const br = new Point(half + w * 0.75, half + h);
        const bl = new Point(half + w * 0.25, half + h);
        const lt = new Point(half,            half + h / 2);
        const verts = [tl, tr, rt, br, bl, lt];

        // Shortest edge / 2 is the corner-radius upper bound. The
        // top/bottom edges are W·0.5 long; the four diagonals are
        // hypot(W·0.25, H/2).
        const diag    = Math.hypot(w * 0.25, h / 2);
        const minEdge = Math.min(w * 0.5, diag);
        const rMax    = Math.max(0, minEdge / 2 - 0.001);
        const r       = Math.max(0, Math.min(this.CornerRadius, rMax));

        const figure = buildRoundedPolygon(verts, r);

        dc.DrawGeometry(this.Fill, stroke, new PathGeometry([figure]));
    }
}
