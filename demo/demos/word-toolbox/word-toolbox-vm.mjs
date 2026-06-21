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
    static WordKey          = Model.RegisterProperty(WordVM, 'Word',          '',        MetaData.None);
    static BeginDragDataKey = Model.RegisterProperty(WordVM, 'BeginDragData', undefined, MetaData.None);

    constructor(word) {
        super();
        this.set_property_value(WordVM.WordKey, word);
    }

    get Word()           { return this.get_property_value(WordVM.WordKey); }
    set Word(v)          { this.set_property_value(WordVM.WordKey, v); }
    get BeginDragData()  { return this.get_property_value(WordVM.BeginDragDataKey); }
    set BeginDragData(v) { this.set_property_value(WordVM.BeginDragDataKey, v); }
}

export class WordToolboxVM extends Model
{
    static ToolboxWordsKey = Model.RegisterProperty(WordToolboxVM, 'ToolboxWords', undefined, MetaData.None);
    static ListBoxWordsKey = Model.RegisterProperty(WordToolboxVM, 'ListBoxWords', undefined, MetaData.None);
    // Tiny status string — counts only, no per-item details.
    static StatusKey       = Model.RegisterProperty(WordToolboxVM, 'Status',       '',        MetaData.None);

    constructor() {
        super();

        // Toolbox catalog — fixed at construction. Each tile gets a
        // Copy-mode drag factory that publishes the word in the
        // FMT_WORD_COPY format.
        const toolbox = new ObservableCollection();
        for (const w of TOOLBOX_WORDS) {
            const vm = new WordVM(w);
            vm.set_property_value(WordVM.BeginDragDataKey, () => ({
                data:    new DataObject().Set(FMT_WORD_COPY, w),
                effects: DragDropEffects.Copy,
            }));
            toolbox.Add(vm);
        }
        this.set_property_value(WordToolboxVM.ToolboxWordsKey, toolbox);

        // Listbox seed — large, mutable. Reorder uses indices, so
        // each tile's BeginDragData reads its current index from the
        // owner collection at drag-start time (not at construction
        // time — the index moves under reorders).
        const list = new ObservableCollection();
        for (const entry of buildListBoxSeed(LIST_SEED_COUNT)) {
            const vm = new WordVM(entry.Word);
            vm.set_property_value(WordVM.BeginDragDataKey, () => ({
                data:    new DataObject().Set(FMT_FROM_INDEX, this._indexOf(vm)),
                effects: DragDropEffects.Move,
            }));
            list.Add(vm);
        }
        this.set_property_value(WordToolboxVM.ListBoxWordsKey, list);

        this._refreshStatus();
    }

    get ToolboxWords()  { return this.get_property_value(WordToolboxVM.ToolboxWordsKey); }
    set ToolboxWords(v) { this.set_property_value(WordToolboxVM.ToolboxWordsKey, v); }
    get ListBoxWords()  { return this.get_property_value(WordToolboxVM.ListBoxWordsKey); }
    set ListBoxWords(v) { this.set_property_value(WordToolboxVM.ListBoxWordsKey, v); }
    get Status()        { return this.get_property_value(WordToolboxVM.StatusKey); }
    set Status(v)       { this.set_property_value(WordToolboxVM.StatusKey, v); }

    // Called by the toolbox-copy drop receiver attached in the
    // bootstrap. Appends a fresh WordVM for `word` with a reorder-
    // mode drag factory installed (same shape as the seed entries).
    OnWordCopied(word) {
        const list = this.ListBoxWords;
        const vm = new WordVM(word);
        vm.set_property_value(WordVM.BeginDragDataKey, () => ({
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
        this.set_property_value(
            WordToolboxVM.StatusKey,
            `Toolbox: ${this.ToolboxWords.Count} words · ListBox: ${list.Count} tiles`,
        );
    }
}
