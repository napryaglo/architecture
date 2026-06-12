// top-app-bar demo — one row per M3 variant (Small / CenterAligned /
// Medium / Large) with shared IconButton actions and a click-count
// read-out so the dynamic-binding chain is visible end-to-end.
import { Application } from '@visualisation-sub/mural/runtime';
import { TopAppBarDemo } from './top-app-bar.mu.js';
import { TopAppBarVM } from './top-app-bar-vm.mjs';
import { register } from '../../platform/registry.mjs';

let resourcesMerged = false;
let vmInstance;

register({
    id:       'top-app-bar',
    group:    'Controls',
    title:    'TopAppBar',
    subtitle: 'Four M3 variants; Variant DP drives row count and title typography.',
    factory: () => {
        if (!resourcesMerged) {
            Application.current?.Resources.AddMergedDictionary(TopAppBarDemo.Clone());
            resourcesMerged = true;
        }
        if (vmInstance === undefined) vmInstance = new TopAppBarVM();
        return vmInstance;
    },
});
