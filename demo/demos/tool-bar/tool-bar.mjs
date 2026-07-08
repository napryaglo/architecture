// tool-bar demo — exposes the ToolBar / ToolBarButton /
// ToolBarToggleButton / ToolBarSeparator family. Items flow LTR;
// overflow moves into the popup behind the chevron.
import { ToolBarVM } from './tool-bar-vm.mjs';
import { register } from '../../platform/registry.mjs';

let vmInstance;

register({
    id:       'tool-bar',
    group:    'Controls',
    title:    'ToolBar',
    subtitle: 'Mixed item types; overflow popup; selection-gated commands dim the corresponding buttons.',
    factory: () => {
        if (vmInstance === undefined) vmInstance = new ToolBarVM();
        return vmInstance;
    },
});
