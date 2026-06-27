import {
    Color,
    MetaData,
    Model,
    ObservableCollection,
    Panel,
    Point,
    Rect,
    Size,
    Visual,
    type VisualHost,
} from '../../runtime/index.js';
import {
    DashStyle,
    type DrawingContext,
    Pen,
    SolidColorBrush,
} from '../../visual-engine/drawing/index.js';
import { LineGeometry } from '../../visual-engine/geometry/geometry.js';
import { registryFor } from './shared-size-group.js';

// WPF Grid panel: a 2D layout with explicit row / column definitions,
// each definition sized in one of three modes — pixel, auto, or star.
//
//   * Pixel (`new GridLength(120)`)         — exact size in pixels.
//   * Auto  (`GridLength.Auto`)              — derived from child desired sizes.
//   * Star  (`new GridLength(1, GridUnitType.Star)`)    — splits leftover space
//     proportionally with other Star tracks.
//
// Children declare their cell via the `Grid.Row` / `Grid.Column`
// attached properties (default 0 / 0). Multi-cell spans use
// `Grid.RowSpan` / `Grid.ColumnSpan` (default 1).
//
// Layout algorithm:
//
//   Measure
//   1. Allocate pixel tracks immediately to their declared size.
//   2. Measure children that span only Auto tracks (single-cell or
//      multi-cell entirely within Auto). Their desired size feeds into
//      the auto-track size: per-track size = max of single-cell child
//      desired sizes; multi-cell children's contribution is distributed
//      among their spanned auto tracks after subtracting pre-resolved
//      tracks.
//   3. Distribute remaining available size among Star tracks
//      proportionally to their stars (1*, 2*, 3* → split as 1:2:3).
//   4. Measure children that touch a Star track with the resolved
//      track sizes so the child knows its full available rect.
//
//   Arrange — every child placed at (sum of preceding column widths,
//   sum of preceding row heights) and sized to (sum of spanned widths,
//   sum of spanned heights).
//
// Version scope (see src/document/grid.md § 0 for the full table):
//   * Grid v1 — pixel / auto / star tracks, Row/ColumnSpan, four-pass
//     measure, prefix-sum arrange, empty-definitions fallback to a
//     single 1* track.
//   * Grid v2.1 (extends v1) — MinWidth/MaxWidth on ColumnDefinition
//     + MinHeight/MaxHeight on RowDefinition. Pixel clamps inline;
//     Auto clamps inline + a Min-floor sweep; Star clamps via an
//     iterative redistribution loop bounded to nStars iterations.
//   * Grid v2.2 (this implementation extends v2.1) — SharedSizeGroup
//     on Row/ColumnDefinition. Auto tracks across multiple Grids on
//     the same presentation target coordinate by name; each member
//     resolves to the max contribution across the group. See
//     shared-size-group.ts and grid.md § 7. Member-set invalidation
//     when the group max changes; converges in 1-2 layout passes.
//   * Grid v3 (this implementation extends v2.2) — ShowGridLines debug
//     rendering (boolean DP + GridLinesBrush; dashed internal column +
//     row separators in RenderOverride); star-track-keep-alive policy
//     in Pass 2.6 of MeasureOverride (proportional Auto shrinkage when
//     Auto over-request would otherwise zero every Star). See § 14.1 +
//     § 14.2 in completed-backlog.md.

export enum GridUnitType
{
    Pixel = 'pixel',
    Auto  = 'auto',
    Star  = 'star',
}

// GridLength — value type representing one track's sizing rule.
// `value` carries pixel size (Pixel) or star weight (Star); for Auto
// the value is ignored.
export class GridLength
{
    public static readonly Auto: GridLength = new GridLength(0, GridUnitType.Auto);
    // `*` — proportional fill. Single-star (weight=1) is the markup
    // default; consumers wanting heavier weights still construct
    // `new GridLength(2, GridUnitType.Star)` etc. in JS. The static lets `.mu`
    // templates write `Width=GridLength.Star` without inline construction.
    public static readonly Star: GridLength = new GridLength(1, GridUnitType.Star);

    public constructor(
        public readonly Value: number,
        public readonly UnitType: GridUnitType = GridUnitType.Pixel,
    ) {}

    public get IsPixel(): boolean { return this.UnitType === GridUnitType.Pixel; }
    public get IsAuto():  boolean { return this.UnitType === GridUnitType.Auto; }
    public get IsStar():  boolean { return this.UnitType === GridUnitType.Star; }
}

class TrackDefinition extends Model
{
    public static readonly WidthKey = Model.RegisterProperty<GridLength>(
        TrackDefinition, 'Width',  new GridLength(1, GridUnitType.Star),
        MetaData.Measure | MetaData.Arrange);

    public static readonly HeightKey = Model.RegisterProperty<GridLength>(
        TrackDefinition, 'Height', new GridLength(1, GridUnitType.Star),
        MetaData.Measure | MetaData.Arrange);
}

export class ColumnDefinition extends TrackDefinition
{
    public static readonly MinWidthKey = Model.RegisterProperty<number>(
        ColumnDefinition, 'MinWidth', 0,
        MetaData.Measure | MetaData.Arrange);

    public static readonly MaxWidthKey = Model.RegisterProperty<number>(
        ColumnDefinition, 'MaxWidth', Number.POSITIVE_INFINITY,
        MetaData.Measure | MetaData.Arrange);

    // Auto-track coordination across multiple Grids on the same
    // presentation target. See src/Controls/shared-size-group.ts and
    // grid.md § 0 / § 7 for the full semantics. Only Auto tracks
    // participate — Pixel and Star tracks ignore this DP even when set.
    public static readonly SharedSizeGroupKey = Model.RegisterProperty<string | undefined>(
        ColumnDefinition, 'SharedSizeGroup', undefined,
        MetaData.Measure | MetaData.Arrange);

    public get Width():    GridLength { return this.get_property_value(TrackDefinition.WidthKey); }
    public set Width(v:    GridLength) { this.set_property_value(TrackDefinition.WidthKey, v); }
    public get MinWidth(): number     { return this.get_property_value(ColumnDefinition.MinWidthKey); }
    public set MinWidth(v: number)    { this.set_property_value(ColumnDefinition.MinWidthKey, v); }
    public get MaxWidth(): number     { return this.get_property_value(ColumnDefinition.MaxWidthKey); }
    public set MaxWidth(v: number)    { this.set_property_value(ColumnDefinition.MaxWidthKey, v); }
    public get SharedSizeGroup(): string | undefined  { return this.get_property_value(ColumnDefinition.SharedSizeGroupKey); }
    public set SharedSizeGroup(v: string | undefined) { this.set_property_value(ColumnDefinition.SharedSizeGroupKey, v); }
}

export class RowDefinition extends TrackDefinition
{
    public static readonly MinHeightKey = Model.RegisterProperty<number>(
        RowDefinition, 'MinHeight', 0,
        MetaData.Measure | MetaData.Arrange);

    public static readonly MaxHeightKey = Model.RegisterProperty<number>(
        RowDefinition, 'MaxHeight', Number.POSITIVE_INFINITY,
        MetaData.Measure | MetaData.Arrange);

    public static readonly SharedSizeGroupKey = Model.RegisterProperty<string | undefined>(
        RowDefinition, 'SharedSizeGroup', undefined,
        MetaData.Measure | MetaData.Arrange);

    public get Height():    GridLength { return this.get_property_value(TrackDefinition.HeightKey); }
    public set Height(v:    GridLength) { this.set_property_value(TrackDefinition.HeightKey, v); }
    public get MinHeight(): number     { return this.get_property_value(RowDefinition.MinHeightKey); }
    public set MinHeight(v: number)    { this.set_property_value(RowDefinition.MinHeightKey, v); }
    public get MaxHeight(): number     { return this.get_property_value(RowDefinition.MaxHeightKey); }
    public set MaxHeight(v: number)    { this.set_property_value(RowDefinition.MaxHeightKey, v); }
    public get SharedSizeGroup(): string | undefined  { return this.get_property_value(RowDefinition.SharedSizeGroupKey); }
    public set SharedSizeGroup(v: string | undefined) { this.set_property_value(RowDefinition.SharedSizeGroupKey, v); }
}

export class Grid extends Panel
{
    public static readonly RowKey         = Model.RegisterAttachedProperty<number>(Grid, 'Row',         0, MetaData.Arrange);
    public static readonly ColumnKey      = Model.RegisterAttachedProperty<number>(Grid, 'Column',      0, MetaData.Arrange);
    public static readonly RowSpanKey     = Model.RegisterAttachedProperty<number>(Grid, 'RowSpan',     1, MetaData.Arrange);
    public static readonly ColumnSpanKey  = Model.RegisterAttachedProperty<number>(Grid, 'ColumnSpan',  1, MetaData.Arrange);

    // Debug overlay (Grid v3 — § 14.1). When true, RenderOverride paints
    // dashed separator lines along every internal column boundary AND
    // every internal row boundary so authors can verify the grid math
    // visually. WPF parity for `Grid.ShowGridLines`. Off by default.
    // Defaults to a 1-pixel dashed line with a translucent grey stroke
    // so the debug overlay reads without dominating the rendered
    // content; consumers can override the stroke via GridLinesBrush.
    public static readonly ShowGridLinesKey   = Model.RegisterProperty<boolean>(   Grid, 'ShowGridLines',   false,     MetaData.Render);
    public static readonly GridLinesBrushKey  = Model.RegisterProperty<SolidColorBrush | undefined>(Grid, 'GridLinesBrush',  undefined, MetaData.Render);

    public get ShowGridLines():     boolean { return this.get_property_value(Grid.ShowGridLinesKey); }
    public set ShowGridLines(v:     boolean) { this.set_property_value(Grid.ShowGridLinesKey, v); }
    public get GridLinesBrush():    SolidColorBrush | undefined { return this.get_property_value(Grid.GridLinesBrushKey); }
    public set GridLinesBrush(v:    SolidColorBrush | undefined) { this.set_property_value(Grid.GridLinesBrushKey, v); }

    public static SetRow(v: Visual, row: number): void              { v.set_property_value(Grid.RowKey, row); }
    public static GetRow(v: Visual): number                          { return v.get_property_value(Grid.RowKey); }
    public static SetColumn(v: Visual, col: number): void           { v.set_property_value(Grid.ColumnKey, col); }
    public static GetColumn(v: Visual): number                       { return v.get_property_value(Grid.ColumnKey); }
    public static SetRowSpan(v: Visual, span: number): void         { v.set_property_value(Grid.RowSpanKey, span); }
    public static GetRowSpan(v: Visual): number                      { return v.get_property_value(Grid.RowSpanKey); }
    public static SetColumnSpan(v: Visual, span: number): void      { v.set_property_value(Grid.ColumnSpanKey, span); }
    public static GetColumnSpan(v: Visual): number                   { return v.get_property_value(Grid.ColumnSpanKey); }

    private readonly _columns = new ObservableCollection<ColumnDefinition>();
    private readonly _rows    = new ObservableCollection<RowDefinition>();

    public constructor()
    {
        super();
        // Track-definition mutations affect layout, so re-invalidate on
        // every collection change. Inserting a new RowDefinition
        // mid-stream is rare in practice but works without special
        // bookkeeping — the Measure pass re-reads both collections from
        // scratch.
        this._columns.Subscribe(() => this.InvalidateMeasure());
        this._rows.Subscribe(()    => this.InvalidateMeasure());
    }

    public get ColumnDefinitions(): ObservableCollection<ColumnDefinition> { return this._columns; }
    public get RowDefinitions():    ObservableCollection<RowDefinition>    { return this._rows; }

    // Resolved on-screen track sizes from the last Measure pass. Reads
    // 0 when the index is out of range OR when no Measure has run yet
    // (the underlying arrays are empty until the first pass). Consumers
    // like GridSplitter use these to compute current widths/heights
    // BEFORE writing new GridLengths back on a drag — knowing where the
    // track ended up after star resolution matters for "preserve total
    // star sum" semantics.
    public GetColumnWidth(index: number): number
    {
        return index >= 0 && index < this._colWidths.length
            ? this._colWidths[index]!
            : 0;
    }
    public GetRowHeight(index: number): number
    {
        return index >= 0 && index < this._rowHeights.length
            ? this._rowHeights[index]!
            : 0;
    }

    // Cached resolved track sizes after MeasureOverride. Arrange reuses
    // them so we don't repeat the three-pass resolution per phase.
    private _colWidths:  number[] = [];
    private _rowHeights: number[] = [];

    // Hook the target-change edge so we unregister this Grid's
    // shared-size contributions whenever it leaves its host. Without
    // this, a Grid removed from the tree would leak its contribution
    // into the registry forever (or until the host itself is GC'd).
    // SetTarget is the natural seam: it fires on both attach and
    // detach (target transitions to/from undefined). The OLD target is
    // captured BEFORE super swaps the back-pointer — registryFor() on
    // the old target gives the registry this Grid was last registered
    // with, even when the new target is undefined.
    protected override SetTarget(target: VisualHost | undefined): void
    {
        const oldRegistry = registryFor(this.target);
        super.SetTarget(target);
        const newRegistry = registryFor(target);
        if (oldRegistry !== undefined && oldRegistry !== newRegistry)
        {
            oldRegistry.unregisterGrid(this);
        }
    }

    protected override MeasureOverride(availableSize: Size): Size
    {
        // Use the declared row/column definitions, or fall back to a
        // single Star track in each dimension so a Grid without any
        // definitions still behaves like a single-cell container.
        const cols: readonly ColumnDefinition[] = this._columns.Count > 0
            ? snapshot(this._columns)
            : [oneStar()];
        const rows: readonly RowDefinition[] = this._rows.Count > 0
            ? snapshot(this._rows)
            : [oneStarRow()];
        const nCols = cols.length;
        const nRows = rows.length;
        const widths  = new Array<number>(nCols).fill(0);
        const heights = new Array<number>(nRows).fill(0);
        const colKind = new Array<GridUnitType>(nCols);
        const rowKind = new Array<GridUnitType>(nRows);
        const colStars = new Array<number>(nCols).fill(0);
        const rowStars = new Array<number>(nRows).fill(0);
        // Per-track Min/Max bounds (Grid v2.1). Defaults are 0 and +Infinity
        // so a definition that doesn't set Min/Max behaves identically to
        // Grid v1. The bounds apply after each sizing pass — Pixel and
        // Auto clamp inline; Star clamps in a separate loop that
        // redistributes the residual to unclamped Stars (see Pass 3.5).
        const colMin = new Array<number>(nCols);
        const colMax = new Array<number>(nCols);
        const rowMin = new Array<number>(nRows);
        const rowMax = new Array<number>(nRows);

        // Pass 1 — pixel tracks resolve immediately; record kinds, star
        // weights, and Min/Max for the later passes. Pixel tracks are
        // clamped against their bounds right away.
        for (let i = 0; i < nCols; i++)
        {
            const def = colAt(cols, i);
            const w = def.Width;
            colKind[i] = w.UnitType;
            colMin[i]  = Math.max(0, def.MinWidth);
            colMax[i]  = Math.max(colMin[i]!, def.MaxWidth);
            if (w.IsPixel) widths[i]  = clamp(w.Value, colMin[i]!, colMax[i]!);
            if (w.IsStar)  colStars[i] = Math.max(0, w.Value);
        }
        for (let i = 0; i < nRows; i++)
        {
            const def = rowAt(rows, i);
            const h = def.Height;
            rowKind[i] = h.UnitType;
            rowMin[i]  = Math.max(0, def.MinHeight);
            rowMax[i]  = Math.max(rowMin[i]!, def.MaxHeight);
            if (h.IsPixel) heights[i]  = clamp(h.Value, rowMin[i]!, rowMax[i]!);
            if (h.IsStar)  rowStars[i] = Math.max(0, h.Value);
        }

        // Pass 2 — measure children that touch any Auto track with
        // infinite available size so their desired size drives the auto
        // resolution. Children entirely on Pixel + Star tracks measure
        // later with the resolved track sizes; deferring lets us
        // distribute Star space after Auto is known.
        const children = this.visualChildren;
        // Bucket children by whether any of their cells is Auto. We
        // measure auto-touching children FIRST so their contribution
        // raises auto-track sizes; star-only children get the final
        // resolved widths/heights for accurate measure.
        const autoBucket: Visual[] = [];
        const restBucket: Visual[] = [];
        for (const child of children)
        {
            if (childTouchesAuto(child, colKind, rowKind, nCols, nRows))
            {
                autoBucket.push(child);
            }
            else
            {
                restBucket.push(child);
            }
        }
        for (const child of autoBucket)
        {
            child.Measure(new Size(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY));
            const sz = child.DesiredSize;
            const c0 = clamp(Grid.GetColumn(child), 0, nCols - 1);
            const r0 = clamp(Grid.GetRow(child),    0, nRows - 1);
            const cs = Math.max(1, Math.min(Grid.GetColumnSpan(child), nCols - c0));
            const rs = Math.max(1, Math.min(Grid.GetRowSpan(child),    nRows - r0));
            // Distribute the desired size across spanned auto tracks
            // evenly. Spans across mixed track kinds are handled by
            // subtracting pre-resolved (pixel) tracks first; the leftover
            // goes to the auto tracks in the span. Each Auto track is
            // clamped to its [Min, Max] right away so that the Star
            // distribution pass below sees the final Auto sizes.
            distributeAcrossAuto(widths,  colKind, colMin, colMax, c0, cs, sz.Width);
            distributeAcrossAuto(heights, rowKind, rowMin, rowMax, r0, rs, sz.Height);
        }

        // After Pass 2, raise any Auto track that's still below its Min
        // (no child large enough to push it there) — a Min on an Auto
        // track is a floor regardless of children. Max already enforced
        // inside distributeAcrossAuto.
        for (let i = 0; i < nCols; i++)
        {
            if (colKind[i] === GridUnitType.Auto && widths[i]! < colMin[i]!) widths[i] = colMin[i]!;
        }
        for (let i = 0; i < nRows; i++)
        {
            if (rowKind[i] === GridUnitType.Auto && heights[i]! < rowMin[i]!) heights[i] = rowMin[i]!;
        }

        // Pass 2.5 — SharedSizeGroup integration. For each Auto track
        // that declares a group name, report THIS Grid's natural-Auto
        // size to the registry and read back the group's coordinated
        // max. The max becomes the track's resolved size, then clamped
        // to the track's own [Min, Max]. See shared-size-group.ts and
        // grid.md § 0 / § 7 for the cross-Grid semantics.
        applySharedSize(this, cols, colKind, widths, colMin, colMax, /*horizontal=*/true);
        applySharedSize(this, rows, rowKind, heights, rowMin, rowMax, /*horizontal=*/false);

        // Pass 2.6 — Star-keep-alive (Grid v3 / § 14.2). When the Auto
        // pass over-allocated such that the remaining budget can't fit
        // every Star track's minimum, shrink Auto tracks proportionally
        // (down to their own min floor) to free room. Without this, the
        // Star resolver below sees a 0 budget and every Star without a
        // MinWidth collapses to 0 — WPF instead clamps Auto sizes to
        // keep some room for Stars. We approximate WPF's behavior by
        // taking the room out of the Auto tracks that have headroom
        // above their min. Stars-only or Auto-only grids skip this pass
        // (no conflict to resolve).
        shrinkAutosToReserveStarMinimums(
            widths, colKind, colMin, colStars, availableSize.Width);
        shrinkAutosToReserveStarMinimums(
            heights, rowKind, rowMin, rowStars, availableSize.Height);

        // Pass 3 — distribute remaining available space among Star
        // tracks proportionally to weights, then iteratively clamp
        // against Min/Max and redistribute the residual to unclamped
        // Stars. Without Min/Max in play this collapses to the v1
        // single-shot distribution.
        distributeStars(widths,  colKind, colStars, colMin, colMax, availableSize.Width);
        distributeStars(heights, rowKind, rowStars, rowMin, rowMax, availableSize.Height);

        // Pass 4 — measure remaining children against the cell rect
        // formed by their spanned tracks. Auto-touching children
        // measured in Pass 2 with infinity, but those measurements are
        // still valid; re-measuring would just give a smaller cell to
        // child layouts that already accepted infinity.
        for (const child of restBucket)
        {
            const c0 = clamp(Grid.GetColumn(child), 0, nCols - 1);
            const r0 = clamp(Grid.GetRow(child),    0, nRows - 1);
            const cs = Math.max(1, Math.min(Grid.GetColumnSpan(child), nCols - c0));
            const rs = Math.max(1, Math.min(Grid.GetRowSpan(child),    nRows - r0));
            let cw = 0; for (let i = 0; i < cs; i++) cw += widths[c0 + i]!;
            let ch = 0; for (let i = 0; i < rs; i++) ch += heights[r0 + i]!;
            child.Measure(new Size(cw, ch));
        }

        this._colWidths  = widths;
        this._rowHeights = heights;
        return new Size(sum(widths), sum(heights));
    }

    protected override ArrangeOverride(finalSize: Size): Size
    {
        const widths  = this._colWidths;
        const heights = this._rowHeights;
        const nCols = widths.length;
        const nRows = heights.length;
        if (nCols === 0 || nRows === 0) return finalSize;

        // Column / row offsets — prefix sums of widths / heights so
        // child position lookup is O(1) per arrange.
        const colOffsets = prefixSums(widths);
        const rowOffsets = prefixSums(heights);

        for (const child of this.visualChildren)
        {
            const c0 = clamp(Grid.GetColumn(child), 0, nCols - 1);
            const r0 = clamp(Grid.GetRow(child),    0, nRows - 1);
            const cs = Math.max(1, Math.min(Grid.GetColumnSpan(child), nCols - c0));
            const rs = Math.max(1, Math.min(Grid.GetRowSpan(child),    nRows - r0));
            const x = colOffsets[c0]!;
            const y = rowOffsets[r0]!;
            const w = (colOffsets[c0 + cs]! - x);
            const h = (rowOffsets[r0 + rs]! - y);
            child.Arrange(new Rect(x, y, w, h));
        }
        void finalSize;
        return finalSize;
    }

    // Debug-overlay rendering (§ 14.1). Paints a dashed line along every
    // internal column boundary AND every internal row boundary. WPF
    // parity for `Grid.ShowGridLines`: outer boundaries are not drawn
    // (the surrounding container already implies them); only the
    // separators BETWEEN tracks need a visual cue.
    //
    // Drawn AFTER children paint (the base Panel does no painting of
    // its own, and the visual tree paints children before their parent's
    // RenderOverride runs against the panel itself — see render-pass
    // ordering in visual-tree.md). The lines therefore sit on top of
    // child content, which is the right z-order for a debug overlay.
    //
    // No-op when ShowGridLines is false or when there's no internal
    // boundary to draw (single-track grids, empty grids).
    protected override RenderOverride(dc: DrawingContext): void
    {
        if (!this.ShowGridLines) return;
        const widths  = this._colWidths;
        const heights = this._rowHeights;
        const nCols = widths.length;
        const nRows = heights.length;
        if (nCols <= 1 && nRows <= 1) return;

        // 50%-opaque grey by default — visible against most surfaces
        // without overwhelming the underlying content. Consumers can
        // override via GridLinesBrush.
        const brush = this.GridLinesBrush
            ?? new SolidColorBrush(new Color(0x80, 0x80, 0x80, 0x80));
        const pen = new Pen(brush, 1);
        pen.DashStyle = DashStyle.Dash;

        const totalW = sum(widths);
        const totalH = sum(heights);
        const colOffsets = prefixSums(widths);
        const rowOffsets = prefixSums(heights);

        // Internal column boundaries — skip index 0 (outer-left edge)
        // and the last boundary (outer-right edge).
        for (let i = 1; i < nCols; i++)
        {
            const x = colOffsets[i]!;
            dc.DrawGeometry(undefined, pen,
                new LineGeometry(new Point(x, 0), new Point(x, totalH)));
        }
        // Internal row boundaries — same skip-outer logic.
        for (let i = 1; i < nRows; i++)
        {
            const y = rowOffsets[i]!;
            dc.DrawGeometry(undefined, pen,
                new LineGeometry(new Point(0, y), new Point(totalW, y)));
        }
    }
}

function oneStar(): ColumnDefinition
{
    const cd = new ColumnDefinition();
    cd.Width = new GridLength(1, GridUnitType.Star);
    return cd;
}

function oneStarRow(): RowDefinition
{
    const rd = new RowDefinition();
    rd.Height = new GridLength(1, GridUnitType.Star);
    return rd;
}

function colAt(c: readonly ColumnDefinition[], i: number): ColumnDefinition { return c[i]!; }
function rowAt(r: readonly RowDefinition[],    i: number): RowDefinition    { return r[i]!; }

function snapshot<T>(coll: ObservableCollection<T>): T[]
{
    const out = new Array<T>(coll.Count);
    for (let i = 0; i < coll.Count; i++) out[i] = coll.Get(i)!;
    return out;
}

function childTouchesAuto(
    child: Visual,
    colKind: readonly GridUnitType[],
    rowKind: readonly GridUnitType[],
    nCols: number, nRows: number,
): boolean
{
    const c0 = clamp(Grid.GetColumn(child), 0, nCols - 1);
    const r0 = clamp(Grid.GetRow(child),    0, nRows - 1);
    const cs = Math.max(1, Math.min(Grid.GetColumnSpan(child), nCols - c0));
    const rs = Math.max(1, Math.min(Grid.GetRowSpan(child),    nRows - r0));
    for (let i = 0; i < cs; i++) if (colKind[c0 + i] === GridUnitType.Auto) return true;
    for (let i = 0; i < rs; i++) if (rowKind[r0 + i] === GridUnitType.Auto) return true;
    return false;
}

// Star-keep-alive (Grid v3, § 14.2). When the Auto pass over-allocated
// such that pixel + auto > available, shrink the Auto tracks down to
// their declared min (or 0 if no min was set) to free room for Star
// tracks. Stars without an explicit MinWidth would otherwise collapse
// to 0 because `distributeStars` sees a 0 budget; WPF instead clamps
// Auto sizes to keep some room for Stars.
//
// Policy:
//   * Compute available shrinkage = sum(currentAuto - autoMin) across
//     every Auto track. This is the maximum we can take out of Autos
//     before any Auto hits its own floor.
//   * Compute required shrinkage = (pixel + auto + starMin) - available.
//     If required <= 0, no overflow — return.
//   * If required >= available shrinkage, take it all: every Auto
//     drops to its autoMin floor. Stars still see whatever's left.
//   * Otherwise, take `required` distributed proportionally to each
//     Auto track's shrinkage headroom (currentAuto - autoMin).
//
// No-op when there are no Star tracks (no reason to shrink Autos) or
// no Auto tracks (nothing to shrink). The starMin sum is 0 when no
// Star track declares MinWidth — in that case we still shrink Autos
// just enough to bring (pixel + auto) below available so distributeStars
// has a positive budget to share among weighted Stars.
function shrinkAutosToReserveStarMinimums(
    sizes:     number[],
    kinds:     readonly GridUnitType[],
    autoMins:  readonly number[],
    starWeights: readonly number[],
    available: number,
): void
{
    if (!Number.isFinite(available) || available <= 0) return;
    const n = sizes.length;
    let pixelSum = 0;
    let autoSum  = 0;
    let starMinSum = 0;
    let hasStars = false;
    let hasAutos = false;
    let availableShrinkage = 0;
    for (let i = 0; i < n; i++)
    {
        const k = kinds[i];
        if (k === GridUnitType.Pixel) pixelSum += sizes[i]!;
        else if (k === GridUnitType.Auto)
        {
            autoSum += sizes[i]!;
            availableShrinkage += Math.max(0, sizes[i]! - autoMins[i]!);
            hasAutos = true;
        }
        else if (k === GridUnitType.Star && starWeights[i]! > 0)
        {
            // Star tracks haven't been resolved yet at this pass — sizes[i]
            // is still 0 for stars. The minimum the star will need is the
            // declared autoMins-counterpart, but for star tracks we use
            // the per-track Min carried alongside (passed via the same
            // mins[] array in the caller's resolver). We don't have that
            // here, so use 0 as a conservative floor; the resolver clamps
            // to the real Min after the budget is set.
            hasStars = true;
        }
    }
    if (!hasStars || !hasAutos) return;
    void starMinSum;

    // Required shrinkage = how much (pixel + auto) must drop to leave
    // a positive budget for distributeStars. We aim for budget > 0 so
    // weighted Stars get SOMETHING; if a Star track declared a MinWidth
    // distributeStars's clamp loop will raise it from there.
    const overflow = (pixelSum + autoSum) - available;
    if (overflow <= 0) return;

    const reduction = Math.min(overflow, availableShrinkage);
    if (reduction <= 0) return;

    if (reduction >= availableShrinkage)
    {
        // Every Auto track drops to its floor — even that may not be
        // enough to fully avoid overflow, but the Stars will at least
        // see a smaller-than-otherwise reserved sum.
        for (let i = 0; i < n; i++)
        {
            if (kinds[i] === GridUnitType.Auto) sizes[i] = autoMins[i]!;
        }
        return;
    }

    // Proportional shrinkage — each Auto track gives up a slice of
    // `reduction` weighted by its (currentAuto - autoMin) headroom.
    for (let i = 0; i < n; i++)
    {
        if (kinds[i] !== GridUnitType.Auto) continue;
        const headroom = Math.max(0, sizes[i]! - autoMins[i]!);
        if (headroom <= 0) continue;
        const share = reduction * (headroom / availableShrinkage);
        sizes[i] = Math.max(autoMins[i]!, sizes[i]! - share);
    }
}

// Distribute `desired` across the AUTO tracks in [start, start+span).
// Pixel tracks already-resolved are subtracted first; the remainder is
// shared evenly between the spanned auto tracks. Each auto track is
// raised to the MAX of its current value and the allocated share —
// shrinking would discard a previously-larger desired size from a
// different child — and then clamped to its declared [Min, Max] so
// the upper bound is honoured immediately.
function distributeAcrossAuto(
    sizes:    number[],
    kinds:    readonly GridUnitType[],
    mins:     readonly number[],
    maxes:    readonly number[],
    start:    number,
    span:     number,
    desired:  number,
): void
{
    let preResolved = 0;
    let autoCount  = 0;
    for (let i = 0; i < span; i++)
    {
        const k = kinds[start + i];
        if (k === GridUnitType.Auto)        autoCount++;
        else if (k === GridUnitType.Pixel)  preResolved += sizes[start + i]!;
        // Star tracks aren't yet resolved at this phase — don't subtract.
    }
    if (autoCount === 0) return;
    const remainder = Math.max(0, desired - preResolved);
    const perAuto   = remainder / autoCount;
    for (let i = 0; i < span; i++)
    {
        if (kinds[start + i] === GridUnitType.Auto)
        {
            const raised = Math.max(sizes[start + i]!, perAuto);
            sizes[start + i] = clamp(raised, mins[start + i]!, maxes[start + i]!);
        }
    }
}

// Distribute the leftover budget across Star tracks proportionally to
// weights, then iteratively clamp each Star track to [Min, Max] and
// redistribute the residual among unclamped Stars. Loop terminates
// when no new track gets clamped — at most `nStars` iterations because
// each iteration locks in at least one new clamped track.
//
// Tracks NOT of star kind are untouched. Pre-resolved pixel + auto
// sizes inside `sizes` count against the available budget on the
// first pass.
function distributeStars(
    sizes:     number[],
    kinds:     readonly GridUnitType[],
    stars:     readonly number[],
    mins:      readonly number[],
    maxes:     readonly number[],
    available: number,
): void
{
    const n = sizes.length;
    // `lockedSize[i]` is the resolved size for tracks fixed at this
    // point — non-star tracks carry their Pass-1/2 size; clamped star
    // tracks carry the clamped value. Initialised to 0 so a `for…of`
    // (used inside sum()) never observes a hole (which would yield
    // undefined and poison the math to NaN).
    // `isLocked` runs alongside so we can distinguish "track size is
    // legitimately 0" from "track isn't locked yet" without needing a
    // sentinel value.
    // `liveStarWeight[i]` is the star weight for tracks still in the
    // redistribution loop; 0 for non-star and for clamped stars.
    const lockedSize     = new Array<number>(n).fill(0);
    const isLocked       = new Array<boolean>(n).fill(false);
    const liveStarWeight = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++)
    {
        if (kinds[i] !== GridUnitType.Star)
        {
            lockedSize[i] = sizes[i]!;
            isLocked[i]   = true;
        }
        else
        {
            liveStarWeight[i] = stars[i]!;
        }
    }

    // Bounded loop — each iteration either converges (no new clamp) or
    // locks in at least one star track. n iterations is a hard cap.
    for (let iter = 0; iter <= n; iter++)
    {
        const reserved = sum(lockedSize);
        const budget   = Math.max(0, available - reserved);
        const totalLive = liveStarWeight.reduce((a, b) => a + b, 0);
        if (totalLive <= 0)
        {
            // No live star tracks left. Push locked sizes (or 0 for
            // unlocked star tracks with no weight) into sizes.
            for (let i = 0; i < n; i++)
            {
                if (kinds[i] === GridUnitType.Star)
                {
                    sizes[i] = isLocked[i] ? lockedSize[i]! : 0;
                }
            }
            return;
        }

        // Provisional allocation for the live stars; clamp each
        // against its [Min, Max]. Any that hit a bound get locked in
        // and the loop runs again with a smaller budget.
        let anyClamped = false;
        for (let i = 0; i < n; i++)
        {
            if (liveStarWeight[i]! <= 0) continue;
            const provisional = budget * (liveStarWeight[i]! / totalLive);
            const clamped     = clamp(provisional, mins[i]!, maxes[i]!);
            if (clamped !== provisional)
            {
                // Hit a bound — lock in the clamped value and drop the
                // track from the live star pool. Also write the
                // clamped value into sizes so that if the loop
                // terminates on a subsequent !anyClamped branch
                // (which doesn't re-traverse lockedSize), sizes still
                // carries the locked value. The freed star weight
                // implicitly redistributes to the rest on the next
                // iteration.
                lockedSize[i]     = clamped;
                isLocked[i]       = true;
                liveStarWeight[i] = 0;
                sizes[i]          = clamped;
                anyClamped = true;
            }
            else
            {
                // Provisional accepted for this iteration; still in the
                // live pool. Write it to sizes provisionally — if no
                // more clamps fire next loop, this becomes the final
                // value.
                sizes[i] = provisional;
            }
        }
        if (!anyClamped) return;
    }
}

function sum(arr: readonly number[]): number
{
    let s = 0;
    for (const v of arr) s += v;
    return s;
}

function prefixSums(arr: readonly number[]): number[]
{
    const out = new Array<number>(arr.length + 1);
    out[0] = 0;
    for (let i = 0; i < arr.length; i++) out[i + 1] = out[i]! + arr[i]!;
    return out;
}

function clamp(v: number, lo: number, hi: number): number
{
    return Math.max(lo, Math.min(hi, v));
}

// SharedSizeGroup integration. Walks the Auto tracks; for each track
// that declares a SharedSizeGroup, aggregates this Grid's contribution
// (the MAX of all Auto tracks in the same group on this Grid) and
// reports it. Reads the group's coordinated max back and applies it
// to every track in this Grid that's in that group, clamped to each
// track's own [Min, Max].
//
// Why aggregate per-Grid before reporting: the registry stores ONE
// contribution per (Grid, group) — a Grid with multiple tracks in the
// same group needs to pre-collapse so the registry records the
// largest contribution, not whichever track ran last.
function applySharedSize(
    grid:  Grid,
    defs:  readonly (ColumnDefinition | RowDefinition)[],
    kinds: readonly GridUnitType[],
    sizes: number[],
    mins:  readonly number[],
    maxes: readonly number[],
    horizontal: boolean,
): void
{
    const reg = (grid as unknown as { target: VisualHost | undefined }).target;
    const registry = registryFor(reg);
    if (registry === undefined) return;

    // Bucket each declaring track by its group name. groupTracks[name]
    // = [indices of tracks in this Grid that belong to that group].
    const groupTracks = new Map<string, number[]>();
    for (let i = 0; i < kinds.length; i++)
    {
        if (kinds[i] !== GridUnitType.Auto) continue;
        const def = defs[i]!;
        const name = horizontal
            ? (def as ColumnDefinition).SharedSizeGroup
            : (def as RowDefinition).SharedSizeGroup;
        if (name === undefined) continue;
        let arr = groupTracks.get(name);
        if (arr === undefined) { arr = []; groupTracks.set(name, arr); }
        arr.push(i);
    }
    if (groupTracks.size === 0) return;

    // For each group, find this Grid's max contribution among its
    // own tracks in the group, then report+read the coordinated max,
    // then apply.
    for (const [name, indices] of groupTracks)
    {
        let contribution = 0;
        for (const i of indices)
        {
            if (sizes[i]! > contribution) contribution = sizes[i]!;
        }
        const groupMax = registry.report(name, grid, contribution);
        for (const i of indices)
        {
            sizes[i] = clamp(groupMax, mins[i]!, maxes[i]!);
        }
    }
}
