import { Block } from './block.js';
import { type Inline, type InlineHost } from './text-element.js';
import { InlineCollection } from './inline-collection.js';

// ─────────────────────────────────────────────────────────────────────
// Paragraph — the fundamental Block: a run of inline content laid out as
// wrapped lines. It is both a Block (stacked by the block host, carries
// Margin / TextAlignment / LineHeight + the inherited char format) and an
// InlineHost (owns an InlineCollection). Its inline content flattens and
// lays out through the SAME pipeline TextBlock uses — a Paragraph is,
// layout-wise, a TextBlock's worth of inlines positioned by the document.
export class Paragraph extends Block implements InlineHost
{
    private readonly _inlines: InlineCollection;

    constructor()
    {
        super();
        this._inlines = new InlineCollection(this);
    }

    public get Inlines(): InlineCollection { return this._inlines; }

    // Markup default slot — `Paragraph { "hi " Bold { "there" } }`. A bare
    // quoted string compiles to a Run (mixed-content mode); identifiers are
    // nested inline elements.
    public AddChild(child: Inline): void { this._inlines.Add(child); }

    // An inline changed — bubble up as a block change (Block.notifyHost
    // fires the owning BlockHost's onBlockTreeChanged).
    public onInlineTreeChanged(): void { this.invalidateTree(); }
}
