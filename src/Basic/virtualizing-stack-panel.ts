import {
    MetaData,
    Model,
    Rect,
    Size,
    Visual,
    type IScrollInfo,
} from '../runtime/index.js';
import { Orientation } from './stack-panel.js';
import { VirtualizingPanel } from './virtualizing-panel.js';

// Stack panel that realizes containers only for items intersecting the
// Viewport rect. Items are assumed to have uniform extent along the
// primary axis (ItemHeight when Orientation=Vertical, ItemWidth when
// Orientation=Horizontal) — the simplification that makes the
// realization math O(1) per measure pass.
//
// Orientation:
//   * Vertical (default) — items stack top-to-bottom, scroll vertically.
//   * Horizontal         — items stack left-to-right, scroll horizontally.
//
// Sizing:
//   * Primary axis     — total extent = itemCount × per-item size. The
//                        Viewport is presumed to be a sub-rect of that
//                        extent (consumer sets it explicitly; no
//                        built-in scrolling yet, just the manual API).
//   * Cross axis       — taken from availableSize (filled). Containers
//                        measure against the available cross-axis size.
//
// Realization protocol:
//   * MeasureOverride computes first / last item indices intersecting
//     the viewport along the primary axis, recycles realized
//     containers outside that range, and realizes (via
//     ItemsControl.Generator) any in-range item not already realized.
//   * ArrangeOverride positions each realized container along the
//     primary axis based on its index × per-item size.
//
// Realized containers also become logical children of the
// ItemsControl (via AttachContainer), so DataContext / inheritable
// properties on the ItemsControl flow through to them — same
// invariant as non-virtualizing ItemsControl.
//
// What's not in this cut: variable item sizes (would need a per-item
// size cache and a coarser viewport calculation), explicit scroll
// viewport (consumers set Viewport manually).
export class VirtualizingStackPanel extends VirtualizingPanel implements IScrollInfo
{
    // Viewport DP lives on VirtualizingPanel base — see virtualizing-panel.ts.
    public static readonly ItemHeightKey  = Model.RegisterProperty<number>(     VirtualizingStackPanel, 'ItemHeight',  20,                   MetaData.Measure);
    public static readonly ItemWidthKey   = Model.RegisterProperty<number>(     VirtualizingStackPanel, 'ItemWidth',   20,                   MetaData.Measure);
    public static readonly OrientationKey = Model.RegisterProperty<Orientation>(VirtualizingStackPanel, 'Orientation', Orientation.Vertical, MetaData.Measure);

    // Sparse map from item index → realized container Visual.
    private realized: Map<number, Visual> = new Map();
    // Measured primary-axis size per item index. Populated after a
    // container measures during MeasureOverride; un-measured items
    // fall back to the ItemHeight / ItemWidth estimate. The map is
    // sparse — only realized items populate; further items use the
    // estimate during viewport math.
    private sizeCache: Map<number, number> = new Map();
    // Max cross-axis desired size across realized containers, captured
    // during the latest MeasureOverride. Surfaced through
    // ExtentWidth/Height on the non-scrolling axis so a ScrollViewer
    // sizing itself to its content's cross-axis (no explicit Width on
    // the host) collapses to its tile width instead of stretching to
    // fill the parent slot.
    private measuredCross: number = 0;

    public get ItemHeight(): number { return this.get_property_value(VirtualizingStackPanel.ItemHeightKey); }
    public set ItemHeight(v: number) { this.set_property_value(VirtualizingStackPanel.ItemHeightKey, v); }

    public get ItemWidth(): number { return this.get_property_value(VirtualizingStackPanel.ItemWidthKey); }
    public set ItemWidth(v: number) { this.set_property_value(VirtualizingStackPanel.ItemWidthKey, v); }

    public get Orientation(): Orientation { return this.get_property_value(VirtualizingStackPanel.OrientationKey); }
    public set Orientation(v: Orientation) { this.set_property_value(VirtualizingStackPanel.OrientationKey, v); }

    private get isHorizontal(): boolean { return this.Orientation === Orientation.Horizontal; }
    // Per-item extent along the primary (scrolling) axis.
    private get itemExtent(): number
    {
        return this.isHorizontal ? this.ItemWidth : this.ItemHeight;
    }

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
        return this.isHorizontal
            ? this.itemCount() * this.ItemWidth
            : this.measuredCross;
    }

    public get ExtentHeight(): number
    {
        return this.isHorizontal
            ? this.measuredCross
            : this.itemCount() * this.ItemHeight;
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
        const horizontal = this.isHorizontal;
        const vp  = this.Viewport;

        if (count === 0)
        {
            return horizontal
                ? new Size(0, availableSize.Height)
                : new Size(availableSize.Width, 0);
        }

        // Variable-size viewport hit-test: walk cumulative offsets
        // (cached size for measured items, ItemHeight/ItemWidth estimate
        // for un-measured ones) until the band crosses the viewport.
        const vpStart = horizontal ? vp.X      : vp.Y;
        const vpEnd   = vpStart + (horizontal ? vp.Width : vp.Height);
        const vpLen   = horizontal ? vp.Width : vp.Height;
        let first = 0;
        let last  = -1;
        if (vpLen > 0)
        {
            const range = this.indicesIntersecting(vpStart, vpEnd, count);
            first = range.first;
            last  = range.last;
        }

        this.realizeRange(first, last);

        // Measure each realized container with the cross-axis size
        // filled and the primary axis Infinity (so the container can
        // report its natural height). The result feeds back into
        // sizeCache for the next pass's viewport math.
        const crossExtent = horizontal ? availableSize.Height : availableSize.Width;
        const childSize = horizontal
            ? new Size(Number.POSITIVE_INFINITY, crossExtent)
            : new Size(crossExtent, Number.POSITIVE_INFINITY);
        let maxCross = 0;
        for (const [index, container] of this.realized)
        {
            container.Measure(childSize);
            const desired = horizontal
                ? container.DesiredSize.Width
                : container.DesiredSize.Height;
            // Cache the measured primary-axis extent so subsequent
            // passes account for variable sizes. Skip when the
            // container reported Infinity (defensive — shouldn't
            // happen from a real Visual).
            if (Number.isFinite(desired))
            {
                this.sizeCache.set(index, desired);
            }
            const cross = horizontal
                ? container.DesiredSize.Height
                : container.DesiredSize.Width;
            if (Number.isFinite(cross)) maxCross = Math.max(maxCross, cross);
        }
        this.measuredCross = maxCross;

        // Total extent = sum of cached sizes + estimate for the rest.
        // Cross-axis = max of realized children's desired cross size
        // (WPF StackPanel convention) — lets the panel collapse to its
        // content width when the parent slot is unbounded. With
        // virtualization the max is only over realized containers; a
        // wider unrealized container outside the viewport would not
        // contribute, but in practice items in a virtualized list are
        // uniform-width and the first realized container is
        // representative.
        const totalPrimary = this.totalPrimaryExtent(count);
        return horizontal
            ? new Size(totalPrimary, maxCross)
            : new Size(maxCross, totalPrimary);
    }

    protected override ArrangeOverride(finalSize: Size): Size
    {
        const horizontal = this.isHorizontal;
        // Pre-compute prefix sums so each container arranges at the
        // right offset given variable sizes. Cheap O(maxIndex) work.
        const maxIdx = Math.max(0, ...this.realized.keys());
        const offsets: number[] = [];
        let cursor = 0;
        for (let i = 0; i <= maxIdx; i++)
        {
            offsets.push(cursor);
            cursor += this.sizeOf(i);
        }
        // Viewport-local arrange. In delegate-mode the SCP arranges
        // this panel into a viewport-sized slot starting at (0, 0);
        // items at full-extent offsets (1000+ px down) would land
        // outside the slot and never paint. Subtract the viewport's
        // primary-axis offset so the first visible item lands at
        // panel-local 0.
        const vp = this.Viewport;
        const scrollOff = horizontal ? vp.X : vp.Y;
        for (const [index, container] of this.realized)
        {
            const off  = offsets[index]! - scrollOff;
            const size = this.sizeOf(index);
            const rect = horizontal
                ? new Rect(off, 0, size, finalSize.Height)
                : new Rect(0, off, finalSize.Width, size);
            container.Arrange(rect);
        }
        return finalSize;
    }

    // ── Variable-size helpers ───────────────────────────────────────

    // Primary-axis extent for item `index`: measured size if cached,
    // otherwise the consumer's ItemHeight / ItemWidth estimate.
    private sizeOf(index: number): number
    {
        const cached = this.sizeCache.get(index);
        return cached !== undefined ? cached : this.itemExtent;
    }

    // Walk cumulative offsets to find the first index whose band ends
    // strictly after `start` and the last index whose band begins
    // strictly before `end`. O(count) — acceptable for our typical
    // item counts; a binary-search prefix-sum could speed it up if a
    // profile demands it.
    private indicesIntersecting(start: number, end: number, count: number): { first: number; last: number }
    {
        let offset = 0;
        let first = -1;
        let last  = -1;
        for (let i = 0; i < count; i++)
        {
            const size  = this.sizeOf(i);
            const itemEnd = offset + size;
            if (first === -1 && itemEnd > start)
            {
                first = i;
            }
            if (offset < end)
            {
                last = i;
            }
            else if (first !== -1)
            {
                break;  // past the viewport — no more intersections.
            }
            offset = itemEnd;
        }
        if (first === -1) return { first: 0, last: -1 };
        return { first, last };
    }

    private totalPrimaryExtent(count: number): number
    {
        let total = 0;
        for (let i = 0; i < count; i++)
        {
            total += this.sizeOf(i);
        }
        return total;
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

        // Realize in-range items via the generator's session API.
        // GenerateNext returns (container, isNewlyRealized); newly-
        // realized containers need tree wiring (panel.AddVisualChild +
        // owner.AttachContainer), then every container — fresh or
        // reused — gets PrepareItemContainer so ItemContainerStyle,
        // AlternationIndex, and subclass-specific Prepare logic run
        // exactly once per realization. Skipping that call was a
        // long-standing gap in the previous Realize-direct loop —
        // virtualized rows missed ItemContainerStyle entirely.
        const session = owner.Generator.StartAt(
            owner.Generator.GeneratorPositionFromIndex(first));
        try
        {
            for (let i = first; i <= last; i++)
            {
                if (this.realized.has(i))
                {
                    // Skip past — advance the cursor by calling
                    // GenerateNext but discard the result (it'll be
                    // the same already-realized container).
                    session.GenerateNext();
                    continue;
                }
                const { container, isNewlyRealized } = session.GenerateNext();
                if (container === undefined) continue;
                if (isNewlyRealized)
                {
                    this.AddVisualChild(container);
                    owner.AttachContainer(container);
                }
                owner.Generator.PrepareItemContainer(container);
                this.realized.set(i, container);
            }
        }
        finally
        {
            session.Dispose();
        }
    }

    private itemCount(): number
    {
        return this.itemsOwner?.ItemCount() ?? 0;
    }
}
