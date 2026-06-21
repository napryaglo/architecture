// diagram demo bootstrap — node-only scene with marquee multi-select.
//
// What lives here:
//   * VM factory (registered with the demo platform).
//   * One view-init step: wire the diagram's drop receiver so toolbox
//     tiles materialize new nodes when dropped.
//   * KeyDown listener on the view root → Delete removes ALL currently
//     selected nodes; Ctrl+G / Ctrl+Shift+G drive Group / Ungroup
//     through the framework's command DPs.
//   * Selection bridge: Diagram is a Selector, so SelectionChanged
//     fires on click / Ctrl-click / Shift-click / marquee. The bridge
//     reflects Selector.SelectedItems onto each NodeVM.IsSelected so
//     the existing data-template triggers (`when($IsSelected)`) keep
//     driving per-shape chrome without any template changes.
//   * Framework-event handlers: GroupRequested / UngroupRequested /
//     CombineRequested / ItemDropped — fire on the Diagram, this file
//     dispatches them to the VM's mutation methods. The framework
//     supplies the gating + the routed-event piping; the demo
//     supplies the data-side mutation.
//
// What's GONE (now framework-provided — see
// src/document/diagram-control.md):
//   * AlignmentGuidesAdorner + align-edges-behavior — framework
//     drives both when Diagram.AlignmentGuidesEnabled = true (set in
//     diagram.mu).
//   * SelectionResizeAdorner — framework mounts it via
//     SelectionResizeEnabled = true (in diagram.mu).
//   * canvas-drop-behavior.mjs — promoted to
//     framework/diagram/behaviors/canvas-drop-behavior.ts; this file
//     re-imports it from the public framework barrel.

import { Application } from '@visualisation-sub/mural/runtime';
import { Diagram, attachCanvasDropBehavior } from '@visualisation-sub/mural/framework';
import { DiagramDemo } from './diagram.mu.js';
import { DiagramShapeTemplates } from './diagram-shape-templates.mu.js';
import { DiagramVM, GroupVM, ShapeNodeVM, topLevelOf } from './diagram-vm.mjs';
import { register } from '../../platform/registry.mjs';
import Icons from '../../assets/icons.mjs';

const LocalStorageService = {
    GetItem(key)        { return window.localStorage.getItem(key); },
    SetItem(key, value) { window.localStorage.setItem(key, value); },
};

let resourcesMerged = false;
let vmInstance;

// Mirror Selector.SelectedItems onto ShapeNodeVM.IsSelected +
// GroupVM.IsSelected so the per-shape `when($IsSelected)` triggers
// (orange chrome) fire on selected top-level leaves, AND the GroupVM
// bbox template (dashed border) fires on selected top-level groups.
//
// "Elevation" rule (Visio / PowerPoint parity): clicking ANY entity
// walks the Parent chain to the outermost ancestor, and ONLY that
// entity gets IsSelected=true.
function attachSelectionBridge(diagram, vm) {
    const sync = () => {
        const nextLeaves = new Set();
        const nextGroups = new Set();
        for (const item of diagram.SelectedItems)
        {
            if (!(item instanceof ShapeNodeVM || item instanceof GroupVM)) continue;
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

    // ── Framework-command proxy wiring ────────────────────────────────
    //
    // The markup binds buttons + the format pane to DiagramVM DPs
    // ($AlignLeftCommand, $SelectionFormatFill, etc.). The actual
    // command implementations live on the framework Diagram control
    // (post-Phase L of the diagram-control refactor). This block
    // forwards values across:
    //
    //   * commands — one-way (Diagram → VM). RelayCommand instances
    //     don't change post-construction, so a one-shot copy suffices.
    //   * SelectionFormatFill / SelectionFormatStroke — TWO-way: the
    //     framework's FormatMirror re-seeds from the selection (Diagram
    //     → VM) AND the format-pane edits write through the VM proxy
    //     onto the Diagram (VM → Diagram) so FormatMirror broadcasts
    //     to every selected leaf.
    //
    // (A future compiler 2-pass scan would let the markup reference
    // `$nodes.AlignLeftCommand` directly, dropping this proxy. The
    // compiler currently resolves x:name in document order; the
    // toolbar IconButtons compile before the Diagram declaration, so
    // ElementName resolution misses.)
    {
        const Diagram_ = Diagram;
        const VM       = vm.constructor;
        const COMMANDS = [
            ['AlignLeftCommandKey',            'AlignLeftCommandKey'],
            ['AlignRightCommandKey',           'AlignRightCommandKey'],
            ['AlignTopCommandKey',             'AlignTopCommandKey'],
            ['AlignMiddleCommandKey',          'AlignMiddleCommandKey'],
            ['AlignCenterCommandKey',          'AlignCenterCommandKey'],
            ['DistributeHorizontalCommandKey', 'DistributeHorizontalCommandKey'],
            ['DistributeVerticalCommandKey',   'DistributeVerticalCommandKey'],
            ['GroupCommandKey',                'GroupCommandKey'],
            ['UngroupCommandKey',              'UngroupCommandKey'],
            ['CombineUnionCommandKey',         'CombineUnionCommandKey'],
            ['CombineIntersectCommandKey',     'CombineIntersectCommandKey'],
            ['CombineSubtractCommandKey',      'CombineSubtractCommandKey'],
            ['CombineExcludeCommandKey',       'CombineExcludeCommandKey'],
        ];
        for (const [diagKey, vmKey] of COMMANDS) {
            vm.set_property_value(VM[vmKey], nodes.get_property_value(Diagram_[diagKey]));
        }
        // TWO-way bridge for the format mirror — initial Diagram→VM
        // sync + bidirectional listeners. Local-tier writes always fire
        // OnPropertyChange (no equal-value dedup in the EVD's set-value
        // path), so naked listener-into-write recursion would loop. A
        // per-bridge `propagating` flag short-circuits the inverse
        // listener while a side-effect write is in flight.
        const bridge = (diagKey, vmKey) => {
            vm.set_property_value(VM[vmKey], nodes.get_property_value(Diagram_[diagKey]));
            let propagating = false;
            nodes.AddPropertyChangedListener(Diagram_[diagKey], () => {
                if (propagating) return;
                propagating = true;
                try { vm.set_property_value(VM[vmKey], nodes.get_property_value(Diagram_[diagKey])); }
                finally { propagating = false; }
            });
            vm.AddPropertyChangedListener(VM[vmKey], () => {
                if (propagating) return;
                propagating = true;
                try { nodes.set_property_value(Diagram_[diagKey], vm.get_property_value(VM[vmKey])); }
                finally { propagating = false; }
            });
        };
        bridge('SelectionFormatFillKey',   'SelectionFormatFillKey');
        bridge('SelectionFormatStrokeKey', 'SelectionFormatStrokeKey');
    }

    // Toolbox drop receiver — attached to the surface Border so drops
    // near the right edge (on the scrollbar) still register. The
    // Diagram receives ItemDropped events with canvas-local Position
    // + the raw DataObject; this file unpacks the kind format and
    // delegates to vm.CreateNode.
    const detachCanvasDrop = attachCanvasDropBehavior(surface, nodes);
    const onItemDropped = (args) => {
        const kind = args.Data.Get('mural/node-kind');
        if (kind === undefined) return;
        // Center the dropped node on the cursor — CreateNode places the
        // top-left at (x, y), so subtract half the default node size.
        const NODE_W = 130, NODE_H = 60;
        const node = vm.CreateNode(kind, args.Position.X - NODE_W / 2, args.Position.Y - NODE_H / 2);
        if (node !== null) {
            nodes.SelectedItem = node;
            vm.Status = `Placed ${kind}. ${vm.Nodes.Count} nodes.`;
        }
    };
    nodes.AddItemDroppedListener(onItemDropped);

    // Selection → data bridge — so `when($IsSelected)` template
    // triggers fire on click / marquee / Ctrl- / Shift-click.
    const detachSelectionBridge = attachSelectionBridge(nodes, vm);

    // Framework event handlers — Group / Ungroup / Combine fire from
    // the Diagram's RelayCommands; this demo's data-side mutation
    // methods do the actual collection updates. The VM's methods
    // already inspect their own selection state (vm._selectedTopLevel
    // / _formatLeaves), so the event args are advisory — useful for
    // demos that need finer control, but here the existing methods
    // suffice.
    const onGroupRequested   = () => vm.Group();
    const onUngroupRequested = () => vm.Ungroup();
    const onCombineRequested = (args) => vm.CombineSelection(args.Mode);
    nodes.AddGroupRequestedListener(onGroupRequested);
    nodes.AddUngroupRequestedListener(onUngroupRequested);
    nodes.AddCombineRequestedListener(onCombineRequested);

    // Focus capture — Diagram.Focusable=true (set in diagram.mu) opts
    // the surface into the keyboard-focus pipeline; take focus on
    // every PointerDown so keystrokes route through the diagram.
    nodes.AddRoutedEventListener('PointerDown', () => nodes.Focus());

    // Keyboard — Delete removes selected; Ctrl+G / Ctrl+Shift+G fire
    // the framework's GroupCommand / UngroupCommand respectively.
    view.AddRoutedEventListener('KeyDown', (args) => {
        if (args?.Key === 'Delete' || args?.Key === 'Backspace')
        {
            const snapshot = [...nodes.SelectedItems];
            if (snapshot.length === 0) return;
            vm.DeleteNodes(snapshot);
            args.Handled = true;
            return;
        }
        if ((args?.Key === 'g' || args?.Key === 'G') && args.Modifiers?.Control)
        {
            const cmd = args.Modifiers.Shift ? nodes.UngroupCommand : nodes.GroupCommand;
            if (cmd?.CanExecute(null)) cmd.Execute(null);
            args.Handled = true;
            return;
        }
    });

    // Seed a few nodes so the demo isn't empty on open.
    queueMicrotask(() => {
        vm.CreateNode('rectangle',     60, 60);
        vm.CreateNode('ellipse',      220, 60);
        vm.CreateNode('squircle',      60, 200);
        vm.CreateNode('flower',       220, 200);
        vm.CreateNode('heart',        380, 60);
        vm.Status = `Ready. ${vm.Nodes.Count} nodes. Drag a shape from the toolbox →`;
        nodes.Focus();
    });

    return function detachAll() {
        detachCanvasDrop();
        detachSelectionBridge();
        nodes.RemoveItemDroppedListener(onItemDropped);
        nodes.RemoveGroupRequestedListener(onGroupRequested);
        nodes.RemoveUngroupRequestedListener(onUngroupRequested);
        nodes.RemoveCombineRequestedListener(onCombineRequested);
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
