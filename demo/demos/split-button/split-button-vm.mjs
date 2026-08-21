// SplitButtonVM — backs the split-button demo. Exposes:
//   * SendCommand (primary action)
//   * SendCount   (click count for the primary action)
//   * MenuActionCommand + MenuActionTaken — fired by each menu-item
//     click in the dropdown
//   * IsOpen — bound to SplitButton.IsOpen for the readout
import { MuralBase, MetaData, RelayCommand, } from '@pragmatic-lab/mural/runtime';
export class SplitButtonVM extends MuralBase {
    static SendCountKey = MuralBase.RegisterProperty(SplitButtonVM, 'SendCount', 0, MetaData.None);
    static MenuActionTakenKey = MuralBase.RegisterProperty(SplitButtonVM, 'MenuActionTaken', '—', MetaData.None);
    static IsOpenKey = MuralBase.RegisterProperty(SplitButtonVM, 'IsOpen', false, MetaData.None);
    // The popup body. Built in the demo's .mjs entry point and
    // assigned here — the VM holds the reference but doesn't construct
    // the Visual (per the project's no-Visual-in-VM rule).
    static MenuPopupKey = MuralBase.RegisterProperty(SplitButtonVM, 'MenuPopup', null, MetaData.None);
    static SendCommandKey = MuralBase.RegisterProperty(SplitButtonVM, 'SendCommand', null, MetaData.None);
    static SendNowCommandKey = MuralBase.RegisterProperty(SplitButtonVM, 'SendNowCommand', null, MetaData.None);
    static ScheduleSendCommandKey = MuralBase.RegisterProperty(SplitButtonVM, 'ScheduleSendCommand', null, MetaData.None);
    static SaveDraftCommandKey = MuralBase.RegisterProperty(SplitButtonVM, 'SaveDraftCommand', null, MetaData.None);
    get SendCount() { return this.get_property_value(SplitButtonVM.SendCountKey); }
    set SendCount(v) { this.set_property_value(SplitButtonVM.SendCountKey, v); }
    get MenuActionTaken() { return this.get_property_value(SplitButtonVM.MenuActionTakenKey); }
    set MenuActionTaken(v) { this.set_property_value(SplitButtonVM.MenuActionTakenKey, v); }
    get IsOpen() { return this.get_property_value(SplitButtonVM.IsOpenKey); }
    set IsOpen(v) { this.set_property_value(SplitButtonVM.IsOpenKey, v); }
    get MenuPopup() { return this.get_property_value(SplitButtonVM.MenuPopupKey); }
    set MenuPopup(v) { this.set_property_value(SplitButtonVM.MenuPopupKey, v); }
    get SendCommand() { return this.get_property_value(SplitButtonVM.SendCommandKey); }
    get SendNowCommand() { return this.get_property_value(SplitButtonVM.SendNowCommandKey); }
    get ScheduleSendCommand() { return this.get_property_value(SplitButtonVM.ScheduleSendCommandKey); }
    get SaveDraftCommand() { return this.get_property_value(SplitButtonVM.SaveDraftCommandKey); }
    constructor() {
        super();
        this.set_property_value(SplitButtonVM.SendCommandKey, new RelayCommand(() => { this.SendCount += 1; }));
        this.set_property_value(SplitButtonVM.SendNowCommandKey, new RelayCommand(() => { this.MenuActionTaken = 'Send now'; this.IsOpen = false; }));
        this.set_property_value(SplitButtonVM.ScheduleSendCommandKey, new RelayCommand(() => { this.MenuActionTaken = 'Schedule send'; this.IsOpen = false; }));
        this.set_property_value(SplitButtonVM.SaveDraftCommandKey, new RelayCommand(() => { this.MenuActionTaken = 'Save draft'; this.IsOpen = false; }));
    }
}
