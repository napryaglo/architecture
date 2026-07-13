// NavigationRailVM — backs the navigation-rail demo. Holds a list of
// destination labels + a SelectedItem that the rail two-way binds. The
// active demo body switches based on SelectedItem.
import { Model, MetaData, ObservableCollection } from 'mural/runtime';

export class NavigationRailVM extends Model
{
    static DestinationsKey  = Model.RegisterProperty<ObservableCollection<string> | null>(NavigationRailVM, 'Destinations', null, MetaData.None);
    static SelectedItemKey  = Model.RegisterProperty<string | undefined>(NavigationRailVM, 'SelectedItem', 'Home', MetaData.None);
    static ActiveLabelKey   = Model.RegisterProperty<string>(NavigationRailVM, 'ActiveLabel', 'Home', MetaData.None);

    get Destinations(): ObservableCollection<string> | null { return this.get_property_value(NavigationRailVM.DestinationsKey); }
    get SelectedItem():  string | undefined { return this.get_property_value(NavigationRailVM.SelectedItemKey); }
    set SelectedItem(v:  string | undefined) { this.set_property_value(NavigationRailVM.SelectedItemKey, v); }
    get ActiveLabel():   string { return this.get_property_value(NavigationRailVM.ActiveLabelKey); }
    set ActiveLabel(v:   string) { this.set_property_value(NavigationRailVM.ActiveLabelKey, v); }

    constructor() {
        super();
        const destinations = new ObservableCollection([
            'Home', 'Search', 'Library', 'Settings',
        ]);
        this.set_property_value(NavigationRailVM.DestinationsKey, destinations);
        this.AddPropertyChangedListener(NavigationRailVM.SelectedItemKey, () => {
            this.ActiveLabel = this.SelectedItem ?? '';
        });
    }
}
