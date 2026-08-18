import {
    Matrix,
    MetaData,
    Model,
    Size,
    type DrawingContext,
} from '../../runtime/index.js';
import { MatrixTransform, PathGeometry, type Geometry } from '../../visual-engine/index.js';
import { Squircle, buildSquircleFigure } from './squircle.js';

// M3 Slanted — a Squircle leaning to one side via a horizontal shear
// about the bottom edge. Default `LeanAngle` = −12°, matching the M3
// catalog's named shape (top leans right, bottom stays planted).
//
// Inscription: the inner Squircle width is shrunk by `H · |tan(angle)|`
// before the shear so the final sheared silhouette fits inside the
// layout rect. (The shear of an unmodified Squircle would otherwise
// extend horizontally outside the slot.) The shrinkage centres around
// the rect midline, so the leaning still reads as a uniform tilt rather
// than a one-sided crop.
//
// Stroke insets by half-thickness (inherited from Squircle).
export class Slanted extends Squircle
{
    public static readonly LeanAngleKey = Model.RegisterProperty<number>(
        Slanted, 'LeanAngle', -12, MetaData.Render);

    public get LeanAngle(): number { return this.get_property_value(Slanted.LeanAngleKey); }
    public set LeanAngle(v: number) { this.set_property_value(Slanted.LeanAngleKey, v); }

    // Hit outline: the same sheared squircle the renderer draws, with the
    // shear baked into the geometry's Transform (Contains inverts it).
    // RenderOverride keeps its own dc.PushTransform — do NOT delegate.
    protected override buildGeometry(size: Size): Geometry | undefined
    {
        if (size.Width <= 0 || size.Height <= 0) return undefined;

        const stroke = this.Stroke;
        const t      = stroke?.Thickness ?? 0;
        const half = t / 2;
        const w    = Math.max(0, size.Width  - t);
        const h    = Math.max(0, size.Height - t);

        const lean = this.LeanAngle * Math.PI / 180;
        const tan  = Math.tan(lean);
        const shift = h * Math.abs(tan);

        const innerWidth = Math.max(0, w - shift);
        const innerXL    = half + shift / 2;

        const geom = new PathGeometry([
            buildSquircleFigure(innerXL, half, innerWidth, h, this.Superness)]);

        if (tan !== 0)
        {
            const yBottom = half + h;
            geom.Transform = new MatrixTransform(new Matrix(1, 0, -tan, 1, yBottom * tan, 0));
        }
        return geom;
    }

    protected override RenderOverride(dc: DrawingContext): void
    {
        const size = this.RenderSize;
        if (size.Width <= 0 || size.Height <= 0) return;

        const stroke = this.Stroke;
        const t      = stroke?.Thickness ?? 0;
        const half = t / 2;
        const w    = Math.max(0, size.Width  - t);
        const h    = Math.max(0, size.Height - t);

        const lean = this.LeanAngle * Math.PI / 180;
        const tan  = Math.tan(lean);
        const shift = h * Math.abs(tan);

        const innerWidth = Math.max(0, w - shift);
        // Centre the shrunken Squircle horizontally inside the rect so
        // the lean reads as symmetric.
        const innerXL    = half + shift / 2;

        const figure = buildSquircleFigure(innerXL, half, innerWidth, h, this.Superness);

        if (tan === 0)
        {
            dc.DrawGeometry(this.Fill, stroke, new PathGeometry([figure]));
            return;
        }

        // Shear about y = half + h (the bottom of the inset rect) so the
        // base stays planted and the top shifts horizontally by ±shift.
        // x' = x + (h0 − y) · tan(α), where h0 = half + h.
        //   row-vector matrix: x' = x · 1 + y · (−tan) + (h0 · tan)
        const yBottom = half + h;
        const skew    = new Matrix(1, 0, -tan, 1, yBottom * tan, 0);

        dc.PushTransform(new MatrixTransform(skew));
        dc.DrawGeometry(this.Fill, stroke, new PathGeometry([figure]));
        dc.Pop();
    }
}
