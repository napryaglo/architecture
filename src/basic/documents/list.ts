import { MetaData, Model, ObservableCollection } from '../../runtime/index.js';
import { TextElement } from './text-element.js';
import { Block, type BlockHost, BlockCollection } from './block.js';

// ─────────────────────────────────────────────────────────────────────
// ListMarkerStyle — the glyph/label drawn in a List's marker column.
// Unordered markers (Disc/Circle/Square) render a fixed bullet char;
// ordered markers (Decimal/…Latin/…Roman) render the 1-based item index
// formatted per the style, offset by List.StartIndex. None omits the
// marker (indent only). markerText() in block-layout.ts maps these to the
// actual string drawn.
export enum ListMarkerStyle
{
    None       = 'none',
    Disc       = 'disc',
    Circle     = 'circle',
    Square     = 'square',
    Decimal    = 'decimal',
    LowerLatin = 'lowerLatin',
    UpperLatin = 'upperLatin',
    LowerRoman = 'lowerRoman',
    UpperRoman = 'upperRoman',
}

// ─────────────────────────────────────────────────────────────────────
// ListItem — one entry of a List. A BlockHost holding Blocks (WPF-faithful:
// text must live inside a Paragraph, ListItem never holds inline text
// directly). Not itself a Block — it is a List child, like a Paragraph is
// a FlowDocument child.
export class ListItem extends TextElement implements BlockHost
{
    private readonly _blocks: BlockCollection;

    constructor()
    {
        super();
        this._blocks = new BlockCollection(this);
    }

    public get Blocks(): BlockCollection { return this._blocks; }

    // Markup default slot — `ListItem { Paragraph {…} }`.
    public AddChild(block: Block): void { this._blocks.Add(block); }

    public onBlockTreeChanged(): void { this.invalidateTree(); }

    // A ListItem's parent is its List (a BlockHost).
    protected override notifyHost(): void
    {
        (this.Parent as BlockHost | undefined)?.onBlockTreeChanged();
    }
}

// ─────────────────────────────────────────────────────────────────────
// List — a Block that stacks ListItems, each drawn with a marker in a
// reserved column and its content indented past it. A List is also a
// BlockHost: its ListItems report changes to it, and it bubbles them up as
// a block change. Nested Lists (a List inside a ListItem) indent naturally
// because each level lays its items out in the reduced content width.
export class List extends Block implements BlockHost
{
    public static readonly MarkerStyleKey = Model.RegisterProperty<ListMarkerStyle>(
        List, 'MarkerStyle', ListMarkerStyle.Disc, MetaData.None);

    // First ordinal for ordered markers (Decimal/…Latin/…Roman).
    public static readonly StartIndexKey = Model.RegisterProperty<number>(
        List, 'StartIndex', 1, MetaData.None);

    // Gap in DIPs between the marker column and the item content.
    public static readonly MarkerOffsetKey = Model.RegisterProperty<number>(
        List, 'MarkerOffset', 8, MetaData.None);

    private readonly _items: ObservableCollection<ListItem>;

    constructor()
    {
        super();
        this._items = new ObservableCollection<ListItem>([]);
        this._items.Subscribe((c) =>
        {
            switch (c.kind)
            {
                case 'inserted': for (const it of c.items) it.Parent = this; break;
                case 'removed':  for (const it of c.items) it.Parent = undefined; break;
                case 'replaced': c.oldItem.Parent = undefined; c.newItem.Parent = this; break;
                case 'cleared':  break;
                case 'moved':    break;
            }
            this.onBlockTreeChanged();
        });
    }

    public get MarkerStyle(): ListMarkerStyle  { return this.get_property_value(List.MarkerStyleKey); }
    public set MarkerStyle(v: ListMarkerStyle) { this.set_property_value(List.MarkerStyleKey, v); }
    public get StartIndex(): number  { return this.get_property_value(List.StartIndexKey); }
    public set StartIndex(v: number) { this.set_property_value(List.StartIndexKey, v); }
    public get MarkerOffset(): number  { return this.get_property_value(List.MarkerOffsetKey); }
    public set MarkerOffset(v: number) { this.set_property_value(List.MarkerOffsetKey, v); }

    public get ListItems(): ObservableCollection<ListItem> { return this._items; }

    // Markup default slot — `List { ListItem {…} ListItem {…} }`.
    public AddChild(item: ListItem): void { this._items.Add(item); }

    // A ListItem changed — bubble up as this List's own block change.
    public onBlockTreeChanged(): void { this.invalidateTree(); }
}
