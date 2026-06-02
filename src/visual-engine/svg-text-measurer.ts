import type { TextMeasurer, TextMetrics } from '../runtime/index.js';

// TextMeasurer that asks an actual offscreen SVG `<text>` element for
// its rendered widths. Because the visible mural surfaces paint text
// through the same SVG text-rendering path, this measurer's widths are
// the widths the user will see — caret positions and selection rects
// computed against it line up exactly with the painted glyphs.
//
// Trade-off vs CanvasTextMeasurer: both share the browser's font
// engine, but Canvas measureText and SVG <text> can disagree on a
// fraction of a pixel per glyph due to differences in how each path
// applies kerning / sub-pixel rounding. Those fractions are
// imperceptible for a single label but they accumulate over a 10-char
// TextBox line into a visibly-misplaced caret. SvgTextMeasurer trades
// the cost of a hidden SVG layout pass for guaranteed alignment.
//
// Trade-off vs FontMetricsMeasurer: the metrics measurer parses a
// concrete font file via opentype.js — same metrics whether the page
// runs in browser, Node, or PDF rendering. SvgTextMeasurer is browser-
// only (it needs an SVGTextContentElement) but doesn't require the
// consumer to ship a font file, and it picks up whatever the browser
// substitutes for system-ui / sans-serif on the user's OS.
//
// Lifetime: one offscreen `<svg>` per measurer, attached to `body`
// outside the visible viewport. `LoadFont` is a no-op — the browser
// owns the font registration (consumers using a private font set up
// the matching @font-face or FontFace).
export class SvgTextMeasurer implements TextMeasurer
{
    private readonly text: SVGTextElement;
    private readonly svg:  SVGSVGElement;

    constructor(doc?: Document)
    {
        const d = doc ?? (typeof document !== 'undefined' ? document : undefined);
        if (d === undefined)
        {
            throw new Error('SvgTextMeasurer: no Document available; use ApproximateTextMeasurer in Node contexts.');
        }
        const SVG_NS = 'http://www.w3.org/2000/svg';
        this.svg = d.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
        // Position the SVG offscreen with ample size so the browser
        // gives it a real layout box. `visibility:hidden` keeps it
        // invisible but layout-participating (display:none would
        // cause getComputedTextLength / getBBox to throw or return 0
        // in some browsers). `left:-99999px` parks it past every
        // realistic page width so the user never sees it.
        const style = this.svg.style as CSSStyleDeclaration;
        style.position      = 'absolute';
        style.visibility    = 'hidden';
        style.pointerEvents = 'none';
        style.left          = '-99999px';
        style.top           = '0';
        style.width         = '1000px';
        style.height        = '100px';
        // overflow:visible is the SVG default but some user stylesheets
        // clamp <svg> globally to overflow:hidden — set it explicitly so
        // glyphs that extend past our small viewBox still report correct
        // geometry.
        style.overflow      = 'visible';

        this.text = d.createElementNS(SVG_NS, 'text') as SVGTextElement;
        // Anchor at (0, 0) so getSubStringLength returns widths from
        // the leading edge of the string.
        this.text.setAttribute('x', '0');
        this.text.setAttribute('y', '0');
        // Critical for editor-style consumers: keep whitespace as-is.
        // The SVG default whitespace handling strips trailing spaces and
        // collapses internal runs to a single space, which would make
        // typing space into a TextBox a visual no-op (getComputedTextLength
        // on "Mural " reports the same width as "Mural") and would make
        // the caret refuse to advance past the trailing space.
        //
        // Must use setAttributeNS with the XML namespace URI — plain
        // setAttribute('xml:space', ...) writes a literal attribute with
        // a colon in its local name, which the SVG layout engine doesn't
        // recognise as the namespaced `xml:space`. We also belt-and-
        // suspenders with the CSS `white-space: pre` which works in
        // SVG2-compliant engines.
        this.text.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
        (this.text as unknown as { style: CSSStyleDeclaration }).style.whiteSpace = 'pre';
        this.svg.appendChild(this.text);
        // Body may not exist yet if a consumer constructs HtmlTarget
        // before DOMContentLoaded. Defer the appendChild to the first
        // available point in that case.
        if (d.body !== null)
        {
            d.body.appendChild(this.svg);
        }
        else if (typeof d.addEventListener === 'function')
        {
            d.addEventListener('DOMContentLoaded',
                () => d.body?.appendChild(this.svg),
                { once: true });
        }
    }

    public LoadFont(): void { /* see class comment */ }

    public Measure(
        text: string,
        fontFamily: string,
        fontSize:   number,
        fontWeight: string,
        fontStyle:  string,
    ): TextMetrics
    {
        this.applyFont(fontFamily, fontSize, fontWeight, fontStyle);

        // Width path: cheap, doesn't depend on bbox / a rendered
        // visibility chain. Empty string returns 0 directly so we
        // never call getComputedTextLength on a zero-length range
        // (some browsers throw there).
        let width = 0;
        if (text.length > 0)
        {
            this.text.textContent = text;
            try
            {
                width = this.text.getComputedTextLength();
            }
            catch
            {
                // Browser refused to compute (e.g. SVG hidden / not in
                // layout yet). Drop to an approximation just for this
                // measurement; the next call may succeed.
                width = text.length * fontSize * 0.6;
            }
        }
        else
        {
            this.text.textContent = '';
        }

        // Ascent / Descent path: getBBox is the SVG-spec way to read
        // per-glyph bounds, but Firefox throws NS_ERROR_FAILURE on
        // <text> elements whose render context isn't laid out
        // (visibility:hidden offscreen elements sometimes qualify).
        // Probe with a tall+deep glyph pair ('Mg') so empty / short
        // text still reports realistic ascent + descent for line
        // layout. Fall back to the ApproximateTextMeasurer ratios
        // (0.85 / 0.35) if the bbox call refuses.
        const prevContent = this.text.textContent;
        let ascent  = fontSize * 0.85;
        let descent = fontSize * 0.35;
        try
        {
            if (text.length === 0) this.text.textContent = 'Mg';
            const bbox = this.text.getBBox();
            ascent  = Math.max(0, -bbox.y);
            descent = Math.max(0, bbox.height - ascent);
        }
        catch
        {
            // Keep the approximate ascent/descent. Renderer can still
            // paint; the line height is just slightly off.
        }
        // Restore the actual text so MeasureCharPositions (when the
        // caller invokes it next) doesn't see the probe content.
        if (text.length === 0 && prevContent !== '') this.text.textContent = '';

        return {
            Width:   width,
            Height:  ascent + descent,
            Ascent:  ascent,
            Descent: descent,
        };
    }

    // Fast path for prefix widths: set the text once, then read
    // getSubStringLength(0, i) for each i. The browser computes the
    // layout once and reuses it across the slice queries, so this is
    // O(text.length) work for the layout plus O(1) per slice read,
    // not the O(text.length) layouts that a naïve `for (i) Measure(prefix)`
    // loop would trigger. Returned array is indexable: result[i] is
    // the X of the leading edge of column i; result[text.length] is
    // the trailing edge of the last glyph.
    //
    // Public because TextEditorSurface calls it directly when this
    // measurer is installed — see computeCharXPositions in
    // Controls/text-box.ts which feature-detects this method.
    public MeasureCharPositions(
        text:       string,
        fontFamily: string,
        fontSize:   number,
        fontWeight: string,
        fontStyle:  string,
    ): number[]
    {
        const xs: number[] = new Array(text.length + 1);
        xs[0] = 0;
        if (text.length === 0) return xs;

        this.applyFont(fontFamily, fontSize, fontWeight, fontStyle);
        this.text.textContent = text;
        for (let i = 1; i <= text.length; i++)
        {
            try
            {
                xs[i] = this.text.getSubStringLength(0, i);
            }
            catch
            {
                // Browser refused on this glyph range — fall back to
                // the approximate ratio for the rest of the line so
                // the editor still measures and the demo opens.
                xs[i] = i * fontSize * 0.6;
            }
        }
        return xs;
    }

    private applyFont(
        family: string, fontSize: number, weight: string, style: string,
    ): void
    {
        this.text.setAttribute('font-family', family);
        this.text.setAttribute('font-size',   String(fontSize));
        if (weight !== 'normal')
        {
            this.text.setAttribute('font-weight', weight);
        }
        else
        {
            this.text.removeAttribute('font-weight');
        }
        if (style !== 'normal')
        {
            this.text.setAttribute('font-style', style);
        }
        else
        {
            this.text.removeAttribute('font-style');
        }
    }
}
