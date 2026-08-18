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

// M3 Bun — symmetric vertical silhouette: a tall pill with a horizontal
// pinch at the middle, evoking two stacked humps (the "top bun + bottom
// bun" reading of the M3 named shape). Four cubic Beziers — one per
// quadrant — let the waist parameter `Waist` (fraction of W, default
// 0.85) dial the pinch from "no pinch" (Waist = 1) to "figure-8" (Waist
// ≈ 0.4).
//
// Stroke insets by half-thickness.
export class Bun extends Shape
{
    // 0…1. 1.0 = no pinch (pure ellipse). 0.4 = pronounced waist.
    public static readonly WaistKey           = Model.RegisterProperty<number>(           Bun, 'Waist',           0.85,      MetaData.Render);

    public get Waist(): number { return this.get_property_value(Bun.WaistKey); }
    public set Waist(v: number) { this.set_property_value(Bun.WaistKey, v); }

    // Hit / clip outline = the OUTER silhouette (inset 0), so the whole
    // shape including its stroke band is grabbable.
    protected override buildGeometry(size: Size): Geometry | undefined
    {
        return this.buildOutline(size, 0);
    }

    // The bun silhouette inset uniformly by `inset` px on every edge.
    // buildGeometry uses inset 0 (outer, for hit); RenderOverride paints at
    // inset = t/2 so a centred stroke lands fully inside the outline.
    private buildOutline(size: Size, inset: number): Geometry | undefined
    {
        if (size.Width <= 0 || size.Height <= 0) return undefined;

        const w    = Math.max(0, size.Width  - 2 * inset);
        const h    = Math.max(0, size.Height - 2 * inset);

        const cx    = inset + w / 2;
        const waist = Math.max(0.2, Math.min(1, this.Waist));
        const wx    = (w / 2) * waist;       // waist half-width
        const top   = new Point(cx, inset);
        const right = new Point(inset + w, inset + h / 2);
        const bot   = new Point(cx, inset + h);
        const left  = new Point(inset, inset + h / 2);
        const wRight = new Point(cx + wx, inset + h / 2);
        const wLeft  = new Point(cx - wx, inset + h / 2);

        // Each quadrant: cubic Bezier from corner to waist. Tangent on
        // the top is horizontal; tangent on the waist is vertical for a
        // smooth pinch.
        const k = 0.5523;
        const tangentY = (h / 4) * k;
        const tangentX = (w / 2) * k;

        // TR quadrant: top → wRight via right
        const seg1 = new CubicBezierSegment(
            new Point(top.X + tangentX,   top.Y),
            new Point(right.X,            right.Y - tangentY * 1.5),
            wRight);
        // BR quadrant: wRight → bot via right-lower
        const seg2 = new CubicBezierSegment(
            new Point(right.X,            right.Y + tangentY * 1.5),
            new Point(bot.X + tangentX,   bot.Y),
            bot);
        // BL quadrant: bot → wLeft via left-lower
        const seg3 = new CubicBezierSegment(
            new Point(bot.X - tangentX,   bot.Y),
            new Point(left.X,             left.Y + tangentY * 1.5),
            wLeft);
        // TL quadrant: wLeft → top via left-upper
        const seg4 = new CubicBezierSegment(
            new Point(left.X,             left.Y - tangentY * 1.5),
            new Point(top.X - tangentX,   top.Y),
            top);

        const figure = new PathFigure(top, [seg1, seg2, seg3, seg4], true);

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
