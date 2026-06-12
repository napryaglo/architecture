// FabVM — backs the FAB demo. One click counter per Size variant + per
// Extended slot so the dynamic-binding chain is visible end-to-end. No
// IsChecked story because FAB is monomorphic on container colour and
// doesn't ship a toggle variant.
import { Model, MetaData, RelayCommand } from '@visualisation-sub/mural/runtime';

export class FabVM extends Model
{
    static SmallClicksKey    = Model.RegisterProperty(FabVM, 'SmallClicks',    0, MetaData.None);
    static DefaultClicksKey  = Model.RegisterProperty(FabVM, 'DefaultClicks',  0, MetaData.None);
    static LargeClicksKey    = Model.RegisterProperty(FabVM, 'LargeClicks',    0, MetaData.None);
    static ExtendedClicksKey = Model.RegisterProperty(FabVM, 'ExtendedClicks', 0, MetaData.None);
    static ComposeClicksKey  = Model.RegisterProperty(FabVM, 'ComposeClicks',  0, MetaData.None);

    static ClickSmallCommandKey    = Model.RegisterProperty(FabVM, 'ClickSmallCommand',    null, MetaData.None);
    static ClickDefaultCommandKey  = Model.RegisterProperty(FabVM, 'ClickDefaultCommand',  null, MetaData.None);
    static ClickLargeCommandKey    = Model.RegisterProperty(FabVM, 'ClickLargeCommand',    null, MetaData.None);
    static ClickExtendedCommandKey = Model.RegisterProperty(FabVM, 'ClickExtendedCommand', null, MetaData.None);
    static ClickComposeCommandKey  = Model.RegisterProperty(FabVM, 'ClickComposeCommand',  null, MetaData.None);

    get SmallClicks()    { return this._get_property_value_by_name('SmallClicks'); }
    set SmallClicks(v)   { this._set_property_value_by_name('SmallClicks', v); }
    get DefaultClicks()  { return this._get_property_value_by_name('DefaultClicks'); }
    set DefaultClicks(v) { this._set_property_value_by_name('DefaultClicks', v); }
    get LargeClicks()    { return this._get_property_value_by_name('LargeClicks'); }
    set LargeClicks(v)   { this._set_property_value_by_name('LargeClicks', v); }
    get ExtendedClicks() { return this._get_property_value_by_name('ExtendedClicks'); }
    set ExtendedClicks(v){ this._set_property_value_by_name('ExtendedClicks', v); }
    get ComposeClicks()  { return this._get_property_value_by_name('ComposeClicks'); }
    set ComposeClicks(v) { this._set_property_value_by_name('ComposeClicks', v); }

    get ClickSmallCommand()    { return this._get_property_value_by_name('ClickSmallCommand'); }
    get ClickDefaultCommand()  { return this._get_property_value_by_name('ClickDefaultCommand'); }
    get ClickLargeCommand()    { return this._get_property_value_by_name('ClickLargeCommand'); }
    get ClickExtendedCommand() { return this._get_property_value_by_name('ClickExtendedCommand'); }
    get ClickComposeCommand()  { return this._get_property_value_by_name('ClickComposeCommand'); }

    constructor() {
        super();
        this._set_property_value_by_name('ClickSmallCommand',    new RelayCommand(() => { this.SmallClicks    += 1; }));
        this._set_property_value_by_name('ClickDefaultCommand',  new RelayCommand(() => { this.DefaultClicks  += 1; }));
        this._set_property_value_by_name('ClickLargeCommand',    new RelayCommand(() => { this.LargeClicks    += 1; }));
        this._set_property_value_by_name('ClickExtendedCommand', new RelayCommand(() => { this.ExtendedClicks += 1; }));
        this._set_property_value_by_name('ClickComposeCommand',  new RelayCommand(() => { this.ComposeClicks  += 1; }));
    }
}
