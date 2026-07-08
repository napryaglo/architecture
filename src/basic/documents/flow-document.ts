import { TextElement } from './text-element.js';
import { type Block, type BlockHost, BlockCollection } from './block.js';

// ─────────────────────────────────────────────────────────────────────
// FlowDocument — the root container of the block model and the content of
// a RichTextBlock / RichTextBox (`.Document`). It is a BlockHost that owns
// the top-level Blocks, and a TextElement so it can carry document-wide
// character-format defaults (FontFamily / FontSize / …, default undefined
// = inherit from the hosting control) that seed the whole block tree.
//
// FlowDocument is NOT itself a Block — it is the tree root. Its `Parent`
// is set to the hosting control (a BlockHost) so a content or format
// change bubbles out to trigger the control's re-measure.
export class FlowDocument extends TextElement implements BlockHost
{
    private readonly _blocks: BlockCollection;

    constructor()
    {
        super();
        this._blocks = new BlockCollection(this);
    }

    public get Blocks(): BlockCollection { return this._blocks; }

    // Markup default slot — `FlowDocument { Paragraph {…} List {…} }`.
    public AddChild(block: Block): void { this._blocks.Add(block); }

    // A child block (or nested collection) changed — bubble toward the host.
    public onBlockTreeChanged(): void { this.invalidateTree(); }

    // The document's parent is the hosting control (a BlockHost).
    protected override notifyHost(): void
    {
        (this.Parent as BlockHost | undefined)?.onBlockTreeChanged();
    }
}
