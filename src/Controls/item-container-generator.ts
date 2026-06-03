import type { Visual } from '../runtime/index.js';
import type { ItemsControl } from './items-control.js';

// Bridge between an ItemsControl's data items and the Visual
// containers that present them. Mirrors WPF's IItemContainerGenerator —
// owned by ItemsControl, queried by ItemsPanel-side code (regular
// and virtualizing) to realize / recycle containers on demand.
//
// Today's role: a typed forward/reverse mapping, a Realize entry
// point that delegates container construction to the ItemsControl's
// GetContainerForItemOverride hook, and a small recycle pool that
// virtualizing panels can drain to amortize allocation. Both the
// default ItemsControl flow and virtualizing panels go through these
// methods so the mapping stays consistent.
//
// Recycling model: Recycle pushes the container into a small per-
// generator pool keyed by NOTHING — the pool just holds Visuals
// that were previously detached. A subsequent Realize for a NEW
// item may take a pooled container ONLY when the ItemsControl
// opts-in via TryRebindContainer; otherwise the pool stays full
// and the new item gets a fresh container. The opt-in keeps the
// default "fresh container per item" semantics that mural's
// DataTemplate (factory-per-item) implies, while still letting
// purpose-built virtualizing scrollers reuse rows.
export class ItemContainerGenerator
{
    private readonly itemToContainer: Map<unknown, Visual> = new Map();
    private readonly containerToItem: Map<Visual, unknown> = new Map();
    // Containers that have been Recycle()'d but not yet detached from
    // memory. A non-virtualizing ItemsControl drops them on the next
    // GC after the panel detaches their Visual subtree — virtualizing
    // panels can call ClaimRecycled to take ownership of one before
    // realizing a new item, avoiding a fresh allocation.
    private readonly recyclePool: Visual[] = [];

    constructor(public readonly itemsControl: ItemsControl) {}

    // Materialize a container for `item`. Delegates the construction
    // to ItemsControl.GetContainerForItemOverride so subclasses
    // (ListBox → ListBoxItem, TreeView → TreeViewItem) can wrap
    // items in their own container shape without subclassing the
    // generator. Idempotent — if the item already has a realized
    // container, returns it as-is.
    public Realize(item: unknown): Visual
    {
        const existing = this.itemToContainer.get(item);
        if (existing !== undefined) return existing;
        const container = this.itemsControl.GetContainerForItemOverride(item);
        this.itemToContainer.set(item, container);
        this.containerToItem.set(container, item);
        return container;
    }

    // Drop the (item, container) mapping AND push the container into
    // the recycle pool. Doesn't detach the Visual from its parent —
    // the caller (ItemsControl or virtualizing panel) owns tree
    // wiring. After Recycle the container is no longer reachable
    // through ContainerFromItem / ItemFromContainer; Realize on the
    // same item will produce a fresh one (or claim a pooled one).
    public Recycle(container: Visual): void
    {
        const item = this.containerToItem.get(container);
        if (item === undefined) return;
        this.itemToContainer.delete(item);
        this.containerToItem.delete(container);
        // Bounded pool — 32 is enough to cover one screen of rows on
        // a virtualized list without holding the GC hostage on
        // large-list scenarios where churn dwarfs reuse. Tune later
        // if a profile demands it.
        if (this.recyclePool.length < 32)
        {
            this.recyclePool.push(container);
        }
    }

    // Virtualization helper: pop a previously-recycled container, or
    // undefined when the pool is empty. The caller is responsible for
    // re-binding it to a new item (typically by setting the container's
    // DataContext / Content / re-running a template's bindable parts)
    // and for re-attaching it to the panel. mural's DataTemplate is
    // factory-per-item, so a fresh `Apply` call on the same item is the
    // simplest "rebind" — but virtualizing panels with bindable
    // containers (ListBoxItem with a DataContext-bound Content) can
    // benefit by skipping the Apply entirely.
    public ClaimRecycled(): Visual | undefined
    {
        return this.recyclePool.pop();
    }

    public get RecycledCount(): number
    {
        return this.recyclePool.length;
    }

    public ContainerFromItem(item: unknown): Visual | undefined
    {
        return this.itemToContainer.get(item);
    }

    public ItemFromContainer(container: Visual): unknown
    {
        return this.containerToItem.get(container);
    }

    public IsRealized(item: unknown): boolean
    {
        return this.itemToContainer.has(item);
    }

    public Clear(): void
    {
        this.itemToContainer.clear();
        this.containerToItem.clear();
        // Pool is per-mapping; clearing the mapping drops the pool
        // too (containers in the pool were tied to the old templates
        // / selectors and shouldn't be reused after a template swap).
        this.recyclePool.length = 0;
    }

    public get Count(): number
    {
        return this.itemToContainer.size;
    }
}
