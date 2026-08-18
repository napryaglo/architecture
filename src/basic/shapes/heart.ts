import {
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

// M3 Heart — classic two-lobe-top + pointed-bottom silhouette. Path is
// two cubic Beziers (one per lobe) and the meeting in the centre top,
// then two cubic Beziers down to the bottom point.
//
// All control points are expressed as fractions of W × H so the shape
// scales with the layout slot. The proportions match the M3 catalog's
// named "Heart" shape: lobes peak at y ≈ 0.30·H, valley at the top
// centre at y ≈ 0.25·H, point at (W/2, H).
//
// Stroke insets by half-thickness.
export class Heart extends Shape
{
    // Hit / clip outline = the OUTER silhouette (inset 0), so the whole
    // shape including its stroke band is grabbable.
    protected override buildGeometry(size: Size): Geometry | undefined
    {
        return this.buildOutline(size, 0);
    }

    // The heart silhouette inset uniformly by `inset` px on every edge.
    // buildGeometry uses inset 0 (outer, for hit); RenderOverride paints at
    // inset = t/2 so a centred stroke lands fully inside the outline.
    private buildOutline(size: Size, inset: number): Geometry | undefined
    {
        if (size.Width <= 0 || size.Height <= 0) return undefined;

        const w = Math.max(0, size.Width  - 2 * inset);
        const h = Math.max(0, size.Height - 2 * inset);

        // Anchor points (fractions of w / h).
        const cx     = inset + w * 0.5;
        const topY   = inset + h * 0.25;       // top-centre valley
        const point  = new Point(cx, inset + h * 1.0);   // bottom point
        const valley = new Point(cx, topY);
        const lobeL  = new Point(inset + w * 0.0,  inset + h * 0.30);  // left lobe peak
        const lobeR  = new Point(inset + w * 1.0,  inset + h * 0.30);  // right lobe peak

        // Cubic-Bezier control points sized for plausible lobe roundness.
        // The control offsets pull each lobe outward and the path down
        // toward the point.
        const ctrl1L = new Point(inset + w * 0.20, inset + h * 0.00);  // valley → lobeL outgoing
        const ctrl2L = new Point(inset + w * -0.10, inset + h * 0.15);  // lobeL incoming
        const ctrl1B = new Point(inset + w * -0.05, inset + h * 0.55);  // lobeL outgoing toward bottom
        const ctrl2B = new Point(inset + w * 0.30, inset + h * 0.90);   // point incoming from left
        const ctrl1R = new Point(inset + w * 0.70, inset + h * 0.90);   // point outgoing toward right
        const ctrl2R = new Point(inset + w * 1.05, inset + h * 0.55);   // lobeR incoming from bottom
        const ctrl1RT = new Point(inset + w * 1.10, inset + h * 0.15);  // lobeR outgoing toward valley
        const ctrl2RT = new Point(inset + w * 0.80, inset + h * 0.00);  // valley incoming from right

        const figure = new PathFigure(valley, [
            new CubicBezierSegment(ctrl1L,  ctrl2L,  lobeL),  // valley → lobeL
            new CubicBezierSegment(ctrl1B,  ctrl2B,  point),  // lobeL → point
            new CubicBezierSegment(ctrl1R,  ctrl2R,  lobeR),  // point → lobeR
            new CubicBezierSegment(ctrl1RT, ctrl2RT, valley), // lobeR → valley
        ], true);

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
