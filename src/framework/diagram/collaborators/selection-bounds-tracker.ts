import { Model } from '../../../runtime/index.js';
import { findDescriptor, resolveKey } from '../../../runtime/model-internals.js';
import type { Diagram } from '../diagram.js';

// Internal collaborator owned by Diagram. Derives SelectionLeft / Top /
// Width / Height / Count (5 read-only DPs on Diagram) from the union
// bbox of every IFigure-shaped CONTAINER currently in
// `Diagram.SelectedContainers`.
//
// Geometry lives on the container Figure, not the data item: under
// container-owned-geometry a selected content node surfaces as a
// geometry-less VM in `SelectedItems`, so reading bounds off the items
// would collapse the bbox to zero and hide the adorner. `SelectedContainers`
// is the Selector's own selection truth (the Figure containers) and always
// carries geometry — for a geometric-shape item the container IS the item,
// so this is uniform across shape nodes and content nodes.
//
// Re-derives whenever:
//   * Selector.SelectionChanged fires (selection set membership changes)
//   * any selected item's Left / Top / Width / Height DP fires
//     PropertyChanged
//
// Per-item geometry listeners attach on selection-enter and detach on
// selection-exit. Listener keys resolved via the `resolveKey + typed-key
// API` pattern (model-internals.ts) — no by-name accessor surface.
//
// IFigure-shape duck-type check: item must be a `Model` instance with
// Left / Top / Width / Height DPs registered somewhere in its class
// hierarchy. `findDescriptor` returns `undefined` on missing, so the
// check is non-throwing. Non-IFigure items (raw strings, opaque tokens)
// are silently excluded from both the bbox math and the count —
// consistent semantics across both surfaces.
export class SelectionBoundsTracker
{
    private readonly _diagram: Diagram;
    private readonly _itemListeners: Map<Model, () => void> = new Map();

    constructor(diagram: Diagram)
    {
        this._diagram = diagram;
        diagram.AddSelectionChangedListener(() => this._onSelectionChanged());
        // Seed initial state — at construction SelectedItems is empty, so
        // this is a (0, 0, 0, 0, 0) write. Still useful: a consumer reading
        // SelectionCount immediately after `new Diagram()` gets 0, not the
        // DP's registered default (which happens to also be 0; the seed
        // makes the contract explicit).
        this._recompute();
    }

    private _onSelectionChanged(): void
    {
        // Detach every existing per-item listener — easier than diffing
        // old set vs new set, and selection-change events are infrequent
        // enough that the extra detach/reattach is invisible.
        for (const detach of this._itemListeners.values()) detach();
        this._itemListeners.clear();

        // Reattach against the current selection's IFigure-shaped containers
        // (the geometry owners), not the data items (content VMs carry no
        // geometry).
        for (const container of this._diagram.SelectedContainers)
        {
            if (this._isFigureShape(container))
            {
                this._itemListeners.set(container, this._listenItem(container));
            }
        }

        this._recompute();
    }

    private _listenItem(item: Model): () => void
    {
        // resolveKey throws if any of Left / Top / Width / Height is
        // missing, but `_isFigureShape` already guarded — by the time
        // we get here the lookups all succeed.
        const leftKey = resolveKey(item, undefined, 'Left');
        const topKey  = resolveKey(item, undefined, 'Top');
        const wKey    = resolveKey(item, undefined, 'Width');
        const hKey    = resolveKey(item, undefined, 'Height');
        const handler = (): void => this._recompute();
        item.AddPropertyChangedListener(leftKey, handler);
        item.AddPropertyChangedListener(topKey,  handler);
        item.AddPropertyChangedListener(wKey,    handler);
        item.AddPropertyChangedListener(hKey,    handler);
        return (): void => {
            item.RemovePropertyChangedListener(leftKey, handler);
            item.RemovePropertyChangedListener(topKey,  handler);
            item.RemovePropertyChangedListener(wKey,    handler);
            item.RemovePropertyChangedListener(hKey,    handler);
        };
    }

    private _recompute(): void
    {
        // Lazy-import the Diagram class for the static Key references.
        // The selection-bounds DP keys live on Diagram itself — see
        // diagram.ts `SelectionLeftKey` etc.
        const Diagram = this._diagram.constructor as typeof import('../diagram.js').Diagram;

        // Collect every IFigure-shaped selected item. Use the listener
        // set as the authoritative set (it was filtered through
        // _isFigureShape on the way in) rather than re-walking
        // SelectedItems and re-filtering.
        const items = [...this._itemListeners.keys()];

        if (items.length === 0)
        {
            this._diagram.set_property_value_with_key(Diagram.SelectionLeftKey,   0);
            this._diagram.set_property_value_with_key(Diagram.SelectionTopKey,    0);
            this._diagram.set_property_value_with_key(Diagram.SelectionWidthKey,  0);
            this._diagram.set_property_value_with_key(Diagram.SelectionHeightKey, 0);
            this._diagram.set_property_value_with_key(Diagram.SelectionCountKey,  0);
            return;
        }

        let minLeft = Number.POSITIVE_INFINITY;
        let minTop  = Number.POSITIVE_INFINITY;
        let maxRight  = Number.NEGATIVE_INFINITY;
        let maxBottom = Number.NEGATIVE_INFINITY;
        for (const item of items)
        {
            const it = item as unknown as { Left: number; Top: number; Width: number; Height: number };
            if (it.Left < minLeft) minLeft = it.Left;
            if (it.Top  < minTop)  minTop  = it.Top;
            if (it.Left + it.Width  > maxRight)  maxRight  = it.Left + it.Width;
            if (it.Top  + it.Height > maxBottom) maxBottom = it.Top  + it.Height;
        }
        this._diagram.set_property_value_with_key(Diagram.SelectionLeftKey,   minLeft);
        this._diagram.set_property_value_with_key(Diagram.SelectionTopKey,    minTop);
        this._diagram.set_property_value_with_key(Diagram.SelectionWidthKey,  maxRight  - minLeft);
        this._diagram.set_property_value_with_key(Diagram.SelectionHeightKey, maxBottom - minTop);
        this._diagram.set_property_value_with_key(Diagram.SelectionCountKey,  items.length);
    }

    private _isFigureShape(item: unknown): item is Model
    {
        if (!(item instanceof Model)) return false;
        const klass = item.constructor as Function;
        return findDescriptor(klass, 'Left')   !== undefined
            && findDescriptor(klass, 'Top')    !== undefined
            && findDescriptor(klass, 'Width')  !== undefined
            && findDescriptor(klass, 'Height') !== undefined;
    }
}
