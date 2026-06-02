// drawer demo — Persistent left rail + Temporary right pane through
// a single DockPanel. The platform factory builds a DrawerVM on first
// activation and wires the Temporary drawer's Closed listener back
// into the VM (scrim click → VM.OptionsOpen = false).
import { app } from '../../drawer.mu.js';
import { MetaData, Model, RelayCommand } from '@visualisation-sub/mural/runtime';
import { Drawer, DrawerVariant } from '@visualisation-sub/mural/Controls';
import { register } from '../registry.mjs';

class DrawerVM extends Model {
    static {
        Model.RegisterProperty(DrawerVM, 'NavOpen',      false,     MetaData.None);
        Model.RegisterProperty(DrawerVM, 'OptionsOpen',  false,     MetaData.None);
        Model.RegisterProperty(DrawerVM, 'ToggleNav',    undefined, MetaData.None);
        Model.RegisterProperty(DrawerVM, 'OpenOptions',  undefined, MetaData.None);
        Model.RegisterProperty(DrawerVM, 'CloseOptions', undefined, MetaData.None);
    }
    get NavOpen()      { return this.get_property_value('NavOpen'); }
    set NavOpen(v)     { this.set_property_value('NavOpen', v); }
    get OptionsOpen()  { return this.get_property_value('OptionsOpen'); }
    set OptionsOpen(v) { this.set_property_value('OptionsOpen', v); }

    constructor() {
        super();
        this.set_property_value('ToggleNav',
            new RelayCommand(() => { this.NavOpen = !this.NavOpen; }));
        this.set_property_value('OpenOptions',
            new RelayCommand(() => { this.OptionsOpen = true; }));
        this.set_property_value('CloseOptions',
            new RelayCommand(() => { this.OptionsOpen = false; }));
    }
}

function findAllByType(visual, ctor, out = []) {
    if (visual instanceof ctor) out.push(visual);
    for (const child of visual.visualChildren) {
        findAllByType(child, ctor, out);
    }
    return out;
}

let initialized = false;

register({
    id:       'drawer',
    group:    'Controls',
    title:    'Drawer',
    subtitle: 'Persistent rail + Temporary overlay drawer driven from the same VM.',
    factory: () => {
        if (!initialized) {
            const vm = new DrawerVM();
            app.Root.DataContext = vm;
            queueMicrotask(() => {
                const drawers = findAllByType(app.Root, Drawer);
                for (const d of drawers) {
                    if (d.Variant === DrawerVariant.Temporary) {
                        d.AddClosedListener(() => { vm.OptionsOpen = false; });
                    }
                }
            });
            initialized = true;
        }
        return app.Root;
    },
});
