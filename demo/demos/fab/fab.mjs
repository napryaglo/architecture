// fab demo — three icon-only sizes (Small / Default / Large) plus two
// Extended FABs (different label content). Click counts bind through
// the VM so the dynamic-binding chain is visible end-to-end.
import { Application } from '@visualisation-sub/mural/runtime';
import { FabDemo } from './fab.mu.js';
import { FabVM } from './fab-vm.mjs';
import { register } from '../../platform/registry.mjs';

let resourcesMerged = false;
let vmInstance;

register({
    id:       'fab',
    group:    'Controls',
    title:    'FAB',
    subtitle: 'Three icon-only sizes + Extended; Size DP drives chrome and CornerRadius.',
    factory: () => {
        if (!resourcesMerged) {
            Application.current?.Resources.AddMergedDictionary(FabDemo.Clone());
            resourcesMerged = true;
        }
        if (vmInstance === undefined) vmInstance = new FabVM();
        return vmInstance;
    },
});
