// canvas-drop-behavior — accepts toolbox tile drops and turns them
// into new nodes on the diagram canvas. Owns the canvas-local
// coordinate transform (a view-tree walk that's forbidden in the VM
// per Rule 1) and dispatches to vm.CreateNode.
//
// The other gestures that used to live here (port → port wire drop)
// are gone — there are no ports anymore in this demo.

const FMT_NODE_KIND = 'mural/node-kind';

// DragDropEffects.Copy — duplicated as a literal so this file doesn't
// pull a runtime import just for the enum value.
const Copy = 1;

const NODE_W = 130;
const NODE_H = 60;

export function attachCanvasDropBehavior(canvas, vm)
{
    canvas.AllowDrop = true;

    // Canvas-local origin cache. The view-tree walk to compute it is
    // the one piece of this behavior that earns its keep relative to a
    // VM implementation. Reset every drag-over since layout can shift
    // between drags.
    let origin = null;
    const ensureOrigin = () => {
        if (origin !== null) return origin;
        let x = 0, y = 0, cur = canvas;
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
            vm.Select(node);
            vm.Status = `Placed ${kind}. ${vm.Nodes.Count} nodes.`;
        }
    };

    canvas.AddRoutedEventListener('DragOver', onDragOver);
    canvas.AddRoutedEventListener('Drop',     onDrop);

    return function detach() {
        canvas.AllowDrop = false;
        canvas.RemoveRoutedEventListener('DragOver', onDragOver);
        canvas.RemoveRoutedEventListener('Drop',     onDrop);
    };
}
