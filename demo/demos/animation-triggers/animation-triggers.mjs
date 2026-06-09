// animation-triggers demo — AnimationTriggersVM is empty; the .mu
// file declares a DataTemplate keyed on AnimationTriggersVM with an
// implicit Button style (scoped to the template root) that drives
// Loaded / hover / TargetName trigger actions.
import { Application } from '@visualisation-sub/mural/runtime';
import { AnimationTriggersDemo } from './animation-triggers.mu.js';
import { AnimationTriggersVM } from './animation-triggers-vm.mjs';
import { register } from '../../platform/registry.mjs';

let resourcesMerged = false;
let vmInstance;

register({
    id:       'animation-triggers',
    group:    'Animation',
    title:    'Trigger actions',
    subtitle: '`when(){ on enter/exit }`, `on Loaded`, `TargetName=banner` — all-markup, zero host JS.',
    factory: () => {
        if (!resourcesMerged) {
            Application.current?.Resources.AddMergedDictionary(AnimationTriggersDemo.Clone());
            resourcesMerged = true;
        }
        if (vmInstance === undefined) vmInstance = new AnimationTriggersVM();
        return vmInstance;
    },
});
