import {
    APPROXIMATE_TEXT_MEASURER,
    Element,
    MetaData,
    MuralBase,
    Point,
    Size,
    Visual,
    type DrawingContext,
    type PointerEventArgs,
    type TextMetrics,
} from '../runtime/index.js';
import { Brush, FontFamily, FontStyle, FontWeight, FormattedText, TextAlignment, TextDecorations, VerticalAlignment } from '../visual-engine/index.js';
import { DEFAULT_FONT_FAMILY, Theme } from './theme.js';
import { Inline, type InlineHost, type LinkTarget, type RunProps } from './documents/text-element.js';
import { InlineCollection } from './documents/inline-collection.js';
import {
    arrangeObjectVisuals,
    flattenInlines,
    layoutInlines,
    linkAtInLayout,
    renderLayout,
    type LayoutResult,
    type MeasureObject,
    type MeasureText,
} from './documents/text-layout.js';

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

// How a single-line (NoWrap) TextBlock handles text wider than its available
// width. None (default) keeps the historic behaviour — the text overflows /
// is hard-clipped by the host. CharacterEllipsis truncates the text to the
// widest character prefix that fits with a trailing '…' appended. Only applies
// on the NoWrap path with a finite available width; ignored when wrapping.
export enum TextTrimming
{
    None              = 'None',
    CharacterEllipsis = 'CharacterEllipsis',
}

// TextAlignment moved to visual-engine (next to FontWeight / TextDecorations)
// so the documents/ Block tier can share it without importing a Visual.
// Re-exported here for back-compat with `import { TextAlignment } from
// './text-block.js'` and the basic barrel.
export { TextAlignment };

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

// How a TextBlock measures its glyph advance widths.
//
// Fast (default) uses the host's primary TextMeasurer — a Canvas 2D
// `measureText` on HtmlTarget — which is synchronous and side-effect-free,
// so a TextBox can re-measure every keystroke cheaply.
//
// Exact routes the WIDTH through the host's ExactTextMeasurer — an offscreen
// SVG `<text>` on HtmlTarget — which is the same engine the renderer paints
// with, so a size-to-content control (a Chip pill, a Button) fits its label
// with no sub-pixel gap between the measured width and the painted glyphs.
// Canvas measureText and SVG <text> disagree by a fraction of a pixel per
// glyph, and by different amounts across Chromium builds (a standalone
// browser vs Electron's bundled Chromium) — Exact closes that gap so chip
// chrome adjusts identically in both. It costs a hidden SVG layout pass per
// measure, so it's opt-in and reserved for static, size-to-text chrome —
// never live-edited text. Vertical metrics (ascent / descent / ink) stay on
// the Fast measurer either way; only the horizontal advance switches.
//
// Inherited (like FontSize / LetterSpacing) so a styled control — e.g. the
// Chip Style — can set it once and have it flow into the label TextBlock the
// consumer nests as content.
export enum MeasurementFidelity
{
    Fast  = 'Fast',
    Exact = 'Exact',
}

export class TextBlock extends Element implements InlineHost
{
    static
    {
        // Type-keyed default Style lookup — `Style [TargetType=TextBlock]`
        // in basic.resources.mu binds Foreground / FontFamily to the
        // active theme tokens via DynamicResource so a theme switch
        // re-tints every untemplated TextBlock without consumers having
        // to set Foreground=@OnSurface on every instance.
        MuralBase.OverrideMetadata(TextBlock, Element.DefaultStyleKeyKey, { default_value: TextBlock });
    }

    // Each of these changes the painted glyph stream, so both Measure
    // (size changes with content / weight / size) AND Render (we must
    // repaint to show the new pixels) are needed. The renderer's
    // incremental update only re-emits primitives for render-dirty
    // visuals — without the Render flag a bound Text update would
    // re-layout but the on-screen text would stay stale until something
    // else dirtied this visual.
    public static readonly TextKey         = MuralBase.RegisterProperty<string>(    TextBlock, 'Text',       '',                  MetaData.Measure | MetaData.Render);
    public static readonly FontFamilyKey   = MuralBase.RegisterProperty<FontFamily>(TextBlock, 'FontFamily', new FontFamily(DEFAULT_FONT_FAMILY), MetaData.Measure | MetaData.Render | MetaData.Inherits);
    public static readonly FontSizeKey     = MuralBase.RegisterProperty<number>(    TextBlock, 'FontSize',   14,                  MetaData.Measure | MetaData.Render | MetaData.Inherits);
    public static readonly FontWeightKey   = MuralBase.RegisterProperty<FontWeight>(TextBlock, 'FontWeight', FontWeight.Normal,   MetaData.Measure | MetaData.Render | MetaData.Inherits);
    public static readonly FontStyleKey    = MuralBase.RegisterProperty<FontStyle>( TextBlock, 'FontStyle',  FontStyle.Normal,    MetaData.Measure | MetaData.Render | MetaData.Inherits);
    // Line embellishments (underline / strikethrough / overline). A
    // combinable flag set — inherited like the other font properties so a
    // TextDecorations set on a container underlines its whole subtree.
    // Render-only: decorations sit on top of the laid-out glyphs and don't
    // change metrics.
    public static readonly TextDecorationsKey = MuralBase.RegisterProperty<TextDecorations>(TextBlock, 'TextDecorations', TextDecorations.None, MetaData.Render | MetaData.Inherits);
    public static readonly ForegroundKey   = MuralBase.RegisterProperty<Brush | undefined>(TextBlock, 'Foreground',   undefined,           MetaData.Render  | MetaData.Inherits);
    public static readonly TextWrappingKey  = MuralBase.RegisterProperty<TextWrapping>( TextBlock, 'TextWrapping',  TextWrapping.NoWrap, MetaData.Measure | MetaData.Render);
    // TextTrimming — single-line ellipsis. CharacterEllipsis truncates NoWrap
    // text to the widest '…'-terminated prefix that fits the available width.
    // Measure | Render: it changes both the stored line (the measured width) and
    // the painted glyph stream.
    public static readonly TextTrimmingKey  = MuralBase.RegisterProperty<TextTrimming>( TextBlock, 'TextTrimming',  TextTrimming.None,   MetaData.Measure | MetaData.Render);
    // TextAlignment is render-only — moving the text within the block
    // doesn't change the block's DesiredSize, and the runtime applies
    // the per-line x offset inside RenderOverride.
    public static readonly TextAlignmentKey = MuralBase.RegisterProperty<TextAlignment>(TextBlock, 'TextAlignment', TextAlignment.Left,  MetaData.Render);
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
    public static readonly LineHeightKey    = MuralBase.RegisterProperty<number>(       TextBlock, 'LineHeight',    Number.NaN,          MetaData.Measure | MetaData.Render | MetaData.Inherits);
    // LetterSpacing — extra space between glyphs, in DIPs. M3 typography
    // tokens spec this as `tracking` (e.g. @BodyMedium tracking = 0.25,
    // @LabelLarge tracking = 0.1). The value rides through FormattedText
    // to the renderer's `letter-spacing` attribute AND is folded into
    // MeasureOverride's advance (base + spacing × glyphCount). Both are
    // required: measure alone would size the block without the paint's
    // spacing; render alone (the historic behaviour) made a wrapped line
    // paint wider than the block was sized, so the last word before a wrap
    // overhung the right edge — small per glyph but ~18px over a 45-char
    // tooltip line, not the "sub-pixel" it was once assumed to be.
    //
    // Measure | Render so a tracking change re-measures (widths shift) and
    // repaints. Inherits so the typography role's tracking flows down a
    // subtree alongside FontSize / LineHeight in the same per-role setter block.
    public static readonly LetterSpacingKey = MuralBase.RegisterProperty<number>(       TextBlock, 'LetterSpacing', 0,                   MetaData.Measure | MetaData.Render | MetaData.Inherits);
    // MeasurementFidelity — Fast (Canvas) vs Exact (paint-engine SVG) width
    // measurement. Measure-only (fidelity changes the measured width, not the
    // painted pixels — render already uses the SVG path). Inherits so a styled
    // control sets it once and it flows into nested label content, exactly
    // like FontSize / LetterSpacing above.
    public static readonly MeasurementFidelityKey = MuralBase.RegisterProperty<MeasurementFidelity>(TextBlock, 'MeasurementFidelity', MeasurementFidelity.Fast, MetaData.Measure | MetaData.Inherits);

    // Lines computed by MeasureOverride when TextWrapping = Wrap. Each
    // entry holds the substring and the measurer-reported metrics for
    // that line — RenderOverride emits one DrawText per line at a y
    // offset of `i * Metrics.Height`. For NoWrap a single entry covers
    // the whole text, falling through to the historic single-line path.
    private _lines: Array<{ text: string; metrics: TextMetrics }> = [];

    // First laid-out line's baseline, measured from the block's TOP: the y an
    // adjacent inline (an embedded code chip) should sit its OWN text baseline on
    // so the two read on one line. 0 before measure / when empty. Accounts for
    // the half-leading an explicit LineHeight adds above the first line. Read by
    // a text host (RichTextBlock) to baseline-align embedded objects.
    public get FirstBaseline(): number
    {
        const m = this._lines[0]?.metrics;
        if (m === undefined) return 0;
        const halfLeading = Math.max(0, (this.effectiveLineHeight(m.Height) - m.Height) / 2);
        return halfLeading + m.Ascent;
    }

    // ── Inline content model (WPF Inlines analog) ───────────────────
    // Lazily created. When non-empty, the flatten → line-layout pipeline
    // replaces the Text-only fast path: `Inlines` is the content (Text is
    // ignored for layout, matching WPF). Text-only TextBlocks never touch
    // any of this — the whole styled-run path is additive.
    private _inlines: InlineCollection | undefined;
    // Last inline layout, kept for RenderOverride + ArrangeOverride.
    private _inlineLayout: LayoutResult | undefined;
    // Embedded-visual children from InlineUIContainers, currently attached
    // as this TextBlock's visual children so the renderer walks them.
    private _objectChildren: Visual[] = [];

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

    // The inline content (WPF's TextBlock.Inlines). Lazily created; adding
    // to it switches this TextBlock onto the styled-run layout path. When
    // empty, the plain Text path is used unchanged.
    public get Inlines(): InlineCollection
    {
        if (this._inlines === undefined) this._inlines = new InlineCollection(this);
        return this._inlines;
    }

    /** True when styled inline content drives layout (vs. plain Text). */
    private get hasInlines(): boolean { return this._inlines !== undefined && this._inlines.Count > 0; }

    // InlineHost — the inline tree bubbles content/format changes here.
    public onInlineTreeChanged(): void
    {
        this.InvalidateMeasure();
        this.InvalidateVisual();
    }

    // Markup default-slot target: `TextBlock { "hi" Bold{…} }` lowers to
    // `.Inlines.Add(child)` for inline children (text nodes → Run). A
    // string still flows through the Text property for the plain case.
    public AddChild(child: Inline): void { this.Inlines.Add(child); }

    // Embedded InlineUIContainer visuals are this TextBlock's visual
    // children so the renderer walks + paints them at their arranged slots.
    public override get visualChildren(): readonly Visual[] { return this._objectChildren; }

    // FontFamily DP — typed FontFamily but tolerant of string-valued
    // theme tokens (`@FontFamily` / `@BodyLargeFont` resolve to CSS
    // strings via DynamicResource). The getter normalizes either form to
    // a FontFamily (WPF's TypeConverter behaviour); the setter coerces so
    // `tb.FontFamily = "Inter"` works programmatically too.
    public get FontFamily(): FontFamily { return FontFamily.from(this.get_property_value(TextBlock.FontFamilyKey)); }
    public set FontFamily(value: FontFamily | string) { this.set_property_value(TextBlock.FontFamilyKey, FontFamily.from(value)); }

    public get FontSize(): number { return this.get_property_value(TextBlock.FontSizeKey); }
    public set FontSize(value: number) { this.set_property_value(TextBlock.FontSizeKey, value); }

    public get FontWeight(): FontWeight { return this.get_property_value(TextBlock.FontWeightKey); }
    public set FontWeight(value: FontWeight) { this.set_property_value(TextBlock.FontWeightKey, value); }

    public get FontStyle(): FontStyle { return this.get_property_value(TextBlock.FontStyleKey); }
    public set FontStyle(value: FontStyle) { this.set_property_value(TextBlock.FontStyleKey, value); }

    public get TextDecorations(): TextDecorations { return this.get_property_value(TextBlock.TextDecorationsKey); }
    public set TextDecorations(value: TextDecorations) { this.set_property_value(TextBlock.TextDecorationsKey, value); }

    public get Foreground(): Brush | undefined { return this.get_property_value(TextBlock.ForegroundKey); }
    public set Foreground(value: Brush | undefined) { this.set_property_value(TextBlock.ForegroundKey, value); }

    public get TextWrapping(): TextWrapping { return this.get_property_value(TextBlock.TextWrappingKey); }
    public set TextWrapping(value: TextWrapping) { this.set_property_value(TextBlock.TextWrappingKey, value); }

    public get TextTrimming(): TextTrimming { return this.get_property_value(TextBlock.TextTrimmingKey); }
    public set TextTrimming(value: TextTrimming) { this.set_property_value(TextBlock.TextTrimmingKey, value); }

    public get TextAlignment(): TextAlignment { return this.get_property_value(TextBlock.TextAlignmentKey); }
    public set TextAlignment(value: TextAlignment) { this.set_property_value(TextBlock.TextAlignmentKey, value); }

    public get LineHeight(): number { return this.get_property_value(TextBlock.LineHeightKey); }
    public set LineHeight(value: number) { this.set_property_value(TextBlock.LineHeightKey, value); }

    public get LetterSpacing(): number { return this.get_property_value(TextBlock.LetterSpacingKey); }
    public set LetterSpacing(value: number) { this.set_property_value(TextBlock.LetterSpacingKey, value); }

    public get MeasurementFidelity(): MeasurementFidelity { return this.get_property_value(TextBlock.MeasurementFidelityKey); }
    public set MeasurementFidelity(value: MeasurementFidelity) { this.set_property_value(TextBlock.MeasurementFidelityKey, value); }

    // Effective line-stride in DIPs. Explicit LineHeight wins; falls
    // back to the measurer's per-line height (font ascent + descent).
    // Used by both Measure (to size the block when wrapping pushes
    // multiple lines) and Render (to position line `i` at y = i * stride).
    private effectiveLineHeight(measuredHeight: number): number
    {
        const lh = this.LineHeight;
        return Number.isFinite(lh) && lh > 0 ? lh : measuredHeight;
    }

    // Widest '…'-terminated character prefix of `text` whose advance fits
    // `maxWidth`. Binary search over the code-point count (Array.from so a
    // surrogate pair counts as one glyph). Returns just '…' when not even the
    // first character fits — never the empty string, so the trim is always
    // visible. Used only on the NoWrap CharacterEllipsis path.
    private ellipsize(
        text: string,
        maxWidth: number,
        measure: (s: string) => TextMetrics,
        advance: (s: string, base: number) => number,
    ): string
    {
        const ELLIPSIS = '…';
        const chars = Array.from(text);
        const fits = (n: number): boolean => {
            const s = chars.slice(0, n).join('') + ELLIPSIS;
            return advance(s, measure(s).Width) <= maxWidth;
        };
        let best = 0;
        let lo = 0;
        let hi = chars.length;
        while (lo <= hi)
        {
            const mid = (lo + hi) >> 1;
            if (fits(mid)) { best = mid; lo = mid + 1; }
            else { hi = mid - 1; }
        }
        return chars.slice(0, best).join('') + ELLIPSIS;
    }

    protected override MeasureOverride(availableSize: Size): Size
    {
        // Styled-inline path — flatten the content tree and run the
        // multi-run line layout. Text-only TextBlocks fall through to the
        // historic fast path below.
        if (this.hasInlines) return this.measureInlines(availableSize);

        // Left inline mode (Inlines emptied) — release any embedded
        // visuals and drop the stale layout so we don't paint/host them.
        if (this._objectChildren.length > 0) this.reconcileObjectChildren([]);
        this._inlineLayout = undefined;

        // Defensive coercion of undefined → '' for the case where a
        // binding pushes undefined through (typical: ContentControl's
        // DataTemplate binds Text to a source property that's
        // momentarily undefined during a content swap). The DP itself
        // is typed `string`, but the binding pipeline can deliver
        // undefined transiently — and the measurer's Array.from(text)
        // throws on undefined.
        const text = this.Text ?? '';
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

        // Fold LetterSpacing into the measured advance so measure agrees
        // with render. The renderer emits `letter-spacing` on the SVG
        // <text>, which the browser adds after every glyph — so a line's
        // rendered width is `base + spacing × glyphCount`. The measurer
        // reports only `base`. If measure ignored spacing (as it used to),
        // the block sized to `base` while the paint drew `base + N×spacing`
        // wider, so the last word before a wrap hung past the block's right
        // edge (a tooltip line at BodySmall tracking 0.4px over ~45 chars =
        // ~18px of overhang — well past sub-pixel). Counting all glyphs
        // (including the trailing one) matches the renderer, and never
        // under-provisions. Code-point count via Array.from mirrors the
        // measurer's own glyph counting (surrogate pairs = one glyph).
        const spacing = this.LetterSpacing;
        const advance = (s: string, base: number): number =>
            spacing === 0 ? base : base + spacing * Array.from(s).length;

        // When MeasurementFidelity = Exact and the host offers a paint-engine
        // measurer (HtmlTarget's offscreen SVG), take the WIDTH from it so the
        // measured advance matches what the SVG renderer paints — see the
        // MeasurementFidelity docblock. Vertical metrics (ascent / descent /
        // ink) stay on the primary measurer, so ink-centring and line stacking
        // are byte-identical; only the horizontal base width is reconciled.
        const exactMeasurer = this.MeasurementFidelity === MeasurementFidelity.Exact
            ? this.target?.ExactTextMeasurer
            : undefined;
        const measureText = (s: string): TextMetrics =>
        {
            const m = measurer.Measure(s, this.FontFamily.Source, this.FontSize, this.FontWeight, this.FontStyle);
            if (exactMeasurer === undefined) return m;
            const exactWidth = exactMeasurer.Measure(
                s, this.FontFamily.Source, this.FontSize, this.FontWeight, this.FontStyle).Width;
            return { ...m, Width: exactWidth };
        };

        // NoWrap (or unbounded available width — typical of being placed
        // in a StackPanel etc.) preserves the historic single-line path.
        if (this.TextWrapping !== TextWrapping.Wrap
            || !Number.isFinite(availableSize.Width))
        {
            const metrics = measureText(text);
            // CharacterEllipsis: when the text is wider than a finite available
            // width, truncate it to the widest '…'-terminated prefix that fits and
            // measure THAT — so the block sizes to the clamped line and the paint
            // shows the ellipsis instead of overflowing / hard-clipping.
            if (this.TextTrimming === TextTrimming.CharacterEllipsis
                && Number.isFinite(availableSize.Width)
                && advance(text, metrics.Width) > availableSize.Width)
            {
                const trimmed = this.ellipsize(text, availableSize.Width, measureText, advance);
                const trimmedMetrics = measureText(trimmed);
                this._lines = [{ text: trimmed, metrics: trimmedMetrics }];
                return new Size(advance(trimmed, trimmedMetrics.Width), this.effectiveLineHeight(trimmedMetrics.Height));
            }
            this._lines = [{ text, metrics }];
            // Effective height honours an explicit LineHeight — a 14pt
            // typography token paired with `LineHeight=20` (M3 BodyMedium)
            // should report a 20px-tall block, not a 17px-tall font hull.
            return new Size(advance(text, metrics.Width), this.effectiveLineHeight(metrics.Height));
        }

        // Wrap: greedy word-wrap. Splits on whitespace, accumulates
        // words into a line until adding the next one would exceed
        // availableSize.Width, then commits the line and starts a new
        // one. A single word wider than the limit goes on its own line
        // (intentionally overflowing — partial-word breaking / hyphen
        // splitting is out of scope for v0).
        const lines: Array<{ text: string; metrics: TextMetrics }> = [];
        const measureLine = (s: string): TextMetrics => measureText(s);
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
            // Compare the letter-spacing-inclusive advance against the
            // budget so a line that fits here also fits when painted.
            if (advance(candidate, candidateMetrics.Width) <= availableSize.Width || current === '')
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
        const maxW = lines.reduce((m, l) => Math.max(m, advance(l.text, l.metrics.Width)), 0);
        const lineH = this.effectiveLineHeight(lines[0]!.metrics.Height);
        const totalH = lineH * lines.length;
        return new Size(maxW, totalH);
    }

    protected override RenderOverride(dc: DrawingContext): void
    {
        if (this._inlineLayout !== undefined && this.hasInlines)
        {
            this.renderInlines(dc);
            return;
        }

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
                this.FontFamily.Source,
                this.FontSize,
                fg,
                this.FontWeight,
                this.FontStyle,
                undefined,
                this.LetterSpacing,
                this.TextDecorations,
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
        const slotW = this.RenderSize.Width;
        // Justify draws each line's words individually with widened gaps —
        // handled in its own path since it can't be expressed as a single
        // per-line offset.
        if (align === TextAlignment.Justify && Number.isFinite(slotW))
        {
            this.renderJustifiedLines(dc, fg, slotW, lineH);
            return;
        }
        const factor = align === TextAlignment.Center ? 0.5
                     : align === TextAlignment.Right  ? 1
                     : 0;
        // Optical vertical centring: nudge the baseline so the painted INK sits
        // at the box centre (see inkCenterOffsetY).
        const inkY = this.inkCenterOffsetY();
        for (let i = 0; i < this._lines.length; i++)
        {
            const line = this._lines[i]!;
            const formatted = new FormattedText(
                line.text,
                this.FontFamily.Source,
                this.FontSize,
                fg,
                this.FontWeight,
                this.FontStyle,
                line.metrics,
                this.LetterSpacing,
                this.TextDecorations,
            );
            // Origin is this Visual's local (offsetX, i * lineHeight) — the
            // arranged-rect offset is applied by Visual.Arrange + the
            // renderer tree walk, so we only need the in-block offsets
            // here.
            const offsetX = factor === 0
                ? 0
                : Math.max(0, (slotW - line.metrics.Width) * factor);
            dc.DrawText(formatted, new Point(offsetX, i * lineH + inkY));
        }
    }

    // Vertical nudge (DIPs) that seats the painted INK at the render box's
    // centre, instead of the font LINE box. The line box (Ascent + Descent) is
    // per-font and deliberately content-stable for line stacking, but it's
    // vertically asymmetric relative to the glyphs actually drawn — so a plain
    // box-centred single-line label (e.g. next to a status dot) rides above or
    // below the icon's centre. Using the measurer's tight ink bounds, this
    // re-centres the ink when the block is explicitly VerticalAlignment=Center.
    //
    // Scoped narrowly on purpose: only single-line, only when centred, only when
    // the measurer supplies ink bounds (the browser canvas does; the approximate
    // measurer doesn't → returns 0). Line stacking and non-centred text are never
    // touched, so this can't shift existing multi-line or top-aligned layouts.
    private inkCenterOffsetY(): number
    {
        if (this.VerticalAlignment !== VerticalAlignment.Center) return 0;
        if (this._lines.length !== 1) return 0;
        const m = this._lines[0]!.metrics;
        if (m.InkAscent === undefined || m.InkDescent === undefined) return 0;
        // Baseline sits at m.Ascent from the box top; ink spans
        // [Ascent - InkAscent, Ascent + InkDescent]. Shift so its centre lands on
        // the render box's vertical centre.
        const inkCenter = m.Ascent + (m.InkDescent - m.InkAscent) / 2;
        return this.RenderSize.Height / 2 - inkCenter;
    }

    // Justify the plain Text path: every line except the last has its
    // inter-word gaps widened so both edges meet the slot. A single-word
    // line, the last line, or a line already at/over the slot draws left.
    private renderJustifiedLines(dc: DrawingContext, fg: Brush, slotW: number, lineH: number): void
    {
        const measurer = this.target?.TextMeasurer ?? APPROXIMATE_TEXT_MEASURER;
        const ls = this.LetterSpacing;
        const measure = (s: string): { m: TextMetrics; w: number } =>
        {
            const m = measurer.Measure(s, this.FontFamily.Source, this.FontSize, this.FontWeight, this.FontStyle);
            return { m, w: ls === 0 ? m.Width : m.Width + ls * [...s].length };
        };
        const spaceW = measure(' ').w;
        for (let i = 0; i < this._lines.length; i++)
        {
            const line   = this._lines[i]!;
            const y      = i * lineH;
            const isLast = i === this._lines.length - 1;
            const words  = line.text.split(' ').filter(w => w.length > 0);
            if (!isLast && words.length >= 2)
            {
                const measured  = words.map(measure);
                const wordsW    = measured.reduce((s, x) => s + x.w, 0);
                const gaps      = words.length - 1;
                const naturalW  = wordsW + gaps * spaceW;
                const extra     = slotW - naturalW;
                if (extra > 0)
                {
                    const perGap = spaceW + extra / gaps;
                    let x = 0;
                    for (let wi = 0; wi < words.length; wi++)
                    {
                        const { m, w } = measured[wi]!;
                        const formatted = new FormattedText(
                            words[wi]!, this.FontFamily.Source, this.FontSize, fg,
                            this.FontWeight, this.FontStyle, m, ls, this.TextDecorations,
                        );
                        dc.DrawText(formatted, new Point(x, y));
                        x += w + perGap;
                    }
                    continue;
                }
            }
            // Last line / single word / no slack → draw the whole line left.
            const formatted = new FormattedText(
                line.text, this.FontFamily.Source, this.FontSize, fg,
                this.FontWeight, this.FontStyle, line.metrics, ls, this.TextDecorations,
            );
            dc.DrawText(formatted, new Point(0, y));
        }
    }

    // ── Styled-inline layout ────────────────────────────────────────

    // The hosting TextBlock's own resolved format — the flatten's root
    // context that every inline inherits from / overrides.
    private baseRunProps(): RunProps
    {
        return {
            family:      this.FontFamily.Source,
            size:        this.FontSize,
            weight:      this.FontWeight,
            style:       this.FontStyle,
            foreground:  this.Foreground,
            decorations: this.TextDecorations,
            link:        undefined,
        };
    }

    private measureInlines(availableSize: Size): Size
    {
        const measurer = this.target?.TextMeasurer ?? APPROXIMATE_TEXT_MEASURER;
        const items = flattenInlines(this._inlines!.ToArray(), this.baseRunProps());

        // Attach embedded visuals BEFORE measuring so they carry this
        // TextBlock's host target while they measure/render.
        const nextObjects: Visual[] = [];
        for (const it of items) if (it.kind === 'object') nextObjects.push(it.visual);
        this.reconcileObjectChildren(nextObjects);

        const measureText: MeasureText = (t, p) =>
            measurer.Measure(t, p.family, p.size, p.weight, p.style);
        const measureObject: MeasureObject = (v) =>
        {
            v.Measure(new Size(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY));
            const d = v.DesiredSize;
            return { width: d.Width, height: d.Height };
        };

        const wrap = this.TextWrapping === TextWrapping.Wrap && Number.isFinite(availableSize.Width);
        const layout = layoutInlines(items, {
            availableWidth: wrap ? availableSize.Width : Number.POSITIVE_INFINITY,
            wrap,
            letterSpacing: this.LetterSpacing,
            lineHeight:    this.LineHeight,
            measureText,
            measureObject,
            align:         this.TextAlignment,
        });
        this._inlineLayout = layout;
        this._lines = [];   // keep the Text-path cache clear
        return new Size(layout.width, layout.height);
    }

    // Attach newly-present embedded visuals, detach removed ones, so
    // `visualChildren` (and the renderer walk) tracks the live set.
    private reconcileObjectChildren(next: Visual[]): void
    {
        for (const v of this._objectChildren) if (!next.includes(v)) this.DetachVisual(v);
        for (const v of next) if (!this._objectChildren.includes(v)) this.AttachVisual(v);
        this._objectChildren = next;
    }

    protected override ArrangeOverride(finalSize: Size): Size
    {
        if (this._inlineLayout !== undefined && this.hasInlines)
        {
            const align  = this.TextAlignment;
            const factor = align === TextAlignment.Center ? 0.5
                         : align === TextAlignment.Right  ? 1 : 0;
            for (const line of this._inlineLayout.lines)
                line.shift = factor === 0 ? 0 : Math.max(0, (finalSize.Width - line.width) * factor);
            arrangeObjectVisuals(this._inlineLayout, 0, 0);
        }
        return finalSize;
    }

    private renderInlines(dc: DrawingContext): void
    {
        renderLayout(dc, this._inlineLayout!, {
            originX: 0, originY: 0,
            letterSpacing: this.LetterSpacing,
            ink:  Theme.ink,
            link: Theme.primary,
        });
    }

    // ── Hyperlink hit-testing ───────────────────────────────────────
    // A press that starts over a link and releases over the SAME link
    // activates it (WPF's on-mouse-up-inside semantics). Only engaged
    // when the content actually contains link runs, so a plain TextBlock
    // stays inert.
    private _pressedLink: LinkTarget | undefined;

    protected override OnPointerDown(args: PointerEventArgs): void
    {
        super.OnPointerDown(args);
        this._pressedLink = this.linkAt(args);
    }

    protected override OnPointerUp(args: PointerEventArgs): void
    {
        super.OnPointerUp(args);
        const pressed = this._pressedLink;
        this._pressedLink = undefined;
        if (pressed !== undefined && this.linkAt(args) === pressed) pressed.activate();
    }

    // Resolve the link (if any) under a pointer event, in this Visual's
    // local coordinates (host coords minus this TextBlock's absolute origin).
    private linkAt(args: PointerEventArgs): LinkTarget | undefined
    {
        const layout = this._inlineLayout;
        if (layout === undefined || !this.hasInlines) return undefined;
        const o = this.absoluteOrigin();
        return linkAtInLayout(layout, args.HostX - o.x, args.HostY - o.y);
    }

    private absoluteOrigin(): { x: number; y: number }
    {
        let x = 0, y = 0;
        let cur: Visual | undefined = this;
        while (cur !== undefined)
        {
            x += cur.ArrangedRect.X;
            y += cur.ArrangedRect.Y;
            cur = cur.GetVisualParent();
        }
        return { x, y };
    }
}
