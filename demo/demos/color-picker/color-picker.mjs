// Bootstrap for the color-picker demo.
//
// Three ColorPickers ride on VM hex DPs; a thin behaviour walks each
// linked preview Border and writes a fresh SolidColorBrush as the hex
// changes. Partial hex strings (e.g. mid-typing) throw inside
// Color.FromHex — we swallow those so the preview stays at its last
// good value until a full hex lands.

import { Application } from '@visualisation-sub/mural/runtime';
import { Border } from '@visualisation-sub/mural/basic';
import { Color, SolidColorBrush } from '@visualisation-sub/mural/visual-engine';

import { ColorPickerDemo } from './color-picker.mu.js';
import { ColorPickerVM } from './color-picker-vm.mjs';
import { register } from '../../platform/registry.mjs';

function attachBehaviors(view, vm) {
    const wires = [
        ['SurfacePreview', 'SurfaceHex'],
        ['AccentPreview',  'AccentHex'],
        ['InkPreview',     'InkHex'],
        ['OverlayPreview', 'OverlayHex'],
    ];

    const cleanups = [];
    for (const [partName, hexProp] of wires) {
        const preview = view.FindName(partName);
        if (!(preview instanceof Border)) continue;

        const apply = () => {
            try {
                preview.Background = new SolidColorBrush(Color.FromHex(vm[hexProp]));
            } catch { /* partial hex during typing */ }
        };
        apply();
        vm._add_property_changed_listener_by_name(hexProp, apply);
        cleanups.push(() => vm._remove_property_changed_listener_by_name(hexProp, apply));
    }

    return function detach() {
        for (const c of cleanups) c();
    };
}

let resourcesMerged = false;
let vmInstance;

register({
    id:       'color-picker',
    group:    'Demos',
    title:    'Color picker',
    subtitle: 'ComboBox-style picker — palette + HSV sliders + hex round-trip.',
    factory: () => {
        if (!resourcesMerged) {
            Application.current?.Resources.AddMergedDictionary(ColorPickerDemo.Clone());
            resourcesMerged = true;
        }
        if (vmInstance === undefined) vmInstance = new ColorPickerVM();
        vmInstance.OnViewMounted = (view) => attachBehaviors(view, vmInstance);
        return vmInstance;
    },
});
