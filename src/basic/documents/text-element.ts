import { MetaData, Model, type PropertyDescriptor } from '../../runtime/index.js';
import { Brush, FontFamily, FontStyle, FontWeight, TextDecorations } from '../../visual-engine/index.js';

// ─────────────────────────────────────────────────────────────────────
// TextElement — the WPF-analog base of the flow-content object model.
// A TextElement is NOT a Visual: it has no Measure/Arrange/Render of its
// own. It is a lightweight data model of formatted text that the hosting
// control (TextBlock today; FlowDocument/RichTextBox later) flattens into
// styled runs and lays out itself.
//
// TextElement carries the *inheritable* character-format properties.
// Their default is `undefined`, meaning "inherit from the parent element
// (an ancestor Span, ultimately the hosting TextBlock)". The flatten step
// resolves an effective value by carrying an inherited-property context
// down the tree — `undefined` keeps the ancestor's value, a set value
// overrides it for the subtree. This replaces DP inheritance, which walks
// the VISUAL tree that inlines are deliberately not part of.
//
// `Block` (Paragraph/List/Table for FlowDocument) will extend TextElement
// alongside `Inline`; introduced now so the editing tier slots in without
// reworking the hierarchy.

// Common marker for anything that hosts flow content and wants to be told
// when its content subtree changes — an InlineHost (Span / TextBlock) or a
// BlockHost (FlowDocument / ListItem / RichText host). TextElement.Parent
// is typed as this base; each subtree (Inline vs Block) dispatches the
// concrete notification in its own `notifyHost`. Kept as an interface so
// the content model in `documents/` never imports a view-layer control.
export interface ContentHost {}

// The host an inline reports tree changes to (a parent Span, or the
// TextBlock at the root).
export interface InlineHost extends ContentHost
{
    onInlineTreeChanged(): void;
}

// An activatable target a run belongs to (a Hyperlink). Stored on the
// resolved run context so the layout / hit-test path stays decoupled from
// the Hyperlink class — the fragment just knows "clicking me activates
// this" and "paint me as a link".
export interface LinkTarget
{
    activate(): void;
}

// The resolved (fully-inherited) character format for one flattened run —
// the mural analog of WPF's TextRunProperties. Every field is concrete
// (no `undefined` inherit sentinels): the flatten carries a base context
// from the hosting TextBlock and each Span overrides it for its subtree.
export interface RunProps
{
    family:      string;
    size:        number;
    weight:      FontWeight;
    style:       FontStyle;
    foreground:  Brush | undefined;
    decorations: TextDecorations;
    // Non-undefined when this run sits inside a Hyperlink — drives link
    // chrome + click activation.
    link:        LinkTarget | undefined;
}

export abstract class TextElement extends Model
{
    // Inheritable character-format DPs. `undefined` = inherit. FontFamily
    // tolerates a raw string (theme token / CSS stack) like TextBlock does.
    public static readonly FontFamilyKey = Model.RegisterProperty<FontFamily | string | undefined>(
        TextElement, 'FontFamily', undefined, MetaData.None);
    public static readonly FontSizeKey   = Model.RegisterProperty<number | undefined>(
        TextElement, 'FontSize', undefined, MetaData.None);
    public static readonly FontWeightKey = Model.RegisterProperty<FontWeight | undefined>(
        TextElement, 'FontWeight', undefined, MetaData.None);
    public static readonly FontStyleKey  = Model.RegisterProperty<FontStyle | undefined>(
        TextElement, 'FontStyle', undefined, MetaData.None);
    public static readonly ForegroundKey = Model.RegisterProperty<Brush | undefined>(
        TextElement, 'Foreground', undefined, MetaData.None);

    // Parent in the flow-content tree — for an Inline, a Span or the
    // hosting TextBlock; for a Block, its FlowDocument / ListItem. Set by
    // the owning collection on add / cleared on remove. Used to bubble tree
    // changes up to the host for re-measure, and (later) to map a character
    // offset back to its source element for editing / hit-test.
    public Parent: ContentHost | undefined;

    public get FontFamily(): FontFamily | string | undefined { return this.get_property_value(TextElement.FontFamilyKey); }
    public set FontFamily(v: FontFamily | string | undefined) { this.set_property_value(TextElement.FontFamilyKey, v); }
    public get FontSize(): number | undefined  { return this.get_property_value(TextElement.FontSizeKey); }
    public set FontSize(v: number | undefined) { this.set_property_value(TextElement.FontSizeKey, v); }
    public get FontWeight(): FontWeight | undefined  { return this.get_property_value(TextElement.FontWeightKey); }
    public set FontWeight(v: FontWeight | undefined) { this.set_property_value(TextElement.FontWeightKey, v); }
    public get FontStyle(): FontStyle | undefined  { return this.get_property_value(TextElement.FontStyleKey); }
    public set FontStyle(v: FontStyle | undefined) { this.set_property_value(TextElement.FontStyleKey, v); }
    public get Foreground(): Brush | undefined  { return this.get_property_value(TextElement.ForegroundKey); }
    public set Foreground(v: Brush | undefined) { this.set_property_value(TextElement.ForegroundKey, v); }

    // Any format-affecting property change bubbles to the host so the
    // TextBlock re-measures / re-renders.
    protected override OnPropertyChanged(d: PropertyDescriptor, o: unknown, n: unknown): void
    {
        super.OnPropertyChanged(d, o, n);
        this.invalidateTree();
    }

    /** Bubble a "the content tree changed" signal toward the hosting
     *  control. Spans forward it up their own parent chain. Each subtree
     *  (Inline vs Block) knows the concrete host-callback to fire. */
    protected invalidateTree(): void
    {
        this.notifyHost();
    }

    /** Fire the host notification appropriate to this element's tree —
     *  `onInlineTreeChanged` for inlines, `onBlockTreeChanged` for blocks. */
    protected abstract notifyHost(): void;
}

// ─────────────────────────────────────────────────────────────────────
// Inline — flow content that participates in a line of text. Adds
// TextDecorations, which — unlike the font properties — ACCUMULATE rather
// than inherit: a run's effective decorations are the union of its own
// and every ancestor inline's (so an Underline span underlines all its
// content while a nested Bold keeps that underline).
export abstract class Inline extends TextElement
{
    public static readonly TextDecorationsKey = Model.RegisterProperty<TextDecorations>(
        Inline, 'TextDecorations', TextDecorations.None, MetaData.None);

    public get TextDecorations(): TextDecorations  { return this.get_property_value(Inline.TextDecorationsKey); }
    public set TextDecorations(v: TextDecorations) { this.set_property_value(Inline.TextDecorationsKey, v); }

    // An inline's parent is always an InlineHost (a Span or the TextBlock).
    protected override notifyHost(): void
    {
        (this.Parent as InlineHost | undefined)?.onInlineTreeChanged();
    }

    // Hook for inlines that contribute more than their plain DP overrides
    // to the flatten context (Hyperlink: link target + link chrome).
    // Called by the flatten AFTER the element's own font DPs have been
    // folded into `ctx`. Default: nothing extra.
    public applyToContext(_ctx: RunProps): void {}
}
