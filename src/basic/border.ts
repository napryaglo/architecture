import {
    CornerRadius,
    MetaData,
    MuralBase,
    Point,
    Rect,
    Single,
    Size,
    Thickness,
    type DrawingContext,
} from '../runtime/index.js';
import type { Visual } from '../runtime/index.js';
import {
    ArcSegment,
    LineSegment,
    PathFigure,
    PathGeometry,
    Pen,
    RectangleGeometry,
    SweepDirection,
    type Geometry,
} from '../visual-engine/index.js';

// A Single that paints a background fill, an optional stroked border,
// and pads its child inward by BorderThickness + Padding on every side.
// Modeled on WPF System.Windows.Controls.Border — the canonical "first
// useful container" of a WPF-style framework.
//
// Margin (outer space) is NOT handled here — Visual's base Measure /
// Arrange already subtract Margin from the slot and inflate the
// reported DesiredSize, so any Border (like any other Visual) honours
// `border.Margin = ...` automatically without code in this file.
//
// Layout:
//   * MeasureOverride shrinks the child's available size by
//     (BorderThickness + Padding) on each axis, measures the child,
//     then reports a desired size of child.DesiredSize + insets.
//   * ArrangeOverride positions the child at (BorderThickness.Left +
//     Padding.Left, BorderThickness.Top + Padding.Top) with the
//     remaining size after subtracting the insets.
//
// Chrome uses the inherited Visual DPs — `Fill` (background) and `Stroke`
// (the border pen: Brush + DashStyle/LineCap/LineJoin/MiterLimit). Border
// does NOT expose BorderBrush/BorderPen; it matches the Shape Fill/Stroke
// model. `Stroke.Thickness` is IGNORED — `BorderThickness` is the width
// authority (uniform + per-side) and the child layout inset.
//
// Render:
//   * Fill fills the entire Border rect (under the stroke).
//   * Stroke + uniform BorderThickness paint an effective pen (Stroke's
//     brush + style at width = BorderThickness.Top), inset by half that
//     width so the stroke sits inside the layout rect.
//   * CornerRadius rounds both the background fill and the stroke.
//     The stroke's inner radius is `CornerRadius - BorderThickness.Top/2`
//     (clamped to zero) so the stroke sits exactly on the rounded
//     outline. Applies to UNIFORM thickness only; the asymmetric
//     four-rect path below renders sharp corners regardless of radius
//     (a single mitered path would need DrawPathGeometry, which the
//     DC doesn't have today).
//   * A non-finite CornerRadius (e.g. `CornerRadius.Full`) is the
//     M3 "Full" shape-family sentinel — the render path treats it as
//     `min(width, height) / 2`, producing a stadium / pill on a wide
//     rect and a circle on a square one.
//   * Non-uniform BorderThickness paints four filled rectangles (top,
//     bottom, left, right) whose union forms the frame, coloured with
//     `Stroke.Brush`. Top and Bottom span the full width; Left and Right
//     fit between them. Each side respects its own thickness
//     independently. CornerRadius is ignored for this case.
export class Border extends Single
{
    // Typed-key DPs. The `T` on each key flows through the typed
    // get/set_property_value overloads so the accessors below need no
    // `as` casts and a typo on the key name is a compile error rather
    // than a silent `undefined` at runtime. The string name is still the
    // binding-path identity ('Fill' etc.) — that's what the µ-mural
    // parser / `Binding(t, 'Fill')` resolves against.
    //
    // Inline static initializers run in declaration order at class-load
    // time, so by the time the first Border instance is constructed every
    // key is registered and slotted. Self-reference to `Border` as the
    // owner class is fine — class declarations are hoisted, only their
    // statics aren't filled in yet, and only the class identity matters
    // to RegisterProperty.
    public static readonly BorderThicknessKey = MuralBase.RegisterProperty<Thickness>(
        Border, 'BorderThickness', Thickness.Zero,
        MetaData.Measure | MetaData.Arrange | MetaData.Render);
    // CornerRadius accepts either a plain `number` (uniform radius —
    // `border.CornerRadius = 8`, `CornerRadius = 4` in markup) or a
    // CornerRadius instance for per-corner asymmetric corners (the
    // connected-bar shape ToolBar's First/Last buttons use). A `Thickness`
    // (the lowered form of `(a, b, c, d)` tuple syntax in .mu source —
    // the compiler always emits Thickness for tuples regardless of
    // target type) is also coerced: positional Left → TopLeft,
    // Top → TopRight, Right → BottomRight, Bottom → BottomLeft, so
    // `CornerRadius = (@ShapeFull, 0, 0, @ShapeFull)` in markup
    // produces the rounded-left / square-right shape one would expect.
    public static readonly CornerRadiusKey = MuralBase.RegisterProperty<number | CornerRadius>(
        Border, 'CornerRadius', 0,
        MetaData.Arrange | MetaData.Render,
        (_model, base_value) =>
        {
            if (base_value instanceof Thickness)
            {
                return new CornerRadius(
                    base_value.Left, base_value.Top, base_value.Right, base_value.Bottom);
            }
            return base_value;
        });
    public static readonly PaddingKey = MuralBase.RegisterProperty<Thickness>(
        Border, 'Padding', Thickness.Zero,
        MetaData.Measure | MetaData.Arrange);

    constructor(child?: Visual)
    {
        super();
        if (child !== undefined) this.SetChild(child);
    }

    public get BorderThickness(): Thickness { return this.get_property_value(Border.BorderThicknessKey); }
    public set BorderThickness(value: Thickness) { this.set_property_value(Border.BorderThicknessKey, value); }

    public get CornerRadius(): number | CornerRadius { return this.get_property_value(Border.CornerRadiusKey); }
    public set CornerRadius(value: number | CornerRadius) { this.set_property_value(Border.CornerRadiusKey, value); }

    public get Padding(): Thickness { return this.get_property_value(Border.PaddingKey); }
    public set Padding(value: Thickness) { this.set_property_value(Border.PaddingKey, value); }

    // For inline-baseline probing by a text host (RichTextBlock): the single
    // child plus the inset above it, so a chip's (Border → TextBlock) internal
    // text baseline composes as `TopContentInset + child.FirstBaseline`.
    public get ContentChild(): Visual | undefined { return this.child; }
    public get TopContentInset(): number { return this.BorderThickness.Top + this.Padding.Top; }

    protected override MeasureOverride(availableSize: Size): Size
    {
        const insetH = this.BorderThickness.Horizontal + this.Padding.Horizontal;
        const insetV = this.BorderThickness.Vertical   + this.Padding.Vertical;

        const childAvailable = new Size(
            Math.max(0, availableSize.Width  - insetH),
            Math.max(0, availableSize.Height - insetV),
        );

        let childDesired = Size.Zero;
        if (this.child !== undefined)
        {
            this.child.Measure(childAvailable);
            childDesired = this.child.DesiredSize;
        }

        return new Size(
            childDesired.Width  + insetH,
            childDesired.Height + insetV,
        );
    }

    protected override ArrangeOverride(finalSize: Size): Size
    {
        if (this.child !== undefined)
        {
            const bt = this.BorderThickness;
            const pd = this.Padding;
            const childRect = new Rect(
                bt.Left + pd.Left,
                bt.Top  + pd.Top,
                Math.max(0, finalSize.Width  - bt.Horizontal - pd.Horizontal),
                Math.max(0, finalSize.Height - bt.Vertical   - pd.Vertical),
            );
            this.child.Arrange(childRect);
        }
        return finalSize;
    }

    protected override buildClipGeometry(size: Size): Geometry
    {
        const { tl, tr, br, bl } = this.resolveCorners(size);
        const rect = new Rect(0, 0, size.Width, size.Height);
        const uniform = tl === tr && tr === br && br === bl;
        return uniform
            ? new RectangleGeometry(rect, tl, tl)   // rounded (square when tl === 0)
            : new RectangleGeometry(rect);          // asymmetric corners → rectangular clip
    }

    // Resolve the four corner radii for `size`, folding the M3 "Full" sentinel
    // (a non-finite radius) to half the shorter side. Shared by the paint path
    // and the ClipToBounds geometry so the clip tracks the painted outline.
    private resolveCorners(size: Size): { tl: number; tr: number; br: number; bl: number }
    {
        const raw = this.CornerRadius;
        const rawCorners = raw instanceof CornerRadius ? raw : new CornerRadius(raw, raw, raw, raw);
        const fold = Math.min(size.Width, size.Height) / 2;
        return {
            tl: Number.isFinite(rawCorners.TopLeft)     ? rawCorners.TopLeft     : fold,
            tr: Number.isFinite(rawCorners.TopRight)    ? rawCorners.TopRight    : fold,
            br: Number.isFinite(rawCorners.BottomRight) ? rawCorners.BottomRight : fold,
            bl: Number.isFinite(rawCorners.BottomLeft)  ? rawCorners.BottomLeft  : fold,
        };
    }

    // The painted rounded-rect geometry inset by `inset` on every edge, each
    // corner radius reduced by the same. Uniform corners lower to a
    // RectangleGeometry; asymmetric corners trace a per-corner path.
    // RenderOverride fills + strokes this (inset = BorderThickness.Top/2 so
    // the centred stroke sits inside the layout rect). ClipToBounds keeps
    // using buildClipGeometry (the outer outline).
    protected override buildPaintGeometry(size: Size, inset: number): Geometry
    {
        const { tl, tr, br, bl } = this.resolveCorners(size);
        const w = Math.max(0, size.Width  - 2 * inset);
        const h = Math.max(0, size.Height - 2 * inset);
        const uniform = tl === tr && tr === br && br === bl;
        if (uniform)
        {
            const r = Math.max(0, tl - inset);
            return new RectangleGeometry(new Rect(inset, inset, w, h), r, r);
        }
        return buildRoundedRectPath(
            inset, inset, w, h,
            Math.max(0, tl - inset), Math.max(0, tr - inset),
            Math.max(0, br - inset), Math.max(0, bl - inset));
    }

    // ClipToBounds clips content to INSIDE the border — the inner rounded rect
    // inset by BorderThickness on each side, radii reduced to match. Overrides
    // the base (which insets by this.Stroke?.Thickness — for a Border that is
    // now the USER pen, whose thickness is ignored for width) so the inner clip
    // insets each edge by its own BorderThickness. This override is load-bearing.
    protected override buildChildClipGeometry(size: Size): Geometry | undefined
    {
        const bt = this.BorderThickness;
        const { tl, tr, br, bl } = this.resolveCorners(size);
        const rect = new Rect(
            bt.Left, bt.Top,
            Math.max(0, size.Width  - bt.Horizontal),
            Math.max(0, size.Height - bt.Vertical));
        // Match buildClipGeometry's corner handling: uniform corners round, asymmetric
        // corners fall to a plain rectangle (no per-corner inner path).
        const uniform = tl === tr && tr === br && br === bl;
        return uniform
            ? new RectangleGeometry(rect, Math.max(0, tl - bt.Left), Math.max(0, tl - bt.Top))
            : new RectangleGeometry(rect);
    }

    // Fill = background; Stroke = the border pen (brush + dash/cap/join/miter).
    // BorderThickness rules the painted WIDTH — Stroke.Thickness is ignored.
    protected override RenderOverride(dc: DrawingContext): void
    {
        const size = this.RenderSize;
        if (size.Width <= 0 || size.Height <= 0) return;

        const bt = this.BorderThickness;
        const uniform = bt.Left === bt.Top && bt.Top === bt.Right && bt.Right === bt.Bottom;
        const stroke = this.Stroke;
        const fill = this.Fill;

        if (uniform)
        {
            // Effective pen: Stroke's brush + style at the BorderThickness width
            // (Stroke.Thickness is ignored). Suppressed when there is no stroke
            // brush or the width is zero.
            const eff = (stroke?.Brush !== undefined && bt.Top > 0)
                ? effectiveBorderPen(stroke, bt.Top)
                : undefined;
            if (fill === undefined && eff === undefined) return;
            const inset = eff !== undefined ? bt.Top / 2 : 0;
            dc.DrawGeometry(fill, eff, this.buildPaintGeometry(size, inset));
            return;
        }

        // Non-uniform: fill (no stroke) then the four-rect frame with Stroke.Brush.
        // Top and Bottom span the full width; Left and Right sit between them so
        // corner pixels are owned by Top/Bottom (a single deterministic
        // assignment instead of overlapping corners that double the alpha for a
        // translucent brush). CornerRadius is intentionally ignored for this case.
        if (fill !== undefined)
        {
            dc.DrawGeometry(fill, undefined, this.buildPaintGeometry(size, 0));
        }
        const brush = stroke?.Brush;
        if (brush === undefined) return;
        const innerY = bt.Top;
        const innerH = Math.max(0, size.Height - bt.Top - bt.Bottom);
        if (bt.Top > 0)
        {
            dc.DrawRectangle(brush, undefined, new Rect(0, 0, size.Width, bt.Top));
        }
        if (bt.Bottom > 0)
        {
            dc.DrawRectangle(brush, undefined, new Rect(0, size.Height - bt.Bottom, size.Width, bt.Bottom));
        }
        if (bt.Left > 0)
        {
            dc.DrawRectangle(brush, undefined, new Rect(0, innerY, bt.Left, innerH));
        }
        if (bt.Right > 0)
        {
            dc.DrawRectangle(brush, undefined, new Rect(size.Width - bt.Right, innerY, bt.Right, innerH));
        }
    }
}

// The pen a Border actually paints with: Stroke supplies the brush and the
// style knobs (dash / cap / join / miter); the WIDTH comes from
// BorderThickness (Stroke.Thickness is ignored on Border).
function effectiveBorderPen(stroke: Pen, width: number): Pen
{
    const p = new Pen(stroke.Brush, width);
    p.DashStyle  = stroke.DashStyle;
    p.LineCap    = stroke.LineCap;
    p.LineJoin   = stroke.LineJoin;
    p.MiterLimit = stroke.MiterLimit;
    return p;
}

// Build a closed PathGeometry tracing a rounded rectangle with INDEPENDENT
// per-corner radii. Walks clockwise starting at the top edge just past
// the top-left arc, then: top-line → top-right arc → right-line →
// bottom-right arc → bottom-line → bottom-left arc → left-line →
// top-left arc → close.
//
// Each radius is clamped to half the shorter shared side so neighbouring
// arcs don't overlap — a corner with radius bigger than the rect can
// hold collapses to the largest fitting circle. Negative radii (the
// stroke path can produce them via `outer - half-thickness`) are
// pre-clamped to zero by the caller, but a final Math.max guards
// against caller bugs.
function buildRoundedRectPath(
    x: number, y: number, w: number, h: number,
    tlRaw: number, trRaw: number, brRaw: number, blRaw: number,
): PathGeometry
{
    const maxRH = w / 2;
    const maxRV = h / 2;
    const clamp = (r: number): number => Math.max(0, Math.min(r, maxRH, maxRV));
    const tl = clamp(tlRaw);
    const tr = clamp(trRaw);
    const br = clamp(brRaw);
    const bl = clamp(blRaw);

    // Start past the top-left arc on the top edge.
    const start = new Point(x + tl, y);
    const segments = [
        // Top edge → top-right arc start
        new LineSegment(new Point(x + w - tr, y)),
        // Top-right arc → right edge top
        new ArcSegment(
            new Point(x + w, y + tr),
            new Size(tr, tr), 0, false, SweepDirection.Clockwise),
        // Right edge → bottom-right arc start
        new LineSegment(new Point(x + w, y + h - br)),
        // Bottom-right arc → bottom edge right
        new ArcSegment(
            new Point(x + w - br, y + h),
            new Size(br, br), 0, false, SweepDirection.Clockwise),
        // Bottom edge → bottom-left arc start
        new LineSegment(new Point(x + bl, y + h)),
        // Bottom-left arc → left edge bottom
        new ArcSegment(
            new Point(x, y + h - bl),
            new Size(bl, bl), 0, false, SweepDirection.Clockwise),
        // Left edge → top-left arc start
        new LineSegment(new Point(x, y + tl)),
        // Top-left arc → back to start point
        new ArcSegment(
            new Point(x + tl, y),
            new Size(tl, tl), 0, false, SweepDirection.Clockwise),
    ];
    return new PathGeometry([new PathFigure(start, segments, true)]);
}
