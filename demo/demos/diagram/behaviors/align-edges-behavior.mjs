// align-edges-behavior — overlay alignment guides while a DiagramNode
// is being dragged. Reads the source node's current ArrangedRect on
// every PointerMove during drag, computes guides against every other
// node, and writes the guide list onto the VM. The
// AlignmentGuidesAdorner re-renders dashed lines through those
// positions.
//
// §19.3 follow-up — the behavior now also installs a PositionSnap
// callback on the Diagram. DiagramNode.moveSelfToCursor consults the
// callback before writing X / Y, so cursor-derived positions snap to
// the closest matching peer edge per axis on every move (within the
// configured tolerance). On detach the callback is uninstalled.
//
// Compliance:
//   * No domain logic in the behavior — guides come from the math
//     kernel; behavior only orchestrates rect collection + write-back.
//   * No view-tree reads from the VM side — behavior owns the
//     ArrangedRect lookups.
//   * Detachable — every routed listener is named and removed.

import { findAlignmentGuides, Rect } from '@visualisation-sub/mural/runtime';
import { DiagramNode } from '@visualisation-sub/mural/framework';

// Walk up from the pointer event source to the enclosing DiagramNode,
// if any. The drag handler in DiagramNode.OnPointerDown captures the
// pointer to itself, so PointerMove events during drag bubble through
// the captured node first.
function findNodeAncestor(visual)
{
    let cur = visual;
    while (cur !== undefined && cur !== null)
    {
        if (cur instanceof DiagramNode) return cur;
        cur = cur.Parent;
    }
    return undefined;
}

function rectFromNode(node)
{
    return new Rect(node.X, node.Y, node.ArrangedRect.Width, node.ArrangedRect.Height);
}

// Walk the current Nodes collection (minus `excluded`), collect each
// materialised peer's rect. Shared by the PointerMove guide-emit and
// the PositionSnap callback below.
function collectOtherRects(diagram, vm, excludedNode)
{
    const others = [];
    const nodesCol = vm.Nodes;
    for (let i = 0; i < nodesCol.Count; i++)
    {
        const peer = nodesCol.Get(i);
        if (excludedNode !== undefined && peer === excludedNode.DataContext) continue;
        const container = diagram.Generator.ContainerFromItem(peer);
        if (!(container instanceof DiagramNode)) continue;
        const rect = container.ArrangedRect;
        if (rect === undefined || rect.Width <= 0) continue;
        others.push(new Rect(container.X, container.Y, rect.Width, rect.Height));
    }
    return others;
}

export function attachAlignEdges(diagram, vm)
{
    let activeNode = undefined;

    // §19.3 follow-up — install the PositionSnap callback so the
    // framework's drag positioning snaps mid-gesture. The callback
    // reads `activeNode` (set by PointerDown below) so it knows
    // which peer to exclude when collecting alignment targets.
    const previousSnap = diagram.PositionSnap;
    diagram.PositionSnap = (rect) => {
        if (activeNode === undefined) return rect;
        const others = collectOtherRects(diagram, vm, activeNode);
        return findAlignmentGuides(rect, others).snapped;
    };

    const onPointerDown = (args) => {
        const node = findNodeAncestor(args.Source);
        if (node === undefined) return;
        activeNode = node;
        // Guides start empty — the user hasn't moved yet.
        vm.AlignmentGuides = [];
    };

    const onPointerMove = (_args) => {
        if (activeNode === undefined) return;
        const moving = rectFromNode(activeNode);
        const others = collectOtherRects(diagram, vm, activeNode);
        vm.AlignmentGuides = findAlignmentGuides(moving, others).guides;
    };

    const onPointerUp = (_args) => {
        if (activeNode === undefined) return;
        activeNode = undefined;
        vm.AlignmentGuides = [];
    };

    diagram.AddRoutedEventListener('PointerDown', onPointerDown);
    diagram.AddRoutedEventListener('PointerMove', onPointerMove);
    diagram.AddRoutedEventListener('PointerUp',   onPointerUp);

    return function detach()
    {
        diagram.RemoveRoutedEventListener('PointerDown', onPointerDown);
        diagram.RemoveRoutedEventListener('PointerMove', onPointerMove);
        diagram.RemoveRoutedEventListener('PointerUp',   onPointerUp);
        // Restore whatever PositionSnap was there before we attached
        // (typically undefined, but a chained behavior could have set it).
        diagram.PositionSnap = previousSnap;
        if (vm.AlignmentGuides.length > 0) vm.AlignmentGuides = [];
    };
}
