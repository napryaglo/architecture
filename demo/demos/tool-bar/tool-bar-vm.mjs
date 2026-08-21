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
import { MetaData, MuralBase, RelayCommand, } from '@pragmatic-lab/mural/runtime';
export class ToolBarVM extends MuralBase {
    static StatusKey = MuralBase.RegisterProperty(ToolBarVM, 'Status', 'Ready.', MetaData.None);
    static HasSelectionKey = MuralBase.RegisterProperty(ToolBarVM, 'HasSelection', false, MetaData.None);
    // Command catalogue exposed as plain fields (resolved by the toolbar
    // markup through the VM's own bindings).
    SaveCommand;
    CutCommand;
    CopyCommand;
    DeleteCommand;
    ToggleSelectionCommand;
    constructor() {
        super();
        const setStatus = (msg) => this.set_property_value(ToolBarVM.StatusKey, msg);
        this.SaveCommand = new RelayCommand(() => setStatus('Save — saved.'));
        this.CutCommand = new RelayCommand(() => setStatus('Cut.'));
        this.CopyCommand = new RelayCommand(() => setStatus('Copy.'));
        this.DeleteCommand = new RelayCommand(() => setStatus('Delete — removed selection.'), () => this.HasSelection);
        // ToggleHasSelection — flipped by the demo's toggle button.
        // Pulses Delete's CanExecuteChanged so its chrome refreshes.
        this.ToggleSelectionCommand = new RelayCommand(() => {
            this.HasSelection = !this.HasSelection;
            this.DeleteCommand.RaiseCanExecuteChanged();
            setStatus(this.HasSelection ? 'Has selection.' : 'No selection.');
        });
    }
    get Status() { return this.get_property_value(ToolBarVM.StatusKey); }
    set Status(v) { this.set_property_value(ToolBarVM.StatusKey, v); }
    get HasSelection() { return this.get_property_value(ToolBarVM.HasSelectionKey); }
    set HasSelection(v) { this.set_property_value(ToolBarVM.HasSelectionKey, v); }
}
