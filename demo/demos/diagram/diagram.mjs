// diagram demo bootstrap — node-only scene with marquee multi-select.
//
// What lives here:
//   * VM factory (registered with the demo platform).
//   * One view-init step: wire the diagram's drop receiver so toolbox
//     tiles materialize new nodes when dropped.
//   * KeyDown listener on the view root → Delete removes ALL currently
//     selected nodes (multi-select via the Selector's SelectedItems).
//   * Selection bridge: Diagram is a Selector, so SelectionChanged
//     fires on click / Ctrl-click / Shift-click / marquee. The bridge
//     reflects Selector.SelectedItems onto each NodeVM.IsSelected so
//     the existing data-template triggers (`when($IsSelected) { … }`)
//     keep driving per-shape chrome without any template changes.
//
// What used to live here that's GONE:
//   * surface.AddRoutedEventListener('PointerDown', …) that cleared
//     selection on background click — the marquee behavior now does
//     this declaratively (plain click on empty area runs ClearSelection).
//   * vm.Select / vm.SelectNodeCommand / vm.ClearSelectionCommand —
//     selection state lives on the Selector now; the VM stays
//     data-only + Save/Load commands.

import { Application } from '@visualisation-sub/mural/runtime';
import { Diagram } from '@visualisation-sub/mural/framework';
import { create as createDiagramResources } from './diagram.mu.js';
import { DiagramVM, NodeVM } from './diagram-vm.mjs';
import { attachCanvasDropBehavior } from './behaviors/canvas-drop-behavior.mjs';
import { register } from '../../platform/registry.mjs';

const LocalStorageService = {
    GetItem(key)        { return window.localStorage.getItem(key); },
    SetItem(key, value) { window.localStorage.setItem(key, value); },
};

let resourcesMerged = false;
let vmInstance;

// Mirror Selector.SelectedItems onto NodeVM.IsSelected so the existing
// per-shape DataTemplate triggers keep driving chrome. Diff against the
// prior snapshot so we only flip the rows that actually changed.
function attachSelectionBridge(diagram) {
    let prev = new Set();
    const sync = () => {
        const next = new Set();
        for (const item of diagram.SelectedItems) next.add(item);
        for (const n of prev) {
            if (!next.has(n) && n instanceof NodeVM) n.IsSelected = false;
        }
        for (const n of next) {
            if (!prev.has(n) && n instanceof NodeVM) n.IsSelected = true;
        }
        prev = next;
    };
    diagram.AddSelectionChangedListener(sync);
    return function detach() {
        diagram.RemoveSelectionChangedListener(sync);
        // Best-effort cleanup: clear lingering IsSelected so a re-mount
        // doesn't start with stale chrome.
        for (const n of prev) if (n instanceof NodeVM) n.IsSelected = false;
        prev = new Set();
    };
}

function attachDiagramBehaviors(view, vm) {
    const surface = view.FindName('surface');
    const nodes   = view.FindName('nodes');
    if (surface === undefined) throw new Error('diagram.mu missing x:name="surface"');
    if (!(nodes instanceof Diagram)) throw new Error('diagram.mu missing x:name="nodes" Diagram');

    // Toolbox → diagram drop receiver. Attached to the Diagram itself
    // (which fills the surface Border post-flatten) so the local coord
    // walk lands in panel-local space (Canvas.Left / Top units).
    const detachCanvasDrop = attachCanvasDropBehavior(nodes, vm, nodes);

    // Selection → data bridge — so `when($IsSelected)` template
    // triggers fire on click / marquee / Ctrl- / Shift-click without
    // any per-shape DataTemplate edits.
    const detachSelectionBridge = attachSelectionBridge(nodes);

    // Keyboard route — Delete / Backspace removes every selected node
    // through the VM. Snapshot SelectedItems FIRST because the
    // ObservableCollection mutations re-enter the Selector's recycle
    // hook and shrink the live set under our iteration.
    view.AddRoutedEventListener('KeyDown', (args) => {
        if (args?.Key !== 'Delete' && args?.Key !== 'Backspace') return;
        const snapshot = [...nodes.SelectedItems];
        if (snapshot.length === 0) return;
        vm.DeleteNodes(snapshot);
        args.Handled = true;
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
        detachSelectionBridge();
    };
}

register({
    id:       'diagram',
    group:    'Demos',
    title:    'Diagrammer',
    subtitle: 'Drag shapes from the toolbox; drag a node to move; click / marquee to select; Delete to remove.',
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
