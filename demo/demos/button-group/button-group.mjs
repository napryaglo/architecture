// button-group demo — M3 ButtonGroup hover-expand row of action
// buttons. Hovered button widens; siblings shrink. PointerLeave
// returns to resting layout. 200ms tween default.
import { ButtonGroupVM } from './button-group-vm.mjs';
import { register } from '../../platform/registry.mjs';

let vmInstance;

register({
    id:       'button-group',
    group:    'Controls',
    title:    'ButtonGroup',
    subtitle: 'M3 2024 hover-expand row of action buttons.',
    factory: () => {
        if (vmInstance === undefined) vmInstance = new ButtonGroupVM();
        return vmInstance;
    },
});
