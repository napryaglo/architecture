import type { TextMeasurer, TextMetrics } from '../runtime/index.js';

// TextMeasurer backed by the browser's own Canvas 2D `measureText` API.
//
// The browser font-renderer is the source of truth for what `<text>`
// elements paint at runtime; asking it directly via canvas gives the
// exact per-text widths the matching SVG text will render with. That
// closes the gap between "measured width" and "rendered width" that
// makes a caret drift (or — when textLength is applied — makes glyphs
// look weirdly stretched because the approximate widths are too wide).
//
// Why a hidden canvas and not the SVG itself: SVG `<text>` doesn't
// expose a synchronous width-of-string API — `getComputedTextLength`
// works but requires the element to be in the document AND laid out,
// which adds a layout flush per call (expensive when measuring a long
// string char-by-char for a TextBox). Canvas 2D's measureText is
// synchronous, font-aware, and free of layout side effects; both
// APIs share the underlying font engine, so the widths match what SVG
// renders at the same family / size / weight / style.
//
// No-state per measurement: `font` is a write-only string we set per
// call. The single offscreen canvas + context is reused for every
// measurement to avoid the GC pressure of allocating one per call.
export class CanvasTextMeasurer implements TextMeasurer
{
    private readonly ctx: CanvasRenderingContext2D;

    // Cache the last-set font shorthand. Re-assigning the same string
    // to `ctx.font` still forces the engine to re-parse and re-resolve
    // the font, which is the dominant per-call cost for short strings.
    // The TextBox per-keystroke path measures the same font repeatedly
    // (every prefix of every line) so the hit rate here is ~100%.
    private _lastFont: string = '';

    constructor(doc?: Document)
    {
        const d = doc ?? (typeof document !== 'undefined' ? document : undefined);
        if (d === undefined)
        {
            throw new Error('CanvasTextMeasurer: no Document available; use ApproximateTextMeasurer in Node contexts.');
        }
        const canvas = d.createElement('canvas');
        const ctx    = canvas.getContext('2d');
        if (ctx === null)
        {
            throw new Error('CanvasTextMeasurer: canvas 2D context unavailable in this environment.');
        }
        this.ctx = ctx;
    }

    // LoadFont is a no-op: the browser owns font registration. Pages
    // that want a custom font register it via `@font-face` (CSS) or
    // `new FontFace(...).load()` (JS), then reference the family by
    // name in the mural Visual's FontFamily DP. The browser's font
    // resolver picks it up automatically the next time we set
    // `ctx.font`. A LoadFont call here would have no way to plumb the
    // buffer into the canvas's font engine without going through
    // FontFace itself, so consumers should use FontFace directly when
    // they need to ship a private font.
    public LoadFont(): void { /* see comment */ }

    public Measure(
        text: string,
        fontFamily: string,
        fontSize: number,
        fontWeight: string,
        fontStyle: string,
    ): TextMetrics
    {
        // CSS font shorthand: "[style] [weight] [size]px [family]".
        // weight === 'normal' and style === 'normal' could be omitted
        // for brevity, but the explicit form is easier to read in
        // devtools when debugging measurement weirdness.
        this.applyFont(fontFamily, fontSize, fontWeight, fontStyle);

        // Empty-string Measure still returns a meaningful Ascent /
        // Descent so callers (TextBox computing line height for an
        // empty editor) get a sensible row height instead of zero.
        // measureText('') returns width 0 with the configured font's
        // bounding-box metrics still populated.
        const m = this.ctx.measureText(text);

        // Prefer fontBoundingBox* over actualBoundingBox*: the actual
        // values shrink for short text without descenders ("ace" has
        // no descender so actualBoundingBoxDescent = 0), which would
        // make a line of "ace" sit at a different y than a line of
        // "ape". fontBoundingBox is per-font, stable across content.
        // Fall back to actualBoundingBox where the browser doesn't
        // expose font metrics (Safari < 11.1), then to the 0.85/0.35
        // ratio used by ApproximateTextMeasurer.
        const mb       = m as TextMetricsWithBounds;
        const ascent   = mb.fontBoundingBoxAscent
                      ?? mb.actualBoundingBoxAscent
                      ?? fontSize * 0.85;
        const descent  = mb.fontBoundingBoxDescent
                      ?? mb.actualBoundingBoxDescent
                      ?? fontSize * 0.35;

        return {
            Width:   m.width,
            Height:  ascent + descent,
            Ascent:  ascent,
            Descent: descent,
        };
    }

    // Fast path for TextBox caret math: emit per-character prefix widths
    // in a single tight loop with the font set once. Saves the O(N)
    // per-call font-string assignment that a naive `for (i) Measure(prefix)`
    // loop would do, and the substring concat happens on already-warm
    // memory. Still O(N²) measure work intrinsic to "width of every
    // prefix" — Canvas doesn't expose per-glyph advances — but a noticeable
    // constant-factor win compared to going through Measure each time.
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
        for (let i = 1; i <= text.length; i++)
        {
            xs[i] = this.ctx.measureText(text.substring(0, i)).width;
        }
        return xs;
    }

    private applyFont(
        family: string, fontSize: number, weight: string, style: string,
    ): void
    {
        const font = `${style} ${weight} ${fontSize}px ${family}`;
        if (font === this._lastFont) return;
        this.ctx.font = font;
        this._lastFont = font;
    }
}

// Narrow structural shape exposing the optional bounding-box fields
// that older Safari versions don't ship. The browser's TextMetrics
// (returned by measureText) shares a name with mural's runtime
// TextMetrics but they're unrelated; this interface is the bridge —
// every field is optional so we can fall through to the FontSize
// ratio when the browser doesn't expose it.
interface TextMetricsWithBounds
{
    width: number;
    actualBoundingBoxAscent?:  number;
    actualBoundingBoxDescent?: number;
    fontBoundingBoxAscent?:    number;
    fontBoundingBoxDescent?:   number;
}
