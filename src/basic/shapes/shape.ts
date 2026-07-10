import { Element, MetaData, Model, Size, type DrawingContext } from '../../runtime/index.js';
import { Brush, Color, Geometry, LineCap, LineJoin, Pen, SolidColorBrush } from '../../visual-engine/index.js';
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

    // Width of an INVISIBLE hit band painted UNDER the visible content
    // (0 = off, the default — existing shapes are unaffected). A thin
    // geometry — a Connector route, a hairline Stroke, an icon outline —
    // is otherwise only hittable on its ~1px painted path, which makes it
    // painful to hover / click. A non-zero value draws the same geometry
    // with a transparent stroke of this width before the visible paint; a
    // transparent stroke is still a "painted" area for SVG `visiblePainted`
    // hit-testing (only `none` is excluded), so the band catches pointer
    // events while staying invisible. The band rides the SAME fit transform
    // as the visible content, so it tracks scaled icons too.
    public static readonly HitTestStrokeWidthKey = Model.RegisterProperty<number>(
        Shape, 'HitTestStrokeWidth', 0, MetaData.Render);

    public get Geometry(): Geometry | undefined { return this.get_property_value(Shape.GeometryKey); }
    public set Geometry(value: Geometry | undefined) { this.set_property_value(Shape.GeometryKey, value); }

    public get Fill(): Brush | undefined { return this.get_property_value(Shape.FillKey); }
    public set Fill(value: Brush | undefined) { this.set_property_value(Shape.FillKey, value); }

    public get Stroke(): Pen | undefined { return this.get_property_value(Shape.StrokeKey); }
    public set Stroke(value: Pen | undefined) { this.set_property_value(Shape.StrokeKey, value); }

    public get HitTestStrokeWidth(): number { return this.get_property_value(Shape.HitTestStrokeWidthKey); }
    public set HitTestStrokeWidth(value: number) { this.set_property_value(Shape.HitTestStrokeWidthKey, value); }

    protected override MeasureOverride(_availableSize: Size): Size
    {
        return Size.Zero;
    }

    protected override ArrangeOverride(finalSize: Size): Size
    {
        return finalSize;
    }

    // In-place mutations of the current Fill / Stroke / Geometry (PenEditor
    // shifting Pen.Thickness, a Storyboard animating SolidColorBrush.Color)
    // re-paint automatically: Fill / Stroke / Geometry are all MetaData.Render
    // Freezable-valued DPs, so Visual.rewireFreezableOwner (§5.2) registers
    // this Shape as an owner and any inner change — including nested ones like
    // Pen.Brush.Color or Brush.Transform.Angle — fires our InvalidateVisual.
    // No per-property listener plumbing needed here any more.

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
        if (fit !== undefined) dc.PushTransform(fit);
        // Invisible hit band first (when enabled) so the visible stroke
        // paints on top of it. Same geometry + fit frame, so the band
        // tracks the route / icon exactly; transparent paint keeps it
        // unseen but hittable (see HitTestStrokeWidthKey).
        const hitW = this.HitTestStrokeWidth;
        if (hitW > 0) dc.DrawGeometry(undefined, hitBandPen(hitW), g);
        // One call. The DC takes the same (brush, pen, geometry) shape
        // the Shape DPs are modelled on — no per-render synthesis needed.
        dc.DrawGeometry(fill, this.Stroke, g);
        if (fit !== undefined) dc.Pop();
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

// Fully-transparent paint shared by every hit band — the band carries no
// per-instance colour, only width. Alpha 0 keeps it invisible; SVG
// `visiblePainted` still hit-tests it because the stroke paint is a value
// other than `none`.
const HIT_BAND_BRUSH = new SolidColorBrush(new Color(0, 0, 0, 0));

// Pen for the invisible hit band. Round cap + join keep the band
// continuous around corners (no gaps at a connector's waypoints). Built
// per render (cheap, only when HitTestStrokeWidth > 0) rather than cached
// per-width — mirrors the connector halo's makeHaloPen.
function hitBandPen(width: number): Pen
{
    const p = new Pen();
    p.Brush    = HIT_BAND_BRUSH;
    p.Thickness = width;
    p.LineCap  = LineCap.Round;
    p.LineJoin = LineJoin.Round;
    return p;
}

