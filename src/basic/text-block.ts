import {
    APPROXIMATE_TEXT_MEASURER,
    Element,
    MetaData,
    Model,
    Point,
    Size,
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

// Per-line horizontal alignment WITHIN the block. Left (default) is the
// historic shape — every line starts at x=0. Center and Right shift each
// line by `(RenderSize.Width - lineWidth) * factor` so a TextBlock that
// receives a slot wider than its natural content (HorizontalAlignment =
// Stretch under a wide parent) centers / right-aligns its glyphs inside
// that slot. Justify is intentionally omitted — it needs variable
// inter-word spacing the FormattedText surface doesn't support.
export enum TextAlignment
{
    Left   = 'Left',
    Center = 'Center',
    Right  = 'Right',
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
export class TextBlock extends Element
{
    static
    {
        // Type-keyed default Style lookup — `Style [TargetType=TextBlock]`
        // in basic.resources.mu binds Foreground / FontFamily to the
        // active theme tokens via DynamicResource so a theme switch
        // re-tints every untemplated TextBlock without consumers having
        // to set Foreground=@OnSurface on every instance.
        Model.OverrideMetadata(TextBlock, Element.DefaultStyleKeyKey, { default_value: TextBlock });
    }

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
    public static readonly TextWrappingKey  = Model.RegisterProperty<TextWrapping>( TextBlock, 'TextWrapping',  TextWrapping.NoWrap, MetaData.Measure | MetaData.Render);
    // TextAlignment is render-only — moving the text within the block
    // doesn't change the block's DesiredSize, and the runtime applies
    // the per-line x offset inside RenderOverride.
    public static readonly TextAlignmentKey = Model.RegisterProperty<TextAlignment>(TextBlock, 'TextAlignment', TextAlignment.Left,  MetaData.Render);
    // LineHeight — explicit per-line vertical spacing in DIPs. NaN
    // (default) defers to the measurer's per-line Height (font ascent +
    // descent), preserving the historic "lines pack as close as the
    // font says" behaviour. A finite value overrides — typography
    // tokens like @BodyMedium set 20 here to lock in M3's "14pt body
    // with 20px line-height" pairing without hand-rolling per-line
    // arithmetic in templates.
    //
    // Inherits so the same value flows from an ancestor (e.g. a Page
    // root with `LineHeight=24`) to every descendant TextBlock without
    // re-stamping on each one.
    public static readonly LineHeightKey    = Model.RegisterProperty<number>(       TextBlock, 'LineHeight',    Number.NaN,          MetaData.Measure | MetaData.Render | MetaData.Inherits);
    // LetterSpacing — extra space between glyphs, in DIPs. M3 typography
    // tokens spec this as `tracking` (e.g. @BodyMedium tracking = 0.25,
    // @LabelLarge tracking = 0.1). Render-only — the value rides through
    // FormattedText to the renderer's `letter-spacing` attribute but is
    // NOT factored into measure. M3 tracking values stay under ±0.5 DIP
    // so wrapping inaccuracy is sub-pixel; honouring it in measure
    // would need a measurer-signature change and isn't worth it for
    // this scale.
    //
    // Inherits so the typography role's tracking flows down a subtree
    // alongside FontSize / LineHeight in the same per-role setter block.
    public static readonly LetterSpacingKey = Model.RegisterProperty<number>(       TextBlock, 'LetterSpacing', 0,                   MetaData.Render | MetaData.Inherits);

    // Lines computed by MeasureOverride when TextWrapping = Wrap. Each
    // entry holds the substring and the measurer-reported metrics for
    // that line — RenderOverride emits one DrawText per line at a y
    // offset of `i * Metrics.Height`. For NoWrap a single entry covers
    // the whole text, falling through to the historic single-line path.
    private _lines: Array<{ text: string; metrics: TextMetrics }> = [];

    constructor(text?: string)
    {
        super();
        // Eager default-Style resolution so Foreground / FontFamily
        // bindings to the active theme are in place before the first
        // paint — same pattern as MenuSeparator / StatusBarSeparator.
        // Falls through silently when no theme is active (tests,
        // bootstrap-before-Application.initialize); a later
        // _refresh_styles_subtree on attach picks it up then.
        this.applyDefaultStyle();
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

    public get TextAlignment(): TextAlignment { return this.get_property_value(TextBlock.TextAlignmentKey); }
    public set TextAlignment(value: TextAlignment) { this.set_property_value(TextBlock.TextAlignmentKey, value); }

    public get LineHeight(): number { return this.get_property_value(TextBlock.LineHeightKey); }
    public set LineHeight(value: number) { this.set_property_value(TextBlock.LineHeightKey, value); }

    public get LetterSpacing(): number { return this.get_property_value(TextBlock.LetterSpacingKey); }
    public set LetterSpacing(value: number) { this.set_property_value(TextBlock.LetterSpacingKey, value); }

    // Effective line-stride in DIPs. Explicit LineHeight wins; falls
    // back to the measurer's per-line height (font ascent + descent).
    // Used by both Measure (to size the block when wrapping pushes
    // multiple lines) and Render (to position line `i` at y = i * stride).
    private effectiveLineHeight(measuredHeight: number): number
    {
        const lh = this.LineHeight;
        return Number.isFinite(lh) && lh > 0 ? lh : measuredHeight;
    }

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
            // Effective height honours an explicit LineHeight — a 14pt
            // typography token paired with `LineHeight=20` (M3 BodyMedium)
            // should report a 20px-tall block, not a 17px-tall font hull.
            return new Size(metrics.Width, this.effectiveLineHeight(metrics.Height));
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
        // ascent per line for baseline placement. Effective line-stride
        // honours an explicit LineHeight DP override.
        const maxW = lines.reduce((m, l) => Math.max(m, l.metrics.Width), 0);
        const lineH = this.effectiveLineHeight(lines[0]!.metrics.Height);
        const totalH = lineH * lines.length;
        return new Size(maxW, totalH);
    }

    protected override RenderOverride(dc: DrawingContext): void
    {
        // Foreground rides the default `Style[TargetType=TextBlock]`
        // setter (Foreground = @OnSurface via DynamicResource) once a
        // theme is active — a theme switch re-tints live through that
        // path. The `?? Theme.ink` tail catches the no-Application
        // case (test harnesses constructing a TextBlock with no
        // active palette): Theme.ink falls through to the NEUTRAL
        // marker brush so the render produces a visible glyph rather
        // than the SVG renderer's hardcoded black.
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
                this.LetterSpacing,
            );
            dc.DrawText(formatted, Point.Zero);
            return;
        }

        // One DrawText per line. Each line's y offset is `i * lineHeight`
        // — single shared line height keeps the layout uniform even
        // when per-line measurements vary slightly under approximate
        // measurers. Per-line metrics still ride along on the
        // FormattedText so SvgDrawingContext gets the right Ascent.
        // effectiveLineHeight honours an explicit LineHeight DP override.
        const lineH = this.effectiveLineHeight(this._lines[0]!.metrics.Height);

        // Per-line horizontal alignment factor:
        //   Left   → 0   (no shift)
        //   Center → 0.5 (half of slack on each side)
        //   Right  → 1   (all slack on the left)
        // Slack = RenderSize.Width - lineWidth. Negative slack (RenderSize
        // narrower than the line) clamps to 0 — the line still starts at
        // x=0 and is allowed to overflow the slot, matching WPF.
        const align = this.TextAlignment;
        const factor = align === TextAlignment.Center ? 0.5
                     : align === TextAlignment.Right  ? 1
                     : 0;
        const slotW = this.RenderSize.Width;
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
                this.LetterSpacing,
            );
            // Origin is this Visual's local (offsetX, i * lineHeight) — the
            // arranged-rect offset is applied by Visual.Arrange + the
            // renderer tree walk, so we only need the in-block offsets
            // here.
            const offsetX = factor === 0
                ? 0
                : Math.max(0, (slotW - line.metrics.Width) * factor);
            dc.DrawText(formatted, new Point(offsetX, i * lineH));
        }
    }
}
