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
import { AdornerLayer } from '@visualisation-sub/mural/visual-engine';
import { Diagram } from '@visualisation-sub/mural/framework';
import { DiagramDemo } from './diagram.mu.js';
import { DiagramShapeTemplates } from './diagram-shape-templates.mu.js';
import { DiagramVM, GroupVM, NodeVM, topLevelOf } from './diagram-vm.mjs';
import { attachCanvasDropBehavior } from './behaviors/canvas-drop-behavior.mjs';
import { SelectionResizeAdorner } from './selection-resize-adorner.mjs';
import { register } from '../../platform/registry.mjs';
import Icons from '../../assets/icons.mjs';

const LocalStorageService = {
    GetItem(key)        { return window.localStorage.getItem(key); },
    SetItem(key, value) { window.localStorage.setItem(key, value); },
};

let resourcesMerged = false;
let vmInstance;

// Mirror Selector.SelectedItems onto NodeVM.IsSelected + GroupVM.IsSelected
// so the per-shape `when($IsSelected)` triggers (orange chrome) fire on
// selected top-level leaves, AND the GroupVM bbox template (dashed border)
// fires on selected top-level groups.
//
// "Elevation" rule (Visio / PowerPoint parity): clicking ANY entity walks
// the Parent chain to the outermost ancestor, and ONLY that entity gets
// IsSelected=true. If the top-level is a GroupVM, its members (leaves and
// sub-groups) stay IsSelected=false — the group bbox stands in for any
// per-member chrome. If the top-level is a leaf, only it gets IsSelected.
//
// Reconcile against ACTUAL IsSelected state per node, not memoized
// "what we set last time". DiagramVM.Group() flips group.IsSelected
// directly (Selector.SelectedItems doesn't change post-grouping, so the
// bridge can't see the new group through the SelectionChanged callback).
// If we memoized prev, the new group would never enter the bridge's
// tracked set, so a later click on empty canvas would clear nothing.
// Walking vm.Nodes here is O(N) per sync, fine at the scales the
// diagrammer demo operates on.
function attachSelectionBridge(diagram, vm) {
    const sync = () => {
        const nextLeaves = new Set();
        const nextGroups = new Set();
        for (const item of diagram.SelectedItems)
        {
            // SelectedItems carries both NodeVMs and GroupVMs (the
            // group bbox container is in the same Nodes collection).
            // Clicking either elevates to the top-level ancestor; only
            // THAT entity's IsSelected lights up.
            if (!(item instanceof NodeVM || item instanceof GroupVM)) continue;
            const root = topLevelOf(item);
            if (root instanceof GroupVM)
            {
                nextGroups.add(root);
            }
            else
            {
                nextLeaves.add(item);
            }
        }
        // Reconcile every node's IsSelected against the desired set.
        // Flipping only when the value actually changes keeps the
        // listener cascade quiet on unchanged rows (each IsSelected
        // setter fires the VM's _watchSelection handler → re-evaluates
        // toolbar CanExecute + selection bbox).
        const nodes = vm.Nodes;
        for (let i = 0; i < nodes.Count; i++)
        {
            const n = nodes.Get(i);
            const wantSelected = (n instanceof GroupVM)
                ? nextGroups.has(n)
                : nextLeaves.has(n);
            if (n.IsSelected !== wantSelected) n.IsSelected = wantSelected;
        }
    };
    diagram.AddSelectionChangedListener(sync);
    return function detach() {
        diagram.RemoveSelectionChangedListener(sync);
        // Best-effort cleanup so a re-mount doesn't start with stale
        // chrome — clear every node's IsSelected. Walk vm.Nodes since
        // that's the canonical entity list (Selector.SelectedItems is
        // a subset).
        const nodes = vm.Nodes;
        for (let i = 0; i < nodes.Count; i++)
        {
            const n = nodes.Get(i);
            if (n.IsSelected) n.IsSelected = false;
        }
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
    const detachSelectionBridge = attachSelectionBridge(nodes, vm);

    // Resize adorner — single Adorner Visual hosted in the SCP's inner
    // AdornerLayer. Riding the layer means the handles scroll with the
    // canvas automatically (the SCP translates the layer along with its
    // content). Adorned element is the Diagram's ItemsPanelInstance, so
    // the adorner's layer-local frame matches canvas-local coords —
    // bbox / handle Arrange writes land at the same positions as
    // DiagramNode containers. The lookup is deferred to a microtask so
    // the items panel has materialized from the template by then.
    let detachResizeAdorner = () => {};
    queueMicrotask(() => {
        const itemsPanel = nodes.ItemsPanelInstance;
        if (itemsPanel === undefined) {
            console.warn('SelectionResizeAdorner: Diagram.ItemsPanelInstance is undefined; adorner skipped.');
            return;
        }
        const layer = AdornerLayer.GetAdornerLayer(itemsPanel);
        if (layer === undefined) {
            console.warn('SelectionResizeAdorner: no AdornerLayer in scope; adorner skipped.');
            return;
        }
        const adorner = new SelectionResizeAdorner(itemsPanel, vm);
        layer.Add(adorner);
        detachResizeAdorner = () => {
            layer.Remove(adorner);
            adorner.Dispose();
        };
    });

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
        if (args?.Key === 'Delete' || args?.Key === 'Backspace')
        {
            const snapshot = [...nodes.SelectedItems];
            if (snapshot.length === 0) return;
            vm.DeleteNodes(snapshot);
            args.Handled = true;
            return;
        }
        // Ctrl+G / Ctrl+Shift+G — Group / Ungroup (Visio + PowerPoint
        // parity). Going through the ICommand surface so CanExecute
        // gating is honored (no-op when fewer than 2 top-level items
        // are selected for Group, or no top-level group selected for
        // Ungroup).
        if ((args?.Key === 'g' || args?.Key === 'G') && args.Modifiers?.Control)
        {
            const cmd = args.Modifiers.Shift ? vm.UngroupCommand : vm.GroupCommand;
            if (cmd?.CanExecute(null)) cmd.Execute(null);
            args.Handled = true;
            return;
        }
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
        detachResizeAdorner();
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
            Application.current?.Resources.AddMergedDictionary(DiagramShapeTemplates.Clone());
            Application.current?.Resources.AddMergedDictionary(Icons);
            resourcesMerged = true;
        }
        if (vmInstance === undefined) vmInstance = new DiagramVM(LocalStorageService);
        vmInstance.OnViewMounted = (view) => attachDiagramBehaviors(view, vmInstance);
        return vmInstance;
    },
});
