import type { Point, Rect } from '../../runtime/index.js';
import type { DrawingContext } from '../../runtime/index.js';
import { Brush, SolidColorBrush } from './brush.js';
import { DashStyle, LineCap, type Pen } from './pen.js';
import { EllipseGeometry, LineGeometry, PathGeometry, RectangleGeometry, type Geometry } from '../geometry/geometry.js';
import { pathGeometryToSvgD } from '../geometry/path-to-svg.js';
import { Transform } from './transform.js';
import { FontStyle, FontWeight, type FormattedText } from '../text/formatted-text.js';
import { Stretch, type ImageSource } from './image-source.js';

// DOM-mode DrawingContext. Mirrors SvgDrawingContext (string builder)
// but appends real SVG elements to a host node instead of accumulating
// markup. Used by SvgRenderer to paint into HtmlTarget's live surface
// — the in-DOM tree means hit-testing can use `event.target` to recover
// the Visual that owns each node (via the renderer's back-reference
// stamps on each visual's outer `<g>`).
//
// Construction takes the SVGElement the DC will paint into (typically
// the visual's "own primitives" group). Push* calls create nested
// `<g>` wrappers inside that root and push them as the new insertion
// point; Pop returns to the parent.
//
// The clip-path `<clipPath>` defs go into a shared `<defs>` element
// owned by the renderer — passed in at construction so multiple DC
// instances rendering the same surface share one id space.

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface SvgDomDrawingContextOptions
{
    /** `<defs>` element that collects clip paths and (future) gradient
     *  / pattern definitions across all visuals on the surface. */
    defs: SVGDefsElement;
    /** Monotonic counter for unique clip-path IDs. Pass a shared
     *  closure so siblings rendered into the same `<defs>` don't
     *  collide. */
    nextClipId: () => string;
    /** Owner document — defaults to globalThis.document, but the
     *  renderer can supply a different one for off-screen rendering
     *  (jsdom in tests, OffscreenCanvas adjacency, etc.). */
    document?: Document;
}

export class SvgDomDrawingContext implements DrawingContext
{
    private readonly stack: SVGElement[];
    private readonly defs:        SVGDefsElement;
    private readonly nextClipId:  () => string;
    private readonly doc:         Document;

    constructor(root: SVGElement, options: SvgDomDrawingContextOptions)
    {
        this.stack      = [root];
        this.defs       = options.defs;
        this.nextClipId = options.nextClipId;
        this.doc        = options.document ?? globalThis.document;
    }

    // ── DrawingContext surface ─────────────────────────────────────

    public DrawRectangle(brush: Brush | undefined, pen: Pen | undefined, rect: Rect): void
    {
        const r = this.create('rect');
        r.setAttribute('x',      formatNumber(rect.X));
        r.setAttribute('y',      formatNumber(rect.Y));
        r.setAttribute('width',  formatNumber(rect.Width));
        r.setAttribute('height', formatNumber(rect.Height));
        applyFill  (r, brush);
        applyStroke(r, pen);
        this.current().appendChild(r);
    }

    public DrawRoundedRectangle(
        brush: Brush | undefined,
        pen: Pen | undefined,
        rect: Rect,
        radiusX: number,
        radiusY: number,
    ): void
    {
        const r = this.create('rect');
        r.setAttribute('x',      formatNumber(rect.X));
        r.setAttribute('y',      formatNumber(rect.Y));
        r.setAttribute('width',  formatNumber(rect.Width));
        r.setAttribute('height', formatNumber(rect.Height));
        if (radiusX > 0) r.setAttribute('rx', formatNumber(radiusX));
        if (radiusY > 0) r.setAttribute('ry', formatNumber(radiusY));
        applyFill  (r, brush);
        applyStroke(r, pen);
        this.current().appendChild(r);
    }

    public DrawGeometry(brush: Brush | undefined, pen: Pen | undefined, geometry: Geometry): void
    {
        // Geometry.Transform lowers to a wrapping `<g transform=…>` the
        // same way DC.PushTransform does, then closes after the emit.
        // Mirrors svg-drawing-context.ts.
        const tx = geometry.Transform;
        const wrap = tx !== Transform.Identity;
        if (wrap) this.PushTransform(tx);

        if (geometry instanceof EllipseGeometry)
        {
            const e = this.create('ellipse');
            e.setAttribute('cx', formatNumber(geometry.Center.X));
            e.setAttribute('cy', formatNumber(geometry.Center.Y));
            e.setAttribute('rx', formatNumber(geometry.RadiusX));
            e.setAttribute('ry', formatNumber(geometry.RadiusY));
            applyFill  (e, brush);
            applyStroke(e, pen);
            this.current().appendChild(e);
        }
        else if (geometry instanceof LineGeometry)
        {
            const l = this.create('line');
            l.setAttribute('x1', formatNumber(geometry.StartPoint.X));
            l.setAttribute('y1', formatNumber(geometry.StartPoint.Y));
            l.setAttribute('x2', formatNumber(geometry.EndPoint.X));
            l.setAttribute('y2', formatNumber(geometry.EndPoint.Y));
            // <line> takes only a stroke. Without one it's invisible —
            // pen-less lines are a no-op by SVG semantics.
            applyStroke(l, pen);
            this.current().appendChild(l);
        }
        else if (geometry instanceof RectangleGeometry)
        {
            const r = this.create('rect');
            const rect = geometry.Rect;
            r.setAttribute('x',      formatNumber(rect.X));
            r.setAttribute('y',      formatNumber(rect.Y));
            r.setAttribute('width',  formatNumber(rect.Width));
            r.setAttribute('height', formatNumber(rect.Height));
            if (geometry.RadiusX > 0) r.setAttribute('rx', formatNumber(geometry.RadiusX));
            if (geometry.RadiusY > 0) r.setAttribute('ry', formatNumber(geometry.RadiusY));
            applyFill  (r, brush);
            applyStroke(r, pen);
            this.current().appendChild(r);
        }
        else if (geometry instanceof PathGeometry)
        {
            // Lower to `<path d="…">`. Both DCs share the d-string
            // generator so the two renderers stay in sync.
            const p = this.create('path');
            p.setAttribute('d', pathGeometryToSvgD(geometry));
            if (geometry.FillRule === 'evenodd') p.setAttribute('fill-rule', 'evenodd');
            applyFill  (p, brush);
            applyStroke(p, pen);
            this.current().appendChild(p);
        }
        else
        {
            if (wrap) this.Pop();
            throw new Error(`SvgDomDrawingContext.DrawGeometry: ${geometry.constructor.name} not implemented yet.`);
        }

        if (wrap) this.Pop();
    }

    public DrawText(text: FormattedText, origin: Point): void
    {
        // SVG `<text y=…>` places the baseline at y; WPF passes the
        // top-left of the text rect. Shift y down by the ascender to
        // align — matches svg-drawing-context.ts.
        const baselineOffset = text.Metrics?.Ascent ?? text.FontSize * 0.85;

        const t = this.create('text');
        t.setAttribute('x', formatNumber(origin.X));
        t.setAttribute('y', formatNumber(origin.Y + baselineOffset));
        t.setAttribute('font-family', text.FontFamily);
        t.setAttribute('font-size',   formatNumber(text.FontSize));
        // Preserve whitespace — see svg-drawing-context.ts for rationale.
        // Without this, typing space into a TextBox would visually do
        // nothing because trailing spaces are stripped by the default
        // SVG whitespace handling. Namespaced setAttributeNS is required
        // for the SVG engine to recognise the attribute; plain
        // setAttribute would write a literal local-name with a colon
        // in it. Also set the CSS white-space property as belt-and-
        // suspenders for SVG2-compliant renderers.
        t.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
        (t as unknown as { style: CSSStyleDeclaration }).style.whiteSpace = 'pre';
        if (text.FontWeight !== FontWeight.Normal)
        {
            t.setAttribute('font-weight', text.FontWeight);
        }
        if (text.FontStyle !== FontStyle.Normal)
        {
            t.setAttribute('font-style', text.FontStyle);
        }
        if (text.LetterSpacing !== 0)
        {
            t.setAttribute('letter-spacing', formatNumber(text.LetterSpacing));
        }
        applyTextFill(t, text.Foreground);
        // No textLength / lengthAdjust here — see the matching block
        // in svg-drawing-context.ts. Forcing the SVG render width to
        // the measurer's width stretched glyphs visibly whenever the
        // two engines disagreed by sub-pixels. CanvasTextMeasurer is
        // accurate enough for caret math at natural widths.
        t.textContent = text.Text;
        this.current().appendChild(t);
    }

    public DrawImage(source: ImageSource, rect: Rect, stretch: Stretch): void
    {
        const i = this.create('image');
        // SVG 2 prefers `href`; legacy `xlink:href` is still accepted
        // by all browsers but emits a deprecation warning in some
        // tooling. Mural targets modern SVG only.
        i.setAttribute('href', source.Uri);
        i.setAttribute('x',      formatNumber(rect.X));
        i.setAttribute('y',      formatNumber(rect.Y));
        i.setAttribute('width',  formatNumber(rect.Width));
        i.setAttribute('height', formatNumber(rect.Height));
        i.setAttribute('preserveAspectRatio', stretchToPreserveAspectRatio(stretch));
        this.current().appendChild(i);
    }

    public PushTransform(transform: Transform): void
    {
        const m = transform.Matrix;
        const g = this.create('g');
        g.setAttribute(
            'transform',
            `matrix(${formatNumber(m.M11)},${formatNumber(m.M12)},${formatNumber(m.M21)},${formatNumber(m.M22)},${formatNumber(m.OffsetX)},${formatNumber(m.OffsetY)})`,
        );
        this.current().appendChild(g);
        this.stack.push(g);
    }

    // Wrap subsequent emissions in a `<g clip-path="url(#id)">`. The
    // referenced `<clipPath id=id>` lands in the renderer-owned `<defs>`
    // so siblings sharing the surface don't collide on IDs.
    public PushClip(geometry: Geometry): void
    {
        const id = this.nextClipId();
        let shape: SVGElement;
        if (geometry instanceof RectangleGeometry)
        {
            shape = this.create('rect');
            const r = geometry.Rect;
            shape.setAttribute('x',      formatNumber(r.X));
            shape.setAttribute('y',      formatNumber(r.Y));
            shape.setAttribute('width',  formatNumber(r.Width));
            shape.setAttribute('height', formatNumber(r.Height));
            if (geometry.RadiusX > 0) shape.setAttribute('rx', formatNumber(geometry.RadiusX));
            if (geometry.RadiusY > 0) shape.setAttribute('ry', formatNumber(geometry.RadiusY));
        }
        else if (geometry instanceof EllipseGeometry)
        {
            shape = this.create('ellipse');
            shape.setAttribute('cx', formatNumber(geometry.Center.X));
            shape.setAttribute('cy', formatNumber(geometry.Center.Y));
            shape.setAttribute('rx', formatNumber(geometry.RadiusX));
            shape.setAttribute('ry', formatNumber(geometry.RadiusY));
        }
        else
        {
            throw new Error(`SvgDomDrawingContext.PushClip: ${geometry.constructor.name} not supported as a clip shape (expected RectangleGeometry or EllipseGeometry).`);
        }
        const clipPath = this.create('clipPath');
        clipPath.setAttribute('id', id);
        clipPath.appendChild(shape);
        this.defs.appendChild(clipPath);

        const g = this.create('g');
        g.setAttribute('clip-path', `url(#${id})`);
        this.current().appendChild(g);
        this.stack.push(g);
    }

    public Pop(): void
    {
        if (this.stack.length <= 1)
        {
            throw new Error('SvgDomDrawingContext.Pop: nothing to pop (Pop without matching Push)');
        }
        this.stack.pop();
    }

    // ── Internals ──────────────────────────────────────────────────

    private create(tag: string): SVGElement
    {
        return this.doc.createElementNS(SVG_NS, tag) as SVGElement;
    }

    private current(): SVGElement
    {
        return this.stack[this.stack.length - 1]!;
    }
}

// ── Attribute helpers — DOM equivalents of svg-drawing-context.ts's
//   string emitters. Kept in this file so the file is self-contained;
//   factor out if a third DC backend appears.

function formatNumber(n: number): string { return n.toString(); }

// Mirrors stretchToPreserveAspectRatio in svg-drawing-context.ts.
function stretchToPreserveAspectRatio(stretch: Stretch): string
{
    switch (stretch)
    {
        case Stretch.None:          return 'xMinYMin meet';
        case Stretch.Fill:          return 'none';
        case Stretch.UniformToFill: return 'xMidYMid slice';
        case Stretch.Uniform:
        default:                    return 'xMidYMid meet';
    }
}

function applyFill(el: SVGElement, brush: Brush | undefined): void
{
    if (brush instanceof SolidColorBrush)
    {
        el.setAttribute('fill', brush.Color.ToCss());
        return;
    }
    // Gradients / ImageBrush — defer; treat as no-fill so the slot
    // stays transparent rather than defaulting to SVG black.
    el.setAttribute('fill', 'none');
}

function applyTextFill(el: SVGElement, brush: Brush | undefined): void
{
    if (brush instanceof SolidColorBrush)
    {
        el.setAttribute('fill', brush.Color.ToCss());
        return;
    }
    el.setAttribute('fill', 'rgb(0,0,0)');
}

function applyStroke(el: SVGElement, pen: Pen | undefined): void
{
    if (pen === undefined) return;
    if (!(pen.Brush instanceof SolidColorBrush)) return;
    el.setAttribute('stroke',        pen.Brush.Color.ToCss());
    el.setAttribute('stroke-width',  formatNumber(pen.Thickness));
    const dash = pen.DashStyle;
    if (!dash.Equals(DashStyle.Solid))
    {
        // Pen.DashStyle.Dashes are Thickness-multipliers (WPF
        // semantics); convert to absolute user-space lengths.
        const dashes = dash.Dashes.map(d => formatNumber(d * pen.Thickness)).join(' ');
        el.setAttribute('stroke-dasharray', dashes);
        if (dash.Offset !== 0)
        {
            el.setAttribute('stroke-dashoffset', formatNumber(dash.Offset * pen.Thickness));
        }
    }
    if (pen.LineCap !== LineCap.Flat)
    {
        el.setAttribute('stroke-linecap', pen.LineCap);
    }
}
