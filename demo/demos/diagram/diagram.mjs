// diagram demo bootstrap — node-only scene with marquee multi-select.
//
// All interaction logic lives in the framework Diagram control. The
// bootstrap is data-only: resources are merged once, the VM is
// constructed with a storage service, and the platform mounts the view
// from the registered DataTemplate. The markup wires the Diagram's
// declarative DPs (DropReceiver, Mutator, ReflectSelectionToItems,
// AlignmentGuidesEnabled, SelectionResizeEnabled, …) so view-mount
// callbacks aren't needed.

import { Application } from '@visualisation-sub/mural/runtime';
import { DiagramDemo } from './diagram.mu.js';
import { DiagramShapeTemplates } from './diagram-shape-templates.mu.js';
import { DiagramVM } from './diagram-vm.mjs';
import { register } from '../../platform/registry.mjs';
import Icons from '../../assets/icons.mjs';

const LocalStorageService = {
    GetItem(key)        { return window.localStorage.getItem(key); },
    SetItem(key, value) { window.localStorage.setItem(key, value); },
};

let resourcesMerged = false;
let vmInstance;

register({
    id:       'diagram',
    group:    'Demos',
    title:    'Diagrammer',
    subtitle: 'Drag shapes from the toolbox; drag a node to move; click / marquee to select; Delete to remove.',
    factory: () => {
        if (!resourcesMerged) {
            Application.current?.Resources.AddMergedDictionary(DiagramDemo.Clone());
            Application.current?.Resources.AddMergedDictionary(DiagramShapeTemplates.Clone());
            Application.current?.Resources.AddMergedDictionary(Icons);
            resourcesMerged = true;
        }
        if (vmInstance === undefined) vmInstance = new DiagramVM(LocalStorageService);
        return vmInstance;
    },
});
