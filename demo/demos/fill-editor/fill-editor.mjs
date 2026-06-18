// Bootstrap for the fill-editor demo. Same shape as the pen-editor
// demo's bootstrap — clone resources, instantiate VM, return.

import { Application } from '@visualisation-sub/mural/runtime';

import { FillEditorDemo } from './fill-editor.mu.js';
import { FillEditorDemoVM } from './fill-editor-vm.mjs';
import { register } from '../../platform/registry.mjs';

let resourcesMerged = false;
let vmInstance;

register({
    id:       'fill-editor',
    group:    'Demos',
    title:    'Fill editor',
    subtitle: 'Inline PowerPoint-style Fill editor — None / Solid / Linear / Radial / Pattern / Picture + opacity.',
    factory: () => {
        if (!resourcesMerged) {
            Application.current?.Resources.AddMergedDictionary(FillEditorDemo.Clone());
            resourcesMerged = true;
        }
        if (vmInstance === undefined) vmInstance = new FillEditorDemoVM();
        return vmInstance;
    },
});
