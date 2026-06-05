// diagram demo bootstrap — node-only scene.
//
// What lives here:
//   * VM factory (registered with the demo platform).
//   * One view-init step: wire the canvas's drop receiver so toolbox
//     tiles materialize new nodes when dropped.
//   * KeyDown listener on the view root → routes to the VM's
//     KeyDownCommand (Delete to remove the selected node).
//
// Everything previously here that managed edges, ports, or per-node
// pointer behaviors is gone — drag-to-move now lives inside the
// DiagramNode control (src/Controls/diagram-node.ts), and there are no
// edges or ports anymore.

import { Application } from '@visualisation-sub/mural/runtime';
import { Canvas } from '@visualisation-sub/mural/Controls';
import { create as createDiagramResources } from './diagram.mu.js';
import { DiagramVM } from './diagram-vm.mjs';
import { attachCanvasDropBehavior } from './behaviors/canvas-drop-behavior.mjs';
import { register } from '../../platform/registry.mjs';

const LocalStorageService = {
    GetItem(key)        { return window.localStorage.getItem(key); },
    SetItem(key, value) { window.localStorage.setItem(key, value); },
};

let resourcesMerged = false;
let vmInstance;

function attachDiagramBehaviors(view, vm) {
    const canvas  = view.FindName('canvas');
    const surface = view.FindName('surface');
    if (!(canvas instanceof Canvas))  throw new Error('diagram.mu missing x:name="canvas"');
    if (surface === undefined)        throw new Error('diagram.mu missing x:name="surface"');

    // Toolbox → canvas drop receiver (the only behavior that needs the
    // bootstrap — the surface-level coord transform is naturally a
    // view-tree concern).
    const detachCanvasDrop = attachCanvasDropBehavior(canvas, vm);

    // Empty-canvas click clears selection.
    surface.AddRoutedEventListener('PointerDown', (args) => {
        if (args.Source === surface) vm.Select(null);
    });

    // Keyboard route — Delete on the view root.
    view.AddRoutedEventListener('KeyDown', (args) => {
        if (vm.KeyDownCommand.CanExecute(args)) vm.KeyDownCommand.Execute(args);
    });

    // Seed a few nodes so the demo isn't empty on open.
    queueMicrotask(() => {
        vm.CreateNode('rect',    60, 60);
        vm.CreateNode('ellipse', 320, 180);
        vm.CreateNode('note',    160, 260);
        vm.Status = `Ready. ${vm.Nodes.Count} nodes. Drag a shape from the toolbox →`;
    });

    return function detachAll() {
        detachCanvasDrop();
    };
}

register({
    id:       'diagram',
    group:    'Demos',
    title:    'Diagrammer',
    subtitle: 'Drag shapes from the toolbox; drag a node to move it; Delete to remove.',
    factory: () => {
        if (!resourcesMerged) {
            Application.current?.Resources.AddMergedDictionary(createDiagramResources());
            resourcesMerged = true;
        }
        if (vmInstance === undefined) vmInstance = new DiagramVM(LocalStorageService);
        vmInstance.OnViewMounted = (view) => attachDiagramBehaviors(view, vmInstance);
        return vmInstance;
    },
});
