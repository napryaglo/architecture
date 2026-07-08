// segmented-button demo — M3 SegmentedButton (Single + Multiple
// variants) wired to an ObservableCollection-backed VM.
import { SegmentedButtonVM } from './segmented-button-vm.mjs';
import { register } from '../../platform/registry.mjs';

let vmInstance;

register({
    id:       'segmented-button',
    group:    'Controls',
    title:    'SegmentedButton',
    subtitle: 'M3 connected-segment row — Single + Multiple selection variants.',
    factory: () => {
        if (vmInstance === undefined) vmInstance = new SegmentedButtonVM();
        return vmInstance;
    },
});
