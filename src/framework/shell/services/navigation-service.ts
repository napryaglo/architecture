import {
    MetaData,
    Model,
    ObservableCollection,
    ServiceBase,
    ServiceKey,
    type IServiceProvider,
} from '../../../runtime/index.js';

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

    public static readonly ItemsKey = Model.RegisterProperty<ObservableCollection<unknown>>(
        NavigationService, 'Items',
        undefined as unknown as ObservableCollection<unknown>, MetaData.None);
        
    public static readonly SelectedItemKey = Model.RegisterProperty<unknown>(
        NavigationService, 'SelectedItem', undefined, MetaData.None);

    constructor(provider: IServiceProvider)
    {
        super(provider);
        // Per-instance collection so the strip always has a target to
        // bind, even before the app populates destinations.
        this.set_property_value(NavigationService.ItemsKey, new ObservableCollection<unknown>());
    }

    public get Items(): ObservableCollection<unknown>
    {
        return this.get_property_value(NavigationService.ItemsKey);
    }

    public get SelectedItem(): unknown { return this.get_property_value(NavigationService.SelectedItemKey); }
    public set SelectedItem(v: unknown) { this.set_property_value(NavigationService.SelectedItemKey, v); }
}
