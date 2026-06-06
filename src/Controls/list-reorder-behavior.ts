import {
    Behavior,
    MetaData,
    Model,
    ObservableCollection,
    type DragEventArgs,
    type Visual,
} from '../runtime/index.js';
import { DragDropEffects } from '../runtime/index.js';
import type { PresentationTarget } from '../visual-engine/index.js';
import { Canvas } from './canvas.js';
import { DataTemplate } from './data-template.js';
import { ItemsControl } from './items-control.js';
import { VirtualizingWrapPanel } from './virtualizing-wrap-panel.js';
import { WrapPanel } from './wrap-panel.js';

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
//     Columns; for non-virtualizing WrapPanel we measure realized
//     cells directly.
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
            const columns = Math.max(1, panel.Columns);
            // Panel arranges children in viewport-LOCAL coords (with
            // panel origin = top of the visible window). Map the
            // cursor's panel-local Y back to a FULL-extent Y by
            // adding the viewport's vertical offset; that's the value
            // the row computation expects.
            const fullY = localY + panel.Viewport.Y;
            const col = Math.max(0, Math.min(columns - 1, Math.floor(localX / cw)));
            const row = Math.max(0, Math.floor(fullY / ch));
            const totalRows = Math.ceil(itemCount / columns);
            // Past the bottom: drop at the end.
            if (row >= totalRows) return itemCount;
            let candidate = row * columns + col;
            if (candidate >= itemCount) candidate = itemCount - 1;
            // Refine: cursor-X past the cell's horizontal midpoint =
            // insert AFTER this cell.
            const cellCenterX = (col + 0.5) * cw;
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

        const pt = host['target'] as PresentationTarget | undefined;
        if (pt === undefined) return;

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
            pt.AttachOverlay(wrapper);
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
        const containers = host.logicalChildren;
        let gapY: number;
        if (index < containers.length)
        {
            gapY = hostTop(containers[index]!);
        }
        else if (containers.length > 0)
        {
            const last = containers[containers.length - 1]!;
            gapY = hostTop(last) + last.ArrangedRect.Height;
        }
        else
        {
            gapY = hostTop(host);
        }
        Canvas.SetLeft(visual, hostLeft(host));
        visual.Width = host.ArrangedRect.Width;
        Canvas.SetTop(visual, gapY);
    }

    private positionWrapAdorner(visual: Visual, host: ItemsControl, index: number): void
    {
        const panel = host.ItemsPanelInstance;
        const panelOriginX = panel !== undefined ? hostLeft(panel) : hostLeft(host);
        const panelOriginY = panel !== undefined ? hostTop(panel)  : hostTop(host);
        const itemCount = host.ItemCount();

        if (panel instanceof VirtualizingWrapPanel)
        {
            const cw = panel.ItemWidth;
            const ch = panel.ItemHeight;
            const columns = Math.max(1, panel.Columns);
            // Map insertion index to a row+column position. For the
            // past-last-cell case, position at the right edge of the
            // last cell (so the indicator sits at the end of the
            // partial last row rather than starting a new line).
            const clamped = Math.min(index, itemCount);
            const col = clamped % columns;
            const row = Math.floor(clamped / columns);
            const cellX = col * cw;
            // Subtract the viewport offset so the indicator lands at
            // the same panel-local Y the cell itself was arranged at.
            const cellY = row * ch - panel.Viewport.Y;
            // Width=2 vertical bar at the cell's LEFT edge — the gap
            // between (col-1) and col. Width chosen to match the
            // vertical-mode horizontal bar's height (2px).
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
        const ox = hostLeft(target.GetVisualParent() ?? target);
        const oy = hostTop(target.GetVisualParent() ?? target);
        visual.Width  = 2;
        visual.Height = r.Height;
        Canvas.SetLeft(visual, ox + r.X + (atRightEdge ? r.Width : 0));
        Canvas.SetTop(visual,  oy + r.Y);
    }

    private tearDownAdorner(): void
    {
        const w = this._adornerWrapper;
        if (w === undefined) return;
        const host = this._host;
        const pt = host?.['target'] as PresentationTarget | undefined;
        pt?.DetachOverlay(w);
        this._adornerWrapper = undefined;
        this._adornerVisual = undefined;
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
    let y = 0;
    let cur: Visual | undefined = v;
    while (cur !== undefined)
    {
        y += cur.ArrangedRect.Y;
        cur = cur.GetVisualParent();
    }
    return y;
}

function hostLeft(v: Visual): number
{
    let x = 0;
    let cur: Visual | undefined = v;
    while (cur !== undefined)
    {
        x += cur.ArrangedRect.X;
        cur = cur.GetVisualParent();
    }
    return x;
}
