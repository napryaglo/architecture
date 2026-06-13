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

    get UndoClicks()  { return this._get_property_value_by_name('UndoClicks'); }
    set UndoClicks(v) { this._set_property_value_by_name('UndoClicks', v); }
    get RedoClicks()  { return this._get_property_value_by_name('RedoClicks'); }
    set RedoClicks(v) { this._set_property_value_by_name('RedoClicks', v); }
    get CutClicks()   { return this._get_property_value_by_name('CutClicks'); }
    set CutClicks(v)  { this._set_property_value_by_name('CutClicks', v); }
    get CopyClicks()  { return this._get_property_value_by_name('CopyClicks'); }
    set CopyClicks(v) { this._set_property_value_by_name('CopyClicks', v); }
    get PasteClicks() { return this._get_property_value_by_name('PasteClicks'); }
    set PasteClicks(v){ this._set_property_value_by_name('PasteClicks', v); }

    get UndoCommand()  { return this._get_property_value_by_name('UndoCommand'); }
    get RedoCommand()  { return this._get_property_value_by_name('RedoCommand'); }
    get CutCommand()   { return this._get_property_value_by_name('CutCommand'); }
    get CopyCommand()  { return this._get_property_value_by_name('CopyCommand'); }
    get PasteCommand() { return this._get_property_value_by_name('PasteCommand'); }

    constructor() {
        super();
        this._set_property_value_by_name('UndoCommand',  new RelayCommand(() => { this.UndoClicks  += 1; }));
        this._set_property_value_by_name('RedoCommand',  new RelayCommand(() => { this.RedoClicks  += 1; }));
        this._set_property_value_by_name('CutCommand',   new RelayCommand(() => { this.CutClicks   += 1; }));
        this._set_property_value_by_name('CopyCommand',  new RelayCommand(() => { this.CopyClicks  += 1; }));
        this._set_property_value_by_name('PasteCommand', new RelayCommand(() => { this.PasteClicks += 1; }));
    }
}
