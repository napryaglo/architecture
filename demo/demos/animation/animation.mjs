// animation demo — AnimationVM holds per-row Storyboard references
// and wires the imperative click handlers in OnViewMounted via
// FindName. On first activation the demo merges its
// ResourceDictionary into Application resources and hands the
// platform a VM instance.
import { Application } from '@visualisation-sub/mural/runtime';
import { create as createAnimationResources } from './animation.mu.js';
import { AnimationVM } from './animation-vm.mjs';
import { register } from '../../platform/registry.mjs';

let resourcesMerged = false;
let vmInstance;

register({
    id:       'animation',
    group:    'Animation',
    title:    'Animation engine',
    subtitle: 'From/To, AutoReverse + Repeat, ThicknessAnimationUsingKeyFrames — driven by AnimationManager on RafClock.',
    factory: () => {
        if (!resourcesMerged) {
            Application.current?.Resources.AddMergedDictionary(createAnimationResources());
            resourcesMerged = true;
        }
        if (vmInstance === undefined) vmInstance = new AnimationVM();
        return vmInstance;
    },
});
