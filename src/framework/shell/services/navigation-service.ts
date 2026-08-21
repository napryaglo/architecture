import {
    ApplicationService,
    MetaData,
    MuralBase,
    ObservableCollection,
    ServiceBase,
    ServiceKey,
    ServiceProvider,
    type IServiceProvider,
} from '../../../runtime/index.js';
import { Capability } from '../module.js';
import type { IActivatable } from './activatable.js';
import { RailAction } from '../rail-action.js';
import type { Geometry } from '../../../visual-engine/index.js';

// One entry in the shell's root navigation layer, built from a module's
// Capability. `Label` / `Icon` are DPs a rail-item template binds; `Capability`
// is a stable back-reference (set once, never changes) — the source capability
// this destination WRAPS. A MuralBase so the item is bindable.
//
// The content shown while a destination is active is NOT held here: the
// NavigationService resolves it from the selected item's `Capability.ServiceKey`
// and exposes it as `ActiveService` (a shell's content host binds that). So a
// destination is purely the rail item + a back-reference to its capability.
export class NavigationDestination extends MuralBase
{
    public static readonly LabelKey = MuralBase.RegisterProperty<string>(
        NavigationDestination, 'Label', '', MetaData.None);

    public static readonly IconKey = MuralBase.RegisterProperty<Geometry | undefined>(
        NavigationDestination, 'Icon', undefined, MetaData.None);

    // The source capability. A plain readonly field (not a DP): identity that
    // never changes, so it needs no change notification.
    public readonly Capability: Capability;

    constructor(capability: Capability)
    {
        super();
        this.Capability = capability;
        this.set_property_value(NavigationDestination.LabelKey, capability.Name);
        this.set_property_value(NavigationDestination.IconKey, capability.Icon);
    }

    public get Label(): string { return this.get_property_value(NavigationDestination.LabelKey); }
    public get Icon(): Geometry | undefined { return this.get_property_value(NavigationDestination.IconKey); }
}

// Backs the shell's Navigation region. Holds the list of destinations
// and the current selection; the navigation strip binds its items and
// selected-item to these DPs, and whatever drives navigation (a command,
// a behavior, a child VM) writes SelectedItem here.
//
// Items are arbitrary app models (the app supplies its own destination
// shape) — this base stays type-agnostic. Apps that need richer
// navigation (history, guards) subclass and register the subclass
// against NavigationService.Key.
export class NavigationService extends ServiceBase
{
    public static readonly Key = new ServiceKey<NavigationService>('NavigationService');

    public static readonly ItemsKey = MuralBase.RegisterProperty<ObservableCollection<unknown>>(
        NavigationService, 'Items',
        undefined as unknown as ObservableCollection<unknown>, MetaData.None);
        
    public static readonly SelectedItemKey = MuralBase.RegisterProperty<unknown>(
        NavigationService, 'SelectedItem', undefined, MetaData.None);

    // The active capability's content service — what a content host presents
    // while its destination is selected (`Content =
    // $service(NavigationService).ActiveService`), resolved from the selected
    // item's `Capability.ServiceKey` and rendered by a `DataTemplate
    // [DataType=Service]`. `unknown` because the concrete service type varies
    // per capability. Derived (recomputed from SelectedItem via
    // syncActiveService), so a view binds it read-only.
    public static readonly ActiveServiceKey = MuralBase.RegisterProperty<unknown>(
        NavigationService, 'ActiveService', undefined, MetaData.None);

    // Command actions pinned to the rail's Header (top) and Footer (bottom)
    // slots — the non-destination part of the activity bar (a settings gear, a
    // help button, an account switcher…). Each a RailAction (icon + command);
    // the framework rail template renders each as an IconButton. Apps add to
    // these to populate the rail's chrome slots WITHOUT overriding the rail
    // template. Empty by default — a shell shows only what's contributed.
    public static readonly HeaderActionsKey = MuralBase.RegisterProperty<ObservableCollection<RailAction>>(
        NavigationService, 'HeaderActions',
        undefined as unknown as ObservableCollection<RailAction>, MetaData.None);
    public static readonly FooterActionsKey = MuralBase.RegisterProperty<ObservableCollection<RailAction>>(
        NavigationService, 'FooterActions',
        undefined as unknown as ObservableCollection<RailAction>, MetaData.None);

    constructor(provider: IServiceProvider)
    {
        super(provider);
        // Per-instance collection so the strip always has a target to
        // bind, even before the app populates destinations.
        this.set_property_value(NavigationService.ItemsKey, new ObservableCollection<unknown>());
        this.set_property_value(NavigationService.HeaderActionsKey, new ObservableCollection<RailAction>());
        this.set_property_value(NavigationService.FooterActionsKey, new ObservableCollection<RailAction>());
        // Keep ActiveService in lock-step with the selection.
        this.AddPropertyChangedListener(
            NavigationService.SelectedItemKey, () => this.syncActiveService());
    }

    public get Items(): ObservableCollection<unknown>
    {
        return this.get_property_value(NavigationService.ItemsKey);
    }

    public get SelectedItem(): unknown { return this.get_property_value(NavigationService.SelectedItemKey); }
    public set SelectedItem(v: unknown) { this.set_property_value(NavigationService.SelectedItemKey, v); }

    public get ActiveService(): unknown
    {
        return this.get_property_value(NavigationService.ActiveServiceKey);
    }

    public get HeaderActions(): ObservableCollection<RailAction>
    {
        return this.get_property_value(NavigationService.HeaderActionsKey);
    }

    public get FooterActions(): ObservableCollection<RailAction>
    {
        return this.get_property_value(NavigationService.FooterActionsKey);
    }

    // SelectedItem → ActiveService: find the Capability behind the selected item
    // and resolve the service it names (`Capability.ServiceKey`) from the
    // container. The content host presents that service (rendered by a
    // DataTemplate keyed to its type). Called on every SelectedItem change
    // (wired in the ctor). Resolution goes through `ServiceProvider.tokenFor`,
    // matching how the `.services:` block registers and how `$service(...)`
    // consumes — and `get()`'s scope cache means re-selecting a group returns
    // the same service instance, so its state persists across rail switches.
    protected syncActiveService(): void
    {
        const key     = this.capabilityOf(this.SelectedItem)?.ServiceKey;
        const service = key !== undefined
            ? this.Provider.get(ServiceProvider.tokenFor(key as unknown as Function))
            : undefined;
        this.set_property_value(NavigationService.ActiveServiceKey, service);
        // Let the now-active service re-present itself. A content-backing
        // service (DocumentSelectorService) shows through a shared content host
        // that holds the LAST presented item; on a rail switch its own
        // selection hasn't changed, so without this nudge the host keeps the
        // previous capability's content. The service opts in via IActivatable —
        // anything else is left untouched.
        (service as Partial<IActivatable> | undefined)?.OnActivated?.();
    }

    // The Capability behind a navigation item: the item itself when it IS a
    // Capability, or the Capability a NavigationDestination wraps. Undefined for
    // any other item shape (ActiveService then clears).
    private capabilityOf(item: unknown): Capability | undefined
    {
        if (item instanceof Capability)            return item;
        if (item instanceof NavigationDestination) return item.Capability;
        return undefined;
    }

    // Factory for the destination created per capability in PopulateFromModules.
    // The destination wraps the capability (rail Label/Icon + back-reference);
    // the service it names is resolved centrally by syncActiveService, not by
    // the destination. Override to emit a richer destination subclass.
    protected createDestination(capability: Capability): NavigationDestination
    {
        return new NavigationDestination(capability);
    }

    // Opt-in: replace Items with a NavigationDestination per capability across every
    // module composed on the Application — the shell's root navigation layer.
    // The base stays type-agnostic (it never calls this itself); the opt-in
    // caller is whoever registers the service — a shell (EditorShell registers a
    // base NavigationService and calls this) or a subclass from its ctor — so
    // destinations come from the declared modules instead of hand-seeding.
    //
    // Resolves the ApplicationService (the module source of truth) from the
    // container, then up-casts each ICapability to the concrete Capability to
    // read the view-facing Icon / ServiceKey above the runtime contract's
    // Name-only surface — the documented IShellModule up-cast seam. One-shot:
    // modules are
    // fully populated by the time a shell resolves this service; call again to
    // rebuild. Clears first, so the caller owns Items once it opts in.
    public PopulateFromModules(): void
    {
        const app = this.Provider.getRequired(ApplicationService.Key);
        this.Items.Clear();
        for (const module of app.Modules)
        {
            for (const capability of module.Capabilities)
            {
                this.Items.Add(this.createDestination(capability as Capability));
            }
        }
        // Land on the first destination so the shell opens showing content
        // rather than an empty panel. Apps that want no initial selection
        // override this (subclass) or clear SelectedItem afterwards.
        if (this.SelectedItem === undefined && this.Items.Count > 0)
        {
            this.SelectedItem = this.Items.Get(0);
        }
    }
}
