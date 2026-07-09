// side-sheet demo — M3 Modal SideSheet: a trailing-edge sheet over a
// dismissable scrim, opened by a button and closed by its ✕ / the scrim.
import { SideSheetVM } from './side-sheet-vm.mjs';
import { register } from '../../platform/registry.mjs';

let vmInstance;

register({
    id:       'side-sheet',
    group:    'Controls',
    title:    'Side Sheet',
    subtitle: 'M3 lateral sheet — a Modal, scrim-backed trailing-edge surface.',
    factory: () => {
        if (vmInstance === undefined) vmInstance = new SideSheetVM();
        return vmInstance;
    },
});
