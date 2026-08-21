// ContextMenuVM — three colored panels each with its OWN ContextMenu.
// Right-click any panel to open its menu; the route-walker finds the
// nearest ancestor with an attached ContextMenu and opens it at the
// cursor position.
import { MetaData, MuralBase, RelayCommand, } from '@pragmatic-lab/mural/runtime';
export class ContextMenuVM extends MuralBase {
    static StatusKey = MuralBase.RegisterProperty(ContextMenuVM, 'Status', 'Right-click any panel.', MetaData.None);
    // Per-panel commands exposed as plain fields the ContextMenu markup
    // binds to. The CommandParameter (the menu-item label) arrives as the
    // command argument.
    RedCommand;
    GreenCommand;
    BlueCommand;
    constructor() {
        super();
        const setStatus = (msg) => this.set_property_value(ContextMenuVM.StatusKey, msg);
        // Three sets of commands keyed by panel colour. The data flows
        // through CommandParameter so the same VM method can format
        // distinct status messages per source. `label` is the menu item's
        // CommandParameter, typed unknown by ICommand — stringify it.
        this.RedCommand = new RelayCommand((label) => setStatus(`Red panel  — ${String(label)}.`));
        this.GreenCommand = new RelayCommand((label) => setStatus(`Green panel — ${String(label)}.`));
        this.BlueCommand = new RelayCommand((label) => setStatus(`Blue panel  — ${String(label)}.`));
    }
    get Status() { return this.get_property_value(ContextMenuVM.StatusKey); }
    set Status(v) { this.set_property_value(ContextMenuVM.StatusKey, v); }
}
