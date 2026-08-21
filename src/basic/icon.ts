import {
    Color,
    Element,
    MetaData,
    MuralBase,
    Size,
    type DrawingContext,
} from '../runtime/index.js';
import {
    EllipseGeometry,
    FillRule,
    Geometry,
    LineGeometry,
    PathGeometry,
    Pen,
    RectangleGeometry,
    SolidColorBrush,
    type Brush,
} from '../visual-engine/index.js';
import { MatrixTransform } from '../visual-engine/drawing/transform.js';
import { Matrix } from '../visual-engine/primitives.js';

// Sentinel value standing in for SVG `currentColor`. Recolor=true treats
// every defined paint as `'currentColor'`; the Icon control then resolves
// to whatever Brush its `Foreground` DP carries (which is normally bound
// to a theme token). Recolor=false honors authored Colors; only paints
// that the SVG file explicitly tagged `currentColor` (or were unspecified,
// since most icon authors omit `fill` and rely on inheritance) get the
// `Foreground` substitution.
export const CURRENT_COLOR: unique symbol = Symbol('currentColor');
export type IconPaint = Color | typeof CURRENT_COLOR | undefined;

// One shape inside an IconDefinition. Geometry is a Mural Geometry node
// (PathGeometry / RectangleGeometry / EllipseGeometry / LineGeometry).
// Fill / Stroke carry SVG-level intent (a parsed color, the currentColor
// sentinel, or undefined = "none"); the Icon control's RenderOverride
// turns these into concrete Brushes at paint time based on Recolor.
//
// StrokeWidth is in viewBox units; the Icon control applies the
// viewBox → RenderSize scale before stroking.
export interface IconShape
{
    readonly Geometry:    Geometry;
    readonly Fill:        IconPaint;
    readonly Stroke:      IconPaint;
    readonly StrokeWidth: number;
}

// Parsed-SVG representation suitable for handing to an Icon control.
// `ViewBoxWidth` / `ViewBoxHeight` are the SVG's viewBox extents (defaults
// to 24×24 — Material Symbols + Lucide + Phosphor + Heroicons all ship
// 24×24 by default). `Shapes` is the flat list of paths / rects / etc.
// produced by the parser (any `<g transform>` was folded into each shape's
// geometry's own Transform during parse).
//
// Not a MuralBase — pure value object. Instances are typically built by
// `parseSvgIcon(svgText)` at build time and stored in a ResourceDictionary
// that the user merges into Application.Resources.
export class IconDefinition
{
    public readonly ViewBoxWidth:  number;
    public readonly ViewBoxHeight: number;
    public readonly Shapes:        readonly IconShape[];

    constructor(viewBoxWidth: number, viewBoxHeight: number, shapes: readonly IconShape[])
    {
        this.ViewBoxWidth  = viewBoxWidth;
        this.ViewBoxHeight = viewBoxHeight;
        this.Shapes        = shapes;
    }
}

// Default paint used when Foreground is undefined AND the icon shape's
// authored fill was either `currentColor` (Recolor=true OR explicit) or
// unspecified. Matches the SVG default of black so a freshly-constructed
// `Icon` without any theme wiring still paints visibly.
const DEFAULT_FOREGROUND = new SolidColorBrush(Color.FromHex('#000000'));

// Fallback DesiredSize when no Source is set. The 24-dp grid is the
// industry default (Material Symbols / Lucide / Phosphor / Heroicons
// all ship 24×24 viewBoxes), so reserving 24 dp in the parent's layout
// matches the eventual rendered size for almost every icon pack.
const DEFAULT_ICON_SIZE = new Size(24, 24);

// Brush cache keyed by Color identity, so authored (non-currentColor)
// fills don't allocate a fresh SolidColorBrush per render frame. Color
// instances are reused across IconDefinitions when the parser sees the
// same hex twice (parser-side dedup), so a WeakMap on Color is correct.
const _authoredBrushCache = new WeakMap<Color, SolidColorBrush>();
function brushForColor(color: Color): SolidColorBrush
{
    let b = _authoredBrushCache.get(color);
    if (b === undefined)
    {
        b = new SolidColorBrush(color);
        _authoredBrushCache.set(color, b);
    }
    return b;
}

// Icon — paints an IconDefinition into its layout slot. The viewBox
// is scaled uniformly (preserving aspect ratio, anchored center) into
// the Icon's RenderSize.
//
// DPs:
//   * Source     — IconDefinition. undefined = paint nothing.
//   * Foreground — Brush used for `currentColor` paints. Default is a
//                   shared black SolidColorBrush so a bare Icon renders.
//   * Recolor    — true (default) → every authored paint becomes
//                   `currentColor`; the icon paints as a flat silhouette
//                   in Foreground. false → honor authored fill / stroke
//                   colors; only paints tagged `currentColor` (or left
//                   unspecified, which the parser treats as currentColor)
//                   pick up Foreground.
//
// MeasureOverride: returns the Visual's explicit Width / Height when
// set, otherwise falls back to the IconDefinition's viewBox extents
// (so an icon stamped without sizing renders at its native size).
//
// RenderOverride: builds a uniform-scale matrix from viewBox → RenderSize,
// pushes it as a transform frame, then DrawGeometry's each shape with the
// resolved fill / stroke Brushes.
export class Icon extends Element
{
    public static readonly SourceKey     = MuralBase.RegisterProperty<IconDefinition | undefined>(
        Icon, 'Source',     undefined, MetaData.Measure | MetaData.Render);
    public static readonly ForegroundKey = MuralBase.RegisterProperty<Brush | undefined>(
        Icon, 'Foreground', undefined, MetaData.Render);
    public static readonly RecolorKey    = MuralBase.RegisterProperty<boolean>(
        Icon, 'Recolor',    true,      MetaData.Render);

    public get Source(): IconDefinition | undefined           { return this.get_property_value(Icon.SourceKey); }
    public set Source(value: IconDefinition | undefined)      { this.set_property_value(Icon.SourceKey, value); }

    public get Foreground(): Brush | undefined                { return this.get_property_value(Icon.ForegroundKey); }
    public set Foreground(value: Brush | undefined)           { this.set_property_value(Icon.ForegroundKey, value); }

    public get Recolor(): boolean                             { return this.get_property_value(Icon.RecolorKey); }
    public set Recolor(value: boolean)                        { this.set_property_value(Icon.RecolorKey, value); }

    protected override MeasureOverride(_availableSize: Size): Size
    {
        const src = this.Source;
        // Fallback to the standard 24×24 icon grid even when Source is
        // undefined, so the Icon reserves space in its parent's layout
        // and doesn't collapse to 0×0. Reserving space matters because
        // Source is often bound through DynamicResource; the binding
        // can fire AFTER the first measure pass, and a StackPanel that
        // allocated 0 to the icon at first measure won't necessarily
        // re-flow on its own. Returning the icon-grid size makes Icon
        // ergonomic without explicit Width / Height in markup.
        if (src === undefined) return DEFAULT_ICON_SIZE;
        // Visual's Width / Height DPs (NaN when unset) win over the
        // viewBox via the explicit-constraint clamp Visual applies after
        // MeasureOverride returns. So we just publish the natural size
        // here and let the framework's measure pipeline handle it.
        return new Size(src.ViewBoxWidth, src.ViewBoxHeight);
    }

    protected override ArrangeOverride(finalSize: Size): Size
    {
        return finalSize;
    }

    protected override RenderOverride(dc: DrawingContext): void
    {
        const src = this.Source;
        if (src === undefined) return;
        const size = this.RenderSize;
        if (size.Width <= 0 || size.Height <= 0) return;
        if (src.ViewBoxWidth <= 0 || src.ViewBoxHeight <= 0) return;

        // Uniform scale + center within the slot. `Math.min` so the
        // longer axis gets letterbox / pillarbox blank space rather
        // than the icon distorting. Square-on-square is the dominant
        // case and degenerates to a single scale factor.
        const scale  = Math.min(size.Width / src.ViewBoxWidth, size.Height / src.ViewBoxHeight);
        const drawnW = src.ViewBoxWidth  * scale;
        const drawnH = src.ViewBoxHeight * scale;
        const offX   = (size.Width  - drawnW) / 2;
        const offY   = (size.Height - drawnH) / 2;
        // M11 / M22 are scale; OffsetX / OffsetY are translation.
        // No rotation / skew, so M12 / M21 = 0.
        const m = new Matrix(scale, 0, 0, scale, offX, offY);
        dc.PushTransform(new MatrixTransform(m));

        const foreground = this.Foreground ?? DEFAULT_FOREGROUND;
        const recolor    = this.Recolor;

        for (const shape of src.Shapes)
        {
            const fillBrush   = resolvePaint(shape.Fill,   foreground, recolor);
            const strokeBrush = resolvePaint(shape.Stroke, foreground, recolor);
            const pen = strokeBrush !== undefined && shape.StrokeWidth > 0
                ? new Pen(strokeBrush, shape.StrokeWidth)
                : undefined;
            dc.DrawGeometry(fillBrush, pen, shape.Geometry);
        }

        dc.Pop();
    }
}

// Resolve an IconShape paint to a runtime Brush given the Icon's
// Foreground + Recolor state.
//   * `undefined` (SVG `fill="none"`) → undefined (no paint)
//   * `CURRENT_COLOR` → always Foreground
//   * `Color` (authored) → Foreground when Recolor, otherwise the Color
function resolvePaint(paint: IconPaint, foreground: Brush, recolor: boolean): Brush | undefined
{
    if (paint === undefined) return undefined;
    if (paint === CURRENT_COLOR) return foreground;
    return recolor ? foreground : brushForColor(paint);
}

// Convenience builder: paths-only IconDefinition from a viewBox size and
// a flat list of (figures + paint metadata) records. Used by the parser
// and by hand-authored tests.
export interface PathIconRecord
{
    Figures:      PathGeometry['Figures'];
    Fill?:        IconPaint;
    Stroke?:      IconPaint;
    StrokeWidth?: number;
    FillRule?:    FillRule;
}

export function buildPathIcon(
    viewBoxWidth:  number,
    viewBoxHeight: number,
    paths:         readonly PathIconRecord[],
): IconDefinition
{
    const shapes: IconShape[] = paths.map(p =>
    {
        const g = new PathGeometry(p.Figures);
        if (p.FillRule !== undefined) g.FillRule = p.FillRule;
        return {
            Geometry:    g,
            Fill:        p.Fill ?? CURRENT_COLOR,
            Stroke:      p.Stroke,
            StrokeWidth: p.StrokeWidth ?? 0,
        };
    });
    return new IconDefinition(viewBoxWidth, viewBoxHeight, shapes);
}

// Convenience for tests / hand-authored icons built out of primitive
// geometries (rects, circles, ellipses, lines). The shape's own
// Geometry already encodes the shape; this just wraps the paint metadata.
export function makeIconShape(
    geometry:     Geometry,
    fill:         IconPaint = CURRENT_COLOR,
    stroke:       IconPaint = undefined,
    strokeWidth:  number    = 0,
): IconShape
{
    return { Geometry: geometry, Fill: fill, Stroke: stroke, StrokeWidth: strokeWidth };
}

// Re-export so test code (and the parser module) can build IconDefinitions
// from the same geometry primitives the renderer dispatches against.
export {
    EllipseGeometry,
    LineGeometry,
    PathGeometry,
    RectangleGeometry,
    type Geometry,
};
