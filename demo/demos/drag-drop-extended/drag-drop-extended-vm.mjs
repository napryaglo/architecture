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
    static IdKey            = Model.RegisterProperty(RowVM, 'Id',            '',         MetaData.None);
    static LabelKey         = Model.RegisterProperty(RowVM, 'Label',         '',         MetaData.None);
    static BeginDragDataKey = Model.RegisterProperty(RowVM, 'BeginDragData', undefined,  MetaData.None);

    constructor(label, indexInList) {
        super();
        const id = 'r' + (_nextId++);
        this.set_property_value(RowVM.IdKey,    id);
        this.set_property_value(RowVM.LabelKey, label);
        // The closure captures the host VM so source-side hooks can
        // update its status fields.
        this._indexInList = indexInList;
    }

    get Id()             { return this.get_property_value(RowVM.IdKey); }
    get Label()          { return this.get_property_value(RowVM.LabelKey); }
    get BeginDragData()  { return this.get_property_value(RowVM.BeginDragDataKey); }
    set BeginDragData(v) { this.set_property_value(RowVM.BeginDragDataKey, v); }
}

// Per-file row in the OS-drop receiver's bound collection. Pure data —
// the view templates render Name / Size.
export class DroppedFileVM extends Model
{
    static NameKey = Model.RegisterProperty(DroppedFileVM, 'Name', '', MetaData.None);
    static SizeKey = Model.RegisterProperty(DroppedFileVM, 'Size', '', MetaData.None);

    constructor(name, sizeBytes) {
        super();
        this.set_property_value(DroppedFileVM.NameKey, name);
        this.set_property_value(DroppedFileVM.SizeKey, formatSize(sizeBytes));
    }
    get Name() { return this.get_property_value(DroppedFileVM.NameKey); }
    get Size() { return this.get_property_value(DroppedFileVM.SizeKey); }
}

function formatSize(bytes) {
    if (typeof bytes !== 'number' || !Number.isFinite(bytes)) return '?';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

export class DragDropExtendedVM extends Model
{
    static RowsKey         = Model.RegisterProperty(DragDropExtendedVM, 'Rows',         undefined, MetaData.None);
    static DroppedFilesKey = Model.RegisterProperty(DragDropExtendedVM, 'DroppedFiles', undefined, MetaData.None);
    // Status strings driven by source-side hooks (8.3) and by the
    // file-drop receiver. Plain DPs so triggers / bindings can
    // observe them.
    static LastEffectKey   = Model.RegisterProperty(DragDropExtendedVM, 'LastEffect',   '—',       MetaData.None);
    static ShiftHintKey    = Model.RegisterProperty(DragDropExtendedVM, 'ShiftHint',    'Hold Shift to cancel the drag.', MetaData.None);
    static FileStatusKey   = Model.RegisterProperty(DragDropExtendedVM, 'FileStatus',   'Drag OS files here.',            MetaData.None);

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
        this.set_property_value(DragDropExtendedVM.RowsKey, rows);
        this.set_property_value(DragDropExtendedVM.DroppedFilesKey, new ObservableCollection());

        // BeginDragData is installed on each row in a second pass so
        // the closure captures `this` (the host VM) — the source-side
        // hooks update LastEffect / status on the host, not on the
        // row.
        for (let i = 0; i < rows.Count; i++) {
            const row = rows.Get(i);
            row.set_property_value(RowVM.BeginDragDataKey, () => {
                const idx = this._indexOf(row);
                return {
                    data:    new DataObject().Set(FMT_FROM_INDEX, idx),
                    effects: DragDropEffects.Move,
                    // 8.3 — feedback hook. Receiver's chosen Effect
                    // bubbles to the status bar so the demo surfaces
                    // what the OS cursor would be doing.
                    onFeedback: (effect) => {
                        this.set_property_value(DragDropExtendedVM.LastEffectKey, effectName(effect));
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

    get Rows()         { return this.get_property_value(DragDropExtendedVM.RowsKey); }
    get DroppedFiles() { return this.get_property_value(DragDropExtendedVM.DroppedFilesKey); }
    get LastEffect()   { return this.get_property_value(DragDropExtendedVM.LastEffectKey); }
    set LastEffect(v)  { this.set_property_value(DragDropExtendedVM.LastEffectKey, v); }
    get ShiftHint()    { return this.get_property_value(DragDropExtendedVM.ShiftHintKey); }
    set ShiftHint(v)   { this.set_property_value(DragDropExtendedVM.ShiftHintKey, v); }
    get FileStatus()   { return this.get_property_value(DragDropExtendedVM.FileStatusKey); }
    set FileStatus(v)  { this.set_property_value(DragDropExtendedVM.FileStatusKey, v); }

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
        this.set_property_value(
            DragDropExtendedVM.FileStatusKey,
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
