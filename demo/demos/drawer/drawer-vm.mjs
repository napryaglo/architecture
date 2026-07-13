// DrawerVM — drives the drawer demo's two Drawers through a single
// view-model. NavOpen and OptionsOpen are reactive booleans;
// ToggleNav / OpenOptions / CloseOptions are commands the markup
// binds to its Buttons. The template's two Drawers OneWay-bind
// IsOpen to NavOpen / OptionsOpen so a Command write flips the drawer
// visibility.
//
// OnViewMounted hooks the Temporary right drawer's Closed event so a
// scrim click (which dismisses the Drawer at the Drawer's own
// initiative) reflects back into the VM's OptionsOpen flag. Without
// this round-trip the next OpenOptions invocation would do nothing —
// IsOpen would still bind to `true` from the VM's perspective.
import { MetaData, Model, RelayCommand } from 'mural/runtime';
import { Drawer, DrawerVariant } from 'mural/framework';
export class DrawerVM extends Model {
    static NavOpenKey = Model.RegisterProperty(DrawerVM, 'NavOpen', false, MetaData.None);
    static OptionsOpenKey = Model.RegisterProperty(DrawerVM, 'OptionsOpen', false, MetaData.None);
    static ToggleNavKey = Model.RegisterProperty(DrawerVM, 'ToggleNav', undefined, MetaData.None);
    static OpenOptionsKey = Model.RegisterProperty(DrawerVM, 'OpenOptions', undefined, MetaData.None);
    static CloseOptionsKey = Model.RegisterProperty(DrawerVM, 'CloseOptions', undefined, MetaData.None);
    get NavOpen() { return this.get_property_value(DrawerVM.NavOpenKey); }
    set NavOpen(v) { this.set_property_value(DrawerVM.NavOpenKey, v); }
    get OptionsOpen() { return this.get_property_value(DrawerVM.OptionsOpenKey); }
    set OptionsOpen(v) { this.set_property_value(DrawerVM.OptionsOpenKey, v); }
    get ToggleNav() { return this.get_property_value(DrawerVM.ToggleNavKey); }
    get OpenOptions() { return this.get_property_value(DrawerVM.OpenOptionsKey); }
    get CloseOptions() { return this.get_property_value(DrawerVM.CloseOptionsKey); }
    constructor() {
        super();
        this.set_property_value(DrawerVM.ToggleNavKey, new RelayCommand(() => { this.NavOpen = !this.NavOpen; }));
        this.set_property_value(DrawerVM.OpenOptionsKey, new RelayCommand(() => { this.OptionsOpen = true; }));
        this.set_property_value(DrawerVM.CloseOptionsKey, new RelayCommand(() => { this.OptionsOpen = false; }));
    }
    // Walks the freshly-rendered view, finds each Temporary Drawer and
    // wires a Closed listener back into OptionsOpen. ContentControl /
    // PageView calls this once when the DataTemplate is applied.
    OnViewMounted(view) {
        for (const d of findAllByType(view, Drawer)) {
            if (d.Variant === DrawerVariant.Temporary) {
                d.AddClosedListener(() => { this.OptionsOpen = false; });
            }
        }
    }
}
function findAllByType(visual, ctor, out = []) {
    if (visual instanceof ctor)
        out.push(visual);
    for (const child of visual.visualChildren) {
        findAllByType(child, ctor, out);
    }
    return out;
}
