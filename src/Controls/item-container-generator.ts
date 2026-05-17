import type { Visual } from '../runtime/index.js';
import type { ItemsControl } from './items-control.js';

// Bridge between an ItemsControl's data items and the Visual
// containers that present them. Mirrors WPF's IItemContainerGenerator —
// owned by ItemsControl, queried by ItemsPanel-side code (regular
// and virtualizing) to realize / recycle containers on demand.
//
// Today's role: a typed forward/reverse mapping plus a Realize entry
// point that applies the ItemsControl's current ItemTemplate. Both
// the default ItemsControl flow and (future) virtualizing panels go
// through these methods so the mapping stays consistent.
//
// Virtualization-readiness: Recycle drops the (item, container) pair
// without disposing the Visual — the caller owns the container's
// tree wiring (Attach / Detach). Currently every Realize creates a
// fresh container; container recycling (reusing the same Visual for
// a different item) is a future optimization, not the current cut.
export class ItemContainerGenerator
{
    private readonly itemToContainer: Map<unknown, Visual> = new Map();
    private readonly containerToItem: Map<Visual, unknown> = new Map();

    constructor(public readonly itemsControl: ItemsControl) {}

    // Materialize a container for `item` using the ItemsControl's
    // current ItemTemplate. Idempotent — if the item already has a
    // realized container, returns it as-is rather than creating a
    // duplicate. Throws when ItemTemplate is undefined (caller is
    // expected to check first; this is a programming-error guard).
    public Realize(item: unknown): Visual
    {
        const existing = this.itemToContainer.get(item);
        if (existing !== undefined) return existing;
        const template = this.itemsControl.ItemTemplate;
        if (template === undefined)
        {
            throw new Error('ItemContainerGenerator.Realize: ItemsControl.ItemTemplate is undefined.');
        }
        const container = template.Apply(item);
        this.itemToContainer.set(item, container);
        this.containerToItem.set(container, item);
        return container;
    }

    // Drop the (item, container) mapping. Doesn't dispose the
    // container's Visual subtree or detach it from the tree — the
    // caller (typically ItemsControl or a virtualizing panel) owns
    // those. After Recycle the container is no longer reachable
    // through ContainerFromItem / ItemFromContainer; Realize on the
    // same item will produce a fresh one.
    public Recycle(container: Visual): void
    {
        const item = this.containerToItem.get(container);
        if (item === undefined) return;
        this.itemToContainer.delete(item);
        this.containerToItem.delete(container);
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
    }

    public get Count(): number
    {
        return this.itemToContainer.size;
    }
}
