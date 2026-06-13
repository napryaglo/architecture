// SplitButtonVM — backs the split-button demo. Exposes:
//   * SendCommand (primary action)
//   * SendCount   (click count for the primary action)
//   * MenuActionCommand + MenuActionTaken — fired by each menu-item
//     click in the dropdown
//   * IsOpen — bound to SplitButton.IsOpen for the readout
import { Model, MetaData, RelayCommand } from '@visualisation-sub/mural/runtime';

export class SplitButtonVM extends Model
{
    static SendCountKey       = Model.RegisterProperty(SplitButtonVM, 'SendCount',       0,    MetaData.None);
    static MenuActionTakenKey = Model.RegisterProperty(SplitButtonVM, 'MenuActionTaken', '—',  MetaData.None);
    static IsOpenKey          = Model.RegisterProperty(SplitButtonVM, 'IsOpen',          false, MetaData.None);
    // The popup body. Built in the demo's .mjs entry point and
    // assigned here — the VM holds the reference but doesn't construct
    // the Visual (per the project's no-Visual-in-VM rule).
    static MenuPopupKey       = Model.RegisterProperty(SplitButtonVM, 'MenuPopup',       null, MetaData.None);

    static SendCommandKey         = Model.RegisterProperty(SplitButtonVM, 'SendCommand',         null, MetaData.None);
    static SendNowCommandKey      = Model.RegisterProperty(SplitButtonVM, 'SendNowCommand',      null, MetaData.None);
    static ScheduleSendCommandKey = Model.RegisterProperty(SplitButtonVM, 'ScheduleSendCommand', null, MetaData.None);
    static SaveDraftCommandKey    = Model.RegisterProperty(SplitButtonVM, 'SaveDraftCommand',    null, MetaData.None);

    get SendCount()       { return this._get_property_value_by_name('SendCount'); }
    set SendCount(v)      { this._set_property_value_by_name('SendCount', v); }
    get MenuActionTaken() { return this._get_property_value_by_name('MenuActionTaken'); }
    set MenuActionTaken(v){ this._set_property_value_by_name('MenuActionTaken', v); }
    get IsOpen()          { return this._get_property_value_by_name('IsOpen'); }
    set IsOpen(v)         { this._set_property_value_by_name('IsOpen', v); }
    get MenuPopup()       { return this._get_property_value_by_name('MenuPopup'); }
    set MenuPopup(v)      { this._set_property_value_by_name('MenuPopup', v); }

    get SendCommand()         { return this._get_property_value_by_name('SendCommand'); }
    get SendNowCommand()      { return this._get_property_value_by_name('SendNowCommand'); }
    get ScheduleSendCommand() { return this._get_property_value_by_name('ScheduleSendCommand'); }
    get SaveDraftCommand()    { return this._get_property_value_by_name('SaveDraftCommand'); }

    constructor() {
        super();
        this._set_property_value_by_name('SendCommand',
            new RelayCommand(() => { this.SendCount += 1; }));
        this._set_property_value_by_name('SendNowCommand',
            new RelayCommand(() => { this.MenuActionTaken = 'Send now';      this.IsOpen = false; }));
        this._set_property_value_by_name('ScheduleSendCommand',
            new RelayCommand(() => { this.MenuActionTaken = 'Schedule send'; this.IsOpen = false; }));
        this._set_property_value_by_name('SaveDraftCommand',
            new RelayCommand(() => { this.MenuActionTaken = 'Save draft';    this.IsOpen = false; }));
    }
}
