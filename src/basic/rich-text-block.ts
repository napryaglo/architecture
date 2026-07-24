import {
    APPROXIMATE_TEXT_MEASURER,
    Element,
    MetaData,
    Model,
    Size,
    Visual,
    type DrawingContext,
    type PointerEventArgs,
} from '../runtime/index.js';
import { Brush, FontFamily, FontStyle, FontWeight, TextDecorations } from '../visual-engine/index.js';
import { DEFAULT_FONT_FAMILY, Theme } from './theme.js';
import { FlowDocument } from './documents/flow-document.js';
import { type BlockHost } from './documents/block.js';
import { type LinkTarget, type RunProps } from './documents/text-element.js';
import { type MeasureObject, type MeasureText } from './documents/text-layout.js';
import {
    arrangeBlockObjects,
    collectEmbeddedVisuals,
    layoutBlocks,
    linkAtInBlocks,
    renderBlocks,
    resolveContext,
    type BlockLayoutResult,
} from './documents/block-layout.js';

// The first-text baseline of an embedded inline object, from its top — so
// text-layout can sit that baseline on the line baseline. Structural (no hard
// import of TextBlock / Border): a TextBlock reports `FirstBaseline`; a single-
// child container (Border) reports `TopContentInset` + `ContentChild`, so a chip
// (Border → TextBlock) composes as inset + label baseline. Undefined for an
// object with no discoverable text → the object middle-aligns.
function firstTextBaseline(v: unknown): number | undefined
{
    const leaf = v as { FirstBaseline?: unknown };
    if (typeof leaf.FirstBaseline === 'number') return leaf.FirstBaseline;
    const box = v as { TopContentInset?: unknown; ContentChild?: unknown };
    if (typeof box.TopContentInset === 'number' && box.ContentChild != null)
    {
        const inner = firstTextBaseline(box.ContentChild);
        return inner === undefined ? undefined : box.TopContentInset + inner;
    }
    return undefined;
}

// ─────────────────────────────────────────────────────────────────────
// RichTextBlock — the read-only host for a FlowDocument, the block-tier
// analog of TextBlock. Like TextBlock it is a self-drawing Element (not a
// templated Control): it flattens its Document's blocks through
// block-layout.ts, stacks the resulting boxes, paints paragraph text +
// list markers, hosts embedded InlineUIContainer visuals, and hit-tests
// Hyperlinks. Its own font DPs (inherited from ancestors, WPF-style) seed
// the document's root character format; the FlowDocument and each block
// override from there.
export class RichTextBlock extends Element implements BlockHost
{
    static
    {
        // Type-keyed default Style — `Style [TargetType=RichTextBlock]` in
        // basic.resources.mu binds Foreground / FontFamily to the theme so
        // a theme switch re-tints untemplated instances (same as TextBlock).
        Model.OverrideMetadata(RichTextBlock, Element.DefaultStyleKeyKey, { default_value: RichTextBlock });
    }

    // The document to display. The default slot for markup
    // (`RichTextBlock { FlowDocument {…} }`). Measure | Render so a swap
    // re-lays-out and repaints.
    public static readonly DocumentKey = Model.RegisterProperty<FlowDocument | undefined>(
        RichTextBlock, 'Document', undefined, MetaData.Measure | MetaData.Render);

    // Root character format — inherited so an ancestor sets it once and
    // every RichTextBlock in the subtree picks it up (WPF TextElement.*).
    public static readonly FontFamilyKey   = Model.RegisterProperty<FontFamily>(RichTextBlock, 'FontFamily', new FontFamily(DEFAULT_FONT_FAMILY), MetaData.Measure | MetaData.Render | MetaData.Inherits);
    public static readonly FontSizeKey     = Model.RegisterProperty<number>(    RichTextBlock, 'FontSize',   14,                MetaData.Measure | MetaData.Render | MetaData.Inherits);
    public static readonly FontWeightKey   = Model.RegisterProperty<FontWeight>(RichTextBlock, 'FontWeight', FontWeight.Normal, MetaData.Measure | MetaData.Render | MetaData.Inherits);
    public static readonly FontStyleKey    = Model.RegisterProperty<FontStyle>( RichTextBlock, 'FontStyle',  FontStyle.Normal,  MetaData.Measure | MetaData.Render | MetaData.Inherits);
    public static readonly TextDecorationsKey = Model.RegisterProperty<TextDecorations>(RichTextBlock, 'TextDecorations', TextDecorations.None, MetaData.Render | MetaData.Inherits);
    public static readonly ForegroundKey   = Model.RegisterProperty<Brush | undefined>(RichTextBlock, 'Foreground', undefined, MetaData.Render | MetaData.Inherits);
    public static readonly LetterSpacingKey = Model.RegisterProperty<number>(   RichTextBlock, 'LetterSpacing', 0,              MetaData.Measure | MetaData.Render | MetaData.Inherits);

    // Last block layout — kept for Arrange / Render / hit-test.
    protected _layout: BlockLayoutResult | undefined;
    // Embedded InlineUIContainer visuals hosted as this control's children.
    private _objectChildren: Visual[] = [];
    private _pressedLink: LinkTarget | undefined;

    constructor()
    {
        super();
        this.applyDefaultStyle();
    }

    public get Document(): FlowDocument | undefined { return this.get_property_value(RichTextBlock.DocumentKey); }
    public set Document(v: FlowDocument | undefined)
    {
        const old = this.get_property_value(RichTextBlock.DocumentKey) as FlowDocument | undefined;
        if (old !== undefined) old.Parent = undefined;
        if (v !== undefined) v.Parent = this;
        this.set_property_value(RichTextBlock.DocumentKey, v);
    }

    // Markup default slot — `RichTextBlock { FlowDocument {…} }`.
    public AddChild(doc: FlowDocument): void { this.Document = doc; }

    public get FontFamily(): FontFamily { return FontFamily.from(this.get_property_value(RichTextBlock.FontFamilyKey)); }
    public set FontFamily(v: FontFamily | string) { this.set_property_value(RichTextBlock.FontFamilyKey, FontFamily.from(v)); }
    public get FontSize(): number { return this.get_property_value(RichTextBlock.FontSizeKey); }
    public set FontSize(v: number) { this.set_property_value(RichTextBlock.FontSizeKey, v); }
    public get FontWeight(): FontWeight { return this.get_property_value(RichTextBlock.FontWeightKey); }
    public set FontWeight(v: FontWeight) { this.set_property_value(RichTextBlock.FontWeightKey, v); }
    public get FontStyle(): FontStyle { return this.get_property_value(RichTextBlock.FontStyleKey); }
    public set FontStyle(v: FontStyle) { this.set_property_value(RichTextBlock.FontStyleKey, v); }
    public get TextDecorations(): TextDecorations { return this.get_property_value(RichTextBlock.TextDecorationsKey); }
    public set TextDecorations(v: TextDecorations) { this.set_property_value(RichTextBlock.TextDecorationsKey, v); }
    public get Foreground(): Brush | undefined { return this.get_property_value(RichTextBlock.ForegroundKey); }
    public set Foreground(v: Brush | undefined) { this.set_property_value(RichTextBlock.ForegroundKey, v); }
    public get LetterSpacing(): number { return this.get_property_value(RichTextBlock.LetterSpacingKey); }
    public set LetterSpacing(v: number) { this.set_property_value(RichTextBlock.LetterSpacingKey, v); }

    // BlockHost — the document (and everything under it) reports content /
    // format changes here so the control re-measures and repaints.
    public onBlockTreeChanged(): void
    {
        this.InvalidateMeasure();
        this.InvalidateVisual();
    }

    // Embedded visuals are this control's visual children.
    public override get visualChildren(): readonly Visual[] { return this._objectChildren; }

    // The control's own resolved format, folded with the document's
    // overrides — the flatten root every block inherits from.
    protected baseRunProps(): RunProps
    {
        const hostBase: RunProps = {
            family:      this.FontFamily.Source,
            size:        this.FontSize,
            weight:      this.FontWeight,
            style:       this.FontStyle,
            foreground:  this.Foreground,
            decorations: this.TextDecorations,
            link:        undefined,
        };
        const doc = this.Document;
        return doc !== undefined ? resolveContext(doc, hostBase) : hostBase;
    }

    protected override MeasureOverride(availableSize: Size): Size
    {
        const doc = this.Document;
        if (doc === undefined)
        {
            if (this._objectChildren.length > 0) this.reconcileObjectChildren([]);
            this._layout = undefined;
            return Size.Zero;
        }
        if (doc.Parent !== this) doc.Parent = this;   // defensive re-wire

        const measurer = this.target?.TextMeasurer ?? APPROXIMATE_TEXT_MEASURER;
        const measureText: MeasureText = (t, p) => measurer.Measure(t, p.family, p.size, p.weight, p.style);
        const measureObject: MeasureObject = (v) =>
        {
            v.Measure(new Size(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY));
            const d = v.DesiredSize;
            // Probe the object's own first-text baseline so text-layout can sit it
            // on the line baseline (a chip's label reads level with the text, the
            // box hangs below). Undefined for objects with no text → middle-align.
            return { width: d.Width, height: d.Height, baseline: firstTextBaseline(v) };
        };

        // Attach embedded visuals BEFORE layout measures them.
        this.reconcileObjectChildren(collectEmbeddedVisuals(doc.Blocks.ToArray()));

        const wrap = Number.isFinite(availableSize.Width);
        const layout = layoutBlocks(doc.Blocks.ToArray(), {
            availableWidth: wrap ? availableSize.Width : Number.POSITIVE_INFINITY,
            base: this.baseRunProps(),
            env: { letterSpacing: this.LetterSpacing, measureText, measureObject },
        });
        this._layout = layout;
        return new Size(layout.width, layout.height);
    }

    private reconcileObjectChildren(next: Visual[]): void
    {
        for (const v of this._objectChildren) if (!next.includes(v)) this.DetachVisual(v);
        for (const v of next)
        {
            if (this._objectChildren.includes(v)) continue;
            // The embedded visual may still be parented to a PRIOR host — a
            // RichTextBlock from a torn-down view that never detached it (a
            // tab switch or a recycled ItemsControl container re-presenting
            // the same document), or a shared document hosted in two places.
            // Claim it from that stale parent before attaching, mirroring the
            // ContentPresenter re-present pattern. Without this the single-
            // parent guard in AttachVisual throws mid-Measure and, because the
            // failed pass leaves the tree measure-dirty, the layout loop
            // retries and rethrows every frame.
            v._release_from_visual_parent();
            this.AttachVisual(v);
        }
        this._objectChildren = next;
    }

    protected override ArrangeOverride(finalSize: Size): Size
    {
        if (this._layout !== undefined) arrangeBlockObjects(this._layout, 0, 0);
        return finalSize;
    }

    protected override RenderOverride(dc: DrawingContext): void
    {
        if (this._layout === undefined) return;
        renderBlocks(dc, this._layout, 0, 0, {
            letterSpacing: this.LetterSpacing,
            ink:  this.Foreground ?? Theme.ink,
            link: Theme.primary,
        });
    }

    // ── Hyperlink hit-testing (press + release over the same link) ──────
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

    private linkAt(args: PointerEventArgs): LinkTarget | undefined
    {
        const layout = this._layout;
        if (layout === undefined) return undefined;
        const o = this.absoluteOrigin();
        return linkAtInBlocks(layout, args.HostX - o.x, args.HostY - o.y);
    }

    protected absoluteOrigin(): { x: number; y: number }
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
