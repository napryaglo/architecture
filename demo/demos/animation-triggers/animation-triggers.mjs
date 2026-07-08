// animation-triggers demo — AnimationTriggersVM is empty; the .mu
// file declares a DataTemplate keyed on AnimationTriggersVM with an
// implicit Button style (scoped to the template root) that drives
// Loaded / hover / TargetName trigger actions.
import { AnimationTriggersVM } from './animation-triggers-vm.mjs';
import { register } from '../../platform/registry.mjs';

let vmInstance;

register({
    id:       'animation-triggers',
    group:    'Animation',
    title:    'Trigger actions',
    subtitle: '`when(){ on enter/exit }`, `on Loaded`, `TargetName=banner` — all-markup, zero host JS.',
    factory: () => {
        if (vmInstance === undefined) vmInstance = new AnimationTriggersVM();
        return vmInstance;
    },
});
