// word-toolbox VM — toolbox of 100 words on the left, a virtualized
// WrapPanel-backed listbox on the right pre-populated with ~2k
// entries. Drag-from-toolbox copies a word into the listbox; drag-
// within-listbox reorders.
//
// MVVM: pure data + commands. The view materializes the wrap-
// virtualizing panel + the reorder behavior + per-tile drag source;
// the VM holds:
//   * ToolboxWords  — fixed catalog (read-only collection of WordVM)
//   * ListBoxWords  — mutable ObservableCollection of WordVM
//   * BeginDragData — per-tile closure factories the markup binds to
//                     each container's IsDraggable / OnDragStart
//
// Two drag formats:
//   * `mural/reorder/from-index`  — within-listbox reorder, payload
//                                    is the source index.
//   * `mural/word/copy`           — toolbox → listbox copy, payload
//                                    is the dragged Word string.
// The reorder behavior keys off the first format; a sibling drop
// receiver attached in the bootstrap handles the second.

import {
    DataObject, DragDropEffects,
    MetaData, Model, ObservableCollection,
} from '@visualisation-sub/mural/runtime';
import { TOOLBOX_WORDS, buildListBoxSeed } from './word-list.mjs';

export const FMT_FROM_INDEX = 'mural/reorder/from-index';
export const FMT_WORD_COPY  = 'mural/word/copy';

const LIST_SEED_COUNT = 2000;

export class WordVM extends Model
{
    static {
        Model.RegisterProperty(WordVM, 'Word',          '',        MetaData.None);
        Model.RegisterProperty(WordVM, 'BeginDragData', undefined, MetaData.None);
    }

    constructor(word) {
        super();
        this._set_property_value_by_name('Word', word);
    }

    get Word()          { return this._get_property_value_by_name('Word'); }
    get BeginDragData() { return this._get_property_value_by_name('BeginDragData'); }
}

export class WordToolboxVM extends Model
{
    static {
        Model.RegisterProperty(WordToolboxVM, 'ToolboxWords', undefined, MetaData.None);
        Model.RegisterProperty(WordToolboxVM, 'ListBoxWords', undefined, MetaData.None);
        // Tiny status string — counts only, no per-item details.
        Model.RegisterProperty(WordToolboxVM, 'Status',       '',        MetaData.None);
    }

    constructor() {
        super();

        // Toolbox catalog — fixed at construction. Each tile gets a
        // Copy-mode drag factory that publishes the word in the
        // FMT_WORD_COPY format.
        const toolbox = new ObservableCollection();
        for (const w of TOOLBOX_WORDS) {
            const vm = new WordVM(w);
            vm._set_property_value_by_name('BeginDragData', () => ({
                data:    new DataObject().Set(FMT_WORD_COPY, w),
                effects: DragDropEffects.Copy,
            }));
            toolbox.Add(vm);
        }
        this._set_property_value_by_name('ToolboxWords', toolbox);

        // Listbox seed — large, mutable. Reorder uses indices, so
        // each tile's BeginDragData reads its current index from the
        // owner collection at drag-start time (not at construction
        // time — the index moves under reorders).
        const list = new ObservableCollection();
        for (const entry of buildListBoxSeed(LIST_SEED_COUNT)) {
            const vm = new WordVM(entry.Word);
            vm._set_property_value_by_name('BeginDragData', () => ({
                data:    new DataObject().Set(FMT_FROM_INDEX, this._indexOf(vm)),
                effects: DragDropEffects.Move,
            }));
            list.Add(vm);
        }
        this._set_property_value_by_name('ListBoxWords', list);

        this._refreshStatus();
    }

    get ToolboxWords() { return this._get_property_value_by_name('ToolboxWords'); }
    get ListBoxWords() { return this._get_property_value_by_name('ListBoxWords'); }
    get Status()       { return this._get_property_value_by_name('Status'); }

    // Called by the toolbox-copy drop receiver attached in the
    // bootstrap. Appends a fresh WordVM for `word` with a reorder-
    // mode drag factory installed (same shape as the seed entries).
    OnWordCopied(word) {
        const list = this.ListBoxWords;
        const vm = new WordVM(word);
        vm._set_property_value_by_name('BeginDragData', () => ({
            data:    new DataObject().Set(FMT_FROM_INDEX, this._indexOf(vm)),
            effects: DragDropEffects.Move,
        }));
        list.Add(vm);
        this._refreshStatus();
    }

    _indexOf(target) {
        const list = this.ListBoxWords;
        for (let i = 0; i < list.Count; i++) {
            if (list.Get(i) === target) return i;
        }
        return -1;
    }

    _refreshStatus() {
        const list = this.ListBoxWords;
        this._set_property_value_by_name(
            'Status',
            `Toolbox: ${this.ToolboxWords.Count} words · ListBox: ${list.Count} tiles`,
        );
    }
}
