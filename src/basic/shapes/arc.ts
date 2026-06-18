import {
    MetaData,
    Model,
    Point,
    Size,
    type DrawingContext,
} from '../../runtime/index.js';
import {
    ArcSegment,
    PathFigure,
    PathGeometry,
    SweepDirection,
} from '../../visual-engine/index.js';
import { Shape } from './shape.js';

// Arc shape — strokes (or fills) a circular arc between StartAngle and
// EndAngle inside the arranged rect. Angles are in degrees, with 0° at
// the +X axis and increasing clockwise (SVG convention). Same shape as
// WPF's Path with an ArcSegment.
//
// Used by the ProgressIndicator Circular variant; consumers can also
// drive the geometry directly for custom radial chrome (sunburst slots,
// fan-out menus, etc.).
//
// Sweep direction: the arc draws clockwise from StartAngle to EndAngle.
// To draw counter-clockwise, the consumer swaps the two angles.
export class Arc extends Shape
{
    public static readonly StartAngleKey      = Model.RegisterProperty<number>(           Arc, 'StartAngle',      0,         MetaData.Render);
    public static readonly EndAngleKey        = Model.RegisterProperty<number>(           Arc, 'EndAngle',        360,       MetaData.Render);
    public get StartAngle(): number { return this.get_property_value(Arc.StartAngleKey); }
    public set StartAngle(v: number) { this.set_property_value(Arc.StartAngleKey, v); }

    public get EndAngle(): number { return this.get_property_value(Arc.EndAngleKey); }
    public set EndAngle(v: number) { this.set_property_value(Arc.EndAngleKey, v); }

    protected override RenderOverride(dc: DrawingContext): void
    {
        const size = this.RenderSize;
        if (size.Width <= 0 || size.Height <= 0) return;

        const stroke = this.Stroke;
        const t      = stroke?.Thickness ?? 0;
        const half = t / 2;
        // Inscribe the arc in the rendered rect — same "stroke sits
        // inside the layout rect" convention Border and Ellipse use.
        const rx = Math.max(0, size.Width  / 2 - half);
        const ry = Math.max(0, size.Height / 2 - half);
        const cx = size.Width  / 2;
        const cy = size.Height / 2;

        const startRad = (this.StartAngle * Math.PI) / 180;
        const endRad   = (this.EndAngle   * Math.PI) / 180;
        const startPoint = new Point(
            cx + rx * Math.cos(startRad),
            cy + ry * Math.sin(startRad),
        );
        const endPoint = new Point(
            cx + rx * Math.cos(endRad),
            cy + ry * Math.sin(endRad),
        );

        // Sweep magnitude in degrees, clamped to [0, 360]. A 0° sweep
        // produces a no-op path (no segments); a 360° sweep is a full
        // ellipse — SVG arc segments require StartPoint ≠ EndPoint, so
        // the >=360° case folds down to a full ellipse traced as two
        // semi-circles ending where they started.
        let sweep = this.EndAngle - this.StartAngle;
        // Normalise into (-360, 360) so a consumer who writes
        // StartAngle=-90, EndAngle=270 (a full circle) still produces
        // the closed shape rather than a degenerate empty path.
        while (sweep <= -360) sweep += 360;
        while (sweep >   360) sweep -= 360;
        if (sweep === 0) return;

        const isLargeArc = Math.abs(sweep) > 180;
        const direction  = sweep >= 0
            ? SweepDirection.Clockwise
            : SweepDirection.Counterclockwise;

        const segments = [
            new ArcSegment(
                endPoint,
                new Size(rx, ry),
                0,            // rotation angle in degrees
                isLargeArc,
                direction,
            ),
        ];
        const figure = new PathFigure(startPoint, segments, false);
        const path   = new PathGeometry([figure]);

        dc.DrawGeometry(this.Fill, stroke, path);
    }
}
