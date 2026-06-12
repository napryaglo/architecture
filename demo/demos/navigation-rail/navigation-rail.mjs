// navigation-rail demo — four destinations + active-label read-out.
// SelectedDataItem rides two-way to a VM string, so clicking an item
// updates the read-out via the standard property-changed listener.
import { Application } from '@visualisation-sub/mural/runtime';
import { NavigationRailDemo } from './navigation-rail.mu.js';
import { NavigationRailVM }   from './navigation-rail-vm.mjs';
import { register } from '../../platform/registry.mjs';

let resourcesMerged = false;
let vmInstance;

register({
    id:       'navigation-rail',
    group:    'Controls',
    title:    'NavigationRail',
    subtitle: 'Vertical destination strip; SelectedDataItem two-way binds to the VM.',
    factory: () => {
        if (!resourcesMerged) {
            Application.current?.Resources.AddMergedDictionary(NavigationRailDemo.Clone());
            resourcesMerged = true;
        }
        if (vmInstance === undefined) vmInstance = new NavigationRailVM();
        return vmInstance;
    },
});
