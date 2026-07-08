// Bootstrap for the fill-editor demo. Same shape as the pen-editor
// demo's bootstrap — clone resources, instantiate VM, return.


import { FillEditorDemoVM } from './fill-editor-vm.mjs';
import { register } from '../../platform/registry.mjs';

let vmInstance;

register({
    id:       'fill-editor',
    group:    'Demos',
    title:    'Fill editor',
    subtitle: 'Inline PowerPoint-style Fill editor — None / Solid / Linear / Radial / Pattern / Picture + opacity.',
    factory: () => {
        if (vmInstance === undefined) vmInstance = new FillEditorDemoVM();
        return vmInstance;
    },
});
