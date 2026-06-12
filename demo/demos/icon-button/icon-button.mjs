// icon-button demo — two rows showcasing the four M3 IconButton variants
// and the four matching IconButtonToggle variants. Click counts and
// checked states bind back through the VM so the dynamic-binding chain
// is visible in the read-outs at the bottom.
import { Application } from '@visualisation-sub/mural/runtime';
import { IconButtonDemo } from './icon-button.mu.js';
import { IconButtonVM } from './icon-button-vm.mjs';
import { register } from '../../platform/registry.mjs';

let resourcesMerged = false;
let vmInstance;

register({
    id:       'icon-button',
    group:    'Controls',
    title:    'IconButton',
    subtitle: 'Four M3 chromes; toggle variants flip Background + glyph ink on IsChecked.',
    factory: () => {
        if (!resourcesMerged) {
            Application.current?.Resources.AddMergedDictionary(IconButtonDemo.Clone());
            resourcesMerged = true;
        }
        if (vmInstance === undefined) vmInstance = new IconButtonVM();
        return vmInstance;
    },
});
