// IconButtonVM — backs the icon-button demo. Tracks how many times each
// icon variant has been clicked and the checked state of the four
// IconButtonToggle variants so the UI can show a live tally + reflect
// the toggle state back into the chrome.
import { Model, MetaData, RelayCommand } from '@visualisation-sub/mural/runtime';

export class IconButtonVM extends Model
{
    static FilledClicksKey   = Model.RegisterProperty(IconButtonVM, 'FilledClicks',   0,     MetaData.None);
    static TonalClicksKey    = Model.RegisterProperty(IconButtonVM, 'TonalClicks',    0,     MetaData.None);
    static OutlinedClicksKey = Model.RegisterProperty(IconButtonVM, 'OutlinedClicks', 0,     MetaData.None);
    static StandardClicksKey = Model.RegisterProperty(IconButtonVM, 'StandardClicks', 0,     MetaData.None);

    static FilledCheckedKey   = Model.RegisterProperty(IconButtonVM, 'FilledChecked',   false, MetaData.None);
    static TonalCheckedKey    = Model.RegisterProperty(IconButtonVM, 'TonalChecked',    false, MetaData.None);
    static OutlinedCheckedKey = Model.RegisterProperty(IconButtonVM, 'OutlinedChecked', false, MetaData.None);
    static StandardCheckedKey = Model.RegisterProperty(IconButtonVM, 'StandardChecked', false, MetaData.None);

    static ClickFilledCommandKey   = Model.RegisterProperty(IconButtonVM, 'ClickFilledCommand',   null, MetaData.None);
    static ClickTonalCommandKey    = Model.RegisterProperty(IconButtonVM, 'ClickTonalCommand',    null, MetaData.None);
    static ClickOutlinedCommandKey = Model.RegisterProperty(IconButtonVM, 'ClickOutlinedCommand', null, MetaData.None);
    static ClickStandardCommandKey = Model.RegisterProperty(IconButtonVM, 'ClickStandardCommand', null, MetaData.None);

    get FilledClicks()   { return this._get_property_value_by_name('FilledClicks'); }
    set FilledClicks(v)  { this._set_property_value_by_name('FilledClicks', v); }
    get TonalClicks()    { return this._get_property_value_by_name('TonalClicks'); }
    set TonalClicks(v)   { this._set_property_value_by_name('TonalClicks', v); }
    get OutlinedClicks() { return this._get_property_value_by_name('OutlinedClicks'); }
    set OutlinedClicks(v){ this._set_property_value_by_name('OutlinedClicks', v); }
    get StandardClicks() { return this._get_property_value_by_name('StandardClicks'); }
    set StandardClicks(v){ this._set_property_value_by_name('StandardClicks', v); }

    get FilledChecked()    { return this._get_property_value_by_name('FilledChecked'); }
    set FilledChecked(v)   { this._set_property_value_by_name('FilledChecked', v); }
    get TonalChecked()     { return this._get_property_value_by_name('TonalChecked'); }
    set TonalChecked(v)    { this._set_property_value_by_name('TonalChecked', v); }
    get OutlinedChecked()  { return this._get_property_value_by_name('OutlinedChecked'); }
    set OutlinedChecked(v) { this._set_property_value_by_name('OutlinedChecked', v); }
    get StandardChecked()  { return this._get_property_value_by_name('StandardChecked'); }
    set StandardChecked(v) { this._set_property_value_by_name('StandardChecked', v); }

    get ClickFilledCommand()   { return this._get_property_value_by_name('ClickFilledCommand'); }
    get ClickTonalCommand()    { return this._get_property_value_by_name('ClickTonalCommand'); }
    get ClickOutlinedCommand() { return this._get_property_value_by_name('ClickOutlinedCommand'); }
    get ClickStandardCommand() { return this._get_property_value_by_name('ClickStandardCommand'); }

    constructor() {
        super();
        this._set_property_value_by_name('ClickFilledCommand',   new RelayCommand(() => { this.FilledClicks   += 1; }));
        this._set_property_value_by_name('ClickTonalCommand',    new RelayCommand(() => { this.TonalClicks    += 1; }));
        this._set_property_value_by_name('ClickOutlinedCommand', new RelayCommand(() => { this.OutlinedClicks += 1; }));
        this._set_property_value_by_name('ClickStandardCommand', new RelayCommand(() => { this.StandardClicks += 1; }));
    }
}
