// context-menu demo — three coloured panels each with an attached
// ContextMenu. Right-click resolves to the nearest ancestor with a
// menu via the auto-installed PointerDown patch on Visual.prototype.
import { Application } from '@visualisation-sub/mural/runtime';
import { create as createContextMenuResources } from './context-menu.mu.js';
import { ContextMenuVM } from './context-menu-vm.mjs';
import { register } from '../../platform/registry.mjs';

let resourcesMerged = false;
let vmInstance;

register({
    id:       'context-menu',
    group:    'Controls',
    title:    'ContextMenu',
    subtitle: 'Right-click any coloured panel — attached ContextMenu DP routes to the nearest ancestor.',
    factory: () => {
        if (!resourcesMerged) {
            Application.current?.Resources.AddMergedDictionary(createContextMenuResources());
            resourcesMerged = true;
        }
        if (vmInstance === undefined) vmInstance = new ContextMenuVM();
        return vmInstance;
    },
});
