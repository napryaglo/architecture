// segmented-button demo — M3 SegmentedButton (Single + Multiple
// variants) wired to an ObservableCollection-backed VM.
import { Application } from '@visualisation-sub/mural/runtime';
import { SegmentedButtonDemo } from './segmented-button.mu.js';
import { SegmentedButtonVM } from './segmented-button-vm.mjs';
import { register } from '../../platform/registry.mjs';

let resourcesMerged = false;
let vmInstance;

register({
    id:       'segmented-button',
    group:    'Controls',
    title:    'SegmentedButton',
    subtitle: 'M3 connected-segment row — Single + Multiple selection variants.',
    factory: () => {
        if (!resourcesMerged) {
            Application.current?.Resources.AddMergedDictionary(SegmentedButtonDemo.Clone());
            resourcesMerged = true;
        }
        if (vmInstance === undefined) vmInstance = new SegmentedButtonVM();
        return vmInstance;
    },
});
