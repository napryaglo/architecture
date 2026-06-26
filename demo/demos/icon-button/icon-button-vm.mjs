// IconButtonVM — backs the icon-button demo. Tracks how many times each
// icon variant has been clicked and the checked state of the four
// IconButtonToggle variants so the UI can show a live tally + reflect
// the toggle state back into the chrome.
import { Model, MetaData, RelayCommand } from '@visualisation-sub/mural/runtime';
export class IconButtonVM extends Model {
    static FilledClicksKey = Model.RegisterProperty(IconButtonVM, 'FilledClicks', 0, MetaData.None);
    static TonalClicksKey = Model.RegisterProperty(IconButtonVM, 'TonalClicks', 0, MetaData.None);
    static OutlinedClicksKey = Model.RegisterProperty(IconButtonVM, 'OutlinedClicks', 0, MetaData.None);
    static StandardClicksKey = Model.RegisterProperty(IconButtonVM, 'StandardClicks', 0, MetaData.None);
    static FilledCheckedKey = Model.RegisterProperty(IconButtonVM, 'FilledChecked', false, MetaData.None);
    static TonalCheckedKey = Model.RegisterProperty(IconButtonVM, 'TonalChecked', false, MetaData.None);
    static OutlinedCheckedKey = Model.RegisterProperty(IconButtonVM, 'OutlinedChecked', false, MetaData.None);
    static StandardCheckedKey = Model.RegisterProperty(IconButtonVM, 'StandardChecked', false, MetaData.None);
    static ClickFilledCommandKey = Model.RegisterProperty(IconButtonVM, 'ClickFilledCommand', null, MetaData.None);
    static ClickTonalCommandKey = Model.RegisterProperty(IconButtonVM, 'ClickTonalCommand', null, MetaData.None);
    static ClickOutlinedCommandKey = Model.RegisterProperty(IconButtonVM, 'ClickOutlinedCommand', null, MetaData.None);
    static ClickStandardCommandKey = Model.RegisterProperty(IconButtonVM, 'ClickStandardCommand', null, MetaData.None);
    get FilledClicks() { return this.get_property_value(IconButtonVM.FilledClicksKey); }
    set FilledClicks(v) { this.set_property_value(IconButtonVM.FilledClicksKey, v); }
    get TonalClicks() { return this.get_property_value(IconButtonVM.TonalClicksKey); }
    set TonalClicks(v) { this.set_property_value(IconButtonVM.TonalClicksKey, v); }
    get OutlinedClicks() { return this.get_property_value(IconButtonVM.OutlinedClicksKey); }
    set OutlinedClicks(v) { this.set_property_value(IconButtonVM.OutlinedClicksKey, v); }
    get StandardClicks() { return this.get_property_value(IconButtonVM.StandardClicksKey); }
    set StandardClicks(v) { this.set_property_value(IconButtonVM.StandardClicksKey, v); }
    get FilledChecked() { return this.get_property_value(IconButtonVM.FilledCheckedKey); }
    set FilledChecked(v) { this.set_property_value(IconButtonVM.FilledCheckedKey, v); }
    get TonalChecked() { return this.get_property_value(IconButtonVM.TonalCheckedKey); }
    set TonalChecked(v) { this.set_property_value(IconButtonVM.TonalCheckedKey, v); }
    get OutlinedChecked() { return this.get_property_value(IconButtonVM.OutlinedCheckedKey); }
    set OutlinedChecked(v) { this.set_property_value(IconButtonVM.OutlinedCheckedKey, v); }
    get StandardChecked() { return this.get_property_value(IconButtonVM.StandardCheckedKey); }
    set StandardChecked(v) { this.set_property_value(IconButtonVM.StandardCheckedKey, v); }
    get ClickFilledCommand() { return this.get_property_value(IconButtonVM.ClickFilledCommandKey); }
    get ClickTonalCommand() { return this.get_property_value(IconButtonVM.ClickTonalCommandKey); }
    get ClickOutlinedCommand() { return this.get_property_value(IconButtonVM.ClickOutlinedCommandKey); }
    get ClickStandardCommand() { return this.get_property_value(IconButtonVM.ClickStandardCommandKey); }
    constructor() {
        super();
        this.set_property_value(IconButtonVM.ClickFilledCommandKey, new RelayCommand(() => { this.FilledClicks += 1; }));
        this.set_property_value(IconButtonVM.ClickTonalCommandKey, new RelayCommand(() => { this.TonalClicks += 1; }));
        this.set_property_value(IconButtonVM.ClickOutlinedCommandKey, new RelayCommand(() => { this.OutlinedClicks += 1; }));
        this.set_property_value(IconButtonVM.ClickStandardCommandKey, new RelayCommand(() => { this.StandardClicks += 1; }));
    }
}
