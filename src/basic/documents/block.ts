import { MetaData, Model, ObservableCollection, Thickness } from '../../runtime/index.js';
import { TextAlignment } from '../../visual-engine/index.js';
import { TextElement, type ContentHost } from './text-element.js';

// ─────────────────────────────────────────────────────────────────────
// Block — the paragraph-level tier of the flow-content model, sibling of
// Inline under TextElement. A Block is NOT a Visual: like Inline it is a
// lightweight data model that the hosting control (RichTextBlock /
// RichTextBox) stacks and lays out itself (see block-layout.ts). Blocks
// carry the inheritable character-format DPs from TextElement (so a
// Paragraph can set FontSize once for all its runs) plus block-level
// paragraph format: Margin, TextAlignment, LineHeight.
//
// Concrete blocks: Paragraph (holds Inlines), List (holds ListItems).
// Section / Table / BlockUIContainer are future additions.

// The host a block reports tree changes to — a FlowDocument or a ListItem
// (both BlockHosts), ultimately the RichText host that re-measures.
export interface BlockHost extends ContentHost
{
    onBlockTreeChanged(): void;
}

export abstract class Block extends TextElement
{
    // Space reserved around the block, between it and its siblings /
    // container. Vertical margins stack (no WPF-style collapsing for now).
    public static readonly MarginKey = Model.RegisterProperty<Thickness>(
        Block, 'Margin', Thickness.Zero, MetaData.None);

    // Per-block horizontal alignment of its lines. Inherited default sense
    // is Left; a block may override for itself.
    public static readonly TextAlignmentKey = Model.RegisterProperty<TextAlignment>(
        Block, 'TextAlignment', TextAlignment.Left, MetaData.None);

    // Explicit line box height for the block's lines; NaN / <= 0 → natural
    // (ascent + descent). Matches the LayoutOptions.lineHeight contract.
    public static readonly LineHeightKey = Model.RegisterProperty<number>(
        Block, 'LineHeight', Number.NaN, MetaData.None);

    public get Margin(): Thickness  { return this.get_property_value(Block.MarginKey); }
    public set Margin(v: Thickness) { this.set_property_value(Block.MarginKey, v); }
    public get TextAlignment(): TextAlignment  { return this.get_property_value(Block.TextAlignmentKey); }
    public set TextAlignment(v: TextAlignment) { this.set_property_value(Block.TextAlignmentKey, v); }
    public get LineHeight(): number  { return this.get_property_value(Block.LineHeightKey); }
    public set LineHeight(v: number) { this.set_property_value(Block.LineHeightKey, v); }

    // A block's parent is always a BlockHost (FlowDocument / ListItem).
    protected override notifyHost(): void
    {
        (this.Parent as BlockHost | undefined)?.onBlockTreeChanged();
    }
}

// ─────────────────────────────────────────────────────────────────────
// BlockCollection — the ordered blocks of a FlowDocument or ListItem. The
// block-tier analog of InlineCollection: on every mutation it fixes up
// each child's Parent back-pointer and notifies the owning host so the
// RichText control re-measures.
export class BlockCollection extends ObservableCollection<Block>
{
    constructor(private readonly owner: BlockHost)
    {
        super([]);
        this.Subscribe((c) =>
        {
            switch (c.kind)
            {
                case 'inserted': for (const it of c.items) it.Parent = this.owner; break;
                case 'removed':  for (const it of c.items) it.Parent = undefined; break;
                case 'replaced': c.oldItem.Parent = undefined; c.newItem.Parent = this.owner; break;
                case 'cleared':  /* items already detached logically */ break;
                case 'moved':    break;
            }
            this.owner.onBlockTreeChanged();
        });
    }
}
