// ToolBarVM — backs the tool-bar demo. Holds the shared command
// catalogue + a status string the toolbar items mutate as they fire.
//
// Three RelayCommands:
//   * Save / Cut / Copy — plain commands; always executable.
//   * Delete            — selection-gated; CanExecute returns
//                          `HasSelection`.
//
// The toggle on the toolbar's right end flips `HasSelection` and pulses
// RaiseCanExecuteChanged so Delete's chrome dims / undims live.

import {
    MetaData,
    Model,
    RelayCommand,
} from '@visualisation-sub/mural/runtime';

export class ToolBarVM extends Model
{
    static StatusKey       = Model.RegisterProperty(ToolBarVM, 'Status',       'Ready.', MetaData.None);
    static HasSelectionKey = Model.RegisterProperty(ToolBarVM, 'HasSelection', false,    MetaData.None);

    constructor() {
        super();
        const setStatus = (msg) => this._set_property_value_by_name('Status', msg);
        this.SaveCommand   = new RelayCommand(() => setStatus('Save — saved.'));
        this.CutCommand    = new RelayCommand(() => setStatus('Cut.'));
        this.CopyCommand   = new RelayCommand(() => setStatus('Copy.'));
        this.DeleteCommand = new RelayCommand(
            () => setStatus('Delete — removed selection.'),
            () => this.HasSelection,
        );

        // ToggleHasSelection — flipped by the demo's toggle button.
        // Pulses Delete's CanExecuteChanged so its chrome refreshes.
        this.ToggleSelectionCommand = new RelayCommand(() => {
            this.HasSelection = !this.HasSelection;
            this.DeleteCommand.RaiseCanExecuteChanged();
            setStatus(this.HasSelection ? 'Has selection.' : 'No selection.');
        });
    }

    get Status()        { return this._get_property_value_by_name('Status'); }
    set Status(v)       { this._set_property_value_by_name('Status', v); }
    get HasSelection()  { return this._get_property_value_by_name('HasSelection'); }
    set HasSelection(v) { this._set_property_value_by_name('HasSelection', v); }
}
