import { MetaData, Model, Point, Size, type DrawingContext } from '../../runtime/index.js';
import { LineGeometry } from '../../visual-engine/index.js';
import { Shape } from './shape.js';

// Straight-line shape — draws a stroked line from (X1, Y1) to (X2, Y2)
// in its own LOCAL coordinate space. WPF parity: same DPs (X1, Y1, X2,
// Y2, Stroke, StrokeThickness).
//
// Layout: the line measures to the bounding box of its endpoints
// (max(X1,X2) wide × max(Y1,Y2) tall). Negative coordinates clip to
// zero — author keeps endpoints in [0, +∞).
//
// Render: a LineGeometry from (X1, Y1) to (X2, Y2) stroked with
// `Stroke` × `StrokeThickness`. No fill (a line has zero area).
//
// Diagram-app usage: the host positions the Line via Canvas.SetLeft /
// SetTop to the bounding box's top-left in canvas coords, and sets
// X1/Y1/X2/Y2 RELATIVE to that origin. This keeps each connector's
// hit area tight to the line rather than blanket-covering the canvas.
export class Line extends Shape
{
    public static readonly X1Key              = Model.RegisterProperty<number>(           Line, 'X1',              0,         MetaData.Measure | MetaData.Render);
    public static readonly Y1Key              = Model.RegisterProperty<number>(           Line, 'Y1',              0,         MetaData.Measure | MetaData.Render);
    public static readonly X2Key              = Model.RegisterProperty<number>(           Line, 'X2',              0,         MetaData.Measure | MetaData.Render);
    public static readonly Y2Key              = Model.RegisterProperty<number>(           Line, 'Y2',              0,         MetaData.Measure | MetaData.Render);
    public get X1(): number { return this.get_property_value(Line.X1Key); }
    public set X1(value: number) { this.set_property_value(Line.X1Key, value); }

    public get Y1(): number { return this.get_property_value(Line.Y1Key); }
    public set Y1(value: number) { this.set_property_value(Line.Y1Key, value); }

    public get X2(): number { return this.get_property_value(Line.X2Key); }
    public set X2(value: number) { this.set_property_value(Line.X2Key, value); }

    public get Y2(): number { return this.get_property_value(Line.Y2Key); }
    public set Y2(value: number) { this.set_property_value(Line.Y2Key, value); }

    protected override MeasureOverride(_availableSize: Size): Size
    {
        // Bounding box of the two endpoints + half stroke on each side.
        // Negative coords are clipped — author should keep endpoints
        // non-negative in local space (the diagram host positions the
        // Line on the Canvas via SetLeft / SetTop so this is natural).
        const half = (this.Stroke?.Thickness ?? 0) / 2;
        const w = Math.max(0, Math.max(this.X1, this.X2)) + half * 2;
        const h = Math.max(0, Math.max(this.Y1, this.Y2)) + half * 2;
        return new Size(w, h);
    }

    protected override RenderOverride(dc: DrawingContext): void
    {
        const stroke = this.Stroke;
        if (stroke === undefined || stroke.Thickness <= 0) return;

        const geom = new LineGeometry(
            new Point(this.X1, this.Y1),
            new Point(this.X2, this.Y2),
        );
        dc.DrawGeometry(undefined, stroke, geom);
    }
}
