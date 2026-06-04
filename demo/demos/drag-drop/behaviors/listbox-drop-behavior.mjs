// listbox-drop-behavior — turns a ListBox into a drop target for
// items dragged FROM the other ListBox. Sets AllowDrop=true,
// subscribes to DragOver/Drop, and dispatches to the VM's MoveTo*
// methods.
//
// `side` is 'left' or 'right' — matches which collection on the VM
// receives the dropped item.

import { DragDropEffects } from '@visualisation-sub/mural/runtime';
import { FMT_ITEM } from '../drag-drop-vm.mjs';

export function attachListBoxDrop(listBox, vm, side)
{
    listBox.AllowDrop = true;

    const isAlreadyHere = (itemId) =>
        side === 'left' ? vm.IsInLeft(itemId) : vm.IsInRight(itemId);

    const onDragOver = (args) => {
        if (!args.Data.Has(FMT_ITEM)) return;
        const itemId = args.Data.Get(FMT_ITEM);
        // Don't accept drop on the source list — the gesture is a
        // no-op, and surfacing it as 'not-allowed' gives clearer
        // feedback than silently accepting Move with no effect.
        if (isAlreadyHere(itemId)) return;
        args.Effect = DragDropEffects.Move;
    };

    const onDrop = (args) => {
        if (!args.Data.Has(FMT_ITEM)) return;
        const itemId = args.Data.Get(FMT_ITEM);
        if (side === 'left') vm.MoveToLeft(itemId);
        else                 vm.MoveToRight(itemId);
    };

    listBox.AddRoutedEventListener('DragOver', onDragOver);
    listBox.AddRoutedEventListener('Drop',     onDrop);

    return function detach() {
        listBox.AllowDrop = false;
        listBox.RemoveRoutedEventListener('DragOver', onDragOver);
        listBox.RemoveRoutedEventListener('Drop',     onDrop);
    };
}
