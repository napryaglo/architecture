// bottom-app-bar demo — M3 BottomAppBar: a leading row of Standard
// IconButtons (the Actions default slot) plus a trailing FloatingAction
// FAB. A single parameterised Tap command echoes the last-tapped action.
import { BottomAppBarVM } from './bottom-app-bar-vm.mjs';
import { register } from '../../platform/registry.mjs';

let vmInstance;

register({
    id:       'bottom-app-bar',
    group:    'Controls',
    title:    'Bottom App Bar',
    subtitle: 'Leading IconButton actions + a trailing FAB, docked to the bottom.',
    factory: () => {
        if (vmInstance === undefined) vmInstance = new BottomAppBarVM();
        return vmInstance;
    },
});
