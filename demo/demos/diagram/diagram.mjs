// diagram demo — DiagramVM hosts all gesture state and DOM-level
// keyboard wiring; OnViewMounted resolves canvas / surface / status /
// toolbox / buttons via FindName and wires the entire pointer + key
// pipeline. On first activation the demo merges its ResourceDictionary
// into Application resources and hands the platform a VM instance.
import { Application } from '@visualisation-sub/mural/runtime';
import { create as createDiagramResources } from './diagram.mu.js';
import { DiagramVM } from './diagram-vm.mjs';
import { register } from '../../platform/registry.mjs';

let resourcesMerged = false;
let vmInstance;

register({
    id:       'diagram',
    group:    'Demos',
    title:    'Diagrammer',
    subtitle: 'Drag shapes from the toolbox; drag a node to move; drag a port to another node to wire them.',
    factory: () => {
        if (!resourcesMerged) {
            Application.current?.Resources.AddMergedDictionary(createDiagramResources());
            resourcesMerged = true;
        }
        if (vmInstance === undefined) vmInstance = new DiagramVM();
        return vmInstance;
    },
});
