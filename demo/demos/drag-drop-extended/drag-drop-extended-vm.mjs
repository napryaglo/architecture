// drag-drop-extended VM — single demo covering the four §8 follow-ups
// closed in this branch: OS file drops (8.1), source-side feedback /
// continue hooks (8.3), ScrollViewer auto-scroll near edges (8.4), and
// the insertion-line adorner on ListReorderBehavior (8.5).
//
// Strictly MVVM-compliant per CLAUDE.md — data + commands only. The
// view materializes ScrollViewer, ListReorderBehavior, an OS-drop
// receiver, and the small insertion-line template; the VM holds the
// items, the dropped-files list, and the status / feedback strings.

import {
    DataObject, DragDropEffects,
    MetaData, Model, ObservableCollection,
} from '@visualisation-sub/mural/runtime';

// Format key for the reorderable row drag payload. The
// ListReorderBehavior queries this on DragOver / Drop to recognise its
// own drag source. Exported so the behavior-attachment glue uses the
// same constant.
export const FMT_FROM_INDEX = 'mural/reorder/from-index';

let _nextId = 1;

export class RowVM extends Model
{
    static {
        Model.RegisterProperty(RowVM, 'Id',            '',         MetaData.None);
        Model.RegisterProperty(RowVM, 'Label',         '',         MetaData.None);
        Model.RegisterProperty(RowVM, 'BeginDragData', undefined,  MetaData.None);
    }

    constructor(label, indexInList) {
        super();
        const id = 'r' + (_nextId++);
        this._set_property_value_by_name('Id',    id);
        this._set_property_value_by_name('Label', label);
        // The closure captures the host VM so source-side hooks can
        // update its status fields.
        this._indexInList = indexInList;
    }

    get Id()            { return this._get_property_value_by_name('Id'); }
    get Label()         { return this._get_property_value_by_name('Label'); }
    get BeginDragData() { return this._get_property_value_by_name('BeginDragData'); }
}

// Per-file row in the OS-drop receiver's bound collection. Pure data —
// the view templates render Name / Size.
export class DroppedFileVM extends Model
{
    static {
        Model.RegisterProperty(DroppedFileVM, 'Name', '', MetaData.None);
        Model.RegisterProperty(DroppedFileVM, 'Size', '', MetaData.None);
    }
    constructor(name, sizeBytes) {
        super();
        this._set_property_value_by_name('Name', name);
        this._set_property_value_by_name('Size', formatSize(sizeBytes));
    }
    get Name() { return this._get_property_value_by_name('Name'); }
    get Size() { return this._get_property_value_by_name('Size'); }
}

function formatSize(bytes) {
    if (typeof bytes !== 'number' || !Number.isFinite(bytes)) return '?';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

export class DragDropExtendedVM extends Model
{
    static {
        Model.RegisterProperty(DragDropExtendedVM, 'Rows',         undefined, MetaData.None);
        Model.RegisterProperty(DragDropExtendedVM, 'DroppedFiles', undefined, MetaData.None);
        // Status strings driven by source-side hooks (8.3) and by the
        // file-drop receiver. Plain DPs so triggers / bindings can
        // observe them.
        Model.RegisterProperty(DragDropExtendedVM, 'LastEffect',   '—',       MetaData.None);
        Model.RegisterProperty(DragDropExtendedVM, 'ShiftHint',    'Hold Shift to cancel the drag.', MetaData.None);
        Model.RegisterProperty(DragDropExtendedVM, 'FileStatus',   'Drag OS files here.',            MetaData.None);
    }

    constructor() {
        super();
        const rows = new ObservableCollection();
        // 30 rows — long enough to exercise auto-scroll on a moderate
        // viewport (~280px tall).
        const labels = [
            'Apple', 'Banana', 'Cherry', 'Date', 'Eggplant', 'Fig',
            'Grape', 'Honeydew', 'Iceberg', 'Jujube', 'Kiwi', 'Lemon',
            'Mango', 'Nectarine', 'Olive', 'Papaya', 'Quince', 'Raspberry',
            'Strawberry', 'Tangerine', 'Ugli', 'Vanilla', 'Watermelon',
            'Xigua', 'Yam', 'Zucchini', 'Apricot', 'Blueberry',
            'Cantaloupe', 'Dragonfruit',
        ];
        for (let i = 0; i < labels.length; i++) rows.Add(new RowVM(labels[i], i));
        this._set_property_value_by_name('Rows', rows);
        this._set_property_value_by_name('DroppedFiles', new ObservableCollection());

        // BeginDragData is installed on each row in a second pass so
        // the closure captures `this` (the host VM) — the source-side
        // hooks update LastEffect / status on the host, not on the
        // row.
        for (let i = 0; i < rows.Count; i++) {
            const row = rows.Get(i);
            row._set_property_value_by_name('BeginDragData', () => {
                const idx = this._indexOf(row);
                return {
                    data:    new DataObject().Set(FMT_FROM_INDEX, idx),
                    effects: DragDropEffects.Move,
                    // 8.3 — feedback hook. Receiver's chosen Effect
                    // bubbles to the status bar so the demo surfaces
                    // what the OS cursor would be doing.
                    onFeedback: (effect) => {
                        this._set_property_value_by_name('LastEffect', effectName(effect));
                    },
                    // 8.3 — continue hook. Returning false cancels the
                    // drag. Polled by the framework every move sample.
                    // We use a dynamic check (window.event would be
                    // ideal but we want a host-agnostic VM) — instead,
                    // the host VM exposes a CancelDragNow flag that the
                    // bootstrap's Shift key listener flips.
                    onContinueQuery: () => !this._shiftHeld(),
                };
            });
        }
    }

    get Rows()         { return this._get_property_value_by_name('Rows'); }
    get DroppedFiles() { return this._get_property_value_by_name('DroppedFiles'); }
    get LastEffect()   { return this._get_property_value_by_name('LastEffect'); }
    get ShiftHint()    { return this._get_property_value_by_name('ShiftHint'); }
    get FileStatus()   { return this._get_property_value_by_name('FileStatus'); }
    set FileStatus(v)  { this._set_property_value_by_name('FileStatus', v); }

    // Set by the bootstrap's window-level keydown / keyup listener.
    // Read by the per-row OnContinueQuery callback (8.3).
    _shiftFlag = false;
    SetShiftHeld(v) { this._shiftFlag = !!v; }
    _shiftHeld()    { return this._shiftFlag; }

    // Called by the OS-drop behavior when a file lands on the receiver.
    // Pushes a DroppedFileVM into the bound collection and updates the
    // status line. Mirrors the way the reorder behavior calls VM
    // methods through the existing wiring.
    OnFileDropped(name, sizeBytes) {
        const file = new DroppedFileVM(name, sizeBytes);
        this.DroppedFiles.Add(file);
        this._set_property_value_by_name(
            'FileStatus',
            `Dropped "${name}" (${formatSize(sizeBytes)}). Total: ${this.DroppedFiles.Count}.`,
        );
    }

    _indexOf(row) {
        for (let i = 0; i < this.Rows.Count; i++) {
            if (this.Rows.Get(i) === row) return i;
        }
        return -1;
    }
}

function effectName(effect) {
    if (effect & DragDropEffects.Copy) return 'Copy';
    if (effect & DragDropEffects.Move) return 'Move';
    if (effect & DragDropEffects.Link) return 'Link';
    return 'None';
}
