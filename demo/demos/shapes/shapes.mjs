// shapes demo — registers the M3 Expressive shape library catalogue
// with the platform shell. Static, no commands, no bindings — the VM
// exists only to satisfy the platform's DataTemplate-keyed-on-DataType
// rendering convention.
import { Application } from '@visualisation-sub/mural/runtime';
import { ShapesDemo } from './shapes.mu.js';
import { ShapesVM } from './shapes-vm.mjs';
import { register } from '../../platform/registry.mjs';

let resourcesMerged = false;
let vmInstance;

register({
    id:       'shapes',
    group:    'Shape library',
    title:    'Expressive shapes',
    subtitle: 'M3 Expressive shape catalogue — all 35 named shapes.',
    factory: () => {
        if (!resourcesMerged) {
            Application.current?.Resources.AddMergedDictionary(ShapesDemo.Clone());
            resourcesMerged = true;
        }
        if (vmInstance === undefined) vmInstance = new ShapesVM();
        return vmInstance;
    },
});
