import {
    Point,
    Size,
    Visual,
    type DrawingContext,
} from '../../runtime/index.js';
import {
    CubicBezierSegment,
    PathFigure,
    PathGeometry,
    Pen,
} from '../../visual-engine/index.js';

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
export class Heart extends Visual
{

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

        // Anchor points (fractions of w / h).
        const cx     = half + w * 0.5;
        const topY   = half + h * 0.25;       // top-centre valley
        const point  = new Point(cx, half + h * 1.0);   // bottom point
        const valley = new Point(cx, topY);
        const lobeL  = new Point(half + w * 0.0,  half + h * 0.30);  // left lobe peak
        const lobeR  = new Point(half + w * 1.0,  half + h * 0.30);  // right lobe peak

        // Cubic-Bezier control points sized for plausible lobe roundness.
        // The control offsets pull each lobe outward and the path down
        // toward the point.
        const ctrl1L = new Point(half + w * 0.20, half + h * 0.00);  // valley → lobeL outgoing
        const ctrl2L = new Point(half + w * -0.10, half + h * 0.15);  // lobeL incoming
        const ctrl1B = new Point(half + w * -0.05, half + h * 0.55);  // lobeL outgoing toward bottom
        const ctrl2B = new Point(half + w * 0.30, half + h * 0.90);   // point incoming from left
        const ctrl1R = new Point(half + w * 0.70, half + h * 0.90);   // point outgoing toward right
        const ctrl2R = new Point(half + w * 1.05, half + h * 0.55);   // lobeR incoming from bottom
        const ctrl1RT = new Point(half + w * 1.10, half + h * 0.15);  // lobeR outgoing toward valley
        const ctrl2RT = new Point(half + w * 0.80, half + h * 0.00);  // valley incoming from right

        const figure = new PathFigure(valley, [
            new CubicBezierSegment(ctrl1L,  ctrl2L,  lobeL),  // valley → lobeL
            new CubicBezierSegment(ctrl1B,  ctrl2B,  point),  // lobeL → point
            new CubicBezierSegment(ctrl1R,  ctrl2R,  lobeR),  // point → lobeR
            new CubicBezierSegment(ctrl1RT, ctrl2RT, valley), // lobeR → valley
        ], true);

        const pen = this.Stroke !== undefined && t > 0
            ? new Pen(this.Stroke, t)
            : undefined;

        dc.DrawGeometry(this.Background, pen, new PathGeometry([figure]));
    }
}
