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
// Coordinate conversion delegates to Diagram.HostToContent, which sums the
// ArrangedRect chain (already carrying the ScrollViewer's -offset) and divides
// by the zoom (PART_Camera's LayoutTransform scale) — so a drop lands correctly
// after the user has scrolled AND at any zoom level.

/** @internal */
export function attachCanvasDropBehavior(receiver: Visual, diagram: Diagram): () => void
{
    (receiver as unknown as { AllowDrop: boolean }).AllowDrop = true;

    const localPosition = (args: DragEventArgs): Point => diagram.HostToContent(args.HostX, args.HostY);

    const onDragOver = (args: DragEventArgs): void => {
        // Accept any drop carrying a toolbox-item payload. Consumers wanting
        // other formats can wire their own DragOver listener.
        if (args.Data.Has(TOOLBOX_ITEM_FORMAT)) args.Effect = DragDropEffects.Copy;
    };

    const onDrop = (args: DragEventArgs): void => {
        if (!args.Data.Has(TOOLBOX_ITEM_FORMAT)) return;
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

// The single toolbox drag format: the payload carries the dropped item's
// id (`dataObject.Set(TOOLBOX_ITEM_FORMAT, item.Id)`). The behavior gates
// DragOver/Drop on the presence of this key; payloads without it are
// ignored. The drop router (attach-standard-mutations) looks the item up in
// the ToolboxRepository and calls its factory.
export const TOOLBOX_ITEM_FORMAT = '@pragmatic-lab/mural/toolbox-item';
