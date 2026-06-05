import {
    MetaData,
    Model,
    type PropertyDescriptor,
} from '../runtime/index.js';
import { ItemsControl } from './items-control.js';

// ItemAt / ItemCount come from ItemsControl as public methods; Selector
// uses them through the inherited interface (the resolveItemAt / resolveIndexOf
// seams below).

// Selector — the WPF parity layer between ItemsControl and any list-
// rendering control that exposes a "currently selected item" surface
// (ListBox, ComboBox, TabControl, ListView, Diagram, …). Mirrors
// System.Windows.Controls.Primitives.Selector.
//
// Surface:
//   * SelectedIndex     — −1 when nothing is selected; index into the
//                          underlying items collection otherwise.
//   * SelectedItem      — the selected data item; undefined when nothing
//                          is selected.
//   * SelectedValue     — projection of SelectedItem through
//                          SelectedValuePath. Equals SelectedItem when
//                          the path is unset.
//   * SelectedValuePath — dotted property path on the selected item
//                          (e.g. 'Id', 'Customer.Code'); empty / unset
//                          means SelectedValue mirrors SelectedItem.
//   * SelectionChanged listener API — Add/Remove subscription model.
//
// All three "selected" DPs (Index / Item / Value) stay in sync. A
// write to any one runs the matching `applySelected*` hook, which
// cross-syncs the siblings (through `withSuppressedSelectionSync` so
// the propagation doesn't re-enter) and fires SelectionChanged.
//
// Subclasses with extra bookkeeping (ListBox: multi-select set,
// ComboBox: popup highlight refresh, Diagram: per-container
// IsSelected flag) override `applySelected*`, do their own state
// update, then `super.applySelected*()` to keep the cross-sync /
// listener-fire honest. Anything a subclass does INSIDE
// `withSuppressedSelectionSync` is treated as "internal propagation"
// — `applySelected*` won't fire for those DP writes, so the
// subclass can mirror its own state to the public DPs without
// recursion.
//
// `resolveItemAt` and `resolveIndexOf` are the only seams subclasses
// override when their selection model isn't pure-Items (ListBox
// container Tag, etc.). Default reads through the inherited
// ItemsControl Items collection.
export class Selector extends ItemsControl
{
    public static readonly SelectedIndexKey     = Model.RegisterProperty<number>(            Selector, 'SelectedIndex',     -1,        MetaData.None);
    public static readonly SelectedItemKey      = Model.RegisterProperty<unknown>(           Selector, 'SelectedItem',      undefined, MetaData.None);
    public static readonly SelectedValueKey     = Model.RegisterProperty<unknown>(           Selector, 'SelectedValue',     undefined, MetaData.None);
    public static readonly SelectedValuePathKey = Model.RegisterProperty<string | undefined>(Selector, 'SelectedValuePath', undefined, MetaData.None);

    private _suppressSync: boolean = false;
    private readonly _selectionListeners: Set<() => void> = new Set();

    public get SelectedIndex(): number      { return this.get_property_value(Selector.SelectedIndexKey); }
    public set SelectedIndex(v: number)     { this.set_property_value(Selector.SelectedIndexKey, v); }

    public get SelectedItem(): unknown      { return this.get_property_value(Selector.SelectedItemKey); }
    public set SelectedItem(v: unknown)     { this.set_property_value(Selector.SelectedItemKey, v); }

    public get SelectedValue(): unknown     { return this.get_property_value(Selector.SelectedValueKey); }
    public set SelectedValue(v: unknown)    { this.set_property_value(Selector.SelectedValueKey, v); }

    public get SelectedValuePath(): string | undefined  { return this.get_property_value(Selector.SelectedValuePathKey); }
    public set SelectedValuePath(v: string | undefined) { this.set_property_value(Selector.SelectedValuePathKey, v); }

    public AddSelectionChangedListener(listener: () => void): void
    {
        this._selectionListeners.add(listener);
    }

    public RemoveSelectionChangedListener(listener: () => void): void
    {
        this._selectionListeners.delete(listener);
    }

    protected fireSelectionChanged(): void
    {
        for (const l of this._selectionListeners) l();
    }

    // Subclass-callable: run `body` with cross-sync suppression so any
    // Selected* DP writes inside don't trigger applySelected*. Used by
    // both the base (to cross-sync siblings without re-entering) and
    // by subclasses (to mirror internal state to the public DPs without
    // tripping their own apply* logic — e.g. ListBox after a multi-
    // select state change).
    protected withSuppressedSelectionSync(body: () => void): void
    {
        const was = this._suppressSync;
        this._suppressSync = true;
        try { body(); }
        finally { this._suppressSync = was; }
    }

    // ── Apply hooks — external-write entry points ──────────────────
    //
    // Each is invoked from OnPropertyChanged for the corresponding DP,
    // AND ONLY when the write didn't come through the cross-sync path
    // (`_suppressSync === false`). The default implementation:
    //   1. Cross-syncs sibling DPs under suppression.
    //   2. Fires SelectionChanged.
    // Subclasses override to insert their bookkeeping before / after
    // super.* — order matters when the subclass's logic depends on
    // the post-sync state.

    protected applySelectedIndex(index: number): void
    {
        const item  = this.resolveItemAt(index);
        const value = this.projectValue(item);
        // Out-of-range writes normalise back to -1 — keeps SelectedIndex
        // consistent with SelectedItem (which is undefined for an
        // unresolved index) and matches WPF's behaviour. Tests rely on
        // this; without it `SelectedIndex = 99` would persist as 99.
        const normalised = item === undefined ? -1 : index;
        this.withSuppressedSelectionSync(() => {
            if (normalised !== index) this.SelectedIndex = normalised;
            this.SelectedItem  = item;
            this.SelectedValue = value;
        });
        this.fireSelectionChanged();
    }

    protected applySelectedItem(item: unknown): void
    {
        const idx   = this.resolveIndexOf(item);
        const value = this.projectValue(item);
        // Items not present in the collection normalise the displayed
        // selection back to "nothing": SelectedIndex / SelectedItem
        // clear. SelectedValue still reflects the projection of the
        // input — a consumer driving SelectedValue with a path can
        // observe "the lookup value the user asked for" even when no
        // current row matches. Matches the legacy ListBox path's behaviour.
        const normalisedItem = idx < 0 ? undefined : item;
        this.withSuppressedSelectionSync(() => {
            if (normalisedItem !== item) this.SelectedItem = normalisedItem;
            this.SelectedIndex = idx;
            this.SelectedValue = value;
        });
        this.fireSelectionChanged();
    }

    protected applySelectedValue(value: unknown): void
    {
        const path = this.SelectedValuePath;
        // No path — SelectedValue mirrors SelectedItem 1:1.
        if (path === undefined || path === '')
        {
            const idx = this.resolveIndexOf(value);
            this.withSuppressedSelectionSync(() => {
                this.SelectedItem  = value;
                this.SelectedIndex = idx;
            });
            this.fireSelectionChanged();
            return;
        }
        // With a path: reverse-look-up. `value === undefined` clears.
        if (value === undefined)
        {
            this.withSuppressedSelectionSync(() => {
                this.SelectedItem  = undefined;
                this.SelectedIndex = -1;
            });
            this.fireSelectionChanged();
            return;
        }
        const n = this.ItemCount();
        for (let i = 0; i < n; i++)
        {
            const candidate = this.resolveItemAt(i);
            if (this.projectValue(candidate) === value)
            {
                this.withSuppressedSelectionSync(() => {
                    this.SelectedItem  = candidate;
                    this.SelectedIndex = i;
                });
                this.fireSelectionChanged();
                return;
            }
        }
        // Unmatched value: leave SelectedValue as-written; clear the
        // displayed selection so Item / Index reflect "no current row
        // matches."
        this.withSuppressedSelectionSync(() => {
            this.SelectedItem  = undefined;
            this.SelectedIndex = -1;
        });
        this.fireSelectionChanged();
    }

    // ── Subclass override seams ─────────────────────────────────────

    /** Item at `index` in the selection's underlying collection. */
    protected resolveItemAt(index: number): unknown
    {
        if (index < 0 || index >= this.ItemCount()) return undefined;
        return this.ItemAt(index);
    }

    /** Index of `item` in the selection's underlying collection, or
     *  −1 when not present. Identity comparison by default. */
    protected resolveIndexOf(item: unknown): number
    {
        if (item === undefined) return -1;
        const n = this.ItemCount();
        for (let i = 0; i < n; i++)
        {
            if (this.ItemAt(i) === item) return i;
        }
        return -1;
    }

    /** Project `item` through SelectedValuePath. Returns the item
     *  unchanged when no path is set; returns undefined when any path
     *  segment hits an undefined / null cursor. */
    protected projectValue(item: unknown): unknown
    {
        const path = this.SelectedValuePath;
        if (path === undefined || path === '' || item === undefined || item === null) return item;
        let cursor: unknown = item;
        for (const segment of path.split('.'))
        {
            if (cursor === undefined || cursor === null) return undefined;
            cursor = (cursor as Record<string, unknown>)[segment];
        }
        return cursor;
    }

    protected override OnPropertyChanged(
        descriptor: PropertyDescriptor,
        oldValue: unknown,
        newValue: unknown,
    ): void
    {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        if (this._suppressSync) return;
        switch (descriptor.Name)
        {
            case 'SelectedIndex': this.applySelectedIndex(newValue as number);  break;
            case 'SelectedItem':  this.applySelectedItem(newValue);             break;
            case 'SelectedValue': this.applySelectedValue(newValue);            break;
        }
    }

}

export type SelectionChangedListener = () => void;
