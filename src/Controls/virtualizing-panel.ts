import { Panel, type CollectionChange } from '../runtime/index.js';
import type { ItemsControl } from './items-control.js';

// Marker base class for panels that manage their own container
// realization rather than receiving them upfront from ItemsControl.
// When ItemsControl.ItemsPanel produces an instance of this, the
// ItemsControl skips its bulk Realize / AddVisualChild step and
// hands the panel a back-pointer (SetItemsOwner). The panel decides
// when to realize / recycle — typically based on a viewport — by
// asking the ItemsControl's Generator for containers on demand.
//
// Layout / render contract:
//   * MeasureOverride / ArrangeOverride compute which items are in
//     view, realize / recycle as needed, then measure / arrange just
//     the realized containers.
//   * OnItemsChanged is called by the ItemsControl whenever its
//     Items collection mutates; the panel re-evaluates realization.
//
// Containers realized through this path get their visual parent =
// the panel (via AddVisualChild) and their logical parent =
// the ItemsControl (via ItemsControl.AttachContainer). Same two-tree
// divergence as non-virtualized ItemsControl.
export abstract class VirtualizingPanel extends Panel
{
    private _itemsOwner: ItemsControl | undefined;

    // Owner-pointer accessor. Subclasses use this to read items, ask
    // the Generator for containers, and ask the ItemsControl to
    // attach / detach containers logically.
    protected get itemsOwner(): ItemsControl | undefined { return this._itemsOwner; }

    // Called by ItemsControl when this panel is installed as / removed
    // as the ItemsPanel. Subclasses invalidate measure so the next
    // layout pass realizes containers under the new owner.
    public SetItemsOwner(owner: ItemsControl | undefined): void
    {
        if (this._itemsOwner === owner) return;
        // Owner change invalidates every realized container — they
        // belonged to the previous owner's generator.
        this.RecycleAll();
        this._itemsOwner = owner;
        this.InvalidateMeasure();
    }

    // Called by ItemsControl on every CollectionChange to Items
    // (insert / remove / replace / clear). Default: recycle all
    // realized containers and invalidate measure — subclasses can
    // override for incremental dispatches.
    public OnItemsChanged(_change: CollectionChange<unknown>): void
    {
        this.RecycleAll();
        this.InvalidateMeasure();
    }

    // Tear down every currently-realized container (visual detach,
    // logical detach, recycle in generator). Subclasses must call
    // this when their owner changes, when ItemsControl signals a
    // disruptive change (cleared), or when shutting down.
    protected abstract RecycleAll(): void;
}
