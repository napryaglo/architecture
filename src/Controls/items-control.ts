import {
    MetaData,
    Model,
    ObservableCollection,
    Panel,
    Rect,
    Size,
    Style,
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

// Function form of WPF's DataTemplateSelector. Given a data item,
// return the DataTemplate that should materialize its container, or
// undefined to fall back to ItemTemplate. Called by the default
// GetContainerForItemOverride.
export type ItemTemplateSelector = (item: unknown) => DataTemplate | undefined;

// CollectionView surface — Tier-3 ItemsSource wraps source data in a
// CollectionView before exposing it as the projected items list. Kept
// as a type alias here (the concrete class lives in collection-view.ts)
// so the ItemsControl's ItemsSource setter has a typed hook without
// importing the heavy implementation file at module-load time.
import type { CollectionView } from './collection-view.js';

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
        Model.RegisterProperty(ItemsControl, 'Items',               undefined, MetaData.Measure);
        Model.RegisterProperty(ItemsControl, 'ItemsSource',         undefined, MetaData.Measure);
        Model.RegisterProperty(ItemsControl, 'ItemTemplate',        undefined, MetaData.Measure);
        Model.RegisterProperty(ItemsControl, 'ItemTemplateSelector',undefined, MetaData.Measure);
        Model.RegisterProperty(ItemsControl, 'ItemContainerStyle',  undefined, MetaData.Measure);
        Model.RegisterProperty(ItemsControl, 'ItemsPanel',          undefined, MetaData.Measure);
        Model.RegisterProperty(ItemsControl, 'Template',            undefined, MetaData.Measure);
        // AlternationCount = 0 → AlternationIndex unused (every
        // container gets 0). >0 → AlternationIndex cycles 0..N-1
        // across containers in items order. WPF parity.
        Model.RegisterProperty(ItemsControl, 'AlternationCount',    0,         MetaData.None);
        // HasItems is logically read-only but stored as a plain DP so
        // it goes through the standard change-notification pipeline
        // (PropertyTrigger / Binding can observe it). Only the
        // ItemsControl writes — consumers read.
        Model.RegisterProperty(ItemsControl, 'HasItems',            false,     MetaData.None);

        // AlternationIndex attached on each generated container during
        // PrepareContainerForItemOverride. Containers read via
        // ItemsControl.GetAlternationIndex(container) — counterpart to
        // Canvas.GetLeft / DockPanel.GetDock.
        Model.RegisterAttachedProperty(ItemsControl, 'AlternationIndex', 0, MetaData.None);
    }

    public static SetAlternationIndex(v: Visual, value: number): void
    {
        v.set_property_value(ItemsControl, 'AlternationIndex', value);
    }

    public static GetAlternationIndex(v: Visual): number
    {
        return v.get_property_value(ItemsControl, 'AlternationIndex');
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
        // WPF parity: assigning Items directly while ItemsSource is set
        // is a programming error — Items is a read-only projection of
        // ItemsSource in that mode. Throwing surfaces the mistake
        // immediately rather than silently letting the next refresh
        // overwrite the assignment.
        if (this.ItemsSource !== undefined)
        {
            throw new Error(
                "ItemsControl.Items cannot be set while ItemsSource is non-undefined. " +
                "Clear ItemsSource first (or mutate the source) to drive items.",
            );
        }
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

    // ── Subclass override points ───────────────────────────────────
    //
    // The three methods below mirror WPF's ItemsControl protected
    // virtuals — exposed as `public` here so VirtualizingPanel-side
    // realization can route through them without back-channel access.
    //
    // Default behavior implements the data-driven path through
    // ItemTemplateSelector → ItemTemplate. Subclasses override to
    // wrap items in their own container shape (ListBox wraps in
    // ListBoxItem; TreeView wraps in TreeViewItem; ComboBox wraps in
    // ComboBoxItem). Custom subclasses also override
    // PrepareContainerForItemOverride to attach behavior (selection,
    // press, etc.) that the data template doesn't know about.

    /**
     * Build the container Visual for `item`. Default picks the
     * DataTemplate via ItemTemplateSelector (then ItemTemplate) and
     * applies it. Subclasses override to wrap in a control-specific
     * container (e.g., ListBoxItem). Throws when no template resolves
     * — surface the configuration gap early rather than letting the
     * panel render nothing.
     */
    public GetContainerForItemOverride(item: unknown): Visual
    {
        const selector = this.ItemTemplateSelector;
        const tmpl = selector?.(item) ?? this.ItemTemplate;
        if (tmpl === undefined)
        {
            throw new Error(
                'ItemsControl: no DataTemplate resolved for item — set ItemTemplate, ItemTemplateSelector, or override GetContainerForItemOverride.',
            );
        }
        return tmpl.Apply(item);
    }

    /**
     * Called right after a container is realized and attached to both
     * trees. The default attaches ItemContainerStyle and stamps
     * AlternationIndex. Subclasses chain via super.* and add their
     * own wiring (data context, selection bindings, pointer
     * handlers).
     *
     * `index` is the container's slot in the items collection — used
     * to compute AlternationIndex and to bind position-aware sub-
     * styling. The hook fires AFTER tree attach so any setter that
     * needs the tree (Bindings, DynamicResources) sees a connected
     * Visual.
     */
    public PrepareContainerForItemOverride(container: Visual, item: unknown, index: number): void
    {
        const style = this.ItemContainerStyle;
        if (style !== undefined)
        {
            this.applyContainerStyle(container, style);
        }
        if (this.AlternationCount > 0)
        {
            ItemsControl.SetAlternationIndex(container, this.computeAlternationIndex(index));
        }
        // Surface the item on the container for subclasses that want
        // to read it back without going through the generator's
        // reverse map. Stored as a plain property bag entry, not a
        // registered DP — subclasses that want trigger / binding
        // visibility can register their own DP and copy it across.
        (container as ContainerWithData)._itemsControlData = item;
        void item; void index;
    }

    /**
     * Symmetric counterpart to PrepareContainerForItemOverride —
     * called BEFORE the container is detached. Default clears
     * ItemContainerStyle. Subclasses chain via super.* and undo any
     * setup they did in Prepare.
     */
    public ClearContainerForItemOverride(container: Visual, item: unknown): void
    {
        if (this.ItemContainerStyle !== undefined)
        {
            this.clearContainerStyle(container);
        }
        (container as ContainerWithData)._itemsControlData = undefined;
        void item;
    }

    private computeAlternationIndex(slot: number): number
    {
        const n = this.AlternationCount;
        return n > 0 ? slot % n : 0;
    }

    private applyContainerStyle(container: Visual, style: Style): void
    {
        // The container is a plain Visual; Visual.Style takes the
        // current Style. Apply checks TargetType compatibility and
        // throws on mismatch — caller's responsibility to match.
        container.Style = style;
    }

    private clearContainerStyle(container: Visual): void
    {
        if (container.Style !== undefined)
        {
            container.Style = undefined;
        }
    }

    private updateHasItems(): void
    {
        const items = this.Items;
        let nonEmpty = false;
        if (items !== undefined)
        {
            // Cheap fast path for ObservableCollection / arrays /
            // CollectionView — anything with Count or .length avoids
            // a full iteration just to check non-empty.
            const c = (items as { Count?: number }).Count;
            if (typeof c === 'number')           nonEmpty = c > 0;
            else if (Array.isArray(items))       nonEmpty = items.length > 0;
            else
            {
                for (const _ of items as Iterable<unknown>) { nonEmpty = true; break; }
            }
        }
        if (this.HasItems !== nonEmpty)
        {
            this.set_property_value('HasItems', nonEmpty);
        }
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

    // Per-item template selector — queried before ItemTemplate by
    // GetContainerForItemOverride. Lets a heterogeneous Items
    // collection render different visuals per data type.
    public get ItemTemplateSelector(): ItemTemplateSelector | undefined
    {
        return this.get_property_value('ItemTemplateSelector');
    }

    public set ItemTemplateSelector(value: ItemTemplateSelector | undefined)
    {
        if (this.ItemTemplateSelector === value) return;
        this.set_property_value('ItemTemplateSelector', value);
        // Selector change invalidates cached containers — each item
        // may now resolve to a different DataTemplate.
        this.rebuildContainers();
    }

    // Style applied to every generated container during
    // PrepareContainerForItemOverride. TargetType must match the
    // container Visual produced by ItemTemplate / GetContainer.
    public get ItemContainerStyle(): Style | undefined
    {
        return this.get_property_value('ItemContainerStyle');
    }

    public set ItemContainerStyle(value: Style | undefined)
    {
        if (this.ItemContainerStyle === value) return;
        this.set_property_value('ItemContainerStyle', value);
        // Reapply the style to every already-realized container.
        // PrepareContainerForItemOverride re-runs the style set; the
        // old style (if any) is unapplied by Visual.Style's setter
        // priority handoff.
        for (let i = 0; i < this._containers.length; i++)
        {
            const c = this._containers[i]!;
            if (value !== undefined)
            {
                this.applyContainerStyle(c, value);
            }
            else
            {
                this.clearContainerStyle(c);
            }
        }
    }

    public get AlternationCount(): number
    {
        return this.get_property_value('AlternationCount');
    }

    public set AlternationCount(value: number)
    {
        if (this.AlternationCount === value) return;
        this.set_property_value('AlternationCount', value);
        // Re-stamp AlternationIndex on every realized container so the
        // new modulus takes effect immediately. New container index =
        // old slot index % new AlternationCount (or 0 when count = 0).
        for (let i = 0; i < this._containers.length; i++)
        {
            ItemsControl.SetAlternationIndex(this._containers[i]!, this.computeAlternationIndex(i));
        }
    }

    public get HasItems(): boolean
    {
        return this.get_property_value('HasItems');
    }

    // ItemsSource is the data-binding hook. Set to ANY iterable (array,
    // ObservableCollection, CollectionView) and the ItemsControl
    // projects it through a CollectionView under the hood. When
    // ItemsSource is set, direct mutation of Items is rejected (WPF
    // parity: Items becomes a read-only view of ItemsSource).
    public get ItemsSource(): unknown
    {
        return this.get_property_value('ItemsSource');
    }

    public set ItemsSource(value: unknown)
    {
        const old = this.get_property_value('ItemsSource');
        if (old === value) return;
        this.set_property_value('ItemsSource', value);
        this.refreshItemsFromSource();
    }

    // Lazily-acquired CollectionView for the current ItemsSource. Held
    // here so SortDescriptions / Filter survive ItemsSource swaps to
    // the same identity (or revival), and so view-mutation subscribers
    // see the same instance.
    private _projectedView: CollectionView | undefined;

    public get View(): CollectionView | undefined
    {
        return this._projectedView;
    }

    private refreshItemsFromSource(): void
    {
        // Tear down the old view subscription (if Items was wired up
        // through one) — the Items setter detaches its own.
        const src = this.ItemsSource;
        if (src === undefined)
        {
            this._projectedView = undefined;
            this.applyProjectedItems(undefined);
            return;
        }
        // Lazy require to dodge the items-control / collection-view
        // import cycle (CollectionView's CollectionChangeListener type
        // doesn't reach the ItemsControl module at compile time).
        const view = createCollectionView(src);
        this._projectedView = view;
        this.applyProjectedItems(view);
    }

    private applyProjectedItems(view: CollectionView | undefined): void
    {
        // Internal call that bypasses the "ItemsSource set → Items
        // read-only" guard — refreshItemsFromSource is the only writer
        // here and it owns the projection.
        this._itemsSubscription?.();
        this._itemsSubscription = undefined;
        this.set_property_value('Items', view);
        if (view !== undefined)
        {
            this._itemsSubscription = view.Subscribe(change => this.handleItemsChange(change));
        }
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
    // ItemsPanel / ItemsSource setters as the bulk initial-load path.
    // Per-mutation updates from an ObservableCollection go through
    // handleItemsChange instead, which only touches affected slots.
    private rebuildContainers(): void
    {
        if (this._itemsPanel !== undefined && !(this._itemsPanel instanceof VirtualizingPanel))
        {
            // Snapshot first — DetachContainer mutates _containers.
            for (const c of [...this._containers])
            {
                const item = this._generator.ItemFromContainer(c);
                this.ClearContainerForItemOverride(c, item);
                this._itemsPanel.RemoveVisualChild(c);
                this.DetachContainer(c);
            }
        }
        // Wipe the generator's item ↔ container mappings so the next
        // Realize calls produce fresh containers (with whatever the
        // current ItemTemplate / Selector / GetContainer is).
        this._generator.Clear();

        const items = this.Items;
        // Resolution: an item only needs SOMETHING to produce a
        // container. Per-item resolution lives in
        // GetContainerForItemOverride; a subclass may have overridden
        // it and need neither ItemTemplate nor ItemTemplateSelector.
        // The rebuild bails only when the panel is missing or items
        // collection is empty/undefined.
        const haveResolver = this.ItemTemplate !== undefined
                          || this.ItemTemplateSelector !== undefined
                          || this.hasContainerOverride();
        if (items === undefined || !haveResolver || this._itemsPanel === undefined)
        {
            this.updateHasItems();
            return;
        }
        // VirtualizingPanel owns its own realization; rebuildContainers
        // just clears state and bails. The panel will pick up the
        // new items on its next measure pass.
        if (this._itemsPanel instanceof VirtualizingPanel)
        {
            this._itemsPanel.InvalidateMeasure();
            this.updateHasItems();
            return;
        }

        let i = 0;
        for (const item of items as Iterable<unknown>)
        {
            const container = this._generator.Realize(item);
            this._itemsPanel.AddVisualChild(container);
            this.AttachContainer(container);
            this.PrepareContainerForItemOverride(container, item, i);
            i++;
        }
        this.updateHasItems();
        this.InvalidateMeasure();
    }

    // Subclass-override sniff: returns true when the consumer has
    // overridden GetContainerForItemOverride. Used to allow rebuilds
    // that don't have ItemTemplate set but DO have a custom container
    // path. Compares against the prototype-installed default.
    private hasContainerOverride(): boolean
    {
        const proto = Object.getPrototypeOf(this) as { GetContainerForItemOverride?: unknown };
        return proto.GetContainerForItemOverride !== ItemsControl.prototype.GetContainerForItemOverride;
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
        if (this._itemsPanel === undefined)
        {
            // No panel — nothing to mirror. _containers stays empty;
            // when ItemsPanel lands, the setter triggers
            // rebuildContainers which catches up.
            this.updateHasItems();
            return;
        }
        // Insert / replace / restamp paths need a container resolver
        // (ItemTemplate, Selector, or a subclass override). Removes
        // and clears don't — they just unbind. Bailing only when
        // we'd actually be unable to make progress.
        const haveResolver = this.ItemTemplate !== undefined
                          || this.ItemTemplateSelector !== undefined
                          || this.hasContainerOverride();
        if (!haveResolver && (change.kind === 'inserted' || change.kind === 'replaced'))
        {
            this.updateHasItems();
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

        // Whether this batch shifts indices for the AlternationIndex
        // re-stamp. Inserts/removes/clears shift; replaced does not.
        let restampFrom: number | undefined = undefined;

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
                    this.PrepareContainerForItemOverride(container, item, at);
                }
                restampFrom = change.index + change.items.length;
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
                    const item = this._generator.ItemFromContainer(container);
                    this.ClearContainerForItemOverride(container, item);
                    panel.RemoveVisualChild(container);
                    this.DetachContainer(container);
                    this._generator.Recycle(container);
                }
                restampFrom = change.index;
                break;
            }
            case 'replaced':
            {
                const old = this._containers[change.index];
                if (old !== undefined)
                {
                    const oldItem = this._generator.ItemFromContainer(old);
                    this.ClearContainerForItemOverride(old, oldItem);
                    panel.RemoveVisualChild(old);
                    this.DetachContainer(old);
                    this._generator.Recycle(old);
                }
                const fresh = this._generator.Realize(change.newItem);
                panel.InsertVisualChild(change.index, fresh);
                this.InsertContainer(change.index, fresh);
                this.PrepareContainerForItemOverride(fresh, change.newItem, change.index);
                break;
            }
            case 'cleared':
            {
                // Snapshot first — DetachContainer mutates _containers.
                for (const c of [...this._containers])
                {
                    const item = this._generator.ItemFromContainer(c);
                    this.ClearContainerForItemOverride(c, item);
                    panel.RemoveVisualChild(c);
                    this.DetachContainer(c);
                }
                this._generator.Clear();
                break;
            }
        }
        // Re-stamp alternation indices on every container at-or-after
        // the disturbed slot. Skipped when AlternationCount = 0
        // (nothing to rotate). Replaced doesn't shift indices, so
        // restampFrom stays undefined for it.
        if (restampFrom !== undefined && this.AlternationCount > 0)
        {
            for (let i = restampFrom; i < this._containers.length; i++)
            {
                ItemsControl.SetAlternationIndex(this._containers[i]!, this.computeAlternationIndex(i));
            }
        }
        this.updateHasItems();
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

// Structural type used by PrepareContainerForItemOverride to stash
// the item on the container without registering a DP. Subclasses
// that want trigger / binding visibility on the item can read the
// item via Generator.ItemFromContainer instead.
interface ContainerWithData
{
    _itemsControlData?: unknown;
}

// Lazy CollectionView factory — defers the import so module-load order
// (items-control before collection-view) doesn't cycle. Wraps source
// data in a fresh CollectionView; an already-wrapped CollectionView
// passes through unchanged so view-state (sort / filter / current)
// survives ItemsSource reassignment to the same view instance.
//
// The require() pattern avoids the cycle without forcing the typed
// surface to lose precision — TypeScript sees CollectionView via the
// top-of-file `import type`; at runtime we resolve through a tiny
// indirection that's set on first use.
let _collectionViewCtor: (new (source: unknown) => CollectionView) | undefined;

function createCollectionView(src: unknown): CollectionView
{
    // CollectionView pass-through: instanceof check uses the cached
    // ctor when one is available — pre-CV-load we can't instanceof
    // it, so the first call always falls into the load path which
    // populates _collectionViewCtor and lets later calls skip the
    // round-trip.
    if (_collectionViewCtor !== undefined && src instanceof _collectionViewCtor) return src as unknown as CollectionView;
    if (_collectionViewCtor === undefined)
    {
        // Synchronous require would be ideal but ESM doesn't have one;
        // resolve through a global the consumer wires (see
        // ItemsControl.RegisterCollectionViewCtor below) so we don't
        // bake the path here. If unset, fall back to a passthrough
        // facade — the caller still gets iteration / Subscribe
        // semantics enough for the non-Tier-3 cases.
        throw new Error(
            'ItemsControl.ItemsSource: CollectionView not registered. ' +
            'Import @visualisation-sub/mural/Controls (the barrel) before assigning ItemsSource — ' +
            'collection-view.ts registers itself with ItemsControl on load.',
        );
    }
    return new _collectionViewCtor(src);
}

// Internal hook used by collection-view.ts to register its ctor
// without creating a static circular import. Not part of the public
// API; consumers don't call this.
export function _registerCollectionViewCtor(ctor: new (source: unknown) => CollectionView): void
{
    _collectionViewCtor = ctor;
}
