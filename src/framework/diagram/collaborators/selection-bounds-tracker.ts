import { Model } from '../../../runtime/index.js';
import { findDescriptor, resolveKey } from '../../../runtime/model-internals.js';
import type { Diagram } from '../diagram.js';

// Internal collaborator owned by Diagram. Derives SelectionX / Y / Width /
// Height / Count (5 read-only DPs on Diagram) from the union bbox of every
// IFigure-shaped item currently in `Diagram.SelectedItems`.
//
// Re-derives whenever:
//   * Selector.SelectionChanged fires (selection set membership changes)
//   * any selected item's X / Y / Width / Height DP fires PropertyChanged
//
// Per-item geometry listeners attach on selection-enter and detach on
// selection-exit. Listener keys resolved via the `resolveKey + typed-key
// API` pattern (model-internals.ts) — no by-name accessor surface.
//
// IFigure-shape duck-type check: item must be a `Model` instance with X /
// Y / Width / Height DPs registered somewhere in its class hierarchy.
// `findDescriptor` returns `undefined` on missing, so the check is
// non-throwing. Non-IFigure items (raw strings, opaque tokens) are
// silently excluded from both the bbox math and the count — consistent
// semantics across both surfaces.
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

        // Reattach against the current selection's IFigure-shaped members.
        for (const item of this._diagram.SelectedItems)
        {
            if (this._isFigureShape(item))
            {
                this._itemListeners.set(item, this._listenItem(item));
            }
        }

        this._recompute();
    }

    private _listenItem(item: Model): () => void
    {
        // resolveKey throws if any of X / Y / Width / Height is missing,
        // but `_isFigureShape` already guarded — by the time we get here
        // the lookups all succeed.
        const xKey = resolveKey(item, undefined, 'X');
        const yKey = resolveKey(item, undefined, 'Y');
        const wKey = resolveKey(item, undefined, 'Width');
        const hKey = resolveKey(item, undefined, 'Height');
        const handler = (): void => this._recompute();
        item.AddPropertyChangedListener(xKey, handler);
        item.AddPropertyChangedListener(yKey, handler);
        item.AddPropertyChangedListener(wKey, handler);
        item.AddPropertyChangedListener(hKey, handler);
        return (): void => {
            item.RemovePropertyChangedListener(xKey, handler);
            item.RemovePropertyChangedListener(yKey, handler);
            item.RemovePropertyChangedListener(wKey, handler);
            item.RemovePropertyChangedListener(hKey, handler);
        };
    }

    private _recompute(): void
    {
        // Lazy-import the Diagram class for the static Key references.
        // The selection-bounds DP keys live on Diagram itself — see
        // diagram.ts `SelectionXKey` etc.
        const Diagram = this._diagram.constructor as typeof import('../diagram.js').Diagram;

        // Collect every IFigure-shaped selected item. Use the listener
        // set as the authoritative set (it was filtered through
        // _isFigureShape on the way in) rather than re-walking
        // SelectedItems and re-filtering.
        const items = [...this._itemListeners.keys()];

        if (items.length === 0)
        {
            this._diagram.set_property_value_with_key(Diagram.SelectionXKey,      0);
            this._diagram.set_property_value_with_key(Diagram.SelectionYKey,      0);
            this._diagram.set_property_value_with_key(Diagram.SelectionWidthKey,  0);
            this._diagram.set_property_value_with_key(Diagram.SelectionHeightKey, 0);
            this._diagram.set_property_value_with_key(Diagram.SelectionCountKey,  0);
            return;
        }

        let minX = Number.POSITIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;
        for (const item of items)
        {
            const it = item as unknown as { X: number; Y: number; Width: number; Height: number };
            if (it.X < minX) minX = it.X;
            if (it.Y < minY) minY = it.Y;
            if (it.X + it.Width  > maxX) maxX = it.X + it.Width;
            if (it.Y + it.Height > maxY) maxY = it.Y + it.Height;
        }
        this._diagram.set_property_value_with_key(Diagram.SelectionXKey,      minX);
        this._diagram.set_property_value_with_key(Diagram.SelectionYKey,      minY);
        this._diagram.set_property_value_with_key(Diagram.SelectionWidthKey,  maxX - minX);
        this._diagram.set_property_value_with_key(Diagram.SelectionHeightKey, maxY - minY);
        this._diagram.set_property_value_with_key(Diagram.SelectionCountKey,  items.length);
    }

    private _isFigureShape(item: unknown): item is Model
    {
        if (!(item instanceof Model)) return false;
        const klass = item.constructor as Function;
        return findDescriptor(klass, 'X')      !== undefined
            && findDescriptor(klass, 'Y')      !== undefined
            && findDescriptor(klass, 'Width')  !== undefined
            && findDescriptor(klass, 'Height') !== undefined;
    }
}
