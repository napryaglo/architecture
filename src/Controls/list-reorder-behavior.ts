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
// Insertion-index math: the cursor's host-Y is compared against each
// realized container's vertical midpoint, and the new index is the
// first container whose midpoint is BELOW the cursor (a midpoint
// before the cursor means the cursor sits in the gap after that row).
// The model assumes a vertically-stacked container layout — works for
// the StackPanel-default ItemsPanel; horizontal layouts and grid
// layouts would need a panel-orientation switch.
//
// Not handled by this implementation:
//   * Visual insertion-line indicator. The behavior performs no
//     rendering. Consumers that want one can attach a sibling behavior
//     listening on the same DragOver and draw into the canvas
//     themselves.
//   * Cross-list reordering. The behavior keys off `FromIndexFormat`
//     against this control's own Items; a drop from a foreign source
//     carrying the same key would be silently mishandled. To support
//     cross-list, the DataObject would need a source-identity tag and
//     this behavior would have to gate the mutation on it.
//   * Horizontal layouts. The insertion-index math compares against
//     container vertical midpoints, so the behavior assumes a
//     vertically-stacked panel.
//   * Item backings other than ObservableCollection. A plain-array
//     Items is read-only from this behavior's perspective and the
//     Drop silently no-ops; callers that need array-backed reorder
//     would have to wrap the array OR expose a VM-supplied
//     OnReorder(from, to) callback (not wired today).
export class ListReorderBehavior extends Behavior
{
    public static readonly FromIndexFormatKey = Model.RegisterProperty<string>(
        ListReorderBehavior, 'FromIndexFormat', 'mural/reorder/from-index', MetaData.None);

    // DataTemplate that renders the insertion-line indicator. When set,
    // the behavior materializes the template on the first DragOver of
    // a reorderable drag and positions the produced Visual at the
    // insertion gap on the host's overlay layer. Undefined → no
    // indicator (consumers either render their own via a sibling
    // behavior or accept the headless mode). DataContext for the
    // template is the host ItemsControl, so the template can read
    // theme resources or bound ancestor properties.
    public static readonly InsertionAdornerTemplateKey = Model.RegisterProperty<DataTemplate | undefined>(
        ListReorderBehavior, 'InsertionAdornerTemplate', undefined, MetaData.None);

    public get FromIndexFormat(): string  { return this.get_property_value(ListReorderBehavior.FromIndexFormatKey); }
    public set FromIndexFormat(v: string) { this.set_property_value(ListReorderBehavior.FromIndexFormatKey, v); }

    public get InsertionAdornerTemplate(): DataTemplate | undefined { return this.get_property_value(ListReorderBehavior.InsertionAdornerTemplateKey); }
    public set InsertionAdornerTemplate(v: DataTemplate | undefined) { this.set_property_value(ListReorderBehavior.InsertionAdornerTemplateKey, v); }

    // Captured at attach time so the routed-event listeners — which
    // need to reach the host items collection AND walk the realised
    // container list — can resolve the right ItemsControl without an
    // extra cast on every fire.
    private _host: ItemsControl | undefined;
    // Materialized adorner state. The wrapper is a Canvas attached to
    // the overlay layer; the OverlayLayer arranges its children in the
    // full surface slot, so without the wrapper Canvas.Top/Left would
    // be ignored. The user-supplied template's produced Visual sits as
    // the canvas's child; we update Canvas.Top on it each move sample.
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

    // Materialize (lazily) the InsertionAdornerTemplate and position it
    // at the insertion gap. Subsequent moves on the same drag re-use
    // the same Visual — only `Canvas.Top` shifts.
    private updateInsertionAdorner(args: DragEventArgs): void
    {
        const host = this._host;
        if (host === undefined) return;
        const template = this.InsertionAdornerTemplate;
        if (template === undefined) return;

        const pt = host['target'] as PresentationTarget | undefined;
        if (pt === undefined) return;

        // Compute the host-Y position of the insertion gap.
        const index = this.computeInsertionIndex(args.HostY, host);
        const containers = host.logicalChildren;
        let gapY: number;
        if (index < containers.length)
        {
            // Top edge of the container at `index`.
            gapY = hostTop(containers[index]!);
        }
        else if (containers.length > 0)
        {
            // Past the last container — bottom edge of the last row.
            const last = containers[containers.length - 1]!;
            gapY = hostTop(last) + last.ArrangedRect.Height;
        }
        else
        {
            // Empty list — drop at the host's top edge.
            gapY = hostTop(host);
        }

        // Lazy materialize on the first valid DragOver of this session.
        if (this._adornerVisual === undefined)
        {
            const produced = template.Apply(host);
            if (produced === undefined) return;
            // Wrap in a Canvas so Canvas.Top / Canvas.Left attached
            // props actually steer the layout — the OverlayLayer's
            // ArrangeOverride passes the full surface slot to its
            // children and doesn't read Canvas.* attached props itself.
            const wrapper = new Canvas();
            wrapper.AddChild(produced);
            this._adornerWrapper = wrapper;
            this._adornerVisual = produced;
            // Auto-clean on session end.
            args.Session?.then(() => this.tearDownAdorner());
            // Position the produced visual within the wrapper Canvas:
            // the host's left edge + width fix the indicator to the
            // list's column.
            Canvas.SetLeft(produced, hostLeft(host));
            produced.Width = host.ArrangedRect.Width;
            pt.AttachOverlay(wrapper);
        }

        Canvas.SetTop(this._adornerVisual, gapY);
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

        // Resolve the bound items collection. This implementation only
        // mutates an ObservableCollection — a plain array would need
        // the consumer to handle the swap through a callback. Bail
        // silently when the binding doesn't expose a mutable
        // collection.
        const items = host.Items;
        if (!(items instanceof ObservableCollection)) return;
        if (from < 0 || from >= items.Count) return;

        const target = this.computeInsertionIndex(args.HostY, host);
        if (target === from || target === from + 1) return; // no-op

        const item = items.Get(from)!;
        items.RemoveAt(from);
        // After RemoveAt, indices above `from` shift down by one.
        const insert = target > from ? target - 1 : target;
        items.Insert(insert, item);
    }

    private computeInsertionIndex(hostY: number, host: ItemsControl): number
    {
        // The container list is the realized rows in items order.
        // For each container, compute its vertical midpoint in host
        // coordinates by walking up the visual tree summing
        // ArrangedRect offsets. The cursor's host-Y compared against
        // those midpoints gives the insertion slot. Falling off the
        // bottom drops at end-of-list.
        const containers = host.logicalChildren;
        for (let i = 0; i < containers.length; i++)
        {
            const c = containers[i]!;
            const mid = hostTop(c) + c.ArrangedRect.Height / 2;
            if (hostY < mid) return i;
        }
        return containers.length;
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
