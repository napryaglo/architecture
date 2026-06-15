// canvas-drop-behavior — accepts toolbox tile drops and turns them
// into new nodes on the diagram surface. Owns the canvas-local
// coordinate transform (a view-tree walk that's forbidden in the VM
// per Rule 1) and dispatches to vm.CreateNode.
//
// Receiver vs. origin: routed events bubble up from the cursor target,
// so the drop receiver MUST be on the bubble path of every place a
// user might legitimately drop. A naive choice — the Diagram itself —
// misses drops on the surrounding ScrollViewer's vertical scrollbar
// (the scrollbar sits OUTSIDE the Diagram's visual subtree, so its
// DragOver / Drop never bubble through the Diagram). The fix splits
// the two roles:
//
//   * receiver       — where the listeners attach. Pass the outermost
//                       Visual that should still treat the cursor as
//                       "on the diagram canvas" (typically the surface
//                       Border or the ScrollViewer itself).
//   * originVisual   — the Visual whose host origin defines the (0,0)
//                       of the canvas-local coordinate frame. Pass the
//                       Diagram (its ItemsPanel sits at its origin so
//                       diagram-local ≡ canvas-local).
//
// When originVisual is omitted, falls back to receiver — preserving
// the previous single-argument contract.
//
// Scroll-offset compensation: the ArrangedRect chain walk doesn't
// include the ScrollViewer's content translation, so a drop at host
// position H translates to canvas-local position
//   H - originHost + scrollOffset
// where scrollOffset is the enclosing ScrollViewer's offset at drop
// time. Without this term, a drop inside the visible viewport after
// the user has scrolled lands at the wrong canvas coordinate.
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

export function attachCanvasDropBehavior(receiver, vm, selector, originVisual)
{
    receiver.AllowDrop = true;
    const origin = originVisual ?? receiver;

    // Walk the origin Visual up to root, summing ArrangedRects to get
    // its position in host coords. Computed lazily AND fresh per
    // DragOver / Drop — layout can shift between drags (e.g., a sibling
    // Border in the chrome resized), and caching across the gesture
    // would land subsequent drops at the wrong coordinate.
    const originHost = () => {
        let x = 0, y = 0, cur = origin;
        while (cur !== undefined) {
            const r = cur.ArrangedRect;
            x += r.X;
            y += r.Y;
            cur = cur.GetVisualParent();
        }
        return { x, y };
    };

    // Walk from `origin` up to find the enclosing ScrollViewer (if
    // any). The ScrollViewer's HorizontalOffset / VerticalOffset gives
    // the canvas-content translation we need to add back to get
    // canvas-local coordinates from a viewport-relative host position.
    const findScrollViewer = () => {
        let cur = origin.GetVisualParent ? origin.GetVisualParent() : undefined;
        while (cur !== undefined) {
            // Duck-type instead of import — keeps the behavior import-
            // light. ScrollViewer is the only Visual that publishes
            // HorizontalOffset + VerticalOffset DPs of type number.
            const ox = cur.HorizontalOffset;
            const oy = cur.VerticalOffset;
            if (typeof ox === 'number' && typeof oy === 'number') return cur;
            cur = cur.GetVisualParent ? cur.GetVisualParent() : undefined;
        }
        return undefined;
    };

    const local = (args) => {
        const o = originHost();
        const sv = findScrollViewer();
        const sx = sv?.HorizontalOffset ?? 0;
        const sy = sv?.VerticalOffset   ?? 0;
        return { x: args.HostX - o.x + sx, y: args.HostY - o.y + sy };
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
