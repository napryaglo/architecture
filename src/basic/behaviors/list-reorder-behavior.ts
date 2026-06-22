import {
    Adorner,
    AdornerLayer,
    Behavior,
    MetaData,
    Model,
    ObservableCollection,
    Rect,
    Size,
    type DrawingContext,
    type DragEventArgs,
    Visual,
} from '../../runtime/index.js';
import { DragDropEffects } from '../../runtime/index.js';
import type { PresentationTarget } from '../../visual-engine/index.js';
import { Canvas } from '../panels/canvas.js';
import { DataTemplate } from '../templates/data-template.js';
import { ItemsControl } from '../../framework/base/items-control.js';
import { VirtualizingWrapPanel } from '../panels/virtualisation/virtualizing-wrap-panel.js';
import { WrapPanel } from '../panels/wrap-panel.js';

// Drag-to-reorder behavior for an ItemsControl. Wires the receiver
// side of the gesture: marks the ItemsControl as AllowDrop=true,
// shows a Move effect while a reorderable item is over it, and on drop
// moves the source item to the calculated insertion index.
//
// The source side (initiating the drag with the right DataObject) is
// the consumer's responsibility — typically `IsDraggable=true` on each
// row's container with an OnDragStart factory that populates the
// drag DataObject with `<FromIndexFormat>: <items index>` so this
// behavior can find the source row.
//
// Layout-mode auto-detect: the behavior inspects the host's
// ItemsPanelInstance at gesture time and picks one of two insertion-
// index strategies.
//
//   * Vertical mode — StackPanel / VirtualizingStackPanel and
//     anything else. Cursor host-Y compared against each realized
//     container's vertical midpoint; the new index is the first
//     container whose midpoint is below the cursor. Indicator: a
//     horizontal bar at the row gap.
//
//   * Wrap mode — WrapPanel / VirtualizingWrapPanel. Cursor (host-X,
//     host-Y) maps to a (row, column) inside the panel; insertion
//     index = row × columns + column, with a before/after refinement
//     based on whether the cursor X sits left of the cell's
//     horizontal midpoint. Indicator: a vertical bar at the column
//     gap, full cell-height tall. For VirtualizingWrapPanel the cell
//     geometry comes from the panel's ItemWidth + ItemHeight +
//     Columns AND its HorizontalSpacing / VerticalSpacing — the
//     cursor→cell map uses strides (ItemWidth + HorizontalSpacing,
//     ItemHeight + VerticalSpacing), and the indicator is centered in
//     the inter-cell gap (or pinned to the panel edge for col 0).
//     For non-virtualizing WrapPanel we measure realized cells
//     directly so spacing falls out for free.
//
// Not handled:
//   * Cross-list reordering. The behavior keys off `FromIndexFormat`
//     against this control's own Items; a drop from a foreign source
//     carrying the same key would be silently mishandled. Cross-list
//     drops with DIFFERENT formats just no-op here, leaving the host
//     control to wire its own DragOver/Drop handlers for them.
//   * Item backings other than ObservableCollection. A plain-array
//     Items is read-only from this behavior's perspective and the
//     Drop silently no-ops.
export class ListReorderBehavior extends Behavior
{
    public static readonly FromIndexFormatKey = Model.RegisterProperty<string>(
        ListReorderBehavior, 'FromIndexFormat', 'mural/reorder/from-index', MetaData.None);

    // DataTemplate that renders the insertion indicator. When set,
    // the behavior materializes the template on the first DragOver of
    // a reorderable drag and positions the produced Visual at the
    // insertion gap on the host's overlay layer. Undefined → no
    // indicator. DataContext for the template is the host
    // ItemsControl. The behavior writes Width/Height + Canvas.Top/Left
    // on the produced visual to size it (a horizontal bar in vertical
    // mode, a vertical bar in wrap mode) — the template only paints,
    // it doesn't constrain.
    public static readonly InsertionAdornerTemplateKey = Model.RegisterProperty<DataTemplate | undefined>(
        ListReorderBehavior, 'InsertionAdornerTemplate', undefined, MetaData.None);

    public get FromIndexFormat(): string  { return this.get_property_value(ListReorderBehavior.FromIndexFormatKey); }
    public set FromIndexFormat(v: string) { this.set_property_value(ListReorderBehavior.FromIndexFormatKey, v); }

    public get InsertionAdornerTemplate(): DataTemplate | undefined { return this.get_property_value(ListReorderBehavior.InsertionAdornerTemplateKey); }
    public set InsertionAdornerTemplate(v: DataTemplate | undefined) { this.set_property_value(ListReorderBehavior.InsertionAdornerTemplateKey, v); }

    private _host: ItemsControl | undefined;
    // Adorner that hosts the insertion-line visual. Bound when the
    // host's tree contains an AdornerDecorator (the modern path);
    // _layer caches the resolved layer so teardown can remove it.
    private _adorner:        ReorderInsertionAdorner | undefined;
    private _adornerLayer:   AdornerLayer | undefined;
    // Overlay-fallback path for hosts NOT wrapped in an AdornerDecorator.
    // Same shape as before the migration so consumers without an
    // AdornerDecorator at the root keep getting an insertion line.
    private _adornerWrapper: Visual | undefined;
    private _adornerVisual:  Visual | undefined;

    public override OnAttached(visual: Visual): void
    {
        if (!(visual instanceof ItemsControl))
        {
            throw new Error(
                'ListReorderBehavior must attach to an ItemsControl (or subclass)');
        }
        this._host = visual;
        visual.AllowDrop = true;
        visual.AddRoutedEventListener('DragOver', (raw) =>
        {
            const args = raw as DragEventArgs;
            if (!args.Data.Has(this.FromIndexFormat)) return;
            args.Effect = DragDropEffects.Move;
            this.updateInsertionAdorner(args);
        });
        visual.AddRoutedEventListener('DragLeave', () => this.tearDownAdorner());
        visual.AddRoutedEventListener('Drop', (raw) =>
        {
            const args = raw as DragEventArgs;
            this.onDrop(args);
            this.tearDownAdorner();
        });
    }

    public override OnDetached(_visual: Visual): void
    {
        this.tearDownAdorner();
        this._host = undefined;
    }

    // ── Mode detection ────────────────────────────────────────────

    private isWrapMode(): boolean
    {
        const panel = this._host?.ItemsPanelInstance;
        return panel instanceof WrapPanel || panel instanceof VirtualizingWrapPanel;
    }

    // ── Insertion-index math ──────────────────────────────────────

    private computeInsertionIndex(args: DragEventArgs): number
    {
        const host = this._host;
        if (host === undefined) return 0;
        if (this.isWrapMode())
        {
            return this.computeWrapInsertionIndex(args.HostX, args.HostY, host);
        }
        return this.computeVerticalInsertionIndex(args.HostY, host);
    }

    private computeVerticalInsertionIndex(hostY: number, host: ItemsControl): number
    {
        const containers = host.logicalChildren;
        for (let i = 0; i < containers.length; i++)
        {
            const c = containers[i]!;
            const mid = hostTop(c) + c.ArrangedRect.Height / 2;
            if (hostY < mid) return i;
        }
        return containers.length;
    }

    // 2D nearest-cell insertion: walk realized containers, pick the
    // cell whose CENTER is closest to the cursor in (X, Y); refine to
    // before-or-after based on cursor-X vs cell horizontal midpoint.
    // For VirtualizingWrapPanel we read Columns + cell size to also
    // handle the "past the last realized cell" case analytically —
    // necessary when the cursor sits in a virtualized row whose
    // containers haven't materialized.
    private computeWrapInsertionIndex(hostX: number, hostY: number, host: ItemsControl): number
    {
        const panel = host.ItemsPanelInstance;
        const containers = host.logicalChildren;
        const itemCount = host.ItemCount();

        if (itemCount === 0) return 0;

        // Resolve panel-local cursor coords.
        const panelOriginX = panel !== undefined ? hostLeft(panel) : hostLeft(host);
        const panelOriginY = panel !== undefined ? hostTop(panel)  : hostTop(host);
        const localX = hostX - panelOriginX;
        const localY = hostY - panelOriginY;

        if (panel instanceof VirtualizingWrapPanel)
        {
            const cw = panel.ItemWidth;
            const ch = panel.ItemHeight;
            const hSp = Math.max(0, panel.HorizontalSpacing);
            const vSp = Math.max(0, panel.VerticalSpacing);
            const strideX = cw + hSp;
            const strideY = ch + vSp;
            const columns = Math.max(1, panel.Columns);
            // Panel arranges children in viewport-LOCAL coords (with
            // panel origin = top of the visible window). Map the
            // cursor's panel-local Y back to a FULL-extent Y by
            // adding the viewport's vertical offset; that's the value
            // the row computation expects.
            const fullY = localY + panel.Viewport.Y;
            // Floor-stride mapping: a cursor inside the inter-cell
            // gap (X in [col·strideX + cw, (col+1)·strideX)) still
            // resolves to `col` — the midpoint refinement below then
            // tips it to "after col" when cursor-X sits past col's
            // own horizontal midpoint, which is the correct behavior
            // for a cursor in the right half of the gap.
            const col = Math.max(0, Math.min(columns - 1, Math.floor(localX / strideX)));
            const row = Math.max(0, Math.floor(fullY / strideY));
            const totalRows = Math.ceil(itemCount / columns);
            // Past the bottom: drop at the end.
            if (row >= totalRows) return itemCount;
            let candidate = row * columns + col;
            if (candidate >= itemCount) candidate = itemCount - 1;
            // Refine: cursor-X past the cell's horizontal midpoint =
            // insert AFTER this cell. Midpoint is in CELL-local coords
            // (the cell sits at [col·strideX, col·strideX + cw)), so
            // the midpoint is col·strideX + cw/2.
            const cellCenterX = col * strideX + cw / 2;
            return localX > cellCenterX ? candidate + 1 : candidate;
        }

        // Non-virtualizing WrapPanel — walk realized containers.
        if (containers.length === 0) return 0;
        let bestIdx = 0;
        let bestDist = Number.POSITIVE_INFINITY;
        for (let i = 0; i < containers.length; i++)
        {
            const c = containers[i]!;
            const rect = c.ArrangedRect;
            const parentX = hostLeft(c.GetVisualParent() ?? c);
            const parentY = hostTop(c.GetVisualParent() ?? c);
            const cellCenterX = parentX + rect.X + rect.Width / 2;
            const cellCenterY = parentY + rect.Y + rect.Height / 2;
            const dx = hostX - cellCenterX;
            const dy = hostY - cellCenterY;
            const d2 = dx * dx + dy * dy;
            if (d2 < bestDist)
            {
                bestDist = d2;
                bestIdx = i;
            }
        }
        const bestRect = containers[bestIdx]!.ArrangedRect;
        const parentX = hostLeft(containers[bestIdx]!.GetVisualParent() ?? containers[bestIdx]!);
        const bestCenterX = parentX + bestRect.X + bestRect.Width / 2;
        return hostX > bestCenterX ? bestIdx + 1 : bestIdx;
    }

    // ── Adorner positioning ───────────────────────────────────────

    private updateInsertionAdorner(args: DragEventArgs): void
    {
        const host = this._host;
        if (host === undefined) return;
        const template = this.InsertionAdornerTemplate;
        if (template === undefined) return;

        const index = this.computeInsertionIndex(args);

        if (this._adornerVisual === undefined)
        {
            const produced = template.Apply(host);
            if (produced === undefined) return;
            const wrapper = new Canvas();
            wrapper.AddChild(produced);
            this._adornerWrapper = wrapper;
            this._adornerVisual = produced;
            args.Session?.then(() => this.tearDownAdorner());

            // Prefer adorner-layer hosting when the tree contains an
            // AdornerLayer provider. Look up FROM the items panel
            // rather than from the host so the nearest layer is the
            // ScrollContentPresenter's inner one (shares the scrolled
            // frame, so the insertion line tracks during auto-scroll)
            // rather than a root-level AdornerDecorator. Falls back
            // to the host when no items panel has been realized yet.
            const lookupRoot = host.ItemsPanelInstance ?? host;
            const layer = AdornerLayer.GetAdornerLayer(lookupRoot);
            if (layer !== undefined)
            {
                const adorner = new ReorderInsertionAdorner(host, wrapper);
                layer.Add(adorner);
                this._adorner      = adorner;
                this._adornerLayer = layer;
            }
            else
            {
                // Host is the logical owner: drop adorner inherits
                // resources / DataContext / inheritable DPs from the
                // list it's reordering, not from the OverlayLayer.
                const pt = host['target'] as PresentationTarget | undefined;
                if (pt === undefined) return;
                host.AttachOverlayChild(wrapper);
            }
        }

        if (this.isWrapMode())
        {
            this.positionWrapAdorner(this._adornerVisual!, host, index);
        }
        else
        {
            this.positionVerticalAdorner(this._adornerVisual!, host, index);
        }
    }

    private positionVerticalAdorner(visual: Visual, host: ItemsControl, index: number): void
    {
        // Position-frame: when the indicator lives in an AdornerLayer
        // mounted inside a ScrollContentPresenter (the inner-scrolled
        // case), the Canvas wrapper sits in the LAYER's local frame —
        // NOT host-coord. Walk to the layer's parent (where the layer
        // is mounted) and subtract the layer's own ArrangedRect offset
        // to get layer-local. Without a layer (the overlay-fallback
        // path), stop = undefined (walk to root) and offset = 0 — gives
        // back the host-coord math the OverlayLayer relies on.
        const layer = this._adornerLayer;
        const stop  = layer?.GetVisualParent();
        const oX    = layer?.ArrangedRect.X ?? 0;
        const oY    = layer?.ArrangedRect.Y ?? 0;

        const containers = host.logicalChildren;
        let gapY: number;
        if (index < containers.length)
        {
            gapY = topInFrame(containers[index]!, stop) - oY;
        }
        else if (containers.length > 0)
        {
            const last = containers[containers.length - 1]!;
            gapY = topInFrame(last, stop) - oY + last.ArrangedRect.Height;
        }
        else
        {
            gapY = topInFrame(host, stop) - oY;
        }
        Canvas.SetLeft(visual, leftInFrame(host, stop) - oX);
        visual.Width = host.ArrangedRect.Width;
        Canvas.SetTop(visual, gapY);
    }

    private positionWrapAdorner(visual: Visual, host: ItemsControl, index: number): void
    {
        const panel = host.ItemsPanelInstance;
        const layer = this._adornerLayer;
        const stop  = layer?.GetVisualParent();
        const oX    = layer?.ArrangedRect.X ?? 0;
        const oY    = layer?.ArrangedRect.Y ?? 0;
        const panelOriginX = (panel !== undefined ? leftInFrame(panel, stop) : leftInFrame(host, stop)) - oX;
        const panelOriginY = (panel !== undefined ? topInFrame(panel, stop)  : topInFrame(host,  stop)) - oY;
        const itemCount = host.ItemCount();

        if (panel instanceof VirtualizingWrapPanel)
        {
            const cw = panel.ItemWidth;
            const ch = panel.ItemHeight;
            const hSp = Math.max(0, panel.HorizontalSpacing);
            const vSp = Math.max(0, panel.VerticalSpacing);
            const strideX = cw + hSp;
            const strideY = ch + vSp;
            const columns = Math.max(1, panel.Columns);
            // Map insertion index to a row+column position. For the
            // past-last-cell case, position at the right edge of the
            // last cell (so the indicator sits at the end of the
            // partial last row rather than starting a new line).
            const clamped = Math.min(index, itemCount);
            const col = clamped % columns;
            const row = Math.floor(clamped / columns);
            // Indicator sits in the inter-cell GAP between (col-1)
            // and col when col > 0 — centered in the gap looks
            // cleanest. For col 0 there's no gap to the left, so pin
            // to the cell's left edge (= panel left edge).
            const cellLeftEdge = col * strideX;
            const cellX = col === 0 ? 0 : cellLeftEdge - hSp / 2;
            // Subtract the viewport offset so the indicator lands at
            // the same panel-local Y the cell itself was arranged at.
            // Row uses the stride so vertical spacing pushes the
            // indicator down past row gaps too.
            const cellY = row * strideY - panel.Viewport.Y;
            // Width=2 vertical bar across the gap (or at panel edge
            // for col 0). Width chosen to match the vertical-mode
            // horizontal bar's height (2px).
            visual.Width  = 2;
            visual.Height = ch;
            Canvas.SetLeft(visual, panelOriginX + cellX);
            Canvas.SetTop(visual,  panelOriginY + cellY);
            return;
        }

        // Non-virtualizing WrapPanel — derive position from realized
        // containers. Insertion BEFORE container `index`: indicator at
        // that container's left edge. PAST the last container:
        // indicator at the last container's right edge.
        const containers = host.logicalChildren;
        if (containers.length === 0)
        {
            visual.Width  = 2;
            visual.Height = 0;
            Canvas.SetLeft(visual, panelOriginX);
            Canvas.SetTop(visual,  panelOriginY);
            return;
        }
        let target: Visual;
        let atRightEdge: boolean;
        if (index < containers.length)
        {
            target = containers[index]!;
            atRightEdge = false;
        }
        else
        {
            target = containers[containers.length - 1]!;
            atRightEdge = true;
        }
        const r = target.ArrangedRect;
        const parent = target.GetVisualParent() ?? target;
        const ox = leftInFrame(parent, stop) - oX;
        const oy = topInFrame(parent,  stop) - oY;
        visual.Width  = 2;
        visual.Height = r.Height;
        Canvas.SetLeft(visual, ox + r.X + (atRightEdge ? r.Width : 0));
        Canvas.SetTop(visual,  oy + r.Y);
    }

    private tearDownAdorner(): void
    {
        const w = this._adornerWrapper;
        if (w === undefined) return;
        if (this._adorner !== undefined && this._adornerLayer !== undefined)
        {
            this._adornerLayer.Remove(this._adorner);
        }
        else
        {
            const host = this._host;
            host?.DetachOverlayChild(w);
        }
        this._adorner        = undefined;
        this._adornerLayer   = undefined;
        this._adornerWrapper = undefined;
        this._adornerVisual  = undefined;
    }

    private onDrop(args: DragEventArgs): void
    {
        const host = this._host;
        if (host === undefined) return;
        if (!args.Data.Has(this.FromIndexFormat)) return;
        const raw = args.Data.Get(this.FromIndexFormat);
        const from = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10);
        if (!Number.isFinite(from)) return;

        const items = host.Items;
        if (!(items instanceof ObservableCollection)) return;
        if (from < 0 || from >= items.Count) return;

        const target = this.computeInsertionIndex(args);
        if (target === from || target === from + 1) return; // no-op

        const item = items.Get(from)!;
        items.RemoveAt(from);
        // After RemoveAt, indices above `from` shift down by one.
        const insert = target > from ? target - 1 : target;
        items.Insert(insert, item);
    }
}

// Sum ancestor ArrangedRect offsets up to the host's origin. Same shape
// as the canvas-local origin walk in canvas-drop-behavior; pulled into
// a helper for clarity rather than duplicated.
function hostTop(v: Visual): number
{
    return topInFrame(v, undefined);
}

function hostLeft(v: Visual): number
{
    return leftInFrame(v, undefined);
}

// Same walk, but stops at `stop` instead of running off the top. Used
// for indicator positioning when the indicator sits in an AdornerLayer
// mounted INSIDE a ScrollContentPresenter — its local frame starts at
// the layer's parent, not at the host root. Pass `stop = undefined` for
// the host-root walk (overlay-fallback path).
function topInFrame(v: Visual, stop: Visual | undefined): number
{
    let y = 0;
    let cur: Visual | undefined = v;
    while (cur !== undefined && cur !== stop)
    {
        y += cur.ArrangedRect.Y;
        cur = cur.GetVisualParent();
    }
    return y;
}

function leftInFrame(v: Visual, stop: Visual | undefined): number
{
    let x = 0;
    let cur: Visual | undefined = v;
    while (cur !== undefined && cur !== stop)
    {
        x += cur.ArrangedRect.X;
        cur = cur.GetVisualParent();
    }
    return x;
}

// Adorner that hosts the user's InsertionAdornerTemplate-produced
// visual. Placement returns the full layer rect so the inner Canvas
// (where the behavior writes Canvas.SetLeft / SetTop on each move
// sample) shares the layer's coordinate frame. When the
// AdornerDecorator wraps the host root that's host-coord space —
// identical to the OverlayLayer behaviour the behaviour used to rely
// on, so the existing positionVerticalAdorner / positionWrapAdorner
// math doesn't need adjustment.
class ReorderInsertionAdorner extends Adorner
{
    private readonly _content: Visual;

    constructor(adornedElement: Visual, content: Visual)
    {
        super(adornedElement);
        this._content = content;
        this.AttachVisual(content);
        // The insertion line is pure feedback — pointer events must
        // reach the ItemsControl underneath so DragOver continues to
        // fire and the line position keeps refining as the cursor
        // moves over the same gap.
        this.IsHitTestVisible = false;
    }

    public override get visualChildren(): readonly Visual[] { return [this._content]; }

    // The behaviour writes Canvas.SetLeft / SetTop in host-coord space
    // on the inner Canvas; for those writes to land at the same on-
    // screen position when we hand things to the renderer, the
    // adorner must fill the layer's full rect. AdornerLayer passes
    // the layer's local-frame slot as `adornedRect` for the host
    // ItemsControl, but we want the broader layer frame — so derive
    // it from the layer's RenderSize directly.
    public override Placement(adornedRect: Rect, _desired: Size): Rect
    {
        void adornedRect;
        const layer = this.GetVisualParent();
        if (layer === undefined) return new Rect(0, 0, 0, 0);
        const ls = layer.RenderSize;
        return new Rect(0, 0, ls.Width, ls.Height);
    }

    protected override MeasureOverride(available: Size): Size
    {
        this._content.Measure(available);
        return this._content.DesiredSize;
    }

    protected override ArrangeOverride(finalSize: Size): Size
    {
        this._content.Arrange(new Rect(0, 0, finalSize.Width, finalSize.Height));
        return finalSize;
    }

    protected override RenderOverride(_dc: DrawingContext): void { }
}
