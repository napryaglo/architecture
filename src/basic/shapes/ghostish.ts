import {
    MetaData,
    Model,
    Point,
    Size,
    type DrawingContext,
} from '../../runtime/index.js';
import {
    ArcSegment,
    LineSegment,
    PathFigure,
    PathGeometry,
    SweepDirection,
    type Geometry,
} from '../../visual-engine/index.js';
import { Shape } from './shape.js';

// M3 Ghost-ish — pill silhouette with a scalloped bottom edge. The top
// half is a half-circle of radius W/2; the sides drop vertically; the
// bottom edge is N concave half-circles ("tentacles") of width W/N.
//
// `ScallopCount` defaults to 3 — the classic three-tail ghost silhouette.
// Higher counts produce a finer ruffled bottom; lower counts (1 or 2)
// produce a wide scoop.
//
// Stroke insets by half-thickness.
//
// Layout: works best when H ≥ W/2 + (W/(2·N)). Smaller H compresses the
// top arc and may flatten the silhouette.
export class Ghostish extends Shape
{
    public static readonly ScallopCountKey    = Model.RegisterProperty<number>(           Ghostish, 'ScallopCount',    3,         MetaData.Render);

    public get ScallopCount(): number { return this.get_property_value(Ghostish.ScallopCountKey); }
    public set ScallopCount(v: number) { this.set_property_value(Ghostish.ScallopCountKey, v); }

    // Outline = the drawn silhouette; single source for paint + hit.
    protected override buildGeometry(size: Size): Geometry | undefined
    {
        if (size.Width <= 0 || size.Height <= 0) return undefined;

        const stroke = this.Stroke;
        const t      = stroke?.Thickness ?? 0;
        const half = t / 2;
        const w    = Math.max(0, size.Width  - t);
        const h    = Math.max(0, size.Height - t);

        const N = Math.max(1, Math.floor(this.ScallopCount));
        const xL = half, xR = half + w, yB = half + h;
        // Top arc — half-ellipse spanning the full width. Vertical
        // radius clamps to half the available height so the silhouette
        // doesn't invert when H is too small.
        const topRy = Math.min(w / 2, h * 0.45);
        const topY  = half + topRy;

        const scallopW = w / N;
        const scallopR = scallopW / 2;

        const segs: (LineSegment | ArcSegment)[] = [
            new ArcSegment(
                new Point(xR, topY),
                new Size(w / 2, topRy),
                0, false, SweepDirection.Clockwise),
            new LineSegment(new Point(xR, yB)),
        ];
        // Walk the scallops right → left. Each scallop arcs UP into the
        // silhouette, so the path traversal is counterclockwise.
        for (let i = 0; i < N; i++)
        {
            const xs = xR - i * scallopW;
            const xe = xs - scallopW;
            segs.push(new ArcSegment(
                new Point(xe, yB),
                new Size(scallopR, scallopR),
                0, false, SweepDirection.Counterclockwise));
        }
        segs.push(new LineSegment(new Point(xL, topY)));

        const figure = new PathFigure(new Point(xL, topY), segs, true);

        return new PathGeometry([figure]);
    }

    protected override RenderOverride(dc: DrawingContext): void
    {
        const geom = this.buildGeometry(this.RenderSize);
        if (geom === undefined) return;
        dc.DrawGeometry(this.Fill, this.Stroke, geom);
    }
}
