// text-box demo — TextBoxVM is intentionally empty; the .mu file
// declares the visual structure as a DataTemplate keyed on TextBoxVM.
// On first activation the demo merges its ResourceDictionary into
// Application.current.Resources and hands the platform a VM instance;
// PageView's ContentControl auto-resolves the template by data type
// and slots the produced Visual.
import { Application } from '@visualisation-sub/mural/runtime';
import { TextBoxDemo } from './text-box.mu.js';
import { TextBoxVM } from './text-box-vm.mjs';
import { register } from '../../platform/registry.mjs';

let resourcesMerged = false;
let vmInstance;

register({
    id:       'text-box',
    group:    'Controls',
    title:    'TextBox',
    subtitle: 'Single-line + multi-line text editing with selection, navigation, and clipboard (Ctrl+A/C/X/V).',
    factory: () => {
        if (!resourcesMerged) {
            Application.current?.Resources.AddMergedDictionary(TextBoxDemo.Clone());
            resourcesMerged = true;
        }
        if (vmInstance === undefined) vmInstance = new TextBoxVM();
        return vmInstance;
    },
});
