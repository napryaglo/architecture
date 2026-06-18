import { MetaData, Model, Size, Visual, type DrawingContext, type PropertyDescriptor } from '../../runtime/index.js';
import { Brush, Geometry, Pen } from '../../visual-engine/index.js';

// One-line rendering primitive: hand it a Geometry, a Fill, and a
// Stroke, get back exactly what a DrawingContext call would paint —
// no synthesized Pen, no hidden RadiusX/Y math, no four-rect frame
// branch. The three knobs map directly to DrawingContext semantics:
//
//   * Geometry — the shape (RectangleGeometry, EllipseGeometry,
//     PathGeometry, LineGeometry, …). Undefined renders nothing.
//   * Fill     — the interior brush. Undefined means no fill (matches
//     SVG `fill="none"` / DC's brush=undefined contract).
//   * Stroke   — the full Pen: Brush + Thickness + DashStyle +
//     LineCap + LineJoin + MiterLimit. Undefined means no stroke.
//
// Layout: shapes have no intrinsic size — sizing comes from explicit
// Width / Height on Visual or from a stretch-style parent slot. Same
// `MeasureOverride → Size.Zero`, `ArrangeOverride → finalSize` shape
// the older primitives used.
//
// Subclassing pattern — concrete shapes (Rectangle, Ellipse, Heart, …)
// extend Shape and override RenderOverride. They build their geometry
// from their own input DPs (RadiusX / Width / per-shape knobs) and
// call dc.DrawGeometry(this.Fill, this.Stroke, computedGeom) directly.
// Setting this.Geometry from inside RenderOverride would re-invalidate
// the visual, so subclasses keep the geometry local.
export class Shape extends Visual
{
    public static readonly GeometryKey = Model.RegisterProperty<Geometry | undefined>(
        Shape, 'Geometry', undefined, MetaData.Render);
    public static readonly FillKey     = Model.RegisterProperty<Brush    | undefined>(
        Shape, 'Fill',     undefined, MetaData.Render);
    public static readonly StrokeKey   = Model.RegisterProperty<Pen      | undefined>(
        Shape, 'Stroke',   undefined, MetaData.Render);

    public get Geometry(): Geometry | undefined { return this.get_property_value(Shape.GeometryKey); }
    public set Geometry(value: Geometry | undefined) { this.set_property_value(Shape.GeometryKey, value); }

    public get Fill(): Brush | undefined { return this.get_property_value(Shape.FillKey); }
    public set Fill(value: Brush | undefined) { this.set_property_value(Shape.FillKey, value); }

    public get Stroke(): Pen | undefined { return this.get_property_value(Shape.StrokeKey); }
    public set Stroke(value: Pen | undefined) { this.set_property_value(Shape.StrokeKey, value); }

    protected override MeasureOverride(_availableSize: Size): Size
    {
        return Size.Zero;
    }

    protected override ArrangeOverride(finalSize: Size): Size
    {
        return finalSize;
    }

    // Subscriptions on the current Pen / Brush instances. The Shape's
    // Stroke and Fill DPs are MetaData.Render, so reference swaps
    // re-paint automatically — but in-place mutations (PenEditor
    // shifting Pen.Thickness, a Storyboard animating
    // SolidColorBrush.Color) don't trip the descendant Visual's
    // invalidation pipeline unless we listen here. Pen.ts's own
    // comment promises propagation "caveat: the holding Visual still
    // needs to listen on its Pen's properties" — this is that listen.
    private _strokeListener:    (() => void) | undefined;
    private _fillListener:      (() => void) | undefined;
    private _geometryListener:  (() => void) | undefined;

    protected override OnPropertyChanged(
        descriptor: PropertyDescriptor,
        oldValue:   unknown,
        newValue:   unknown,
    ): void
    {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        if (descriptor.Owner !== Shape) return;
        switch (descriptor.Name)
        {
            case 'Stroke':
                this._strokeListener?.();
                this._strokeListener = subscribeAny(newValue as Pen | undefined, () => this.InvalidateVisual());
                break;
            case 'Fill':
                this._fillListener?.();
                this._fillListener = subscribeAny(newValue as Brush | undefined, () => this.InvalidateVisual());
                break;
            case 'Geometry':
                this._geometryListener?.();
                this._geometryListener = subscribeAny(newValue as Geometry | undefined, () => this.InvalidateVisual());
                break;
        }
    }

    protected override RenderOverride(dc: DrawingContext): void
    {
        const g = this.Geometry;
        if (g === undefined) return;
        // One call. The DC takes the same (brush, pen, geometry) shape
        // the Shape DPs are modelled on — no per-render synthesis needed.
        dc.DrawGeometry(this.Fill, this.Stroke, g);
    }
}

// Subscribe `cb` to every relevant property on `target`. Returns a
// thunk that detaches all subscriptions. No-ops on undefined — the
// holder stores the thunk verbatim so the next swap calls it
// unconditionally.
//
// Pen / Brush / Geometry have known property surfaces; we enumerate
// the relevant ones here rather than relying on a catch-all (which
// the Model surface doesn't currently expose). Render coalesces
// repeat InvalidateVisual calls so this is cheap even if multiple
// properties fire in a single user gesture.
const PEN_PROPS:      readonly string[] = ['Brush', 'Thickness', 'DashStyle', 'LineCap', 'LineJoin', 'MiterLimit'];
const BRUSH_PROPS:    readonly string[] = ['Opacity', 'Transform', 'Color', 'GradientStops', 'StartPoint', 'EndPoint', 'Center', 'RadiusX', 'RadiusY', 'SpreadMethod', 'ImageSource', 'Stretch', 'AlignmentX', 'AlignmentY', 'Kind', 'Foreground', 'Background', 'Size', 'Angle', 'StrokeThickness'];
const GEOMETRY_PROPS: readonly string[] = ['Rect', 'RadiusX', 'RadiusY', 'Start', 'End', 'Center', 'Width', 'Height', 'StartAngle', 'EndAngle', 'Figures'];

function subscribeAny(target: Model | undefined, cb: () => void): (() => void) | undefined
{
    if (target === undefined) return undefined;
    const props = selectPropSet(target);
    const installed: Array<{ prop: string; cb: () => void }> = [];
    for (const prop of props)
    {
        // Some props only exist on a subset of subclasses — skip the
        // ones the runtime doesn't know about rather than throw on the
        // mismatch. Cheap: Model.HasProperty walks the prototype chain
        // exactly the way the binding system already does.
        if (!Model.HasProperty(target.constructor, prop)) continue;
        target._add_property_changed_listener_by_name(prop, cb);
        installed.push({ prop, cb });
    }
    return () => {
        for (const { prop, cb: c } of installed)
        {
            target._remove_property_changed_listener_by_name(prop, c);
        }
    };
}

function selectPropSet(target: Model): readonly string[]
{
    if (target instanceof Pen)      return PEN_PROPS;
    if (target instanceof Brush)    return BRUSH_PROPS;
    if (target instanceof Geometry) return GEOMETRY_PROPS;
    return [];
}
