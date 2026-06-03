// spin-edit demo — SpinEditVM is empty; the .mu file declares the
// visual structure as a DataTemplate keyed on SpinEditVM. On first
// activation the demo merges its ResourceDictionary into Application
// resources and hands the platform a VM instance.
import { Application } from '@visualisation-sub/mural/runtime';
import { create as createSpinEditResources } from './spin-edit.mu.js';
import { SpinEditVM } from './spin-edit-vm.mjs';
import { register } from '../../platform/registry.mjs';

let resourcesMerged = false;
let vmInstance;

register({
    id:       'spin-edit',
    group:    'Controls',
    title:    'SpinEdit',
    subtitle: 'Numeric up/down with clamping, decimal precision, and small/large step keys (Arrow, PageUp/Down).',
    factory: () => {
        if (!resourcesMerged) {
            Application.current?.Resources.AddMergedDictionary(createSpinEditResources());
            resourcesMerged = true;
        }
        if (vmInstance === undefined) vmInstance = new SpinEditVM();
        return vmInstance;
    },
});
