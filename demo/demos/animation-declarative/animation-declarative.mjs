// animation-declarative demo — AnimationDeclarativeVM is empty; the
// .mu file declares a DataTemplate keyed on AnimationDeclarativeVM and
// carries an implicit Button style scoped to that template's root.
// On first activation the demo merges its ResourceDictionary into
// Application resources and hands the platform a VM instance.
import { Application } from '@visualisation-sub/mural/runtime';
import { create as createAnimationDeclarativeResources } from './animation-declarative.mu.js';
import { AnimationDeclarativeVM } from './animation-declarative-vm.mjs';
import { register } from '../../platform/registry.mjs';

let resourcesMerged = false;
let vmInstance;

register({
    id:       'animation-declarative',
    group:    'Animation',
    title:    'Declarative trigger actions',
    subtitle: '`on Click { BeginStoryboard { DoubleAnimation[...] } }` inside a style — no host-side JS.',
    factory: () => {
        if (!resourcesMerged) {
            Application.current?.Resources.AddMergedDictionary(createAnimationDeclarativeResources());
            resourcesMerged = true;
        }
        if (vmInstance === undefined) vmInstance = new AnimationDeclarativeVM();
        return vmInstance;
    },
});
