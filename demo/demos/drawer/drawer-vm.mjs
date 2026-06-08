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
import { MetaData, Model, RelayCommand } from '@visualisation-sub/mural/runtime';
import { Drawer, DrawerVariant } from '@visualisation-sub/mural/framework';

export class DrawerVM extends Model
{
    static {
        Model.RegisterProperty(DrawerVM, 'NavOpen',      false,     MetaData.None);
        Model.RegisterProperty(DrawerVM, 'OptionsOpen',  false,     MetaData.None);
        Model.RegisterProperty(DrawerVM, 'ToggleNav',    undefined, MetaData.None);
        Model.RegisterProperty(DrawerVM, 'OpenOptions',  undefined, MetaData.None);
        Model.RegisterProperty(DrawerVM, 'CloseOptions', undefined, MetaData.None);
    }

    get NavOpen()      { return this._get_property_value_by_name('NavOpen'); }
    set NavOpen(v)     { this._set_property_value_by_name('NavOpen', v); }
    get OptionsOpen()  { return this._get_property_value_by_name('OptionsOpen'); }
    set OptionsOpen(v) { this._set_property_value_by_name('OptionsOpen', v); }
    get ToggleNav()    { return this._get_property_value_by_name('ToggleNav'); }
    get OpenOptions()  { return this._get_property_value_by_name('OpenOptions'); }
    get CloseOptions() { return this._get_property_value_by_name('CloseOptions'); }

    constructor() {
        super();
        this._set_property_value_by_name('ToggleNav',
            new RelayCommand(() => { this.NavOpen = !this.NavOpen; }));
        this._set_property_value_by_name('OpenOptions',
            new RelayCommand(() => { this.OptionsOpen = true; }));
        this._set_property_value_by_name('CloseOptions',
            new RelayCommand(() => { this.OptionsOpen = false; }));
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
    if (visual instanceof ctor) out.push(visual);
    for (const child of visual.visualChildren) {
        findAllByType(child, ctor, out);
    }
    return out;
}
