import {
    MetaData,
    Model,
    Point,
    Size,
    type DrawingContext,
} from '../../runtime/index.js';
import {
    CubicBezierSegment,
    PathFigure,
    PathGeometry,
    type Geometry,
} from '../../visual-engine/index.js';
import { Shape } from './shape.js';

// M3 Squircle — superellipse `|2x/W|^n + |2y/H|^n = 1` rendered as a
// closed Bezier-approximated curve. The exponent n is exposed as the
// `Superness` DP:
//
//   * n = 2 — exact ellipse (degenerates to Ellipse).
//   * n = 4 — the M3 spec's named Squircle: rounded-rectangle-ish with
//             a smooth, continuous corner curvature (no arc-to-straight
//             discontinuity).
//   * n → ∞ — approaches a sharp rectangle.
//
// The curve is approximated with one cubic Bezier per quadrant, eight
// control points total. Bezier handles sit on the axis-aligned mid-edge
// tangents at offsets `kappa(n) * r` from the edge midpoint toward the
// corner, where r is the half-width / half-height of that quadrant.
// kappa(2) = 0.5523 (the canonical circle-via-Bezier value), kappa(∞) → 1
// (handles reach the corner). For 4 < n < ∞ the fit is visually
// indistinguishable from a true superellipse at common UI sizes; at
// extreme proportions the curve drifts inward by ≲1 logical pixel,
// which the M3 spec doesn't care about.
//
// Stroke insets by half-thickness (Border / Ellipse convention).
export class Squircle extends Shape
{
    // Superellipse exponent. M3 named "Squircle" is n = 4.
    public static readonly SupernessKey       = Model.RegisterProperty<number>(           Squircle, 'Superness',       4,         MetaData.Render);

    public get Superness(): number { return this.get_property_value(Squircle.SupernessKey); }
    public set Superness(v: number) { this.set_property_value(Squircle.SupernessKey, v); }

    // Outline = the drawn silhouette; single source for paint + hit.
    protected override buildGeometry(size: Size): Geometry | undefined
    {
        if (size.Width <= 0 || size.Height <= 0) return undefined;

        const stroke = this.Stroke;
        const t      = stroke?.Thickness ?? 0;
        const half = t / 2;
        const w    = Math.max(0, size.Width  - t);
        const h    = Math.max(0, size.Height - t);

        const figure = buildSquircleFigure(half, half, w, h, this.Superness);

        return new PathGeometry([figure]);
    }

    protected override RenderOverride(dc: DrawingContext): void
    {
        const geom = this.buildGeometry(this.RenderSize);
        if (geom === undefined) return;
        dc.DrawGeometry(this.Fill, this.Stroke, geom);
    }
}

// Build the closed Squircle PathFigure inscribed in (x, y, w, h).
// Exposed so subclasses (Slanted) can render the superellipse path in a
// shrunken inner rect before applying their own transform.
export function buildSquircleFigure(
    x: number, y: number, w: number, h: number, superness: number,
): PathFigure
{
    const rx = w / 2;
    const ry = h / 2;
    const cx = x + rx;
    const cy = y + ry;

    const n  = Math.max(1, superness);
    // Bezier offset from each axis midpoint toward the corner. For
    // n = 2 the canonical circle constant is 0.5523; as n → ∞ the
    // handle reaches the corner. The blend `1 - (1 - k2) * 2^(1 - n/2)`
    // gives the right asymptotes and tracks the superellipse fit to
    // ~1 logical pixel for typical UI sizes.
    const k2 = 4 * (Math.SQRT2 - 1) / 3;
    const k  = 1 - (1 - k2) * Math.pow(2, 1 - n / 2);

    const top    = new Point(cx,           cy - ry);
    const right  = new Point(cx + rx,      cy);
    const bottom = new Point(cx,           cy + ry);
    const left   = new Point(cx - rx,      cy);

    return new PathFigure(top, [
        new CubicBezierSegment(
            new Point(cx + k * rx, cy - ry),
            new Point(cx + rx,     cy - k * ry),
            right),
        new CubicBezierSegment(
            new Point(cx + rx,     cy + k * ry),
            new Point(cx + k * rx, cy + ry),
            bottom),
        new CubicBezierSegment(
            new Point(cx - k * rx, cy + ry),
            new Point(cx - rx,     cy + k * ry),
            left),
        new CubicBezierSegment(
            new Point(cx - rx,     cy - k * ry),
            new Point(cx - k * rx, cy - ry),
            top),
    ], true);
}
