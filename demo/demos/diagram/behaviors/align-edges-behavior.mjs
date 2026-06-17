// align-edges-behavior — overlay alignment guides while a DiagramNode
// is being dragged. Reads the source node's current ArrangedRect on
// every PointerMove during drag, computes guides against every other
// node, and writes the guide list onto the VM. The
// AlignmentGuidesAdorner re-renders dashed lines through those
// positions.
//
// V1 limitation — the behavior provides VISUAL feedback only; the
// framework DiagramNode owns drag positioning via the Selector
// pipeline, and there's no v1 hook for "snap the cursor-derived
// position to a target before writing X / Y". A snap follow-up would
// add a `Diagram.PositionSnap?: (rect: Rect) => Rect` callback hook
// — see § 19.3 backlog notes.
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

export function attachAlignEdges(diagram, vm)
{
    let activeNode = undefined;

    const onPointerDown = (args) => {
        const node = findNodeAncestor(args.Source);
        if (node === undefined) return;
        activeNode = node;
        // Guides start empty — the user hasn't moved yet.
        vm.AlignmentGuides = [];
    };

    const onPointerMove = (args) => {
        if (activeNode === undefined) return;
        const moving = rectFromNode(activeNode);
        const others = [];
        const nodesCol = vm.Nodes;
        for (let i = 0; i < nodesCol.Count; i++)
        {
            const peer = nodesCol.Get(i);
            // Skip the dragged item AND its top-level group (partners
            // moving in lockstep would emit nuisance guides at delta 0).
            if (peer === activeNode.DataContext) continue;
            // Look up the container — if the peer isn't materialised
            // (virtualised off-screen), skip it. ArrangedRect on a
            // non-materialised container is undefined.
            const container = diagram.Generator.ContainerFromItem(peer);
            if (!(container instanceof DiagramNode)) continue;
            const rect = container.ArrangedRect;
            if (rect === undefined || rect.Width <= 0) continue;
            others.push(new Rect(container.X, container.Y, rect.Width, rect.Height));
        }
        const result = findAlignmentGuides(moving, others);
        vm.AlignmentGuides = result.guides;
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
        if (vm.AlignmentGuides.length > 0) vm.AlignmentGuides = [];
    };
}
