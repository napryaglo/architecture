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

// Default font stack: matches what modern OSes ship with — falls back
// through system-ui (the OS UI font), then generic sans-serif as a last
// resort. Lives at module scope so changing it is one place.
const DEFAULT_FONT_FAMILY = 'system-ui, sans-serif';

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
    static {
        Model.RegisterProperty(TextBlock, 'Text',       '',                  MetaData.Measure);
        Model.RegisterProperty(TextBlock, 'FontFamily', DEFAULT_FONT_FAMILY, MetaData.Measure | MetaData.Inherits);
        Model.RegisterProperty(TextBlock, 'FontSize',   14,                  MetaData.Measure | MetaData.Inherits);
        Model.RegisterProperty(TextBlock, 'FontWeight', FontWeight.Normal,   MetaData.Measure | MetaData.Inherits);
        Model.RegisterProperty(TextBlock, 'FontStyle',  FontStyle.Normal,    MetaData.Measure | MetaData.Inherits);
        Model.RegisterProperty(TextBlock, 'Foreground', undefined,           MetaData.Render  | MetaData.Inherits);
    }

    // Cached metrics from the most recent MeasureOverride. Reused by
    // RenderOverride so we don't double-measure (and so SvgDrawingContext
    // can use the real Ascent for baseline placement).
    private _metrics: TextMetrics | undefined;

    constructor(text?: string)
    {
        super();
        if (text !== undefined) this.Text = text;
    }

    public get Text(): string { return this.get_property_value('Text'); }
    public set Text(value: string) { this.set_property_value('Text', value); }

    public get FontFamily(): string { return this.get_property_value('FontFamily'); }
    public set FontFamily(value: string) { this.set_property_value('FontFamily', value); }

    public get FontSize(): number { return this.get_property_value('FontSize'); }
    public set FontSize(value: number) { this.set_property_value('FontSize', value); }

    public get FontWeight(): FontWeight { return this.get_property_value('FontWeight'); }
    public set FontWeight(value: FontWeight) { this.set_property_value('FontWeight', value); }

    public get FontStyle(): FontStyle { return this.get_property_value('FontStyle'); }
    public set FontStyle(value: FontStyle) { this.set_property_value('FontStyle', value); }

    public get Foreground(): Brush | undefined { return this.get_property_value('Foreground'); }
    public set Foreground(value: Brush | undefined) { this.set_property_value('Foreground', value); }

    protected override MeasureOverride(_availableSize: Size): Size
    {
        const text = this.Text;
        if (text === '')
        {
            this._metrics = undefined;
            return Size.Zero;
        }
        // Defer to the host's TextMeasurer when there is one (so a
        // FontMetricsMeasurer with a loaded font gives real per-glyph
        // widths and proper Ascent / Descent). Falls back to the shared
        // ApproximateTextMeasurer when there's no host (unattached
        // Visual being measured in isolation, common in tests).
        const measurer = this.target?.TextMeasurer ?? APPROXIMATE_TEXT_MEASURER;
        const metrics = measurer.Measure(
            text,
            this.FontFamily,
            this.FontSize,
            this.FontWeight,
            this.FontStyle,
        );
        this._metrics = metrics;
        return new Size(metrics.Width, metrics.Height);
    }

    protected override RenderOverride(dc: DrawingContext): void
    {
        const text = this.Text;
        if (text === '') return;
        const formatted = new FormattedText(
            text,
            this.FontFamily,
            this.FontSize,
            this.Foreground,
            this.FontWeight,
            this.FontStyle,
            this._metrics,  // baseline for SVG comes from Metrics.Ascent
        );
        // Origin is this Visual's local (0, 0) — alignment + arranged
        // offset are applied by Visual.Arrange + HeadlessTarget's tree
        // walk, so RenderOverride just emits at the local origin.
        dc.DrawText(formatted, Point.Zero);
    }
}
