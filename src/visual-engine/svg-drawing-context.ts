import type { Point, Rect } from '../runtime/index.js';
import type { DrawingContext } from '../runtime/index.js';
import { Brush, SolidColorBrush } from './brush.js';
import type { Pen } from './pen.js';
import { EllipseGeometry, LineGeometry, RectangleGeometry, type Geometry } from './geometry.js';
import { Transform } from './transform.js';
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
    // <clipPath> elements collected separately so they emit at the
    // top of the document inside a single <defs> block — SVG allows
    // inline <defs> but render order through some viewers gets weird
    // when a clip-path="url(#id)" reference appears before its
    // definition. Collecting up front avoids the issue.
    private readonly defs: string[] = [];
    private clipCounter: number = 0;

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

    public DrawGeometry(brush: Brush | undefined, pen: Pen | undefined, geometry: Geometry): void
    {
        // Geometry.Transform lowers to a wrapping <g transform="…"> the
        // same way DC.PushTransform does, then closes after the emit.
        const tx = geometry.Transform;
        const wrap = tx !== Transform.Identity;
        if (wrap) this.PushTransform(tx);

        if (geometry instanceof EllipseGeometry)
        {
            const attrs: string[] = [
                `cx="${formatNumber(geometry.Center.X)}"`,
                `cy="${formatNumber(geometry.Center.Y)}"`,
                `rx="${formatNumber(geometry.RadiusX)}"`,
                `ry="${formatNumber(geometry.RadiusY)}"`,
                fillAttr(brush),
                ...strokeAttrs(pen),
            ];
            this.output.push(`<ellipse ${attrs.join(' ')} />`);
        }
        else if (geometry instanceof LineGeometry)
        {
            // <line> takes only a stroke (no fill semantics in SVG —
            // setting one is a no-op). Pen-less lines are a no-op too.
            const attrs: string[] = [
                `x1="${formatNumber(geometry.StartPoint.X)}"`,
                `y1="${formatNumber(geometry.StartPoint.Y)}"`,
                `x2="${formatNumber(geometry.EndPoint.X)}"`,
                `y2="${formatNumber(geometry.EndPoint.Y)}"`,
                ...strokeAttrs(pen),
            ];
            this.output.push(`<line ${attrs.join(' ')} />`);
        }
        else if (geometry instanceof RectangleGeometry)
        {
            // Reuse DrawRectangle for the basic case; rounded corners
            // (RadiusX / RadiusY > 0) get rx / ry attributes added.
            const r = geometry.Rect;
            const attrs: string[] = [
                `x="${formatNumber(r.X)}"`,
                `y="${formatNumber(r.Y)}"`,
                `width="${formatNumber(r.Width)}"`,
                `height="${formatNumber(r.Height)}"`,
            ];
            if (geometry.RadiusX > 0) attrs.push(`rx="${formatNumber(geometry.RadiusX)}"`);
            if (geometry.RadiusY > 0) attrs.push(`ry="${formatNumber(geometry.RadiusY)}"`);
            attrs.push(fillAttr(brush));
            attrs.push(...strokeAttrs(pen));
            this.output.push(`<rect ${attrs.join(' ')} />`);
        }
        else
        {
            // PathGeometry, GeometryGroup — lower to <path d="…"> when a
            // concrete user needs them. Throw loudly until then so a
            // silent miss doesn't ship an empty SVG.
            if (wrap) this.Pop();
            throw new Error(`SvgDrawingContext.DrawGeometry: ${geometry.constructor.name} not implemented yet.`);
        }

        if (wrap) this.Pop();
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

    // Wraps subsequent output in a <g clip-path="url(#…)"> whose
    // referenced <clipPath> contains the geometry's shape. The
    // <clipPath> element gets collected into the document's <defs>
    // block, emitted at the top by ToSvg / ToFragment. Pop emits
    // the closing </g> — same Pop as PushTransform since both stack
    // frames are <g>-shaped.
    //
    // Supported clip shapes: RectangleGeometry and EllipseGeometry
    // (the cases that round-trip cleanly to SVG shape elements
    // inside <clipPath>). Lines / paths / groups throw — clip
    // requires an enclosed region, which a line doesn't have.
    public PushClip(geometry: Geometry): void
    {
        const id = `clip${this.clipCounter++}`;
        let shape: string;
        if (geometry instanceof RectangleGeometry)
        {
            const r = geometry.Rect;
            shape = `<rect x="${formatNumber(r.X)}" y="${formatNumber(r.Y)}" width="${formatNumber(r.Width)}" height="${formatNumber(r.Height)}"`;
            if (geometry.RadiusX > 0) shape += ` rx="${formatNumber(geometry.RadiusX)}"`;
            if (geometry.RadiusY > 0) shape += ` ry="${formatNumber(geometry.RadiusY)}"`;
            shape += ` />`;
        }
        else if (geometry instanceof EllipseGeometry)
        {
            shape = `<ellipse cx="${formatNumber(geometry.Center.X)}" cy="${formatNumber(geometry.Center.Y)}" rx="${formatNumber(geometry.RadiusX)}" ry="${formatNumber(geometry.RadiusY)}" />`;
        }
        else
        {
            throw new Error(`SvgDrawingContext.PushClip: ${geometry.constructor.name} not supported as a clip shape (expected RectangleGeometry or EllipseGeometry).`);
        }
        this.defs.push(`<clipPath id="${id}">${shape}</clipPath>`);
        this.output.push(`<g clip-path="url(#${id})">`);
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
        const defs = this.defs.length > 0 ? `  <defs>${this.defs.join('')}</defs>\n` : '';
        const inner = this.output.join('\n  ');
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n${defs}  ${inner}\n</svg>\n`;
    }

    // Buffered SVG fragments without the <svg> wrapper. Useful when the
    // DC is rendering into an existing SVG slot rather than producing a
    // standalone document. Defs are prepended so consumers wrapping
    // the fragment get the referenced clip paths.
    public ToFragment(): string
    {
        const defs = this.defs.length > 0 ? `<defs>${this.defs.join('')}</defs>\n` : '';
        return defs + this.output.join('\n');
    }
}

// JS's Number.toString omits the trailing ".0" on integers and emits a
// minimal decimal otherwise — exactly what SVG attribute values want.
function formatNumber(n: number): string
{
    return n.toString();
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
