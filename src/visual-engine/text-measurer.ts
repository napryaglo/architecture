// Per-text measurement result. Width / Height are in DIPs, sized for
// the requested fontSize. Ascent is the distance from the top of the
// bounding box down to the typographic baseline; Descent is the
// distance from baseline down to the bottom. Always non-negative;
// Ascent + Descent === Height.
//
// Renderers that paint text at a "top-left" origin (SvgDrawingContext)
// add Ascent to the y coordinate to produce the SVG-style baseline.
// Measurers without per-font metrics (ApproximateTextMeasurer) fill in
// reasonable defaults — Ascent ≈ FontSize × 0.85, Descent ≈ FontSize ×
// 0.35 — so consumers can always rely on the four fields being present.
export interface TextMetrics
{
    readonly Width:   number;
    readonly Height:  number;
    readonly Ascent:  number;
    readonly Descent: number;

    // Actual INK extent of this text, measured from the baseline: InkAscent is
    // the distance up to the top of the tallest painted glyph, InkDescent the
    // distance down to the bottom of the lowest. Unlike Ascent / Descent (the
    // per-font LINE box, deliberately content-stable for line stacking), these
    // are the tight bounds of the glyphs actually drawn — so "Connector" (no
    // descenders) reports InkDescent ≈ 0. Optional: a measurer without glyph
    // bounds (ApproximateTextMeasurer) leaves them undefined. Consumers use them
    // to optically centre a single line by its ink rather than its line box (see
    // TextBlock vertical centring); they must NOT drive line stacking.
    readonly InkAscent?:  number;
    readonly InkDescent?: number;
}

// Renderer / environment-supplied text measurement service. Lives on
// the VisualHost so any Visual can reach it via `this.target?.TextMeasurer`.
//
// FontFamily is a CSS-style comma-separated stack — the measurer walks
// the list and uses the first loaded match. fontWeight and fontStyle are
// the string values of the FontWeight / FontStyle enums in visual-engine
// (kept as plain strings here so runtime stays enum-free for them).
//
// LoadFont is sync (font parsing itself is sync once a buffer is in
// hand) and returns void. Async font fetching is the caller's concern —
// pass an already-fetched ArrayBuffer. Optional weight / style hints
// override the measurer's auto-detection from the font's OS/2 table.
//
// Measurers that don't use per-font metrics (ApproximateTextMeasurer)
// implement LoadFont as a no-op.
export interface TextMeasurer
{
    LoadFont(
        family: string,
        source: ArrayBuffer | Uint8Array,
        weight?: string,
        style?: string,
    ): void;

    Measure(
        text: string,
        fontFamily: string,
        fontSize: number,
        fontWeight: string,
        fontStyle: string,
    ): TextMetrics;
}

// Approximate measurer used when no real font metrics are available.
// Stateless — LoadFont is a no-op, Measure uses constant ratios
// (AVG_GLYPH_RATIO and LINE_HEIGHT_RATIO) calibrated against typical
// sans-serif proportions. Width is `glyphCount × fontSize × 0.6`, height
// is `fontSize × 1.2`; Ascent / Descent split the height 0.85 / 0.35
// (the same baseline ratio SvgDrawingContext was using before this
// abstraction landed, so output stays byte-identical when nothing's
// loaded).
//
// Counts code points (Array.from), so surrogate pairs like emoji are
// one glyph each rather than two.
export class ApproximateTextMeasurer implements TextMeasurer
{
    public LoadFont(): void { /* no-op — approximation needs no font data */ }

    public Measure(
        text: string,
        _fontFamily: string,
        fontSize: number,
        _fontWeight: string,
        _fontStyle: string,
    ): TextMetrics
    {
        if (text === '')
        {
            return { Width: 0, Height: 0, Ascent: 0, Descent: 0 };
        }
        const glyphCount = Array.from(text).length;
        const width  = glyphCount * fontSize * AVG_GLYPH_RATIO;
        const height = fontSize * LINE_HEIGHT_RATIO;
        return {
            Width:   width,
            Height:  height,
            Ascent:  fontSize * BASELINE_RATIO,
            Descent: height - fontSize * BASELINE_RATIO,
        };
    }
}

const AVG_GLYPH_RATIO   = 0.6;   // slightly overestimates average sans-serif glyph width
const LINE_HEIGHT_RATIO = 1.2;   // typical CSS / WPF default
const BASELINE_RATIO    = 0.85;  // distance from top of bounding box to baseline

// Shared default — Visuals fall back to this when no host or no
// measurer is wired. Stateless and side-effect-free, so a single
// instance is safe to share across the whole framework.
export const APPROXIMATE_TEXT_MEASURER: TextMeasurer = new ApproximateTextMeasurer();
