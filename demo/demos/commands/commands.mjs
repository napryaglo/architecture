// commands demo bootstrap â€” wires the Diagram-side selection bridge
// (Selector.SelectedItems â†’ NodeVM.IsSelected + CommandsVM.HasSelection)
// and seeds the canvas with a few starter nodes.
//
// Same selection-bridge pattern as the diagram demo: the VM doesn't
// reach into the view tree; the bootstrap subscribes to the Diagram's
// SelectionChanged event and updates VM state in lockstep.
import { Application } from '@visualisation-sub/mural/runtime';
import { Diagram } from '@visualisation-sub/mural/framework';
import { CommandsDemo } from './commands.mu.js';
import { CommandsVM, NodeVM } from './commands-vm.mjs';
import { register } from '../../platform/registry.mjs';

const LocalStorageService = {
    GetItem(key)        { return window.localStorage.getItem(key); },
    SetItem(key, value) { window.localStorage.setItem(key, value); },
};

let resourcesMerged = false;
let vmInstance;

// Mirror Selector.SelectedItems onto each NodeVM.IsSelected AND publish
// the aggregate HasSelection state to the VM so selection-gated
// commands re-evaluate.
function attachSelectionBridge(diagram, vm) {
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
        vm.PublishSelectionState(next.size > 0);
    };
    diagram.AddSelectionChangedListener(sync);
    return function detach() {
        diagram.RemoveSelectionChangedListener(sync);
        for (const n of prev) if (n instanceof NodeVM) n.IsSelected = false;
        prev = new Set();
        vm.PublishSelectionState(false);
    };
}

function attachBehaviors(view, vm) {
    const nodes = view.FindName('nodes');
    if (!(nodes instanceof Diagram)) throw new Error('commands.mu missing x:name="nodes" Diagram');

    const detachSelectionBridge = attachSelectionBridge(nodes, vm);

    // Keyboard: Delete / Backspace removes selected nodes.
    view.AddRoutedEventListener('KeyDown', (args) => {
        if (args?.Key !== 'Delete' && args?.Key !== 'Backspace') return;
        const snapshot = [...nodes.SelectedItems];
        if (snapshot.length === 0) return;
        vm.DeleteCommand.Execute(snapshot);
        args.Handled = true;
    });

    // Seed the canvas so the demo opens populated.
    queueMicrotask(() => {
        vm.CreateNode('rect',    80,  80);
        vm.CreateNode('rect',    260, 80);
        vm.CreateNode('ellipse', 80,  200);
        vm.CreateNode('note',    260, 200);
        vm.Status = `Ready. ${vm.Nodes.Count} nodes. Click / Ctrl-click / marquee to select; right-click for context menu.`;
    });

    return function detachAll() {
        detachSelectionBridge();
    };
}

register({
    id:       'commands',
    group:    'Demos',
    title:    'Commands',
    subtitle: 'ToolBar + Menu + ContextMenu over a Diagram. One ICommand instance drives every surface.',
    factory: () => {
        if (!resourcesMerged) {
            Application.current?.Resources.AddMergedDictionary(CommandsDemo.Clone());
            resourcesMerged = true;
        }
        if (vmInstance === undefined) vmInstance = new CommandsVM(LocalStorageService);
        vmInstance.OnViewMounted = (view) => attachBehaviors(view, vmInstance);
        return vmInstance;
    },
});
