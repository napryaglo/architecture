// MenuVM — command catalogue + status mirror for the menu demo. The
// MenuButton hosts a vertical column of MenuItems; click an item to
// run its command. Status reflects the latest invocation.
//
// Two checkable items (ShowGrid / SnapToGrid) demonstrate IsCheckable
// + IsChecked. Their Command callbacks read IsChecked through the
// MenuItem's CommandParameter (the markup passes `$self.IsChecked`).
import { MetaData, Model, RelayCommand, } from 'mural/runtime';
export class MenuVM extends Model {
    static StatusKey = Model.RegisterProperty(MenuVM, 'Status', 'Ready.', MetaData.None);
    static ShowGridKey = Model.RegisterProperty(MenuVM, 'ShowGrid', true, MetaData.None);
    static SnapToGridKey = Model.RegisterProperty(MenuVM, 'SnapToGrid', false, MetaData.None);
    // Command catalogue exposed as plain fields the menu markup binds to.
    NewCommand;
    OpenCommand;
    SaveCommand;
    SaveAsCommand;
    CloseCommand;
    UndoCommand;
    RedoCommand;
    ShowGridCommand;
    SnapToGridCommand;
    constructor() {
        super();
        const setStatus = (msg) => this.set_property_value(MenuVM.StatusKey, msg);
        this.NewCommand = new RelayCommand(() => setStatus('New — empty document.'));
        this.OpenCommand = new RelayCommand(() => setStatus('Open — read from disk.'));
        this.SaveCommand = new RelayCommand(() => setStatus('Save — written to disk.'));
        this.SaveAsCommand = new RelayCommand(() => setStatus('Save As… — file dialog opened.'));
        this.CloseCommand = new RelayCommand(() => setStatus('Close — document closed.'));
        this.UndoCommand = new RelayCommand(() => setStatus('Undo.'));
        this.RedoCommand = new RelayCommand(() => setStatus('Redo.'));
        // Toggle commands — the MenuItem's IsCheckable+IsChecked DPs
        // flip first (Button.OnPreClick fires in the click protocol),
        // then the Command runs and reads the post-flip state.
        this.ShowGridCommand = new RelayCommand(() => {
            this.ShowGrid = !this.ShowGrid;
            setStatus(`Show Grid → ${this.ShowGrid ? 'on' : 'off'}.`);
        });
        this.SnapToGridCommand = new RelayCommand(() => {
            this.SnapToGrid = !this.SnapToGrid;
            setStatus(`Snap to Grid → ${this.SnapToGrid ? 'on' : 'off'}.`);
        });
    }
    get Status() { return this.get_property_value(MenuVM.StatusKey); }
    set Status(v) { this.set_property_value(MenuVM.StatusKey, v); }
    get ShowGrid() { return this.get_property_value(MenuVM.ShowGridKey); }
    set ShowGrid(v) { this.set_property_value(MenuVM.ShowGridKey, v); }
    get SnapToGrid() { return this.get_property_value(MenuVM.SnapToGridKey); }
    set SnapToGrid(v) { this.set_property_value(MenuVM.SnapToGridKey, v); }
}
