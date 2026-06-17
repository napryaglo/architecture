// SelectionResizeAdorner — demo-local thin shim that adapts DiagramVM
// to the framework's `SelectionSource` contract and delegates to
// `SelectionBoundsAdorner` (src/basic/selection-bounds-adorner.ts).
//
// §19.4 follow-up: the bbox + 8-handle chrome lives in the framework
// now. This module survives only as the DiagramVM ↔ SelectionSource
// adapter — the per-VM property keys (SelectionXKey, etc.) are
// demo-specific, so they translate to the framework's `Bounds` /
// `subscribe` / `applyResize` surface here.

import { SelectionBoundsAdorner } from '@visualisation-sub/mural/basic';
import { Rect } from '@visualisation-sub/mural/runtime';
import { DiagramVM } from './diagram-vm.mjs';

// Adapter: turns DiagramVM's selection-* DPs into the SelectionSource
// shape the framework adorner expects. Lifetime tracked by the
// returned `dispose` thunk.
function makeSource(vm)
{
    const SUB_KEYS = [
        DiagramVM.SelectionXKey,
        DiagramVM.SelectionYKey,
        DiagramVM.SelectionWidthKey,
        DiagramVM.SelectionHeightKey,
        DiagramVM.SelectionCountKey,
    ];
    return {
        get Count()  { return vm.SelectionCount; },
        get Bounds() {
            return new Rect(vm.SelectionX, vm.SelectionY, vm.SelectionWidth, vm.SelectionHeight);
        },
        subscribe(listener)
        {
            for (const k of SUB_KEYS) vm.AddPropertyChangedListener(k, listener);
            return () => {
                for (const k of SUB_KEYS) vm.RemovePropertyChangedListener(k, listener);
            };
        },
        beginResize()                              { vm.BeginSelectionResize(); },
        applyResize(dw, dh, xAnchor, yAnchor)      { vm.ApplySelectionResize(dw, dh, xAnchor, yAnchor); },
        endResize()                                { vm.EndSelectionResize(); },
    };
}

// Re-export shape: tests + bootstrap construct `new
// SelectionResizeAdorner(itemsPanel, vm)` and call `.Dispose()`
// afterwards. The shim preserves both signatures so callers don't
// change.
export class SelectionResizeAdorner extends SelectionBoundsAdorner
{
    constructor(itemsPanel, vm)
    {
        super(itemsPanel, makeSource(vm));
    }
}
