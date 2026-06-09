// drawer demo — DrawerVM drives both drawers through bindings.
// On first activation the demo merges its ResourceDictionary into
// Application resources and hands the platform a VM instance. The
// VM's OnViewMounted hook (called once after the DataTemplate is
// applied) wires the Temporary drawer's Closed listener so a scrim
// click reflects OptionsOpen=false back into the VM.
import { Application } from '@visualisation-sub/mural/runtime';
import { DrawerDemo } from './drawer.mu.js';
import { DrawerVM } from './drawer-vm.mjs';
import { register } from '../../platform/registry.mjs';

let resourcesMerged = false;
let vmInstance;

register({
    id:       'drawer',
    group:    'Controls',
    title:    'Drawer',
    subtitle: 'Persistent rail + Temporary overlay drawer driven from the same VM.',
    factory: () => {
        if (!resourcesMerged) {
            Application.current?.Resources.AddMergedDictionary(DrawerDemo.Clone());
            resourcesMerged = true;
        }
        if (vmInstance === undefined) vmInstance = new DrawerVM();
        return vmInstance;
    },
});
