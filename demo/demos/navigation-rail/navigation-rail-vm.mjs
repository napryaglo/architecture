// NavigationRailVM — backs the navigation-rail demo. Holds a list of
// destination labels + a SelectedItem that the rail two-way binds. The
// active demo body switches based on SelectedItem.
import { Model, MetaData, ObservableCollection } from '@visualisation-sub/mural/runtime';

export class NavigationRailVM extends Model
{
    static DestinationsKey  = Model.RegisterProperty(NavigationRailVM, 'Destinations',  null,                 MetaData.None);
    static SelectedItemKey  = Model.RegisterProperty(NavigationRailVM, 'SelectedItem',  'Home',              MetaData.None);
    static ActiveLabelKey   = Model.RegisterProperty(NavigationRailVM, 'ActiveLabel',   'Home',              MetaData.None);

    get Destinations() { return this._get_property_value_by_name('Destinations'); }
    get SelectedItem()  { return this._get_property_value_by_name('SelectedItem'); }
    set SelectedItem(v) { this._set_property_value_by_name('SelectedItem', v); }
    get ActiveLabel()   { return this._get_property_value_by_name('ActiveLabel'); }
    set ActiveLabel(v)  { this._set_property_value_by_name('ActiveLabel', v); }

    constructor() {
        super();
        const destinations = new ObservableCollection([
            'Home', 'Search', 'Library', 'Settings',
        ]);
        this._set_property_value_by_name('Destinations', destinations);
        this._add_property_changed_listener_by_name('SelectedItem', () => {
            this.ActiveLabel = this.SelectedItem ?? '';
        });
    }
}
