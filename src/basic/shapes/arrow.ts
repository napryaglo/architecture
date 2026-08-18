import {
    MetaData,
    Model,
    Point,
    Size,
    type DrawingContext,
} from '../../runtime/index.js';
import {
    LineSegment,
    PathFigure,
    PathGeometry,
    QuadraticBezierSegment,
    type Geometry,
} from '../../visual-engine/index.js';
import { Shape } from './shape.js';

// M3 Arrow — point-up shield silhouette. Same vertex skeleton as
// `Triangle` (top, bottom-left, bottom-right) but the bottom edge bows
// inward by `BowDepth` (fraction of H, default 0.15 — the M3 named
// arrow's interior notch).
//
// `CornerRadius` rounds the three vertices via quadratic Beziers like
// Triangle does; the bowed bottom remains a quadratic Bezier whose
// endpoints attach to the rounded BL / BR offsets.
//
// Stroke insets by half-thickness.
export class Arrow extends Shape
{
    public static readonly CornerRadiusKey    = Model.RegisterProperty<number>(           Arrow, 'CornerRadius',    0,         MetaData.Render);
    // 0 → straight base (degenerates to Triangle), 1 → base touches top.
    public static readonly BowDepthKey        = Model.RegisterProperty<number>(           Arrow, 'BowDepth',        0.15,      MetaData.Render);

    public get CornerRadius(): number { return this.get_property_value(Arrow.CornerRadiusKey); }
    public set CornerRadius(v: number) { this.set_property_value(Arrow.CornerRadiusKey, v); }

    public get BowDepth(): number { return this.get_property_value(Arrow.BowDepthKey); }
    public set BowDepth(v: number) { this.set_property_value(Arrow.BowDepthKey, v); }

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

        const topToBr = unit(top, br);
        const blToTop = unit(bl,  top);
        const topToBl = neg(blToTop);
        const brToTop = neg(topToBr);

        // The bow control point: the bottom edge midpoint pulled up
        // toward the top by `BowDepth × H`.
        const bow = Math.max(0, Math.min(1, this.BowDepth)) * h;
        const baseCtrl = new Point(half + w / 2, half + h - bow);

        const edges = [
            Math.hypot(br.X - top.X, br.Y - top.Y),
            w,
            Math.hypot(top.X - bl.X, top.Y - bl.Y),
        ];
        const rMax = Math.max(0, Math.min(...edges) / 2 - 0.001);
        const r    = Math.max(0, Math.min(this.CornerRadius, rMax));

        // Round-corner endpoints — where the rounded corner arcs end on
        // each incident edge. For the straight side edges these are
        // line endpoints; for the bowed bottom they're the bow Bezier's
        // endpoints.
        const brTopSide  = offset(br, brToTop,    r);
        const brBaseSide = new Point(br.X - r, br.Y);
        const blBaseSide = new Point(bl.X + r, bl.Y);
        const blTopSide  = offset(bl, blToTop, r);
        const topRight   = offset(top, topToBr, r);
        const topLeft    = offset(top, topToBl, r);

        const segments = r === 0
            ? [
                new LineSegment(br),
                new QuadraticBezierSegment(baseCtrl, bl),
                new LineSegment(top),
            ]
            : [
                new LineSegment(brTopSide),
                new QuadraticBezierSegment(br, brBaseSide),
                new QuadraticBezierSegment(baseCtrl, blBaseSide),
                new QuadraticBezierSegment(bl, blTopSide),
                new LineSegment(topLeft),
                new QuadraticBezierSegment(top, topRight),
            ];
        const startPoint = r === 0 ? top : topRight;

        const figure = new PathFigure(startPoint, segments, true);

        return new PathGeometry([figure]);
    }

    protected override RenderOverride(dc: DrawingContext): void
    {
        const geom = this.buildGeometry(this.RenderSize);
        if (geom === undefined) return;
        dc.DrawGeometry(this.Fill, this.Stroke, geom);
    }
}

function unit(a: Point, b: Point): Point
{
    const dx = b.X - a.X;
    const dy = b.Y - a.Y;
    const m  = Math.hypot(dx, dy) || 1;
    return new Point(dx / m, dy / m);
}

function neg(p: Point): Point { return new Point(-p.X, -p.Y); }

function offset(p: Point, dir: Point, r: number): Point
{
    return new Point(p.X + dir.X * r, p.Y + dir.Y * r);
}
