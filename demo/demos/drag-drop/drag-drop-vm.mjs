// drag-drop demo VM — two lists, items move between them via drag.
//
// Follows the MVVM rules in CLAUDE.md strictly:
//   * Data + commands only; no view reaches, no Visual mutation, no
//     host globals, no Visual construction.
//   * BeginDragData on ItemVM is a function-valued DP that the
//     framework's IsDraggable latch reads via OnDragStart=$BeginDragData.
//   * Domain operations (MoveToLeft / MoveToRight) are plain methods —
//     called by the drop behavior, not via routed events directly.

import {
    DataObject, DragDropEffects,
    MetaData, Model, ObservableCollection,
} from '@visualisation-sub/mural/runtime';

// Format key the drag-data payload uses. Receivers query
// `args.Data.Has(FMT_ITEM)` and `args.Data.Get(FMT_ITEM)` to read
// the item id back out. Exported so the drop behavior reads the
// same constant.
export const FMT_ITEM = 'mural/list-item';

let _nextId = 1;

export class ItemVM extends Model
{
    static {
        Model.RegisterProperty(ItemVM, 'Id',            '',         MetaData.None);
        Model.RegisterProperty(ItemVM, 'Label',         '',         MetaData.None);
        // Bound from .mu via OnDragStart=$BeginDragData on the
        // ListBoxItem container. Returns the drag payload at trip
        // time. Stored as a DP so the binding pipeline pushes the
        // value to the framework's OnDragStart slot.
        Model.RegisterProperty(ItemVM, 'BeginDragData', undefined,  MetaData.None);
    }

    constructor(label) {
        super();
        const id = 'i' + (_nextId++);
        this._set_property_value_by_name('Id',    id);
        this._set_property_value_by_name('Label', label);
        // Arrow function — `this` stays bound when the framework
        // invokes it via the IsDraggable latch.
        this._set_property_value_by_name('BeginDragData', () => ({
            data:    new DataObject().Set(FMT_ITEM, this.Id),
            effects: DragDropEffects.Move,
        }));
    }

    get Id()            { return this._get_property_value_by_name('Id'); }
    get Label()         { return this._get_property_value_by_name('Label'); }
    get BeginDragData() { return this._get_property_value_by_name('BeginDragData'); }
}

export class DragDropVM extends Model
{
    static {
        Model.RegisterProperty(DragDropVM, 'LeftItems',  undefined,                       MetaData.None);
        Model.RegisterProperty(DragDropVM, 'RightItems', undefined,                       MetaData.None);
        Model.RegisterProperty(DragDropVM, 'Status',     'Drag items between the lists.', MetaData.None);
    }

    constructor() {
        super();
        const left  = new ObservableCollection();
        const right = new ObservableCollection();
        for (const label of ['Apple', 'Banana', 'Cherry', 'Date'])      left.Add(new ItemVM(label));
        for (const label of ['Eggplant', 'Fig', 'Grape'])               right.Add(new ItemVM(label));
        this._set_property_value_by_name('LeftItems',  left);
        this._set_property_value_by_name('RightItems', right);
    }

    get LeftItems()  { return this._get_property_value_by_name('LeftItems'); }
    get RightItems() { return this._get_property_value_by_name('RightItems'); }
    get Status()     { return this._get_property_value_by_name('Status'); }
    set Status(v)    { this._set_property_value_by_name('Status', v); }

    // Move an item to the left list. No-op when the item is already
    // there (the drop behavior screens this case in DragOver and
    // suppresses the Effect, but we re-check at Drop time for safety).
    MoveToLeft(itemId) {
        return this._move(itemId, this.RightItems, this.LeftItems, 'left');
    }

    MoveToRight(itemId) {
        return this._move(itemId, this.LeftItems, this.RightItems, 'right');
    }

    _move(itemId, from, to, sideName) {
        let item = null;
        for (let i = 0; i < from.Count; i++)
        {
            const candidate = from.Get(i);
            if (candidate.Id === itemId) { item = candidate; break; }
        }
        if (item === null) return false;          // not in source — already at destination
        from.Remove(item);
        to.Add(item);
        this.Status = `Moved "${item.Label}" to ${sideName}.`;
        return true;
    }

    // Helpers the drop behavior queries during DragOver to decide
    // whether to accept (avoids same-list "drop" that would be a
    // no-op).
    IsInLeft(itemId) {
        for (let i = 0; i < this.LeftItems.Count; i++)
        {
            if (this.LeftItems.Get(i).Id === itemId) return true;
        }
        return false;
    }

    IsInRight(itemId) {
        for (let i = 0; i < this.RightItems.Count; i++)
        {
            if (this.RightItems.Get(i).Id === itemId) return true;
        }
        return false;
    }
}
