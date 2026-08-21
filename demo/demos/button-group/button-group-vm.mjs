// ButtonGroupVM — backs the button-group demo. Tracks click counts
// for each action button so the hover-expand interaction can be
// verified end-to-end (hover widens, click increments).
import { MuralBase, MetaData, RelayCommand } from '@pragmatic-lab/mural/runtime';
export class ButtonGroupVM extends MuralBase {
    static UndoClicksKey = MuralBase.RegisterProperty(ButtonGroupVM, 'UndoClicks', 0, MetaData.None);
    static RedoClicksKey = MuralBase.RegisterProperty(ButtonGroupVM, 'RedoClicks', 0, MetaData.None);
    static CutClicksKey = MuralBase.RegisterProperty(ButtonGroupVM, 'CutClicks', 0, MetaData.None);
    static CopyClicksKey = MuralBase.RegisterProperty(ButtonGroupVM, 'CopyClicks', 0, MetaData.None);
    static PasteClicksKey = MuralBase.RegisterProperty(ButtonGroupVM, 'PasteClicks', 0, MetaData.None);
    static UndoCommandKey = MuralBase.RegisterProperty(ButtonGroupVM, 'UndoCommand', null, MetaData.None);
    static RedoCommandKey = MuralBase.RegisterProperty(ButtonGroupVM, 'RedoCommand', null, MetaData.None);
    static CutCommandKey = MuralBase.RegisterProperty(ButtonGroupVM, 'CutCommand', null, MetaData.None);
    static CopyCommandKey = MuralBase.RegisterProperty(ButtonGroupVM, 'CopyCommand', null, MetaData.None);
    static PasteCommandKey = MuralBase.RegisterProperty(ButtonGroupVM, 'PasteCommand', null, MetaData.None);
    get UndoClicks() { return this.get_property_value(ButtonGroupVM.UndoClicksKey); }
    set UndoClicks(v) { this.set_property_value(ButtonGroupVM.UndoClicksKey, v); }
    get RedoClicks() { return this.get_property_value(ButtonGroupVM.RedoClicksKey); }
    set RedoClicks(v) { this.set_property_value(ButtonGroupVM.RedoClicksKey, v); }
    get CutClicks() { return this.get_property_value(ButtonGroupVM.CutClicksKey); }
    set CutClicks(v) { this.set_property_value(ButtonGroupVM.CutClicksKey, v); }
    get CopyClicks() { return this.get_property_value(ButtonGroupVM.CopyClicksKey); }
    set CopyClicks(v) { this.set_property_value(ButtonGroupVM.CopyClicksKey, v); }
    get PasteClicks() { return this.get_property_value(ButtonGroupVM.PasteClicksKey); }
    set PasteClicks(v) { this.set_property_value(ButtonGroupVM.PasteClicksKey, v); }
    get UndoCommand() { return this.get_property_value(ButtonGroupVM.UndoCommandKey); }
    get RedoCommand() { return this.get_property_value(ButtonGroupVM.RedoCommandKey); }
    get CutCommand() { return this.get_property_value(ButtonGroupVM.CutCommandKey); }
    get CopyCommand() { return this.get_property_value(ButtonGroupVM.CopyCommandKey); }
    get PasteCommand() { return this.get_property_value(ButtonGroupVM.PasteCommandKey); }
    constructor() {
        super();
        this.set_property_value(ButtonGroupVM.UndoCommandKey, new RelayCommand(() => { this.UndoClicks += 1; }));
        this.set_property_value(ButtonGroupVM.RedoCommandKey, new RelayCommand(() => { this.RedoClicks += 1; }));
        this.set_property_value(ButtonGroupVM.CutCommandKey, new RelayCommand(() => { this.CutClicks += 1; }));
        this.set_property_value(ButtonGroupVM.CopyCommandKey, new RelayCommand(() => { this.CopyClicks += 1; }));
        this.set_property_value(ButtonGroupVM.PasteCommandKey, new RelayCommand(() => { this.PasteClicks += 1; }));
    }
}
