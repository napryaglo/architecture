// toggle-button demo — exposes the ToggleButton control via a simple
// VM-driven demo. The .mu side declares a DataTemplate keyed off the
// ToggleButtonVM type so PageView's ContentControl auto-resolves it.
import { Application } from '@visualisation-sub/mural/runtime';
import { ToggleButtonDemo } from './toggle-button.mu.js';
import { ToggleButtonVM } from './toggle-button-vm.mjs';
import { register } from '../../platform/registry.mjs';

let resourcesMerged = false;
let vmInstance;

register({
    id:       'toggle-button',
    group:    'Controls',
    title:    'ToggleButton',
    subtitle: 'IsChecked flips on click; TwoWay binding keeps VM and chrome in sync.',
    factory: () => {
        if (!resourcesMerged) {
            Application.current?.Resources.AddMergedDictionary(ToggleButtonDemo.Clone());
            resourcesMerged = true;
        }
        if (vmInstance === undefined) vmInstance = new ToggleButtonVM();
        return vmInstance;
    },
});
