import type { TextMetrics } from '../runtime/index.js';
import type { Brush } from './brush.js';

// Boldness of a glyph. v1 keeps the WPF FontWeights set tight — just
// the two values that have first-class SVG / CSS keywords. Numeric
// weights (100–900) can layer on later as a separate type.
export enum FontWeight
{
    Normal = 'normal',
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

    constructor(
        text: string,
        fontFamily: string,
        fontSize: number,
        foreground: Brush | undefined,
        fontWeight: FontWeight = FontWeight.Normal,
        fontStyle: FontStyle = FontStyle.Normal,
        metrics?: TextMetrics,
    )
    {
        this.Text = text;
        this.FontFamily = fontFamily;
        this.FontSize = fontSize;
        this.Foreground = foreground;
        this.FontWeight = fontWeight;
        this.FontStyle = fontStyle;
        this.Metrics = metrics;
    }
}
