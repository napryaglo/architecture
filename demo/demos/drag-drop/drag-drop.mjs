// drag-drop demo bootstrap — wires the listbox-drop-behavior onto
// each ListBox after view materialization. The VM is pure data +
// methods; the .mu wires drag-source declaratively via IsDraggable +
// OnDragStart; this file is the glue.

import { Application } from '@visualisation-sub/mural/runtime';
import { ListBox } from '@visualisation-sub/mural/Controls';
import { create as createResources } from './drag-drop.mu.js';
import { DragDropVM } from './drag-drop-vm.mjs';
import { attachListBoxDrop } from './behaviors/listbox-drop-behavior.mjs';
import { register } from '../../platform/registry.mjs';

let resourcesMerged = false;
let vmInstance;

function attachBehaviors(view, vm) {
    const left  = view.FindName('leftList');
    const right = view.FindName('rightList');
    if (!(left  instanceof ListBox)) throw new Error('drag-drop.mu missing x:name="leftList"');
    if (!(right instanceof ListBox)) throw new Error('drag-drop.mu missing x:name="rightList"');

    const detachLeft  = attachListBoxDrop(left,  vm, 'left');
    const detachRight = attachListBoxDrop(right, vm, 'right');

    return function detachAll() {
        detachLeft();
        detachRight();
    };
}

register({
    id:       'drag-drop',
    group:    'Demos',
    title:    'Drag & drop between lists',
    subtitle: 'Drag any item from one list to the other to move it.',
    factory: () => {
        if (!resourcesMerged) {
            Application.current?.Resources.AddMergedDictionary(createResources());
            resourcesMerged = true;
        }
        if (vmInstance === undefined) vmInstance = new DragDropVM();
        vmInstance.OnViewMounted = (view) => attachBehaviors(view, vmInstance);
        return vmInstance;
    },
});
