// tool-bar demo — exposes the ToolBar / ToolBarButton /
// ToolBarToggleButton / ToolBarSeparator family. Items flow LTR;
// overflow moves into the popup behind the chevron.
import { Application } from '@visualisation-sub/mural/runtime';
import { create as createToolBarResources } from './tool-bar.mu.js';
import { ToolBarVM } from './tool-bar-vm.mjs';
import { register } from '../../platform/registry.mjs';

let resourcesMerged = false;
let vmInstance;

register({
    id:       'tool-bar',
    group:    'Controls',
    title:    'ToolBar',
    subtitle: 'Mixed item types; overflow popup; selection-gated commands dim the corresponding buttons.',
    factory: () => {
        if (!resourcesMerged) {
            Application.current?.Resources.AddMergedDictionary(createToolBarResources());
            resourcesMerged = true;
        }
        if (vmInstance === undefined) vmInstance = new ToolBarVM();
        return vmInstance;
    },
});
