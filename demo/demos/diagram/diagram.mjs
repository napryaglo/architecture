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
import { DiagramDemo } from './diagram.mu.js';
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

    // Toolbox → diagram drop receiver.
    //
    // Routing target is the surface Border (the outer chrome that
    // wraps the ScrollViewer + its scrollbars). Attaching directly to
    // the Diagram missed drops near the right edge — the vertical
    // scrollbar consumed routed drag events there, and because the
    // scrollbar lives inside the ScrollViewer's chrome (not inside
    // the Diagram), those events never bubble through the Diagram.
    // Surface Border sits above both subtrees, so every drop in the
    // canvas region bubbles through.
    //
    // The fourth argument pins the coordinate origin to the Diagram
    // (its ItemsPanel ≡ canvas-local space). Without that, dropping
    // on the surface would translate against the surface's host
    // position — wrong frame for Canvas.Left / Canvas.Top units.
    const detachCanvasDrop = attachCanvasDropBehavior(surface, vm, nodes, nodes);

    // Selection → data bridge — so `when($IsSelected)` template
    // triggers fire on click / marquee / Ctrl- / Shift-click without
    // any per-shape DataTemplate edits.
    const detachSelectionBridge = attachSelectionBridge(nodes);

    // Focus capture — Diagram.Focusable=true (set in diagram.mu) opts
    // the surface into the keyboard-focus pipeline; the listener below
    // takes focus on every PointerDown so a click anywhere on the
    // diagram (node, empty space, marquee start) routes subsequent
    // keystrokes to it. Without focus, the KeyDown handlers below would
    // never fire — Routed events flow from the focused Visual upward,
    // and nothing else in this view-tree opts in.
    nodes.AddRoutedEventListener('PointerDown', () => nodes.Focus());

    // Keyboard route — Delete / Backspace removes every selected node.
    // Arrow-key nudging is owned by the Diagram control itself (see
    // Diagram.OnKeyDown override in src/framework/diagram/diagram.ts).
    // Snapshot SelectedItems FIRST because the ObservableCollection
    // mutations re-enter the Selector's recycle hook and shrink the
    // live set under our iteration.
    view.AddRoutedEventListener('KeyDown', (args) => {
        if (args?.Key !== 'Delete' && args?.Key !== 'Backspace') return;
        const snapshot = [...nodes.SelectedItems];
        if (snapshot.length === 0) return;
        vm.DeleteNodes(snapshot);
        args.Handled = true;
    });

    // Seed a few nodes so the demo isn't empty on open. Picks one from
    // each shape family so the canvas surface shows the variety the
    // toolbox catalogue exposes.
    queueMicrotask(() => {
        vm.CreateNode('rectangle',     60, 60);
        vm.CreateNode('ellipse',      220, 60);
        vm.CreateNode('squircle',      60, 200);
        vm.CreateNode('flower',       220, 200);
        vm.CreateNode('heart',        380, 60);
        vm.Status = `Ready. ${vm.Nodes.Count} nodes. Drag a shape from the toolbox →`;
        // Initial focus — so arrow keys work BEFORE the user clicks the
        // surface. Deferred to the microtask so the view's mount path is
        // complete (Focus() no-ops on an unattached Visual).
        nodes.Focus();
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
            Application.current?.Resources.AddMergedDictionary(DiagramDemo.Clone());
            resourcesMerged = true;
        }
        if (vmInstance === undefined) vmInstance = new DiagramVM(LocalStorageService);
        vmInstance.OnViewMounted = (view) => attachDiagramBehaviors(view, vmInstance);
        return vmInstance;
    },
});
