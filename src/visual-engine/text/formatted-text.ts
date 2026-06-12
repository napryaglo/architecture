import type { TextMetrics } from '../../runtime/index.js';
import type { Brush } from '../drawing/brush.js';

// Boldness of a glyph. Normal (400) / Medium (500) / Bold (700) cover
// the three weights M3 typography roles call out — Title and Label
// tiers spec Medium, everything else spec Normal or Bold. Numeric
// values are CSS-valid `font-weight` strings; SVG renderers emit them
// verbatim as the `font-weight` attribute.
export enum FontWeight
{
    Normal = 'normal',
    Medium = '500',
    Bold   = 'bold',
}

// Italic vs upright. Same shape as WPF FontStyles.
export enum FontStyle
{
    Normal = 'normal',
    Italic = 'italic',
}

// A snapshot of laid-out text ready to be rendered. NOT a Model — it's
// an immutable value built by a Visual's OnRender from its own
// properties (FontFamily, FontSize, …) and handed to
// DrawingContext.DrawText.
//
// Foreground is optional — undefined lets the renderer fall back to its
// default (black for SVG). Concrete Visuals (TextBlock, Run, …) decide
// whether to pass through `undefined` or supply an explicit default.
export class FormattedText
{
    public readonly Text: string;
    public readonly FontFamily: string;
    public readonly FontSize: number;
    public readonly Foreground: Brush | undefined;
    public readonly FontWeight: FontWeight;
    public readonly FontStyle: FontStyle;
    // Pre-computed metrics from the measurer that sized this text
    // during MeasureOverride. Renderers use Metrics.Ascent for proper
    // baseline placement (SVG y = origin.Y + Ascent). Optional — when
    // undefined, renderers fall back to an approximation based on
    // FontSize.
    public readonly Metrics: TextMetrics | undefined;
    // Extra space between adjacent glyphs, in DIPs. M3 typography
    // tokens spec this as `tracking` (e.g. DisplayLarge = -0.25,
    // LabelLarge = 0.1). Defaults to 0 (browser default kerning).
    // Renderers emit `letter-spacing` on the SVG `<text>` element when
    // non-zero. Note: not factored into Metrics.Width, so wrapping
    // ignores it — fine for the small M3 tracking values, would need
    // measurer integration for larger values.
    public readonly LetterSpacing: number;

    constructor(
        text: string,
        fontFamily: string,
        fontSize: number,
        foreground: Brush | undefined,
        fontWeight: FontWeight = FontWeight.Normal,
        fontStyle: FontStyle = FontStyle.Normal,
        metrics?: TextMetrics,
        letterSpacing: number = 0,
    )
    {
        this.Text = text;
        this.FontFamily = fontFamily;
        this.FontSize = fontSize;
        this.Foreground = foreground;
        this.FontWeight = fontWeight;
        this.FontStyle = fontStyle;
        this.Metrics = metrics;
        this.LetterSpacing = letterSpacing;
    }
}
