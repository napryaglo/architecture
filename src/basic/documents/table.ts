import { MetaData, MuralBase, ObservableCollection, Thickness } from '../../runtime/index.js';
import { Brush } from '../../visual-engine/index.js';
import { TextElement } from './text-element.js';
import { Block, type BlockHost, BlockCollection } from './block.js';

// ─────────────────────────────────────────────────────────────────────
// Table — the grid tier of the flow-content model, the third concrete
// Block alongside Paragraph and List (the "Table is a future addition"
// slot block.ts reserved). A Table is NOT a Visual: like List it is a
// lightweight data model the hosting control (RichTextBlock / RichTextBox)
// lays out itself via block-layout.ts (see layoutTable). It stacks
// TableRows; each row holds TableCells; each cell is a BlockHost holding
// Blocks — so a cell's content composes exactly like a ListItem's
// (paragraphs, inline chips, bold, links, wrapping) with no special cases.
//
// Column widths are computed at layout time from cell content (natural
// widths, shrunk proportionally to fit a constrained width). Per-column
// alignment is NOT a Table concern: a cell aligns its own content through
// the ordinary Paragraph.TextAlignment, laid out at the column's width.

// ─────────────────────────────────────────────────────────────────────
// TableCell — one grid cell: a BlockHost holding Blocks, the exact shape
// of ListItem. A TableCell is a TableRow child, not itself a Block.
export class TableCell extends TextElement implements BlockHost
{
    private readonly _blocks: BlockCollection;

    constructor()
    {
        super();
        this._blocks = new BlockCollection(this);
    }

    public get Blocks(): BlockCollection { return this._blocks; }

    // Markup default slot — `TableCell { Paragraph {…} }`.
    public AddChild(block: Block): void { this._blocks.Add(block); }

    public onBlockTreeChanged(): void { this.invalidateTree(); }

    // A TableCell's parent is its TableRow (a BlockHost).
    protected override notifyHost(): void
    {
        (this.Parent as BlockHost | undefined)?.onBlockTreeChanged();
    }
}

// ─────────────────────────────────────────────────────────────────────
// TableRow — a horizontal band of TableCells. Like ListItem it is a row
// container, not a Block; it is a Table child. IsHeader marks the header
// band so layout can tint it (Table.HeaderBackground) — content emphasis
// (bold) is applied by the cell's own inlines, not by this flag.
export class TableRow extends TextElement implements BlockHost
{
    public static readonly IsHeaderKey = MuralBase.RegisterProperty<boolean>(
        TableRow, 'IsHeader', false, MetaData.None);

    private readonly _cells: ObservableCollection<TableCell>;

    constructor()
    {
        super();
        this._cells = new ObservableCollection<TableCell>([]);
        this._cells.Subscribe((c) =>
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

    public get IsHeader(): boolean  { return this.get_property_value(TableRow.IsHeaderKey); }
    public set IsHeader(v: boolean) { this.set_property_value(TableRow.IsHeaderKey, v); }

    public get Cells(): ObservableCollection<TableCell> { return this._cells; }

    // Markup default slot — `TableRow { TableCell {…} TableCell {…} }`.
    public AddChild(cell: TableCell): void { this._cells.Add(cell); }

    // A cell changed — bubble up as this row's own block change.
    public onBlockTreeChanged(): void { this.invalidateTree(); }

    // A TableRow's parent is its Table (a BlockHost).
    protected override notifyHost(): void
    {
        (this.Parent as BlockHost | undefined)?.onBlockTreeChanged();
    }
}

// ─────────────────────────────────────────────────────────────────────
// Table — a Block that stacks TableRows in a grid, drawing gridlines
// (BorderBrush / BorderThickness) around every cell and padding each cell
// by CellPadding. Also a BlockHost: its rows report changes to it, and it
// bubbles them up as a block change. Undefined BorderBrush ⇒ no gridlines;
// undefined HeaderBackground ⇒ no header tint.
export class Table extends Block implements BlockHost
{
    // Gridline brush. Undefined draws no gridlines (content-only table).
    public static readonly BorderBrushKey = MuralBase.RegisterProperty<Brush | undefined>(
        Table, 'BorderBrush', undefined, MetaData.None);

    // Gridline width in DIPs — also the gap reserved between/around cells.
    public static readonly BorderThicknessKey = MuralBase.RegisterProperty<number>(
        Table, 'BorderThickness', 1, MetaData.None);

    // Space inside each cell, between the gridline and the cell content.
    public static readonly CellPaddingKey = MuralBase.RegisterProperty<Thickness>(
        Table, 'CellPadding', new Thickness(8, 4, 8, 4), MetaData.None);

    // Fill painted behind rows whose IsHeader is true. Undefined ⇒ none.
    public static readonly HeaderBackgroundKey = MuralBase.RegisterProperty<Brush | undefined>(
        Table, 'HeaderBackground', undefined, MetaData.None);

    // Column-sizing mode. False (default): every column takes its natural
    // content width, shrinking proportionally only if the table overflows a
    // finite width. True: non-last columns stay natural (auto) and the LAST
    // column absorbs the remaining width (star) so the table fills its box —
    // the last column shrinks + wraps first when space is tight. Used by the
    // agent chat's markdown tables.
    public static readonly LastColumnFillsKey = MuralBase.RegisterProperty<boolean>(
        Table, 'LastColumnFills', false, MetaData.None);

    private readonly _rows: ObservableCollection<TableRow>;

    constructor()
    {
        super();
        this._rows = new ObservableCollection<TableRow>([]);
        this._rows.Subscribe((c) =>
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

    public get BorderBrush(): Brush | undefined  { return this.get_property_value(Table.BorderBrushKey); }
    public set BorderBrush(v: Brush | undefined) { this.set_property_value(Table.BorderBrushKey, v); }
    public get BorderThickness(): number  { return this.get_property_value(Table.BorderThicknessKey); }
    public set BorderThickness(v: number) { this.set_property_value(Table.BorderThicknessKey, v); }
    public get CellPadding(): Thickness  { return this.get_property_value(Table.CellPaddingKey); }
    public set CellPadding(v: Thickness) { this.set_property_value(Table.CellPaddingKey, v); }
    public get HeaderBackground(): Brush | undefined  { return this.get_property_value(Table.HeaderBackgroundKey); }
    public set HeaderBackground(v: Brush | undefined) { this.set_property_value(Table.HeaderBackgroundKey, v); }
    public get LastColumnFills(): boolean  { return this.get_property_value(Table.LastColumnFillsKey); }
    public set LastColumnFills(v: boolean) { this.set_property_value(Table.LastColumnFillsKey, v); }

    public get Rows(): ObservableCollection<TableRow> { return this._rows; }

    // Markup default slot — `Table { TableRow {…} TableRow {…} }`.
    public AddChild(row: TableRow): void { this._rows.Add(row); }

    // A row changed — bubble up as this Table's own block change.
    public onBlockTreeChanged(): void { this.invalidateTree(); }
}
