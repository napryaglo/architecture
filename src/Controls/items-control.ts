import {
    MetaData,
    Model,
    ObservableCollection,
    Panel,
    Rect,
    Size,
    Visual,
    type CollectionChange,
    type DrawingContext,
    type PropertyDescriptor,
} from '../runtime/index.js';
import { ControlTemplate, type TemplateInstance } from './control-template.js';
import type { DataTemplate } from './data-template.js';
import { ItemContainerGenerator } from './item-container-generator.js';
import { ItemsPresenter } from './items-presenter.js';
import { VirtualizingPanel } from './virtualizing-panel.js';

// Factory that constructs a fresh Panel for an ItemsControl to host its
// generated containers in. Same shape as ControlTemplate's factory —
// the ItemsControl invokes it once when ItemsPanel changes.
export type ItemsPanelFactory = () => Panel;

// Data-driven container that materializes a Visual per item in its
// Items collection, using ItemTemplate to render each one, hosted
// inside an ItemsPanel.
//
// Items may be a plain readonly array OR an ObservableCollection. With
// an array, the materialized tree rebuilds when Items is reassigned;
// with an ObservableCollection, each mutation triggers a rebuild
// (current cut: simple full rebuild; incremental insert / remove is
// a future optimization).
//
// Two-tree wiring is the headline:
//   * Visual tree: ItemsControl → ItemsPanel → generated containers
//   * Logical tree: ItemsControl → generated containers (directly,
//                   bypassing the panel)
//
// That divergence means DataContext / inheritable properties set on
// the ItemsControl flow down to each container without passing through
// the items panel — matching WPF semantics. The items panel itself is
// template-internal (visual only), not a logical child of the
// ItemsControl.
//
// Simplifications vs WPF:
//   * No surrounding ControlTemplate / ItemsPresenter — the items
//     panel is the ItemsControl's direct visual child.
//   * No virtualization (every item materializes a container).
//   * No item-container styling.
//   * Generated containers ARE the template output — there's no
//     ContentPresenter wrapper around each item.
export class ItemsControl extends Visual
{
    static {
        Model.RegisterProperty(ItemsControl, 'Items',        undefined, MetaData.Measure);
        Model.RegisterProperty(ItemsControl, 'ItemTemplate', undefined, MetaData.Measure);
        Model.RegisterProperty(ItemsControl, 'ItemsPanel',   undefined, MetaData.Measure);
        Model.RegisterProperty(ItemsControl, 'Template',     undefined, MetaData.Measure);
    }

    private _itemsPanel: Panel | undefined;
    private _itemsSubscription: (() => void) | undefined;

    // When a ControlTemplate is applied, this holds the apply result:
    // root + presenter for surrounding chrome. The items panel ends
    // up as a visual child of the ItemsPresenter inside (when one is
    // present); without a template the panel is a direct visual
    // child of the ItemsControl.
    private _templateInstance: TemplateInstance | undefined;
    private _itemsPresenter: ItemsPresenter | undefined;
    // Generated containers, in the same order as their corresponding
    // items (for non-virtualizing scenarios). Source of truth for
    // logicalChildren; mirrored into the items panel's visual-children
    // list. May be a subset of the items collection if a virtualizing
    // panel is used (only realized items appear here).
    private _containers: Visual[] = [];
    // Bridge between data items and container Visuals. Owns the
    // item ↔ container mapping and the Realize / Recycle entry points.
    // Public so virtualizing panels can realize containers on demand.
    private readonly _generator: ItemContainerGenerator = new ItemContainerGenerator(this);

    public get Generator(): ItemContainerGenerator { return this._generator; }

    // Public container-lifecycle hooks. Both the internal non-
    // virtualizing path (rebuildContainers / handleItemsChange) and
    // VirtualizingPanel realization route through here, so _containers
    // (the source of truth for logicalChildren) stays consistent
    // regardless of who's driving.
    public AttachContainer(container: Visual): void
    {
        this.AttachLogical(container);
        this._containers.push(container);
    }

    public InsertContainer(index: number, container: Visual): void
    {
        this.AttachLogical(container);
        this._containers.splice(index, 0, container);
    }

    public DetachContainer(container: Visual): void
    {
        const i = this._containers.indexOf(container);
        if (i >= 0) this._containers.splice(i, 1);
        this.DetachLogical(container);
    }

    public get Items(): ObservableCollection<any> | readonly unknown[] | undefined
    {
        return this.get_property_value('Items');
    }

    public set Items(value: ObservableCollection<any> | readonly unknown[] | undefined)
    {
        const old = this.Items;
        if (old === value) return;

        this._itemsSubscription?.();
        this._itemsSubscription = undefined;

        this.set_property_value('Items', value);

        if (value instanceof ObservableCollection)
        {
            // Incremental — dispatch on change.kind so single-item
            // inserts / removes / replaces touch only the affected
            // container instead of tearing down the whole panel.
            // Cleared still tears down (it's the destructive case).
            this._itemsSubscription = value.Subscribe(change => this.handleItemsChange(change));
        }

        this.rebuildContainers();
    }

    public get ItemTemplate(): DataTemplate | undefined
    {
        return this.get_property_value('ItemTemplate');
    }

    public set ItemTemplate(value: DataTemplate | undefined)
    {
        if (this.ItemTemplate === value) return;
        this.set_property_value('ItemTemplate', value);
        // Template change invalidates every cached container — Realize
        // would return stale instances built from the old template.
        // rebuildContainers will detach + clear the generator first.
        this.rebuildContainers();
    }

    public get Template(): ControlTemplate | undefined
    {
        return this.get_property_value('Template');
    }

    // Optional ControlTemplate that wraps the items panel in
    // surrounding chrome (header, footer, scroll viewer, etc.). The
    // template must contain an ItemsPresenter — when applied, the
    // items panel is slotted into that presenter rather than parented
    // directly under this ItemsControl. Without a Template the panel
    // is hosted directly (legacy behavior).
    //
    // Re-templating preserves the items panel instance and its
    // realized containers: the panel is moved from the old presenter
    // (or direct slot) into the new presenter.
    public set Template(value: ControlTemplate | undefined)
    {
        if (this.Template === value) return;
        this.set_property_value('Template', value);
        this.rebuildTemplate();
    }

    public get ItemsPanel(): ItemsPanelFactory | undefined
    {
        return this.get_property_value('ItemsPanel');
    }

    // Re-apply the current Template. Carries the existing items panel
    // (and its realized containers) across the swap so re-templating
    // is non-destructive for the items themselves — the items panel
    // is unparented from its old host (presenter or this ItemsControl
    // directly) and re-parented under the new presenter (or restored
    // as a direct child if the new template has no ItemsPresenter or
    // there's no new Template at all).
    private rebuildTemplate(): void
    {
        const panel = this._itemsPanel;

        // Detach panel from its current visual parent (old presenter
        // or this control).
        if (panel !== undefined)
        {
            if (this._itemsPresenter !== undefined)
            {
                this._itemsPresenter.SetItemsPanel(undefined);
            }
            else
            {
                this.DetachVisual(panel);
            }
        }

        // Tear down the old template tree.
        if (this._templateInstance !== undefined)
        {
            this.DetachVisual(this._templateInstance.root);
            this._templateInstance = undefined;
            this._itemsPresenter = undefined;
        }

        // Apply the new template, or revert to direct hosting.
        const tmpl = this.Template;
        if (tmpl !== undefined)
        {
            const instance = tmpl.Apply(this);
            this.AttachVisual(instance.root);
            this._templateInstance = instance;
            this._itemsPresenter = findFirstItemsPresenter(instance.root);

            if (panel !== undefined && this._itemsPresenter !== undefined)
            {
                this._itemsPresenter.SetItemsPanel(panel);
            }
            else if (panel !== undefined)
            {
                // Template doesn't include an ItemsPresenter — the
                // panel is orphaned. Re-host it directly under this
                // control as a fallback so it still renders.
                this.AttachVisual(panel);
            }
        }
        else if (panel !== undefined)
        {
            // No template — direct host.
            this.AttachVisual(panel);
        }

        this.InvalidateMeasure();
    }

    public set ItemsPanel(value: ItemsPanelFactory | undefined)
    {
        if (this.ItemsPanel === value) return;

        // Tear down the old panel. Two paths:
        //   * VirtualizingPanel: it manages its own container lifecycle
        //     via SetItemsOwner(undefined) → RecycleAll → handles
        //     visual detach + logical detach + generator recycle on
        //     its own. We just visually detach the panel itself.
        //   * Plain Panel: walk our _containers list, detach each both
        //     from the panel and logically from us.
        if (this._itemsPanel !== undefined)
        {
            if (this._itemsPanel instanceof VirtualizingPanel)
            {
                // SetItemsOwner(undefined) calls RecycleAll on the
                // panel, which iterates its realized containers and
                // calls our DetachContainer + generator.Recycle on
                // each. _containers / generator land in clean state.
                this._itemsPanel.SetItemsOwner(undefined);
            }
            else
            {
                // Snapshot before iteration — DetachContainer
                // mutates _containers.
                for (const c of [...this._containers])
                {
                    this._itemsPanel.RemoveVisualChild(c);
                    this.DetachContainer(c);
                }
                this._generator.Clear();
            }
            // Visually unparent from wherever the panel currently
            // lives — inside the ItemsPresenter when a Template is
            // applied; otherwise directly under us.
            if (this._itemsPresenter !== undefined)
            {
                this._itemsPresenter.SetItemsPanel(undefined);
            }
            else
            {
                this.DetachVisual(this._itemsPanel);
            }
            this._itemsPanel = undefined;
        }

        this.set_property_value('ItemsPanel', value);

        if (value !== undefined)
        {
            this._itemsPanel = value();
            // Where does the panel live visually? Inside an
            // ItemsPresenter when a Template is applied; directly
            // under this control otherwise.
            if (this._itemsPresenter !== undefined)
            {
                this._itemsPresenter.SetItemsPanel(this._itemsPanel);
            }
            else
            {
                this.AttachVisual(this._itemsPanel);
            }
            if (this._itemsPanel instanceof VirtualizingPanel)
            {
                // Hand the panel a back-pointer; the panel realizes
                // containers on demand from MeasureOverride.
                this._itemsPanel.SetItemsOwner(this);
            }
            else
            {
                this.rebuildContainers();
            }
        }
    }

    public override get visualChildren(): readonly Visual[]
    {
        // With a Template applied the visual subtree is rooted at the
        // template's root (which contains the ItemsPresenter, which
        // contains the items panel). Without a template the items
        // panel is our direct visual child.
        if (this._templateInstance !== undefined) return [this._templateInstance.root];
        return this._itemsPanel !== undefined ? [this._itemsPanel] : [];
    }

    // Containers are logical children of the ItemsControl — so
    // DataContext / inheritable properties set here flow to them,
    // not through the items panel.
    public override get logicalChildren(): readonly Visual[]
    {
        return this._containers;
    }

    // Inheritance propagation across logical children (the
    // containers), AND through to the items panel as a template-
    // internal visual (same pattern as ContentControl + template root).
    protected override propagate_inheritance_to_logical_children(): void
    {
        for (const c of this._containers)
        {
            c['refresh_inheritance_subtree']();
        }
        this._itemsPanel?.['refresh_inheritance_subtree']();
    }

    protected override propagate_inheritance_for_logical_children(descriptor: PropertyDescriptor): void
    {
        for (const c of this._containers)
        {
            c['refresh_inherited'](descriptor);
        }
        this._itemsPanel?.['refresh_inherited'](descriptor);
    }

    // Target propagation rides the visual tree, so it hops to either
    // the template root (which contains the items panel as a
    // descendant) or to the items panel directly when no template
    // is applied.
    protected override propagate_target_to_visual_children(): void
    {
        const root = this._templateInstance?.root ?? this._itemsPanel;
        root?.['SetTarget'](this['target']);
    }

    protected override MeasureOverride(availableSize: Size): Size
    {
        const root = this._templateInstance?.root ?? this._itemsPanel;
        if (root === undefined) return Size.Zero;
        root.Measure(availableSize);
        return root.DesiredSize;
    }

    protected override ArrangeOverride(finalSize: Size): Size
    {
        const root = this._templateInstance?.root ?? this._itemsPanel;
        if (root === undefined) return Size.Zero;
        root.Arrange(new Rect(0, 0, finalSize.Width, finalSize.Height));
        return finalSize;
    }

    // Nothing to paint at the ItemsControl level — the items panel and
    // its children produce the output.
    protected override RenderOverride(_dc: DrawingContext): void { }

    // Tears down current containers and re-materializes from the
    // current Items + ItemTemplate. Called from Items / ItemTemplate /
    // ItemsPanel setters as the bulk initial-load path. Per-mutation
    // updates from an ObservableCollection go through
    // handleItemsChange instead, which only touches affected slots.
    private rebuildContainers(): void
    {
        if (this._itemsPanel !== undefined && !(this._itemsPanel instanceof VirtualizingPanel))
        {
            // Snapshot first — DetachContainer mutates _containers.
            for (const c of [...this._containers])
            {
                this._itemsPanel.RemoveVisualChild(c);
                this.DetachContainer(c);
            }
        }
        // Wipe the generator's item ↔ container mappings so the next
        // Realize calls produce fresh containers (with whatever the
        // current ItemTemplate is).
        this._generator.Clear();

        const items = this.Items;
        const template = this.ItemTemplate;
        if (items === undefined || template === undefined || this._itemsPanel === undefined) return;
        // VirtualizingPanel owns its own realization; rebuildContainers
        // just clears state and bails. The panel will pick up the
        // new items on its next measure pass.
        if (this._itemsPanel instanceof VirtualizingPanel)
        {
            this._itemsPanel.InvalidateMeasure();
            return;
        }

        const iter = items instanceof ObservableCollection ? items : items;
        for (const item of iter)
        {
            const container = this._generator.Realize(item);
            this._itemsPanel.AddVisualChild(container);
            this.AttachContainer(container);
        }
        this.InvalidateMeasure();
    }

    // Incremental update path for ObservableCollection mutations on
    // Items. Dispatches by change.kind; each branch touches only the
    // affected slot(s) rather than rebuilding the whole panel.
    //
    // Index semantics: `inserted` / `removed` / `replaced` indices
    // are in the items collection's space, which the _containers
    // array mirrors 1:1, so the same index is used for both arrays
    // and for InsertVisualChild on the items panel.
    private handleItemsChange(change: CollectionChange<unknown>): void
    {
        if (this._itemsPanel === undefined || this.ItemTemplate === undefined)
        {
            // No panel or template — nothing to mirror. _containers
            // stays empty; when ItemTemplate / ItemsPanel land, the
            // setter triggers rebuildContainers which catches up.
            return;
        }
        if (this._itemsPanel instanceof VirtualizingPanel)
        {
            // Virtualizing panel owns its own realization; just
            // forward the change so it can re-resolve viewport.
            this._itemsPanel.OnItemsChanged(change);
            return;
        }
        const panel = this._itemsPanel;

        switch (change.kind)
        {
            case 'inserted':
            {
                // change.items is the slice that was inserted; for
                // each, generate a container and splice it in.
                // ObservableCollection currently only fires one-item
                // inserts but the payload supports more — handle both.
                for (let i = 0; i < change.items.length; i++)
                {
                    const item = change.items[i]!;
                    const at = change.index + i;
                    const container = this._generator.Realize(item);
                    panel.InsertVisualChild(at, container);
                    this.InsertContainer(at, container);
                }
                break;
            }
            case 'removed':
            {
                // Each removal compacts the array; the index stays
                // the same for subsequent items in the same batch
                // (so removing N consecutive items means removing
                // index k N times).
                for (let i = 0; i < change.items.length; i++)
                {
                    const container = this._containers[change.index];
                    if (container === undefined) continue;
                    panel.RemoveVisualChild(container);
                    this.DetachContainer(container);
                    this._generator.Recycle(container);
                }
                break;
            }
            case 'replaced':
            {
                const old = this._containers[change.index];
                if (old !== undefined)
                {
                    panel.RemoveVisualChild(old);
                    this.DetachContainer(old);
                    this._generator.Recycle(old);
                }
                const fresh = this._generator.Realize(change.newItem);
                panel.InsertVisualChild(change.index, fresh);
                this.InsertContainer(change.index, fresh);
                break;
            }
            case 'cleared':
            {
                // Snapshot first — DetachContainer mutates _containers.
                for (const c of [...this._containers])
                {
                    panel.RemoveVisualChild(c);
                    this.DetachContainer(c);
                }
                this._generator.Clear();
                break;
            }
        }
        this.InvalidateMeasure();
    }
}

// Depth-first search for the first ItemsPresenter in a template's
// visual subtree. Mirrors findFirstContentPresenter in
// control-template.ts. "First one wins" matches WPF — a template with
// multiple presenters is unusual; the documented surface is one slot.
function findFirstItemsPresenter(visual: Visual): ItemsPresenter | undefined
{
    if (visual instanceof ItemsPresenter) return visual;
    for (const child of visual.visualChildren)
    {
        const found = findFirstItemsPresenter(child);
        if (found !== undefined) return found;
    }
    return undefined;
}
