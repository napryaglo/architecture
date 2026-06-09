// animation-named demo — AnimationNamedVM is empty; the .mu file
// declares a DataTemplate keyed on AnimationNamedVM with an implicit
// Button style (scoped to the template root) that drives Begin /
// Pause / Resume / Stop via named storyboards.
import { Application } from '@visualisation-sub/mural/runtime';
import { AnimationNamedDemo } from './animation-named.mu.js';
import { AnimationNamedVM } from './animation-named-vm.mjs';
import { register } from '../../platform/registry.mjs';

let resourcesMerged = false;
let vmInstance;

register({
    id:       'animation-named',
    group:    'Animation',
    title:    'Named storyboards',
    subtitle: '`BeginStoryboard[Name=loop]` + Pause / Resume / Stop on hover and click — markup-only.',
    factory: () => {
        if (!resourcesMerged) {
            Application.current?.Resources.AddMergedDictionary(AnimationNamedDemo.Clone());
            resourcesMerged = true;
        }
        if (vmInstance === undefined) vmInstance = new AnimationNamedVM();
        return vmInstance;
    },
});
