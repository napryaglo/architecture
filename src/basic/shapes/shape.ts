import { Element, MetaData, Model, Size, type DrawingContext, type PropertyDescriptor } from '../../runtime/index.js';
import type { PropertyKey } from '../../runtime/index.js';
import { resolveKey } from '../../runtime/model-internals.js';
import { Brush, Geometry, Pen } from '../../visual-engine/index.js';
import { MatrixTransform } from '../../visual-engine/drawing/transform.js';
import { Matrix } from '../../visual-engine/primitives.js';
import { TextBlock } from '../text-block.js';

// One-line rendering primitive: hand it a Geometry, a Fill, and a
// Stroke, get back exactly what a DrawingContext call would paint —
// no synthesized Pen, no hidden RadiusX/Y math, no four-rect frame
// branch. The three knobs map directly to DrawingContext semantics:
//
//   * Geometry — the shape (RectangleGeometry, EllipseGeometry,
//     PathGeometry, LineGeometry, …). Undefined renders nothing.
//   * Fill     — the interior brush. Undefined means no fill (matches
//     SVG `fill="none"` / DC's brush=undefined contract) — UNLESS Stroke
//     is also unset, in which case the Shape paints with the inherited
//     TextBlock.Foreground so a bare `Shape [Geometry=@icon]` follows the
//     surrounding text ink with no explicit Fill (see effectiveFill).
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
export class Shape extends Element
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
        // Fit a SHARED geometry into this Shape's slot. Icons resolve a
        // single Geometry instance from a ResourceDictionary (authored in
        // a fixed box, e.g. 24×24) that many Shapes paint at different
        // sizes; we scale to fit by pushing a transform FRAME rather than
        // mutating the shared geometry. No fit when the slot already
        // matches the geometry (the common case — authored at its used
        // size) or when the slot is degenerate: Connector paints its route
        // in absolute canvas coordinates at Size.Zero and must NOT scale.
        const fill = this.effectiveFill();
        const fit = this.fitTransform(g);
        if (fit !== undefined)
        {
            dc.PushTransform(fit);
            dc.DrawGeometry(fill, this.Stroke, g);
            dc.Pop();
            return;
        }
        // One call. The DC takes the same (brush, pen, geometry) shape
        // the Shape DPs are modelled on — no per-render synthesis needed.
        dc.DrawGeometry(fill, this.Stroke, g);
    }

    // Effective interior brush for painting. When BOTH Fill and Stroke
    // are unset, the Shape paints with the inherited TextBlock.Foreground
    // — so a bare `Shape [Geometry=@icon]` follows the surrounding text
    // ink the way an icon glyph should, with no explicit Fill binding.
    // Precedence: an explicit Fill always wins; a stroke-only Shape
    // (Stroke set, Fill unset) keeps fill="none" rather than acquiring a
    // surprise interior. Foreground is MetaData.Render | Inherits, so a
    // change to the inherited ink re-invalidates this Shape automatically
    // through the base property pipeline — no extra subscription needed.
    //
    // Computed at render time (not pushed onto the Fill DP) so the
    // fallback never fights an explicit Fill binding and leaves Fill
    // reading as authored. Concrete catalog subclasses that override
    // RenderOverride paint `this.Fill` directly and opt out of this
    // fallback; they may call effectiveFill() to opt in.
    protected effectiveFill(): Brush | undefined
    {
        const fill = this.Fill;
        if (fill !== undefined) return fill;
        if (this.Stroke !== undefined) return undefined;
        return this.get_property_value(TextBlock.ForegroundKey);
    }

    // Uniform-scale + center transform mapping the geometry's bounds into
    // the render slot, or undefined when no scaling is wanted. Mirrors the
    // viewBox→slot math the Icon control uses, but driven off the
    // geometry's own bounds (its implicit viewBox) so a plain
    // `Shape [Geometry=@homeIcon]` scales with no extra DP.
    private fitTransform(g: Geometry): MatrixTransform | undefined
    {
        const size = this.RenderSize;
        // Degenerate slot → paint as authored. Guards Connector (Size.Zero
        // route in absolute coords) and any unsized Shape.
        if (!(size.Width > 0) || !(size.Height > 0)
            || !Number.isFinite(size.Width) || !Number.isFinite(size.Height))
        {
            return undefined;
        }
        const b = g.GetBounds();
        if (!(b.Width > 0) || !(b.Height > 0)) return undefined;
        // Already aligned to the slot at 1:1 → nothing to do (icon authored
        // at exactly its used size; a Figure shape sized to its geometry).
        const EPS = 1e-3;
        if (Math.abs(b.X) < EPS && Math.abs(b.Y) < EPS
            && Math.abs(b.Width  - size.Width)  < EPS
            && Math.abs(b.Height - size.Height) < EPS)
        {
            return undefined;
        }
        const s    = Math.min(size.Width / b.Width, size.Height / b.Height);
        const offX = (size.Width  - b.Width  * s) / 2 - b.X * s;
        const offY = (size.Height - b.Height * s) / 2 - b.Y * s;
        return new MatrixTransform(new Matrix(s, 0, 0, s, offX, offY));
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
    const installed: Array<{ key: PropertyKey<unknown>; cb: () => void }> = [];
    for (const prop of props)
    {
        // Some props only exist on a subset of subclasses — skip the
        // ones the runtime doesn't know about rather than throw on the
        // mismatch. Cheap: Model.HasProperty walks the prototype chain
        // exactly the way the binding system already does.
        if (!Model.HasProperty(target.constructor, prop)) continue;
        const key = resolveKey(target, undefined, prop);
        target.AddPropertyChangedListener(key, cb);
        installed.push({ key, cb });
    }
    return () => {
        for (const { key, cb: c } of installed)
        {
            target.RemovePropertyChangedListener(key, c);
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
