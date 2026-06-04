// diagram demo bootstrap — owns view-layer wiring.
//
// Per CLAUDE.md MVVM rules: the VM does data + commands; the .mu does
// markup + bindings + declarative event triggers; THIS file is the
// glue between them. The bootstrap is allowed to do everything Rules
// 1 / 4 forbid VMs from doing (FindName, AddRoutedEventListener,
// ItemsControl.Generator reaches) — it's the "view init" layer.
//
// Lifecycle:
//   1. Demo platform calls `factory()` → returns a DiagramVM instance.
//   2. Platform materializes a view tree from the DiagramTemplate
//      DataTemplate using the VM as DataContext.
//   3. Platform calls `vm.OnViewMounted(view)` — that hook lives here
//      (NOT on the VM) as `attachDiagramBehaviors(view, vm)` invoked
//      via a small wrapper on the returned VM.
import { Application } from '@visualisation-sub/mural/runtime';
import { Canvas, ItemsControl } from '@visualisation-sub/mural/Controls';
import { create as createDiagramResources } from './diagram.mu.js';
import { DiagramVM } from './diagram-vm.mjs';
import { attachCanvasDropBehavior } from './behaviors/canvas-drop-behavior.mjs';
import { attachNodeContainer } from './behaviors/node-container-behavior.mjs';
import { register } from '../../platform/registry.mjs';

// LocalStorageService — concrete implementation of IStorageService for
// the browser host. Injected into DiagramVM at construction so the VM
// stays host-agnostic (Rule 5: VMs don't touch host globals).
const LocalStorageService = {
    GetItem(key)        { return window.localStorage.getItem(key); },
    SetItem(key, value) { window.localStorage.setItem(key, value); },
};

let resourcesMerged = false;
let vmInstance;

function attachDiagramBehaviors(view, vm) {
    const canvas  = view.FindName('canvas');
    const surface = view.FindName('surface');
    const nodesIC = view.FindName('nodes');
    if (!(canvas instanceof Canvas))         throw new Error('diagram.mu missing x:name="canvas"');
    if (surface === undefined)               throw new Error('diagram.mu missing x:name="surface"');
    if (!(nodesIC instanceof ItemsControl))  throw new Error('diagram.mu missing x:name="nodes" ItemsControl');

    // Per-template selection — toolbox tiles share one template,
    // nodes dispatch by kind. Selectors live in the bootstrap because
    // they reference Control instances; the VM only knows about VMs.
    const res = Application.current.Resources;
    nodesIC.ItemTemplateSelector = (item) => {
        if (item === undefined || item.Kind === undefined) return undefined;
        switch (item.Kind) {
            case 'rect':    return res.Resolve('DiagramRectTemplate');
            case 'ellipse': return res.Resolve('DiagramEllipseTemplate');
            case 'note':    return res.Resolve('DiagramNoteTemplate');
            default:        return res.Resolve('DiagramRectTemplate');
        }
    };

    // Canvas drop receiver — DragOver / Drop wiring + coord transform.
    const detachCanvasDrop = attachCanvasDropBehavior(canvas, vm);

    // Per-node behaviors (port hover + port wire + edge-relayout)
    // attach when the ItemsControl materializes each container, detach
    // when it's recycled / removed. The subscription walks the Add /
    // Remove deltas.
    const perNodeDetachers = new Map();
    vm.Nodes.Subscribe((change) => {
        if (change.kind === 'inserted') {
            for (const node of change.items) {
                const container = nodesIC.Generator.ContainerFromItem(node);
                if (container === undefined) continue;
                const d = attachNodeContainer(container, node, vm, canvas);
                perNodeDetachers.set(node, d);
            }
        }
        else if (change.kind === 'removed') {
            for (const node of change.items) {
                perNodeDetachers.get(node)?.();
                perNodeDetachers.delete(node);
            }
        }
        else if (change.kind === 'cleared') {
            for (const d of perNodeDetachers.values()) d();
            perNodeDetachers.clear();
        }
    });

    // Selection-clear when the surface itself is the PointerDown
    // source (empty canvas click). This is bootstrap-level wiring —
    // could also live in a `surface-behavior.mjs` but a one-line
    // listener doesn't earn its own file yet.
    surface.AddRoutedEventListener('PointerDown', (args) => {
        if (args.Source === surface) vm.Select(null);
    });

    // Keyboard — the view root carries the demo's KeyDown route.
    // Document-level keyboard handling is exactly what Rule 5 forbids
    // VMs from doing; in the bootstrap it's fine because we own the
    // demo lifecycle and can clean up on tear-down (if the platform
    // grows a teardown hook).
    view.AddRoutedEventListener('KeyDown', (args) => {
        if (vm.KeyDownCommand.CanExecute(args)) vm.KeyDownCommand.Execute(args);
    });

    // Seed two nodes + one connector so the demo isn't empty on open.
    // Lives here (not in the VM constructor) because the seeding needs
    // the nodes to materialize containers before behaviors attach,
    // which requires the view + subscription to be in place first.
    queueMicrotask(() => {
        const a = vm.CreateNode('rect',    60, 60);
        const b = vm.CreateNode('ellipse', 320, 180);
        const c = vm.CreateNode('note',    160, 260);
        vm.AddEdge(a.Id, b.Id);
        vm.AddEdge(b.Id, c.Id);
        vm.Status = `Ready. ${vm.Nodes.Count} nodes, ${vm.Edges.Count} edges. Drag a shape from the toolbox →`;
    });

    // Single detach handle if the platform grows tear-down. Not used
    // by the current platform but cheap to expose.
    return function detachAll() {
        detachCanvasDrop();
        for (const d of perNodeDetachers.values()) d();
        perNodeDetachers.clear();
    };
}

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
        if (vmInstance === undefined) vmInstance = new DiagramVM(LocalStorageService);
        // Shim OnViewMounted onto the VM so the platform's existing
        // post-materialize hook fires our bootstrap-level attach call
        // without changing the platform. The shim runs once per first
        // mount; subsequent re-mounts (toggling the demo) re-attach
        // behaviors against the fresh view.
        vmInstance.OnViewMounted = (view) => attachDiagramBehaviors(view, vmInstance);
        return vmInstance;
    },
});
