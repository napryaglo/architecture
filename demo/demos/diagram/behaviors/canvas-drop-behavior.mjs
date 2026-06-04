// canvas-drop-behavior — translates view-layer drag events on the
// diagram canvas into VM-layer domain calls. Owns the canvas-local
// coordinate transform (a view-tree walk that's forbidden in the VM
// per Rule 1) and the format-dispatch on drop:
//
//   FMT_NODE_KIND → vm.CreateNode(kind, localX, localY)
//   FMT_NODE_MOVE → vm.MoveNode(nodeId, localX, localY)
//   FMT_PORT      → vm.AddEdge(fromId, hitNode.Id)   (hit-test via the
//                   VM's Nodes collection — no view reach needed)
//
// Sets AllowDrop=true on the canvas at attach time so the framework's
// drag dispatcher routes events here.

const FMT_NODE_KIND = 'mural/node-kind';
const FMT_NODE_MOVE = 'mural/node-move';
const FMT_PORT      = 'mural/port';

// DragDropEffects values — duplicated from the runtime so this file
// doesn't pull a runtime import just for the enum.
const Copy = 1;
const Move = 2;
const Link = 4;

const NODE_W = 130;
const NODE_H = 60;

export function attachCanvasDropBehavior(canvas, vm)
{
    canvas.AllowDrop = true;

    // Canvas origin cache — the view-tree walk to compute it is the
    // ONE place this behavior earns its keep relative to a VM
    // implementation. Invalidate whenever the canvas's ArrangedRect
    // changes (layout pass).
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

    // hitTestNode — view-coord hit test against the VM's Nodes
    // collection using each node's X/Y/W/H. We treat the diagram
    // shapes as rectangles for the purposes of edge connection (the
    // chrome may be an ellipse but the bounding box is what wires
    // snap to).
    const hitTestNode = (x, y) => {
        for (let i = vm.Nodes.Count - 1; i >= 0; i--) {
            const n = vm.Nodes.Get(i);
            if (x >= n.X && x <= n.X + NODE_W && y >= n.Y && y <= n.Y + NODE_H) {
                return n;
            }
        }
        return null;
    };

    const onDragOver = (args) => {
        if (args.Data.Has(FMT_NODE_KIND)) { args.Effect = Copy; return; }
        if (args.Data.Has(FMT_NODE_MOVE)) { args.Effect = Move; return; }
        if (args.Data.Has(FMT_PORT)) {
            const port = args.Data.Get(FMT_PORT);
            const p = local(args);
            const over = hitTestNode(p.x, p.y);
            if (over !== null && over.Id !== port.nodeId) args.Effect = Link;
        }
    };

    const onDrop = (args) => {
        const p = local(args);
        if (args.Data.Has(FMT_NODE_KIND)) {
            const kind = args.Data.Get(FMT_NODE_KIND);
            const node = vm.CreateNode(kind, p.x - NODE_W / 2, p.y - NODE_H / 2);
            vm.Select(node);
            vm.Status = `Placed ${kind}. ${vm.Nodes.Count} nodes, ${vm.Edges.Count} edges.`;
            return;
        }
        if (args.Data.Has(FMT_NODE_MOVE)) {
            const { nodeId } = args.Data.Get(FMT_NODE_MOVE);
            vm.MoveNode(nodeId, p.x - NODE_W / 2, p.y - NODE_H / 2);
            vm.Status = `Moved. ${vm.Nodes.Count} nodes, ${vm.Edges.Count} edges.`;
            return;
        }
        if (args.Data.Has(FMT_PORT)) {
            const port = args.Data.Get(FMT_PORT);
            const over = hitTestNode(p.x, p.y);
            if (over === null || over.Id === port.nodeId) return;
            vm.AddEdge(port.nodeId, over.Id);
            vm.Status = `Connected. ${vm.Nodes.Count} nodes, ${vm.Edges.Count} edges.`;
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
