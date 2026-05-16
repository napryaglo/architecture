import type { Point, Rect } from '../runtime/index.js';
import type { DrawingContext } from '../runtime/index.js';
import { Brush, SolidColorBrush } from './brush.js';
import type { Pen } from './pen.js';
import type { Geometry } from './geometry.js';
import type { Transform } from './transform.js';
import { FontStyle, FontWeight, type FormattedText } from './formatted-text.js';

// Minimal SVG implementation of DrawingContext. Translates draw calls
// into string-form SVG elements buffered in `output`; the consumer (a
// renderer, a test script, …) wraps them in an outer <svg> element with
// the desired width/height/viewBox.
//
// Surface implemented:
//   * DrawRectangle  — for SolidColorBrush fills and SolidColorBrush-backed Pen strokes
//   * DrawText       — for SolidColorBrush foreground; defaults to black when undefined
//   * PushTransform / Pop — emits <g transform="matrix(…)"> wrappers
//
// Surface still pending:
//   * DrawGeometry — throws NotImplemented until a Geometry-using Visual needs it
//   * Non-solid Brushes (Linear/Radial gradients, ImageBrush) — need
//     <defs> + id-based references
//   * Brush.Opacity + Pen.DashStyle + LineCap/LineJoin/MiterLimit
//
// Not a full renderer yet — there's no slot tree, no dirty tracking,
// no DOM mount. Just the DC seam that turns draw calls into SVG strings.
// The full SvgRenderer (which owns the slot map and ties into
// HtmlTarget) is a later step.
export class SvgDrawingContext implements DrawingContext
{
    private readonly output: string[] = [];

    public DrawRectangle(brush: Brush | undefined, pen: Pen | undefined, rect: Rect): void
    {
        const attrs: string[] = [
            `x="${formatNumber(rect.X)}"`,
            `y="${formatNumber(rect.Y)}"`,
            `width="${formatNumber(rect.Width)}"`,
            `height="${formatNumber(rect.Height)}"`,
            fillAttr(brush),
            ...strokeAttrs(pen),
        ];
        this.output.push(`<rect ${attrs.join(' ')} />`);
    }

    public DrawGeometry(_brush: Brush | undefined, _pen: Pen | undefined, _geometry: Geometry): void
    {
        throw new Error('SvgDrawingContext.DrawGeometry: not implemented yet (build-order: lands when a concrete Geometry-using Visual needs it).');
    }

    public DrawText(text: FormattedText, origin: Point): void
    {
        // SVG's <text y=…> places the BASELINE at y, not the top of the
        // bounding box. WPF's DrawText takes origin as the top-left of
        // the text rect. We shift y down by the ascender height — when
        // FormattedText was sized by a real TextMeasurer (FontMetricsMeasurer
        // with a loaded font), Metrics.Ascent is the actual font's
        // ascender for this size. Without metrics (no font loaded /
        // ApproximateTextMeasurer), fall back to the 0.85 ratio that
        // works reasonably for system-ui / sans-serif / common serifs.
        const baselineOffset = text.Metrics?.Ascent ?? text.FontSize * 0.85;

        const attrs: string[] = [
            `x="${formatNumber(origin.X)}"`,
            `y="${formatNumber(origin.Y + baselineOffset)}"`,
            `font-family="${escapeXmlAttr(text.FontFamily)}"`,
            `font-size="${formatNumber(text.FontSize)}"`,
        ];
        if (text.FontWeight !== FontWeight.Normal)
        {
            attrs.push(`font-weight="${text.FontWeight}"`);
        }
        if (text.FontStyle !== FontStyle.Normal)
        {
            attrs.push(`font-style="${text.FontStyle}"`);
        }
        attrs.push(fillAttrForText(text.Foreground));

        this.output.push(`<text ${attrs.join(' ')}>${escapeXmlText(text.Text)}</text>`);
    }

    public PushTransform(transform: Transform): void
    {
        const m = transform.Matrix;
        this.output.push(
            `<g transform="matrix(${formatNumber(m.M11)},${formatNumber(m.M12)},${formatNumber(m.M21)},${formatNumber(m.M22)},${formatNumber(m.OffsetX)},${formatNumber(m.OffsetY)})">`,
        );
    }

    public Pop(): void
    {
        this.output.push(`</g>`);
    }

    // Collects everything emitted so far into a self-contained
    // SVG document at the given dimensions. Subsequent draws continue
    // to append to the same buffer — call once at end of rendering.
    public ToSvg(width: number, height: number): string
    {
        const inner = this.output.join('\n  ');
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n  ${inner}\n</svg>\n`;
    }

    // Buffered SVG fragments without the <svg> wrapper. Useful when the
    // DC is rendering into an existing SVG slot rather than producing a
    // standalone document.
    public ToFragment(): string
    {
        return this.output.join('\n');
    }
}

// SVG accepts integers and decimals; we drop trailing .0 on integer-valued
// numbers so the output stays readable.
function formatNumber(n: number): string
{
    return Number.isInteger(n) ? n.toString() : n.toString();
}

function fillAttr(brush: Brush | undefined): string
{
    if (brush instanceof SolidColorBrush)
    {
        return `fill="${brush.Color.ToCss()}"`;
    }
    // Gradients / ImageBrush land later; for now treat unknown brushes as
    // no fill so the slot stays transparent rather than defaulting to
    // SVG's black.
    return `fill="none"`;
}

function strokeAttrs(pen: Pen | undefined): string[]
{
    if (pen === undefined) return [];
    if (!(pen.Brush instanceof SolidColorBrush)) return [];
    return [
        `stroke="${pen.Brush.Color.ToCss()}"`,
        `stroke-width="${formatNumber(pen.Thickness)}"`,
    ];
}

// Text foreground defaults to black when no brush is supplied — matches
// the SVG default and gives TextBlock the "just shows up" behavior with
// no Foreground set.
function fillAttrForText(brush: Brush | undefined): string
{
    if (brush instanceof SolidColorBrush)
    {
        return `fill="${brush.Color.ToCss()}"`;
    }
    return `fill="rgb(0,0,0)"`;
}

// Element content escaping — only & < > matter inside a text node.
function escapeXmlText(s: string): string
{
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Attribute value escaping — additionally double quotes since our
// attributes are always wrapped in double quotes.
function escapeXmlAttr(s: string): string
{
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}
