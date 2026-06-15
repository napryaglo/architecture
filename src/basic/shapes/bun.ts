import {
    MetaData,
    Model,
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

// M3 Bun — symmetric vertical silhouette: a tall pill with a horizontal
// pinch at the middle, evoking two stacked humps (the "top bun + bottom
// bun" reading of the M3 named shape). Four cubic Beziers — one per
// quadrant — let the waist parameter `Waist` (fraction of W, default
// 0.85) dial the pinch from "no pinch" (Waist = 1) to "figure-8" (Waist
// ≈ 0.4).
//
// Stroke insets by half-thickness.
export class Bun extends Visual
{
    // 0…1. 1.0 = no pinch (pure ellipse). 0.4 = pronounced waist.
    public static readonly WaistKey           = Model.RegisterProperty<number>(           Bun, 'Waist',           0.85,      MetaData.Render);

    public get Waist(): number { return this.get_property_value(Bun.WaistKey); }
    public set Waist(v: number) { this.set_property_value(Bun.WaistKey, v); }

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

        const cx    = half + w / 2;
        const waist = Math.max(0.2, Math.min(1, this.Waist));
        const wx    = (w / 2) * waist;       // waist half-width
        const top   = new Point(cx, half);
        const right = new Point(half + w, half + h / 2);
        const bot   = new Point(cx, half + h);
        const left  = new Point(half, half + h / 2);
        const wRight = new Point(cx + wx, half + h / 2);
        const wLeft  = new Point(cx - wx, half + h / 2);

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

        const pen = this.Stroke !== undefined && t > 0
            ? new Pen(this.Stroke, t)
            : undefined;

        dc.DrawGeometry(this.Background, pen, new PathGeometry([figure]));
    }
}
