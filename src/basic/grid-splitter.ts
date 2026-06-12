import {
    Adorner,
    AdornerLayer,
    HorizontalAlignment,
    MetaData,
    Model,
    PropertyDescriptor,
    Rect,
    Size,
    VerticalAlignment,
    Visual,
    type DrawingContext,
    type KeyEventArgs,
} from '../runtime/index.js';
import { Brush } from '../visual-engine/index.js';
import { Grid, GridLength } from './panels/grid.js';
import { Thumb, type DragDeltaEventArgs, type DragStartedEventArgs, type DragCompletedEventArgs } from './scroll/thumb.js';

// ResizeDirection — WPF parity:
//   Auto    — pick from the splitter's rendered aspect (taller→columns,
//             wider→rows). The WPF heuristic uses ActualWidth vs.
//             ActualHeight at the moment the drag starts.
//   Columns — resize the adjacent column tracks; drag is on the X axis.
//   Rows    — resize the adjacent row tracks; drag is on the Y axis.
export type GridResizeDirection = 'Auto' | 'Columns' | 'Rows';

// ResizeBehavior — which two tracks the splitter actually resizes.
// WPF parity:
//   PreviousAndCurrent — tracks [n-1, n], where n is the splitter's cell.
//                        Splitter visually sits on the right/bottom edge
//                        of its own cell.
//   CurrentAndNext     — tracks [n, n+1]. Splitter on the left/top edge.
//   PreviousAndNext    — tracks [n-1, n+1], skipping the splitter's own
//                        cell. Splitter occupies a dedicated separator
//                        track sized to its own thickness. THIS IS THE
//                        WPF DEFAULT for centred/stretched splitters.
//   BasedOnAlignment   — pick from HorizontalAlignment / VerticalAlignment:
//                          Left/Top      → PreviousAndCurrent
//                          Right/Bottom  → CurrentAndNext
//                          Center/Stretch → PreviousAndNext
export type GridResizeBehavior =
    | 'BasedOnAlignment'
    | 'CurrentAndNext'
    | 'PreviousAndCurrent'
    | 'PreviousAndNext';

// Default brush for the drag-preview adorner — Material Primary so
// the line tints with the active theme. Consumers pin a specific
// colour via the PreviewBrush DP.

// GridSplitter — a Thumb that lives in a Grid cell and resizes the
// adjacent column or row tracks on drag.  WPF
// System.Windows.Controls.GridSplitter parity, including ShowsPreview
// (ghost line follows cursor, commit on release) and keyboard arrow
// nudges.
//
// Track-mutation policy:
//   * Both adjacent tracks Star  → preserve total Star sum, redistribute
//                                   by new on-screen ratio (so the Grid
//                                   stays Star-sized and continues to
//                                   respond to layout changes).
//   * Both adjacent tracks Pixel → write new pixel values.
//   * Either track Auto / mixed Pixel+Star → convert both to Pixel.
//
// Min/Max bounds (ColumnDefinition.MinWidth / .MaxWidth, RowDefinition.
// MinHeight / .MaxHeight) are honoured: a drag that would push either
// side past its bound clamps the delta.
//
// To use: drop a GridSplitter into a Grid cell. The default Auto/Auto
// pair behaves correctly for the common 3-column dashboard pattern
// (`<col*>  <GridSplitter>  <col*>`) — ResizeDirection=Auto picks
// "Columns" because a centred splitter is naturally taller than wide,
// ResizeBehavior=BasedOnAlignment with default HorizontalAlignment=
// Stretch picks PreviousAndNext, and the splitter's own cell is treated
// as a separator track sized to its thickness.
export class GridSplitter extends Thumb
{
    public static readonly ResizeDirectionKey = Model.RegisterProperty<GridResizeDirection>(
        GridSplitter, 'ResizeDirection', 'Auto', MetaData.Render);

    public static readonly ResizeBehaviorKey = Model.RegisterProperty<GridResizeBehavior>(
        GridSplitter, 'ResizeBehavior', 'BasedOnAlignment', MetaData.None);

    public static readonly ShowsPreviewKey = Model.RegisterProperty<boolean>(
        GridSplitter, 'ShowsPreview', false, MetaData.None);

    public static readonly DragIncrementKey = Model.RegisterProperty<number>(
        GridSplitter, 'DragIncrement', 1, MetaData.None);

    public static readonly KeyboardIncrementKey = Model.RegisterProperty<number>(
        GridSplitter, 'KeyboardIncrement', 10, MetaData.None);

    public static readonly PreviewBrushKey = Model.RegisterProperty<Brush | undefined>(
        GridSplitter, 'PreviewBrush', undefined, MetaData.None);

    static {
        Model.OverrideMetadata(GridSplitter, Visual.DefaultStyleKeyKey, { default_value: GridSplitter });
    }

    // Snapshot taken on DragStarted so the drag stays consistent even
    // if the layout shifts mid-drag. WPF takes the same snapshot.
    private _axis: 'Columns' | 'Rows' = 'Columns';
    private _grid: Grid | undefined;
    // Resolved adjacent track indices (after BasedOnAlignment lookup).
    private _trackA = -1;
    private _trackB = -1;
    // Starting GridLengths and resolved pixel sizes for each track.
    private _startLenA:  GridLength | undefined;
    private _startLenB:  GridLength | undefined;
    private _startSizeA = 0;
    private _startSizeB = 0;
    // Snapshot Min/Max so clamps are stable across the drag.
    private _minA = 0;
    private _maxA = Number.POSITIVE_INFINITY;
    private _minB = 0;
    private _maxB = Number.POSITIVE_INFINITY;

    // Accumulated drag offset since DragStarted, in host-coord pixels
    // along the resize axis. Used by ShowsPreview to drive the adorner
    // and to commit at DragCompleted.
    private _accumDelta = 0;

    // ShowsPreview adorner — lazily created on DragStarted, removed on
    // DragCompleted. Layer is also resolved on DragStarted.
    private _previewAdorner: GridSplitterPreviewAdorner | undefined;
    private _previewLayer:   AdornerLayer | undefined;

    constructor()
    {
        super();
        this.AddDragStartedListener(args => this.onDragStarted(args));
        this.AddDragDeltaListener(args => this.onDragDelta(args));
        this.AddDragCompletedListener(args => this.onDragCompleted(args));
        // Default cursor reflects the current ResizeDirection (Auto
        // refreshes on arrange).
        this.refreshCursor();
    }

    // ── Public DPs ─────────────────────────────────────────────────

    public get ResizeDirection(): GridResizeDirection { return this.get_property_value(GridSplitter.ResizeDirectionKey); }
    public set ResizeDirection(v: GridResizeDirection) { this.set_property_value(GridSplitter.ResizeDirectionKey, v); }

    protected override OnPropertyChanged(
        descriptor: PropertyDescriptor,
        oldValue:   unknown,
        newValue:   unknown,
    ): void
    {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        // Markup writes bypass the TS setter and go through the descriptor,
        // so the cursor refresh has to live here to catch parser-driven
        // ResizeDirection writes.
        if (descriptor.Name === 'ResizeDirection') this.refreshCursor();
    }

    public get ResizeBehavior(): GridResizeBehavior { return this.get_property_value(GridSplitter.ResizeBehaviorKey); }
    public set ResizeBehavior(v: GridResizeBehavior) { this.set_property_value(GridSplitter.ResizeBehaviorKey, v); }

    public get ShowsPreview(): boolean { return this.get_property_value(GridSplitter.ShowsPreviewKey); }
    public set ShowsPreview(v: boolean) { this.set_property_value(GridSplitter.ShowsPreviewKey, v); }

    public get DragIncrement(): number { return this.get_property_value(GridSplitter.DragIncrementKey); }
    public set DragIncrement(v: number) { this.set_property_value(GridSplitter.DragIncrementKey, v); }

    public get KeyboardIncrement(): number { return this.get_property_value(GridSplitter.KeyboardIncrementKey); }
    public set KeyboardIncrement(v: number) { this.set_property_value(GridSplitter.KeyboardIncrementKey, v); }

    public get PreviewBrush(): Brush | undefined { return this.get_property_value(GridSplitter.PreviewBrushKey); }
    public set PreviewBrush(v: Brush | undefined) { this.set_property_value(GridSplitter.PreviewBrushKey, v); }

    // ── Cursor ─────────────────────────────────────────────────────

    private refreshCursor(): void
    {
        const dir = this.ResizeDirection;
        if (dir === 'Columns') this.Cursor = 'ew-resize';
        else if (dir === 'Rows') this.Cursor = 'ns-resize';
        else
        {
            // Auto — pick from arranged aspect; falls back to ew-resize
            // before the first arrange when ArrangedRect is zero.
            const r = this.ArrangedRect;
            this.Cursor = r.Height >= r.Width ? 'ew-resize' : 'ns-resize';
        }
    }

    protected override ArrangeOverride(finalSize: Size): Size
    {
        const result = super.ArrangeOverride(finalSize);
        if (this.ResizeDirection === 'Auto') this.refreshCursor();
        return result;
    }

    // ── Drag lifecycle ────────────────────────────────────────────

    private onDragStarted(_args: DragStartedEventArgs): void
    {
        this._accumDelta = 0;
        const snap = this.takeSnapshot();
        if (snap === undefined) return;
        if (this.ShowsPreview)
        {
            const layer = AdornerLayer.GetAdornerLayer(this);
            if (layer !== undefined)
            {
                // PreviewBrush rides the default
                // `Style[TargetType=GridSplitter]` setter via
                // DynamicResource (@Primary) so a theme switch re-tints
                // the adorner live. No `?? Theme.primary` fallback.
                const brush = this.PreviewBrush;
                if (brush === undefined) return;
                const adorner = new GridSplitterPreviewAdorner(this, snap.axis, brush);
                layer.Add(adorner);
                this._previewAdorner = adorner;
                this._previewLayer   = layer;
            }
        }
    }

    private onDragDelta(args: DragDeltaEventArgs): void
    {
        if (this._grid === undefined) return;
        const raw = this._axis === 'Columns' ? args.HorizontalChange : args.VerticalChange;
        const stepped = this.snapToIncrement(raw);
        if (stepped === 0) return;
        this._accumDelta += stepped;
        if (this.ShowsPreview)
        {
            this._previewAdorner?.SetDelta(this._accumDelta);
            // Bubble arrange so the layer re-runs Placement on next pass.
            this._previewLayer?.InvalidateArrange();
        }
        else
        {
            this.applyResize(this._accumDelta);
        }
    }

    private onDragCompleted(args: DragCompletedEventArgs): void
    {
        if (this._grid === undefined) return;
        if (this.ShowsPreview && !args.Canceled)
        {
            // Final commit — apply the accumulated delta now.
            this.applyResize(this._accumDelta);
        }
        // Tear down preview either way.
        if (this._previewAdorner !== undefined && this._previewLayer !== undefined)
        {
            this._previewLayer.Remove(this._previewAdorner);
        }
        this._previewAdorner = undefined;
        this._previewLayer   = undefined;
        // Snapshot stays available for diagnostics until next drag.
    }

    // ── Snapshot + track resolution ───────────────────────────────

    private takeSnapshot(): { axis: 'Columns' | 'Rows' } | undefined
    {
        const grid = this.findOwningGrid();
        if (grid === undefined) return undefined;
        this._grid = grid;
        this._axis = this.resolveAxis();
        const [a, b] = this.resolveTrackIndices(grid, this._axis);
        if (a < 0 || b < 0) return undefined;
        this._trackA = a;
        this._trackB = b;
        if (this._axis === 'Columns')
        {
            const defA = grid.ColumnDefinitions.Get(a);
            const defB = grid.ColumnDefinitions.Get(b);
            if (defA === undefined || defB === undefined) return undefined;
            this._startLenA  = defA.Width;
            this._startLenB  = defB.Width;
            this._startSizeA = grid.GetColumnWidth(a);
            this._startSizeB = grid.GetColumnWidth(b);
            this._minA = defA.MinWidth;
            this._maxA = defA.MaxWidth;
            this._minB = defB.MinWidth;
            this._maxB = defB.MaxWidth;
        }
        else
        {
            const defA = grid.RowDefinitions.Get(a);
            const defB = grid.RowDefinitions.Get(b);
            if (defA === undefined || defB === undefined) return undefined;
            this._startLenA  = defA.Height;
            this._startLenB  = defB.Height;
            this._startSizeA = grid.GetRowHeight(a);
            this._startSizeB = grid.GetRowHeight(b);
            this._minA = defA.MinHeight;
            this._maxA = defA.MaxHeight;
            this._minB = defB.MinHeight;
            this._maxB = defB.MaxHeight;
        }
        return { axis: this._axis };
    }

    private findOwningGrid(): Grid | undefined
    {
        let cur: Visual | undefined = this.GetVisualParent();
        while (cur !== undefined)
        {
            if (cur instanceof Grid) return cur;
            cur = cur.GetVisualParent();
        }
        return undefined;
    }

    private resolveAxis(): 'Columns' | 'Rows'
    {
        const dir = this.ResizeDirection;
        if (dir === 'Columns') return 'Columns';
        if (dir === 'Rows')    return 'Rows';
        // Auto — pick from arranged aspect at this moment.
        const r = this.ArrangedRect;
        return r.Height >= r.Width ? 'Columns' : 'Rows';
    }

    private resolveTrackIndices(grid: Grid, axis: 'Columns' | 'Rows'): [number, number]
    {
        const behavior = this.ResizeBehavior;
        const idx = axis === 'Columns' ? Grid.GetColumn(this) : Grid.GetRow(this);
        const count = axis === 'Columns' ? grid.ColumnDefinitions.Count : grid.RowDefinitions.Count;
        const resolved = behavior === 'BasedOnAlignment'
            ? this.resolveAlignmentBehavior(axis)
            : behavior;
        switch (resolved)
        {
            case 'PreviousAndCurrent':
                if (idx <= 0) return [-1, -1];
                return [idx - 1, idx];
            case 'CurrentAndNext':
                if (idx >= count - 1) return [-1, -1];
                return [idx, idx + 1];
            case 'PreviousAndNext':
                if (idx <= 0 || idx >= count - 1) return [-1, -1];
                return [idx - 1, idx + 1];
            default:
                return [-1, -1];
        }
    }

    private resolveAlignmentBehavior(axis: 'Columns' | 'Rows'): Exclude<GridResizeBehavior, 'BasedOnAlignment'>
    {
        if (axis === 'Columns')
        {
            switch (this.HorizontalAlignment)
            {
                case HorizontalAlignment.Left:  return 'PreviousAndCurrent';
                case HorizontalAlignment.Right: return 'CurrentAndNext';
                default:                         return 'PreviousAndNext';
            }
        }
        else
        {
            switch (this.VerticalAlignment)
            {
                case VerticalAlignment.Top:    return 'PreviousAndCurrent';
                case VerticalAlignment.Bottom: return 'CurrentAndNext';
                default:                        return 'PreviousAndNext';
            }
        }
    }

    // ── Resize math ───────────────────────────────────────────────

    private snapToIncrement(raw: number): number
    {
        const inc = this.DragIncrement;
        if (inc <= 1) return raw;
        return Math.round(raw / inc) * inc;
    }

    // Apply an accumulated delta to the snapshot. Clamps against Min /
    // Max on each side; writes new GridLengths back through the proper
    // policy (preserve Star / preserve Pixel / convert to Pixel for
    // Auto + mixed cases).
    private applyResize(delta: number): void
    {
        const grid = this._grid;
        if (grid === undefined) return;
        // Clamp delta against Min/Max on both sides.
        const newA = this._startSizeA + delta;
        const newB = this._startSizeB - delta;
        let clampedA = Math.max(this._minA, Math.min(this._maxA, newA));
        let clampedB = Math.max(this._minB, Math.min(this._maxB, newB));
        // Re-derive a coherent delta from whichever side clamped harder.
        const dA = clampedA - this._startSizeA;
        const dB = this._startSizeB - clampedB;
        const effectiveDelta = Math.abs(dA) < Math.abs(dB) ? dA : dB;
        clampedA = this._startSizeA + effectiveDelta;
        clampedB = this._startSizeB - effectiveDelta;
        // Resolve target unit type pair.
        const lenA = this._startLenA!;
        const lenB = this._startLenB!;
        const newLenA = computeNewLength(lenA, lenB, clampedA, clampedB, /* which */ 'A');
        const newLenB = computeNewLength(lenA, lenB, clampedA, clampedB, /* which */ 'B');
        if (this._axis === 'Columns')
        {
            grid.ColumnDefinitions.Get(this._trackA)!.Width = newLenA;
            grid.ColumnDefinitions.Get(this._trackB)!.Width = newLenB;
        }
        else
        {
            grid.RowDefinitions.Get(this._trackA)!.Height = newLenA;
            grid.RowDefinitions.Get(this._trackB)!.Height = newLenB;
        }
        // ColumnDefinition / RowDefinition are Models, not Visuals — DP
        // writes on them don't invalidate the Grid's measure cache via
        // the usual parent walk. The Grid subscribes to its definitions
        // collection but not to per-definition property changes, so
        // poke it explicitly. Without this the next Grid.Measure call
        // short-circuits on the still-valid cache and the new widths
        // never reach the painted geometry.
        grid.InvalidateMeasure();
    }

    // ── Keyboard nudges ────────────────────────────────────────────

    protected override OnKeyDown(args: KeyEventArgs): void
    {
        super.OnKeyDown(args);
        if (args.Handled || this.IsDragging) return;
        const inc = this.KeyboardIncrement;
        const grid = this.findOwningGrid();
        if (grid === undefined) return;
        // Map arrow direction to (axis, delta). Arrows that don't match
        // the splitter's resolved axis are silently ignored (Left/Right
        // on a row splitter, Up/Down on a column splitter).
        let arrowAxis: 'Columns' | 'Rows';
        let delta: number;
        switch (args.Key)
        {
            case 'ArrowLeft':  arrowAxis = 'Columns'; delta = -inc; break;
            case 'ArrowRight': arrowAxis = 'Columns'; delta =  inc; break;
            case 'ArrowUp':    arrowAxis = 'Rows';    delta = -inc; break;
            case 'ArrowDown':  arrowAxis = 'Rows';    delta =  inc; break;
            default: return;
        }
        // Snapshot using the resolved axis, then bail if the arrow's
        // axis disagrees — keyboard nudge on the "wrong" axis is a
        // no-op rather than a silent off-axis resize.
        this._grid = grid;
        const snap = this.takeSnapshot();
        if (snap === undefined || snap.axis !== arrowAxis) return;
        this.applyResize(delta);
        args.Handled = true;
    }
}

// Decide the new GridLength for one side of a resize.
// Policy:
//   Both sides Pixel  → write Pixel(value).
//   Both sides Star   → preserve total Star sum, distribute by new
//                       on-screen ratio so the Grid stays Star-sized.
//   Anything else      → write Pixel(value) (Auto can't be resized; mixed
//                       Pixel+Star also commits to Pixel for predictability).
function computeNewLength(
    lenA: GridLength, lenB: GridLength,
    newA: number, newB: number,
    which: 'A' | 'B',
): GridLength
{
    const both = (kind: 'pixel' | 'star' | 'auto'): boolean =>
        lenA.UnitType === kind && lenB.UnitType === kind;
    if (both('star'))
    {
        const total = newA + newB;
        if (total <= 0) return new GridLength(0, 'star');
        const starSum = lenA.Value + lenB.Value;
        const ratio = which === 'A' ? newA / total : newB / total;
        return new GridLength(starSum * ratio, 'star');
    }
    return new GridLength(which === 'A' ? newA : newB, 'pixel');
}

// ── Preview adorner ───────────────────────────────────────────────

// A thin painted bar that follows the splitter's drag delta when
// ShowsPreview=true. The splitter itself stays put until DragCompleted;
// the preview adorner shows where the resize WILL land if the user
// releases now.
//
// Layout: the adorner targets the GridSplitter as AdornedElement. The
// layer's positioning walk gives us the splitter's rect in layer-local
// coords; Placement offsets that rect by the accumulated delta along
// the resize axis. RenderOverride paints a filled rectangle.
class GridSplitterPreviewAdorner extends Adorner
{
    private _delta = 0;
    private readonly _axis: 'Columns' | 'Rows';
    private readonly _brush: Brush;

    constructor(splitter: GridSplitter, axis: 'Columns' | 'Rows', brush: Brush)
    {
        super(splitter);
        this._axis = axis;
        this._brush = brush;
        // Decoration only — events go to the splitter underneath.
        this.IsHitTestVisible = false;
    }

    public SetDelta(delta: number): void
    {
        if (this._delta === delta) return;
        this._delta = delta;
        this.InvalidateArrange();
        this.GetVisualParent()?.InvalidateArrange();
    }

    public override Placement(adornedRect: Rect, _desired: Size): Rect
    {
        if (this._axis === 'Columns')
        {
            return new Rect(adornedRect.X + this._delta, adornedRect.Y,
                            adornedRect.Width, adornedRect.Height);
        }
        return new Rect(adornedRect.X, adornedRect.Y + this._delta,
                        adornedRect.Width, adornedRect.Height);
    }

    protected override MeasureOverride(_a: Size): Size { return Size.Zero; }

    protected override RenderOverride(dc: DrawingContext): void
    {
        const s = this.RenderSize;
        if (s.Width <= 0 || s.Height <= 0) return;
        dc.DrawRectangle(this._brush, undefined, new Rect(0, 0, s.Width, s.Height));
    }
}
