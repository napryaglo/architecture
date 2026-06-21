import {
    Model,
    Rect,
    type PropertyKey,
} from '../../../runtime/index.js';
import { findDescriptor, resolveKey } from '../../../runtime/model-internals.js';
import type { SelectionSource } from '../../../basic/index.js';
import type { Diagram } from '../diagram.js';

// Adapter from Diagram's selection-bounds DPs (Phase C) + selected
// IFigure items into the SelectionSource contract that
// SelectionBoundsAdorner expects.
//
// Bounds + Count → routed straight from Diagram.SelectionX/Y/Width/
// Height/Count (read-only DPs driven by SelectionBoundsTracker).
//
// beginResize / applyResize / endResize → snapshot each selected
// IFigure-shaped item's rect on begin, scale + reposition on apply
// based on the anchor, clear the snapshot on end. Per-item writes go
// through `set_property_value_with_key` after resolveKey, same pattern
// as Group's Translate.
//
// IGroup handling: the v1 path treats every selected item uniformly
// — if a group's X / Y / Width / Height are READ-ONLY (the standard
// shape per spec § 3.3), the writes throw and the source skips that
// entity with a warning. A later phase can add per-group leaf-scaling
// math (the demo's DiagramVM.ApplySelectionResize does this) but it
// requires a `Members`-walk contract beyond plain IFigure.

const MIN_DIMENSION = 8;

interface FigureSnapshot {
    item:   Model;
    xKey:   PropertyKey<unknown>;
    yKey:   PropertyKey<unknown>;
    wKey:   PropertyKey<unknown>;
    hKey:   PropertyKey<unknown>;
    x: number; y: number; w: number; h: number;
    // True iff every geometry DP is read-only — skip this entry in
    // applyResize (we can't write through). Groups land here.
    isReadOnly: boolean;
}

export class DiagramSelectionSource implements SelectionSource
{
    private readonly _diagram: Diagram;
    private _snapshot: FigureSnapshot[] | undefined = undefined;

    constructor(diagram: Diagram)
    {
        this._diagram = diagram;
    }

    public get Count(): number
    {
        return this._diagram.SelectionCount;
    }

    public get Bounds(): Rect
    {
        return new Rect(
            this._diagram.SelectionX,
            this._diagram.SelectionY,
            this._diagram.SelectionWidth,
            this._diagram.SelectionHeight,
        );
    }

    // Subscribe to every bound-related DP — any of them changing means
    // the adorner needs to re-arrange its bbox + handles.
    public subscribe(listener: () => void): () => void
    {
        const Diagram = this._diagram.constructor as typeof import('../diagram.js').Diagram;
        const keys = [
            Diagram.SelectionXKey,
            Diagram.SelectionYKey,
            Diagram.SelectionWidthKey,
            Diagram.SelectionHeightKey,
            Diagram.SelectionCountKey,
        ];
        for (const k of keys) this._diagram.AddPropertyChangedListener(k, listener);
        return (): void => {
            for (const k of keys) this._diagram.RemovePropertyChangedListener(k, listener);
        };
    }

    public beginResize(): void
    {
        const snaps: FigureSnapshot[] = [];
        for (const item of this._diagram.SelectedItems)
        {
            if (!(item instanceof Model)) continue;
            const klass = item.constructor as Function;
            const xDesc = findDescriptor(klass, 'X');
            const yDesc = findDescriptor(klass, 'Y');
            const wDesc = findDescriptor(klass, 'Width');
            const hDesc = findDescriptor(klass, 'Height');
            if (xDesc === undefined || yDesc === undefined || wDesc === undefined || hDesc === undefined) continue;
            const isReadOnly = wDesc.IsReadOnly === true || hDesc.IsReadOnly === true;
            snaps.push({
                item,
                xKey: resolveKey(item, undefined, 'X'),
                yKey: resolveKey(item, undefined, 'Y'),
                wKey: resolveKey(item, undefined, 'Width'),
                hKey: resolveKey(item, undefined, 'Height'),
                x: (item as unknown as { X: number }).X,
                y: (item as unknown as { Y: number }).Y,
                w: (item as unknown as { Width: number }).Width,
                h: (item as unknown as { Height: number }).Height,
                isReadOnly,
            });
        }
        this._snapshot = snaps;
    }

    public applyResize(
        dw: number, dh: number,
        xAnchor: 'left' | 'right' | 'none',
        yAnchor: 'top'  | 'bottom' | 'none',
    ): void
    {
        if (this._snapshot === undefined) return;
        for (const s of this._snapshot)
        {
            // Skip read-only entries (Groups). v1 limitation — see file
            // header. Consumer can subscribe to Diagram.SelectedItems
            // and apply custom resize semantics if needed.
            if (s.isReadOnly) continue;

            const newW = Math.max(MIN_DIMENSION, s.w + dw);
            const newH = Math.max(MIN_DIMENSION, s.h + dh);
            const newX = (xAnchor === 'right')  ? s.x + s.w - newW : s.x;
            const newY = (yAnchor === 'bottom') ? s.y + s.h - newH : s.y;

            s.item.set_property_value_with_key(s.xKey, newX);
            s.item.set_property_value_with_key(s.yKey, newY);
            s.item.set_property_value_with_key(s.wKey, newW);
            s.item.set_property_value_with_key(s.hKey, newH);
        }
    }

    public endResize(): void
    {
        this._snapshot = undefined;
    }
}
