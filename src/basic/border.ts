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
    RectangleGeometry,
    SweepDirection,
    type Geometry,
} from '../visual-engine/index.js';

// A Single that paints a background fill, an optional UNIFORM stroked outline,
// and pads its child inward by the stroke width + Padding on every side.
// Modeled on WPF System.Windows.Controls.Border — the canonical "first
// useful container" of a WPF-style framework.
//
// Margin (outer space) is NOT handled here — Visual's base Measure /
// Arrange already subtract Margin from the slot and inflate the
// reported DesiredSize, so any Border (like any other Visual) honours
// `border.Margin = ...` automatically without code in this file.
//
// Chrome uses the inherited Visual DPs — `Fill` (background) and `Stroke`
// (the border pen: Brush + Thickness + DashStyle/LineCap/LineJoin/MiterLimit).
// Border does NOT expose BorderBrush/BorderPen or a per-side BorderThickness; it
// matches the Shape Fill/Stroke model exactly. The `Stroke` pen's `Thickness` is
// the single, uniform border-width authority: it drives the painted outline width,
// the child layout inset (reserved on every side), the child clip, and
// TopContentInset. A brushless pen (or zero thickness) reserves and paints
// nothing. One-sided edges (dividers, underlines, rules) are drawn with an
// oriented `Line`, not a Border.
//
// Layout:
//   * MeasureOverride shrinks the child's available size by (strokeWidth +
//     Padding) on each axis, measures the child, then reports child.DesiredSize
//     + insets.
//   * ArrangeOverride positions the child at (strokeWidth + Padding.Left,
//     strokeWidth + Padding.Top) with the remaining size after the insets.
//
// Render:
//   * Fill fills the entire Border rect (under the stroke).
//   * A non-zero `Stroke` paints the outline with the pen (its own Thickness),
//     inset by half that width so the stroke sits inside the layout rect. Fill +
//     stroke lower to a single DrawGeometry call.
//   * CornerRadius rounds both the fill and the stroke; the stroke's inner radius
//     is `CornerRadius - strokeWidth/2` (clamped to zero). Uniform and per-corner
//     asymmetric corners are both supported (a uniform pen traces either).
//   * A non-finite CornerRadius (e.g. `CornerRadius.Full`) is the M3 "Full"
//     shape-family sentinel — treated as `min(width, height) / 2`, producing a
//     stadium / pill on a wide rect and a circle on a square one.
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

    public get CornerRadius(): number | CornerRadius { return this.get_property_value(Border.CornerRadiusKey); }
    public set CornerRadius(value: number | CornerRadius) { this.set_property_value(Border.CornerRadiusKey, value); }

    public get Padding(): Thickness { return this.get_property_value(Border.PaddingKey); }
    public set Padding(value: Thickness) { this.set_property_value(Border.PaddingKey, value); }

    // For inline-baseline probing by a text host (RichTextBlock): the single
    // child plus the inset above it, so a chip's (Border → TextBlock) internal
    // text baseline composes as `TopContentInset + child.FirstBaseline`.
    public get ContentChild(): Visual | undefined { return this.child; }
    public get TopContentInset(): number { return this.strokeWidth() + this.Padding.Top; }

    // The uniform border width: the Stroke pen's Thickness when it has a brush to
    // paint with, else 0. This single value drives the painted outline, the child
    // layout inset (reserved on every side), the child clip, and TopContentInset —
    // there is no per-side width. A brushless pen (or zero thickness) reserves and
    // paints nothing.
    private strokeWidth(): number
    {
        const s = this.Stroke;
        return (s?.Brush !== undefined) ? (s.Thickness ?? 0) : 0;
    }

    protected override MeasureOverride(availableSize: Size): Size
    {
        const t = this.strokeWidth();
        const insetH = 2 * t + this.Padding.Horizontal;
        const insetV = 2 * t + this.Padding.Vertical;

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
            const t  = this.strokeWidth();
            const pd = this.Padding;
            const childRect = new Rect(
                t + pd.Left,
                t + pd.Top,
                Math.max(0, finalSize.Width  - 2 * t - pd.Horizontal),
                Math.max(0, finalSize.Height - 2 * t - pd.Vertical),
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
    // inset by the uniform stroke width on each side, radii reduced to match.
    // Overrides the base so the inner clip tracks the painted outline. Load-bearing.
    protected override buildChildClipGeometry(size: Size): Geometry | undefined
    {
        const t = this.strokeWidth();
        const { tl, tr, br, bl } = this.resolveCorners(size);
        const rect = new Rect(
            t, t,
            Math.max(0, size.Width  - 2 * t),
            Math.max(0, size.Height - 2 * t));
        // Match buildClipGeometry's corner handling: uniform corners round, asymmetric
        // corners fall to a plain rectangle (no per-corner inner path).
        const uniform = tl === tr && tr === br && br === bl;
        return uniform
            ? new RectangleGeometry(rect, Math.max(0, tl - t), Math.max(0, tl - t))
            : new RectangleGeometry(rect);
    }

    // Fill = background; Stroke = the border pen (brush + thickness + dash/cap/
    // join/miter). The pen's Thickness is the uniform border width; the outline is
    // centred on the edge (inset by half the width so it sits inside the layout
    // rect). Fill + stroke lower to a single DrawGeometry call.
    protected override RenderOverride(dc: DrawingContext): void
    {
        const size = this.RenderSize;
        if (size.Width <= 0 || size.Height <= 0) return;

        const stroke = this.Stroke;
        const fill = this.Fill;
        const t = this.strokeWidth();
        // Paint the outline only when the pen has a brush AND a non-zero width.
        const eff = t > 0 ? stroke : undefined;
        if (fill === undefined && eff === undefined) return;
        const inset = eff !== undefined ? t / 2 : 0;
        dc.DrawGeometry(fill, eff, this.buildPaintGeometry(size, inset));
    }
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
