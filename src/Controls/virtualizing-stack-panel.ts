import {
    MetaData,
    Model,
    ObservableCollection,
    Rect,
    Size,
    Visual,
    type IScrollInfo,
} from '../runtime/index.js';
import { VirtualizingPanel } from './virtualizing-panel.js';

// Vertical stack panel that realizes containers only for items
// intersecting the Viewport rect. Items are assumed to have uniform
// height (ItemHeight) — the simplification that makes the realization
// math O(1) per measure pass.
//
// Sizing:
//   * Width  — taken from availableSize (filled). Containers measure
//              against that width and ItemHeight.
//   * Height — total extent: itemCount * ItemHeight. The Viewport
//              is presumed to be a sub-rect of that extent (consumer
//              sets it explicitly; no built-in scrolling yet, just
//              the manual API).
//
// Realization protocol:
//   * MeasureOverride computes first / last item indices intersecting
//     the viewport, recycles realized containers outside that range,
//     and realizes (via ItemsControl.Generator) any in-range item not
//     already realized. Measures each realized container with
//     (availableWidth, ItemHeight).
//   * ArrangeOverride positions each realized container at
//     Rect(0, index * ItemHeight, availableWidth, ItemHeight).
//
// Realized containers also become logical children of the
// ItemsControl (via AttachContainer), so DataContext / inheritable
// properties on the ItemsControl flow through to them — same
// invariant as non-virtualizing ItemsControl.
//
// What's not in this cut: variable item heights (would need a per-
// item size cache and a coarser viewport calculation), horizontal
// orientation (trivial flip — defer), explicit scroll viewport
// (consumers set Viewport manually), recycling of containers across
// items (Recycle currently drops the mapping; Realize on a new item
// creates a fresh container).
export class VirtualizingStackPanel extends VirtualizingPanel implements IScrollInfo
{
    static {
        Model.RegisterProperty(VirtualizingStackPanel, 'Viewport',   Rect.Zero, MetaData.Measure);
        Model.RegisterProperty(VirtualizingStackPanel, 'ItemHeight', 20,        MetaData.Measure);
    }

    // Sparse map from item index → realized container Visual.
    private realized: Map<number, Visual> = new Map();

    public get Viewport(): Rect { return this.get_property_value('Viewport'); }
    public set Viewport(v: Rect) { this.set_property_value('Viewport', v); }

    public get ItemHeight(): number { return this.get_property_value('ItemHeight'); }
    public set ItemHeight(v: number) { this.set_property_value('ItemHeight', v); }

    // Read-only view of currently-realized item indices — useful for
    // tests and tooling that need to know what's "live."
    public get RealizedIndices(): readonly number[]
    {
        return [...this.realized.keys()].sort((a, b) => a - b);
    }

    // ----- IScrollInfo -----
    // ScrollViewer talks through these when this panel is its
    // (eventual) Content's IScrollInfo provider. Extent reflects the
    // total content size; viewport mirrors the Viewport rect (set
    // either by the consumer directly or by ScrollViewer via the
    // SetHorizontal/VerticalOffset hooks).

    public get ExtentWidth(): number
    {
        return this.Viewport.Width;
    }

    public get ExtentHeight(): number
    {
        const count = this.itemCount();
        return count * this.ItemHeight;
    }

    public get ViewportWidth(): number  { return this.Viewport.Width; }
    public get ViewportHeight(): number { return this.Viewport.Height; }

    public get HorizontalOffset(): number { return this.Viewport.X; }
    public get VerticalOffset(): number   { return this.Viewport.Y; }

    public SetHorizontalOffset(value: number): void
    {
        const vp = this.Viewport;
        if (vp.X === value) return;
        this.Viewport = new Rect(value, vp.Y, vp.Width, vp.Height);
    }

    public SetVerticalOffset(value: number): void
    {
        const vp = this.Viewport;
        if (vp.Y === value) return;
        this.Viewport = new Rect(vp.X, value, vp.Width, vp.Height);
    }

    protected override MeasureOverride(availableSize: Size): Size
    {
        const owner = this.itemsOwner;
        if (owner === undefined) return Size.Zero;
        const count = this.itemCount();
        if (count === 0) return new Size(availableSize.Width, 0);

        const h = this.ItemHeight;
        const vp = this.Viewport;

        // Items whose vertical band intersects the viewport:
        //   item i's band = [i * h, (i + 1) * h)
        //   intersects [vp.Y, vp.Y + vp.Height) when
        //     i * h < vp.Y + vp.Height  AND  (i + 1) * h > vp.Y
        // Solving for i:
        //   firstIndex = max(0, floor(vp.Y / h))
        //   lastIndex  = min(count - 1, floor((vp.Y + vp.Height - 1) / h))
        // When vp is empty / outside the extent, the range is empty
        // and nothing gets realized.
        let first = Math.max(0, Math.floor(vp.Y / h));
        let last  = Math.min(count - 1, Math.floor((vp.Y + vp.Height - 1) / h));
        if (vp.Height <= 0) { first = 0; last = -1; }  // empty range

        this.realizeRange(first, last);

        for (const container of this.realized.values())
        {
            container.Measure(new Size(availableSize.Width, h));
        }

        return new Size(availableSize.Width, count * h);
    }

    protected override ArrangeOverride(finalSize: Size): Size
    {
        const h = this.ItemHeight;
        for (const [index, container] of this.realized)
        {
            container.Arrange(new Rect(0, index * h, finalSize.Width, h));
        }
        return finalSize;
    }

    protected override RecycleAll(): void
    {
        const owner = this.itemsOwner;
        for (const [, container] of this.realized)
        {
            this.RemoveVisualChild(container);
            owner?.DetachContainer(container);
            owner?.Generator.Recycle(container);
        }
        this.realized.clear();
    }

    // Reconcile the realized set against the desired [first, last]
    // range: drop out-of-range realized containers, fill in missing
    // in-range items. Index keys mirror item indices in the owner's
    // Items collection so re-resolution after Items mutation falls
    // out naturally (mutation forces a measure via OnItemsChanged).
    private realizeRange(first: number, last: number): void
    {
        const owner = this.itemsOwner!;

        // Recycle indices outside the new range. Snapshot the keys
        // first because we mutate the map mid-loop.
        for (const index of [...this.realized.keys()])
        {
            if (index < first || index > last)
            {
                const container = this.realized.get(index)!;
                this.RemoveVisualChild(container);
                owner.DetachContainer(container);
                owner.Generator.Recycle(container);
                this.realized.delete(index);
            }
        }

        // Realize in-range items that aren't already realized.
        for (let i = first; i <= last; i++)
        {
            if (this.realized.has(i)) continue;
            const item = this.itemAt(i);
            if (item === undefined) continue;
            const container = owner.Generator.Realize(item);
            this.AddVisualChild(container);
            owner.AttachContainer(container);
            this.realized.set(i, container);
        }
    }

    private itemCount(): number
    {
        const items = this.itemsOwner?.Items;
        if (items === undefined) return 0;
        if (items instanceof ObservableCollection) return items.Count;
        return (items as readonly unknown[]).length;
    }

    private itemAt(i: number): unknown
    {
        const items = this.itemsOwner?.Items;
        if (items === undefined) return undefined;
        if (items instanceof ObservableCollection) return items.Get(i);
        return (items as readonly unknown[])[i];
    }
}
