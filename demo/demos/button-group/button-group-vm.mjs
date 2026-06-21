// ButtonGroupVM — backs the button-group demo. Tracks click counts
// for each action button so the hover-expand interaction can be
// verified end-to-end (hover widens, click increments).
import { Model, MetaData, RelayCommand } from '@visualisation-sub/mural/runtime';

export class ButtonGroupVM extends Model
{
    static UndoClicksKey   = Model.RegisterProperty(ButtonGroupVM, 'UndoClicks',   0, MetaData.None);
    static RedoClicksKey   = Model.RegisterProperty(ButtonGroupVM, 'RedoClicks',   0, MetaData.None);
    static CutClicksKey    = Model.RegisterProperty(ButtonGroupVM, 'CutClicks',    0, MetaData.None);
    static CopyClicksKey   = Model.RegisterProperty(ButtonGroupVM, 'CopyClicks',   0, MetaData.None);
    static PasteClicksKey  = Model.RegisterProperty(ButtonGroupVM, 'PasteClicks',  0, MetaData.None);

    static UndoCommandKey  = Model.RegisterProperty(ButtonGroupVM, 'UndoCommand',  null, MetaData.None);
    static RedoCommandKey  = Model.RegisterProperty(ButtonGroupVM, 'RedoCommand',  null, MetaData.None);
    static CutCommandKey   = Model.RegisterProperty(ButtonGroupVM, 'CutCommand',   null, MetaData.None);
    static CopyCommandKey  = Model.RegisterProperty(ButtonGroupVM, 'CopyCommand',  null, MetaData.None);
    static PasteCommandKey = Model.RegisterProperty(ButtonGroupVM, 'PasteCommand', null, MetaData.None);

    get UndoClicks()  { return this.get_property_value(ButtonGroupVM.UndoClicksKey); }
    set UndoClicks(v) { this.set_property_value(ButtonGroupVM.UndoClicksKey, v); }
    get RedoClicks()  { return this.get_property_value(ButtonGroupVM.RedoClicksKey); }
    set RedoClicks(v) { this.set_property_value(ButtonGroupVM.RedoClicksKey, v); }
    get CutClicks()   { return this.get_property_value(ButtonGroupVM.CutClicksKey); }
    set CutClicks(v)  { this.set_property_value(ButtonGroupVM.CutClicksKey, v); }
    get CopyClicks()  { return this.get_property_value(ButtonGroupVM.CopyClicksKey); }
    set CopyClicks(v) { this.set_property_value(ButtonGroupVM.CopyClicksKey, v); }
    get PasteClicks() { return this.get_property_value(ButtonGroupVM.PasteClicksKey); }
    set PasteClicks(v){ this.set_property_value(ButtonGroupVM.PasteClicksKey, v); }

    get UndoCommand()  { return this.get_property_value(ButtonGroupVM.UndoCommandKey); }
    get RedoCommand()  { return this.get_property_value(ButtonGroupVM.RedoCommandKey); }
    get CutCommand()   { return this.get_property_value(ButtonGroupVM.CutCommandKey); }
    get CopyCommand()  { return this.get_property_value(ButtonGroupVM.CopyCommandKey); }
    get PasteCommand() { return this.get_property_value(ButtonGroupVM.PasteCommandKey); }

    constructor() {
        super();
        this.set_property_value(ButtonGroupVM.UndoCommandKey,  new RelayCommand(() => { this.UndoClicks  += 1; }));
        this.set_property_value(ButtonGroupVM.RedoCommandKey,  new RelayCommand(() => { this.RedoClicks  += 1; }));
        this.set_property_value(ButtonGroupVM.CutCommandKey,   new RelayCommand(() => { this.CutClicks   += 1; }));
        this.set_property_value(ButtonGroupVM.CopyCommandKey,  new RelayCommand(() => { this.CopyClicks  += 1; }));
        this.set_property_value(ButtonGroupVM.PasteCommandKey, new RelayCommand(() => { this.PasteClicks += 1; }));
    }
}
