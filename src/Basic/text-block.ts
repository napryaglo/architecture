import {
    APPROXIMATE_TEXT_MEASURER,
    MetaData,
    Model,
    Point,
    Size,
    Visual,
    type DrawingContext,
    type TextMetrics,
} from '../runtime/index.js';
import { Brush, FontStyle, FontWeight, FormattedText } from '../visual-engine/index.js';
import { DEFAULT_FONT_FAMILY, Theme } from './theme.js';

// Mirrors WPF's TextWrapping enum. NoWrap (default) keeps the historic
// single-line behaviour — text overflows the host width when too long.
// Wrap drives MeasureOverride to greedy-fit lines into availableSize.Width
// and RenderOverride to emit one DrawText per line at line-spaced y
// offsets.
export enum TextWrapping
{
    NoWrap = 'NoWrap',
    Wrap   = 'Wrap',
}

// Renders a single run of text. The simplest concrete Visual that's
// actually visible — exercises MeasureOverride (text dimensions),
// RenderOverride (dc.DrawText), property inheritance (font properties
// cascade from ancestors), and FormattedText composition.
//
// Properties:
//   * Text       — the string to render (default '')
//   * FontFamily — CSS-style font stack, inherited (default system-ui)
//   * FontSize   — in DIPs, inherited (default 14)
//   * FontWeight — Normal | Bold, inherited (default Normal)
//   * FontStyle  — Normal | Italic, inherited (default Normal)
//   * Foreground — Brush for fill, inherited (default undefined → black)
//
// MetaData.Inherits on the font properties means an ancestor can set
// them once (via the cross-class explicit-owner overload) and every
// TextBlock in the subtree picks them up — that's the WPF
// "TextElement.FontSize on a Window" pattern.
export class TextBlock extends Visual
{
    // Each of these changes the painted glyph stream, so both Measure
    // (size changes with content / weight / size) AND Render (we must
    // repaint to show the new pixels) are needed. The renderer's
    // incremental update only re-emits primitives for render-dirty
    // visuals — without the Render flag a bound Text update would
    // re-layout but the on-screen text would stay stale until something
    // else dirtied this visual.
    public static readonly TextKey         = Model.RegisterProperty<string>(    TextBlock, 'Text',       '',                  MetaData.Measure | MetaData.Render);
    public static readonly FontFamilyKey   = Model.RegisterProperty<string>(    TextBlock, 'FontFamily', DEFAULT_FONT_FAMILY, MetaData.Measure | MetaData.Render | MetaData.Inherits);
    public static readonly FontSizeKey     = Model.RegisterProperty<number>(    TextBlock, 'FontSize',   14,                  MetaData.Measure | MetaData.Render | MetaData.Inherits);
    public static readonly FontWeightKey   = Model.RegisterProperty<FontWeight>(TextBlock, 'FontWeight', FontWeight.Normal,   MetaData.Measure | MetaData.Render | MetaData.Inherits);
    public static readonly FontStyleKey    = Model.RegisterProperty<FontStyle>( TextBlock, 'FontStyle',  FontStyle.Normal,    MetaData.Measure | MetaData.Render | MetaData.Inherits);
    public static readonly ForegroundKey   = Model.RegisterProperty<Brush | undefined>(TextBlock, 'Foreground',   undefined,           MetaData.Render  | MetaData.Inherits);
    public static readonly TextWrappingKey = Model.RegisterProperty<TextWrapping>(TextBlock, 'TextWrapping', TextWrapping.NoWrap, MetaData.Measure | MetaData.Render);

    // Lines computed by MeasureOverride when TextWrapping = Wrap. Each
    // entry holds the substring and the measurer-reported metrics for
    // that line — RenderOverride emits one DrawText per line at a y
    // offset of `i * Metrics.Height`. For NoWrap a single entry covers
    // the whole text, falling through to the historic single-line path.
    private _lines: Array<{ text: string; metrics: TextMetrics }> = [];

    constructor(text?: string)
    {
        super();
        if (text !== undefined) this.Text = text;
    }

    public get Text(): string { return this.get_property_value(TextBlock.TextKey); }
    public set Text(value: string) { this.set_property_value(TextBlock.TextKey, value); }

    public get FontFamily(): string { return this.get_property_value(TextBlock.FontFamilyKey); }
    public set FontFamily(value: string) { this.set_property_value(TextBlock.FontFamilyKey, value); }

    public get FontSize(): number { return this.get_property_value(TextBlock.FontSizeKey); }
    public set FontSize(value: number) { this.set_property_value(TextBlock.FontSizeKey, value); }

    public get FontWeight(): FontWeight { return this.get_property_value(TextBlock.FontWeightKey); }
    public set FontWeight(value: FontWeight) { this.set_property_value(TextBlock.FontWeightKey, value); }

    public get FontStyle(): FontStyle { return this.get_property_value(TextBlock.FontStyleKey); }
    public set FontStyle(value: FontStyle) { this.set_property_value(TextBlock.FontStyleKey, value); }

    public get Foreground(): Brush | undefined { return this.get_property_value(TextBlock.ForegroundKey); }
    public set Foreground(value: Brush | undefined) { this.set_property_value(TextBlock.ForegroundKey, value); }

    public get TextWrapping(): TextWrapping { return this.get_property_value(TextBlock.TextWrappingKey); }
    public set TextWrapping(value: TextWrapping) { this.set_property_value(TextBlock.TextWrappingKey, value); }

    protected override MeasureOverride(availableSize: Size): Size
    {
        const text = this.Text;
        if (text === '')
        {
            this._lines = [];
            return Size.Zero;
        }
        // Defer to the host's TextMeasurer when there is one (so a
        // FontMetricsMeasurer with a loaded font gives real per-glyph
        // widths and proper Ascent / Descent). Falls back to the shared
        // ApproximateTextMeasurer when there's no host (unattached
        // Visual being measured in isolation, common in tests).
        const measurer = this.target?.TextMeasurer ?? APPROXIMATE_TEXT_MEASURER;

        // NoWrap (or unbounded available width — typical of being placed
        // in a StackPanel etc.) preserves the historic single-line path.
        if (this.TextWrapping !== TextWrapping.Wrap
            || !Number.isFinite(availableSize.Width))
        {
            const metrics = measurer.Measure(
                text, this.FontFamily, this.FontSize, this.FontWeight, this.FontStyle);
            this._lines = [{ text, metrics }];
            return new Size(metrics.Width, metrics.Height);
        }

        // Wrap: greedy word-wrap. Splits on whitespace, accumulates
        // words into a line until adding the next one would exceed
        // availableSize.Width, then commits the line and starts a new
        // one. A single word wider than the limit goes on its own line
        // (intentionally overflowing — partial-word breaking / hyphen
        // splitting is out of scope for v0).
        const lines: Array<{ text: string; metrics: TextMetrics }> = [];
        const measureLine = (s: string): TextMetrics => measurer.Measure(
            s, this.FontFamily, this.FontSize, this.FontWeight, this.FontStyle);
        let current = '';
        let currentMetrics: TextMetrics | undefined;
        const flush = (): void => {
            if (current === '') return;
            lines.push({ text: current, metrics: currentMetrics ?? measureLine(current) });
            current = '';
            currentMetrics = undefined;
        };

        // Split on any whitespace run; the split values are the words.
        // Trailing whitespace between words collapses to a single space
        // in the rendered line (matches HTML text-rendering defaults).
        const words = text.split(/\s+/).filter(w => w.length > 0);
        for (const word of words)
        {
            const candidate = current === '' ? word : current + ' ' + word;
            const candidateMetrics = measureLine(candidate);
            if (candidateMetrics.Width <= availableSize.Width || current === '')
            {
                current = candidate;
                currentMetrics = candidateMetrics;
            }
            else
            {
                flush();
                current = word;
                currentMetrics = measureLine(word);
            }
        }
        flush();

        this._lines = lines;
        // Surface-side metric: max line width × stacked height. Per-line
        // metrics live on each `_lines` entry; render uses the right
        // ascent per line for baseline placement.
        const maxW = lines.reduce((m, l) => Math.max(m, l.metrics.Width), 0);
        const lineH = lines[0]!.metrics.Height;
        const totalH = lineH * lines.length;
        return new Size(maxW, totalH);
    }

    protected override RenderOverride(dc: DrawingContext): void
    {
        // When Foreground hasn't been explicitly set (DP default is
        // undefined and no ancestor's inheritance landed a value), fall
        // back to the active palette's OnSurface ink rather than the
        // SVG renderer's hardcoded rgb(0,0,0). In dark mode the
        // renderer fallback paints black-on-dark text — unreadable.
        // Reading Theme.ink at render time means a theme swap re-paints
        // the next time the visual is render-dirty.
        const fg = this.Foreground ?? Theme.ink;

        // Fallback for callers that Render without a prior Measure
        // (test harnesses, ad-hoc DC drives) — emit the raw Text as a
        // single line with no metrics so FormattedText falls back to
        // its built-in baseline approximation.
        if (this._lines.length === 0)
        {
            const text = this.Text;
            if (text === '') return;
            const formatted = new FormattedText(
                text,
                this.FontFamily,
                this.FontSize,
                fg,
                this.FontWeight,
                this.FontStyle,
                undefined,
            );
            dc.DrawText(formatted, Point.Zero);
            return;
        }

        // One DrawText per line. Each line's y offset is `i * lineHeight`
        // — single shared line height keeps the layout uniform even
        // when per-line measurements vary slightly under approximate
        // measurers. Per-line metrics still ride along on the
        // FormattedText so SvgDrawingContext gets the right Ascent.
        const lineH = this._lines[0]!.metrics.Height;
        for (let i = 0; i < this._lines.length; i++)
        {
            const line = this._lines[i]!;
            const formatted = new FormattedText(
                line.text,
                this.FontFamily,
                this.FontSize,
                fg,
                this.FontWeight,
                this.FontStyle,
                line.metrics,
            );
            // Origin is this Visual's local (0, 0) for the first line —
            // alignment + arranged offset are applied by Visual.Arrange
            // + the renderer tree walk. Subsequent lines step down by
            // one shared line height.
            dc.DrawText(formatted, new Point(0, i * lineH));
        }
    }
}
