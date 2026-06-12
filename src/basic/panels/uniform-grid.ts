import {
    MetaData,
    Model,
    Panel,
    Rect,
    Size,
} from '../../runtime/index.js';

// Uniform grid layout. Every cell has the same size; children fill
// cells in row-major order. Matches WPF System.Windows.Controls.Primitives.UniformGrid.
//
// DPs:
//   * Rows        — explicit row count. 0 = auto-derive from child count + Columns.
//   * Columns     — explicit column count. 0 = auto-derive from child count + Rows.
//                   When BOTH are 0 the panel picks an approximately-square grid
//                   (ceil(sqrt(count + FirstColumn)) columns).
//   * FirstColumn — how many cells in the first row to leave empty before the
//                   first child lands. Useful for calendar layouts where the
//                   first row doesn't start on Sunday/Monday. Clamped to
//                   [0, Columns-1]; out-of-range values are silently treated
//                   as 0 (matches WPF).
//
// Measure: cellSize = floor(availableSize / (Columns, Rows)); each child is
// measured against that cellSize and the panel's own DesiredSize is
// (max-child-width × Columns, max-child-height × Rows). Returning the
// max-times-count rather than sum-of-children means a grid with one tall
// child still reserves the same height for every row.
//
// Arrange: each cell sits at (col × cellW, row × cellH) inside finalSize,
// with cellW = finalSize.Width / Columns, cellH = finalSize.Height / Rows.
// Cells are filled in row-major order starting at (0, FirstColumn).
export class UniformGrid extends Panel
{
    public static readonly RowsKey = Model.RegisterProperty<number>(
        UniformGrid, 'Rows', 0, MetaData.Measure | MetaData.Arrange);

    public static readonly ColumnsKey = Model.RegisterProperty<number>(
        UniformGrid, 'Columns', 0, MetaData.Measure | MetaData.Arrange);

    public static readonly FirstColumnKey = Model.RegisterProperty<number>(
        UniformGrid, 'FirstColumn', 0, MetaData.Arrange);

    public get Rows():        number { return this.get_property_value(UniformGrid.RowsKey); }
    public set Rows(v:        number)        { this.set_property_value(UniformGrid.RowsKey, v); }
    public get Columns():     number { return this.get_property_value(UniformGrid.ColumnsKey); }
    public set Columns(v:     number)        { this.set_property_value(UniformGrid.ColumnsKey, v); }
    public get FirstColumn(): number { return this.get_property_value(UniformGrid.FirstColumnKey); }
    public set FirstColumn(v: number)        { this.set_property_value(UniformGrid.FirstColumnKey, v); }

    // Resolved dimensions cached between Measure and Arrange. The
    // resolution is identical in both passes (count is stable), but
    // caching saves a re-walk through `visualChildren` plus the
    // ceil-of-sqrt computation when both Rows and Columns are 0.
    private _resolvedRows = 0;
    private _resolvedCols = 0;

    protected override MeasureOverride(availableSize: Size): Size
    {
        const { rows, cols } = this.resolveDimensions();
        this._resolvedRows = rows;
        this._resolvedCols = cols;
        if (rows === 0 || cols === 0) return Size.Zero;

        const cellAvail = new Size(
            availableSize.Width  / cols,
            availableSize.Height / rows,
        );

        // Largest child dimensions drive the cell size we report back as
        // DesiredSize. WPF-parity: a single oversize child grows the
        // whole grid uniformly.
        let maxW = 0;
        let maxH = 0;
        for (const child of this.visualChildren)
        {
            child.Measure(cellAvail);
            const sz = child.DesiredSize;
            if (sz.Width  > maxW) maxW = sz.Width;
            if (sz.Height > maxH) maxH = sz.Height;
        }
        return new Size(maxW * cols, maxH * rows);
    }

    protected override ArrangeOverride(finalSize: Size): Size
    {
        const rows = this._resolvedRows;
        const cols = this._resolvedCols;
        if (rows === 0 || cols === 0) return finalSize;

        const cellW = finalSize.Width  / cols;
        const cellH = finalSize.Height / rows;
        const firstCol = this.clampFirstColumn(cols);

        // Row-major fill starting at (row 0, col firstCol).
        let cellIndex = firstCol;
        const maxCells = rows * cols;
        for (const child of this.visualChildren)
        {
            if (cellIndex >= maxCells) break;
            const row = Math.floor(cellIndex / cols);
            const col = cellIndex - row * cols;
            child.Arrange(new Rect(col * cellW, row * cellH, cellW, cellH));
            cellIndex++;
        }
        return finalSize;
    }

    // Pick rows/cols based on (Rows, Columns, child count, FirstColumn).
    // Mirrors WPF System.Windows.Controls.Primitives.UniformGrid.UpdateComputedValues.
    private resolveDimensions(): { rows: number; cols: number }
    {
        let rows = Math.max(0, Math.floor(this.Rows));
        let cols = Math.max(0, Math.floor(this.Columns));
        const count = this.visualChildren.length;
        const slots = count + this.clampFirstColumn(cols > 0 ? cols : Number.POSITIVE_INFINITY);

        if (rows === 0 && cols === 0)
        {
            // Both unset — square-ish layout. ceil(sqrt(slots)) cols,
            // then back-derive rows to hold the children. WPF parity.
            cols = Math.max(1, Math.ceil(Math.sqrt(slots)));
            rows = Math.max(1, Math.ceil(slots / cols));
        }
        else if (rows === 0)
        {
            rows = Math.max(1, Math.ceil(slots / cols));
        }
        else if (cols === 0)
        {
            cols = Math.max(1, Math.ceil(slots / rows));
        }
        return { rows, cols };
    }

    // Out-of-range FirstColumn (negative, >= Columns) silently clamps to 0.
    private clampFirstColumn(cols: number): number
    {
        const fc = Math.floor(this.FirstColumn);
        if (fc < 0 || fc >= cols) return 0;
        return fc;
    }
}
