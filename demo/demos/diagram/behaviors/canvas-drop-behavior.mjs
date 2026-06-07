// canvas-drop-behavior — accepts toolbox tile drops and turns them
// into new nodes on the diagram surface. Owns the canvas-local
// coordinate transform (a view-tree walk that's forbidden in the VM
// per Rule 1) and dispatches to vm.CreateNode.
//
// Receiver shape: any Visual that can hold AllowDrop + DragOver / Drop
// listeners. In the post-flatten markup the Diagram itself is what we
// attach to — its ItemsPanel (a Canvas) sits at the Diagram's origin
// so diagram-local coords ≡ panel-local coords for the purpose of
// dropping a node at the cursor position.
//
// A Selector reference is taken so the behavior can select the
// freshly-created node through the standard SelectedItem path —
// keeping selection state in one place (the Selector) instead of
// reaching back into the VM for a Select() helper.

const FMT_NODE_KIND = 'mural/node-kind';

// DragDropEffects.Copy — duplicated as a literal so this file doesn't
// pull a runtime import just for the enum value.
const Copy = 1;

const NODE_W = 130;
const NODE_H = 60;

export function attachCanvasDropBehavior(receiver, vm, selector)
{
    receiver.AllowDrop = true;

    // Receiver-local origin cache. The view-tree walk to compute it is
    // the one piece of this behavior that earns its keep relative to a
    // VM implementation. Reset every drag-over since layout can shift
    // between drags.
    let origin = null;
    const ensureOrigin = () => {
        if (origin !== null) return origin;
        let x = 0, y = 0, cur = receiver;
        while (cur !== undefined) {
            const r = cur.ArrangedRect;
            x += r.X;
            y += r.Y;
            cur = cur.GetVisualParent();
        }
        origin = { x, y };
        return origin;
    };
    const local = (args) => {
        const o = ensureOrigin();
        return { x: args.HostX - o.x, y: args.HostY - o.y };
    };

    const onDragOver = (args) => {
        if (args.Data.Has(FMT_NODE_KIND)) args.Effect = Copy;
    };

    const onDrop = (args) => {
        if (!args.Data.Has(FMT_NODE_KIND)) return;
        const kind = args.Data.Get(FMT_NODE_KIND);
        const p = local(args);
        const node = vm.CreateNode(kind, p.x - NODE_W / 2, p.y - NODE_H / 2);
        if (node !== null) {
            // Replace selection with the just-dropped node — feels
            // right when placing one item at a time. Marquee / Ctrl
            // afterwards can still extend.
            selector.SelectedItem = node;
            vm.Status = `Placed ${kind}. ${vm.Nodes.Count} nodes.`;
        }
    };

    receiver.AddRoutedEventListener('DragOver', onDragOver);
    receiver.AddRoutedEventListener('Drop',     onDrop);

    return function detach() {
        receiver.AllowDrop = false;
        receiver.RemoveRoutedEventListener('DragOver', onDragOver);
        receiver.RemoveRoutedEventListener('Drop',     onDrop);
    };
}
