// Bootstrap for the pen-editor demo. Clones the .mu's resources into
// the Application dictionary on first activation, instantiates the VM,
// and returns it for the platform to host as DataContext.

import { Application } from '@visualisation-sub/mural/runtime';

import { PenEditorDemo } from './pen-editor.mu.js';
import { PenEditorDemoVM } from './pen-editor-vm.mjs';
import { register } from '../../platform/registry.mjs';

let resourcesMerged = false;
let vmInstance;

register({
    id:       'pen-editor',
    group:    'Demos',
    title:    'Pen editor',
    subtitle: 'Inline PowerPoint-style Pen editor — brush, thickness, dash, cap, join.',
    factory: () => {
        if (!resourcesMerged) {
            Application.current?.Resources.AddMergedDictionary(PenEditorDemo.Clone());
            resourcesMerged = true;
        }
        if (vmInstance === undefined) vmInstance = new PenEditorDemoVM();
        return vmInstance;
    },
});
