import {
    DragDropEffects,
    Point,
    type DataObject,
    type DragEventArgs,
    type Visual,
} from '../../../runtime/index.js';
import type { Diagram } from '../diagram.js';

// Promoted from the demo's canvas-drop-behavior.mjs. Wires a Visual
// to accept drag-drops and translate the cursor host-coordinates into
// canvas-local coordinates (origin = Diagram.ItemsPanel's top-left,
// adjusted for the enclosing ScrollViewer's offset).
//
// On Drop, fires Diagram.ItemDropped with the canvas-local Position +
// the raw DataObject. The framework doesn't interpret the data — the
// consumer's listener inspects format strings (mural/node-kind,
// mural/file, …) and materializes accordingly.
//
// Receiver vs. originVisual:
//   * receiver     — where the routed listeners attach. Must be on the
//                    bubble path of every place a user might legitimately
//                    drop. Usually the surrounding surface Border or
//                    ScrollViewer, NOT the Diagram itself — a naive
//                    Diagram receiver misses drops on the scrollbar
//                    (the scrollbar lives outside the Diagram's visual
//                    subtree so its DragOver/Drop never bubble through).
//   * diagram      — the Diagram whose ItemsPanel defines (0,0) of the
//                    canvas-local coordinate frame. Always required.
//
// Scroll compensation: the ArrangedRect chain walk doesn't include
// the ScrollViewer's content translation. A drop at host position H
// translates to canvas-local position
//   H - panelHost + scrollOffset
// where scrollOffset is the enclosing ScrollViewer's offset at drop
// time. Without this, a drop inside the visible viewport AFTER the
// user has scrolled lands at the wrong canvas coordinate.

const NODE_KIND_FORMAT = 'mural/node-kind';

/** @internal */
export function attachCanvasDropBehavior(receiver: Visual, diagram: Diagram): () => void
{
    (receiver as unknown as { AllowDrop: boolean }).AllowDrop = true;

    const panelHost = (): { x: number; y: number } => {
        const panel = diagram.ItemsPanelInstance;
        if (panel === undefined) return { x: 0, y: 0 };
        let x = 0, y = 0;
        let cur: Visual | undefined = panel;
        while (cur !== undefined)
        {
            const r = cur.ArrangedRect;
            x += r.X;
            y += r.Y;
            cur = cur.GetVisualParent();
        }
        return { x, y };
    };

    // Duck-type for ScrollViewer — it's the only Visual that publishes
    // numeric HorizontalOffset / VerticalOffset DPs.
    const findScrollViewerOffsets = (): { x: number; y: number } => {
        const panel = diagram.ItemsPanelInstance;
        if (panel === undefined) return { x: 0, y: 0 };
        let cur: Visual | undefined = panel.GetVisualParent();
        while (cur !== undefined)
        {
            const ox = (cur as unknown as { HorizontalOffset?: unknown }).HorizontalOffset;
            const oy = (cur as unknown as { VerticalOffset?:   unknown }).VerticalOffset;
            if (typeof ox === 'number' && typeof oy === 'number') return { x: ox, y: oy };
            cur = cur.GetVisualParent();
        }
        return { x: 0, y: 0 };
    };

    const localPosition = (args: DragEventArgs): Point => {
        const o   = panelHost();
        const off = findScrollViewerOffsets();
        return new Point(args.HostX - o.x + off.x, args.HostY - o.y + off.y);
    };

    const onDragOver = (args: DragEventArgs): void => {
        // Accept any drop carrying a known node-kind format. Consumers
        // wanting other formats can wire their own DragOver listener.
        if (args.Data.Has(NODE_KIND_FORMAT)) args.Effect = DragDropEffects.Copy;
    };

    const onDrop = (args: DragEventArgs): void => {
        if (!args.Data.Has(NODE_KIND_FORMAT)) return;
        diagram._fireItemDropped({
            Data:     args.Data,
            Position: localPosition(args),
        });
    };

    receiver.AddRoutedEventListener('DragOver', onDragOver as unknown as (a: unknown) => void);
    receiver.AddRoutedEventListener('Drop',     onDrop     as unknown as (a: unknown) => void);

    return (): void => {
        (receiver as unknown as { AllowDrop: boolean }).AllowDrop = false;
        receiver.RemoveRoutedEventListener('DragOver', onDragOver as unknown as (a: unknown) => void);
        receiver.RemoveRoutedEventListener('Drop',     onDrop     as unknown as (a: unknown) => void);
    };
}

export interface ItemDroppedArgs
{
    readonly Data:     DataObject;
    readonly Position: Point;
}

export type ItemDroppedListener = (args: ItemDroppedArgs) => void;

// Drag-data format key consumers should put their toolbox tile's kind
// under: `dataObject.Set('mural/node-kind', kindString)`. The behavior
// gates DragOver/Drop on the presence of this key; payloads without it
// are ignored.
export const TOOLBOX_NODE_KIND_FORMAT = NODE_KIND_FORMAT;
