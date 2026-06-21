// NavigationRailVM — backs the navigation-rail demo. Holds a list of
// destination labels + a SelectedItem that the rail two-way binds. The
// active demo body switches based on SelectedItem.
import { Model, MetaData, ObservableCollection } from '@visualisation-sub/mural/runtime';

export class NavigationRailVM extends Model
{
    static DestinationsKey  = Model.RegisterProperty(NavigationRailVM, 'Destinations',  null,                 MetaData.None);
    static SelectedItemKey  = Model.RegisterProperty(NavigationRailVM, 'SelectedItem',  'Home',              MetaData.None);
    static ActiveLabelKey   = Model.RegisterProperty(NavigationRailVM, 'ActiveLabel',   'Home',              MetaData.None);

    get Destinations() { return this.get_property_value(NavigationRailVM.DestinationsKey); }
    get SelectedItem()  { return this.get_property_value(NavigationRailVM.SelectedItemKey); }
    set SelectedItem(v) { this.set_property_value(NavigationRailVM.SelectedItemKey, v); }
    get ActiveLabel()   { return this.get_property_value(NavigationRailVM.ActiveLabelKey); }
    set ActiveLabel(v)  { this.set_property_value(NavigationRailVM.ActiveLabelKey, v); }

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
