// slider demo — SliderVM is empty; the .mu file declares the visual
// structure as a DataTemplate keyed on SliderVM. On first activation
// the demo merges its ResourceDictionary into Application resources
// and hands the platform a VM instance.
import { Application } from '@visualisation-sub/mural/runtime';
import { create as createSliderResources } from './slider.mu.js';
import { SliderVM } from './slider-vm.mjs';
import { register } from '../../platform/registry.mjs';

let resourcesMerged = false;
let vmInstance;

register({
    id:       'slider',
    group:    'Controls',
    title:    'Slider',
    subtitle: 'Single-thumb range with horizontal + vertical orientation, keyboard nudges, and track-click jump-to-point.',
    factory: () => {
        if (!resourcesMerged) {
            Application.current?.Resources.AddMergedDictionary(createSliderResources());
            resourcesMerged = true;
        }
        if (vmInstance === undefined) vmInstance = new SliderVM();
        return vmInstance;
    },
});
