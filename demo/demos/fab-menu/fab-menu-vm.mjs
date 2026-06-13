// FabMenuVM — backs the fab-menu demo. Tracks per-action click
// counts so the user can verify each mini-FAB in the popup fires
// through to a command target, and the FAB-toggle state for the
// read-out.
import { Model, MetaData, RelayCommand } from '@visualisation-sub/mural/runtime';

export class FabMenuVM extends Model
{
    static IsOpenKey         = Model.RegisterProperty(FabMenuVM, 'IsOpen',         false, MetaData.None);
    static ItemsKey          = Model.RegisterProperty(FabMenuVM, 'Items',          null,  MetaData.None);

    static CreateClicksKey   = Model.RegisterProperty(FabMenuVM, 'CreateClicks',   0, MetaData.None);
    static UploadClicksKey   = Model.RegisterProperty(FabMenuVM, 'UploadClicks',   0, MetaData.None);
    static ShareClicksKey    = Model.RegisterProperty(FabMenuVM, 'ShareClicks',    0, MetaData.None);

    static CreateCommandKey  = Model.RegisterProperty(FabMenuVM, 'CreateCommand',  null, MetaData.None);
    static UploadCommandKey  = Model.RegisterProperty(FabMenuVM, 'UploadCommand',  null, MetaData.None);
    static ShareCommandKey   = Model.RegisterProperty(FabMenuVM, 'ShareCommand',   null, MetaData.None);

    get IsOpen()         { return this._get_property_value_by_name('IsOpen'); }
    set IsOpen(v)        { this._set_property_value_by_name('IsOpen', v); }
    get Items()          { return this._get_property_value_by_name('Items'); }
    set Items(v)         { this._set_property_value_by_name('Items', v); }

    get CreateClicks()   { return this._get_property_value_by_name('CreateClicks'); }
    set CreateClicks(v)  { this._set_property_value_by_name('CreateClicks', v); }
    get UploadClicks()   { return this._get_property_value_by_name('UploadClicks'); }
    set UploadClicks(v)  { this._set_property_value_by_name('UploadClicks', v); }
    get ShareClicks()    { return this._get_property_value_by_name('ShareClicks'); }
    set ShareClicks(v)   { this._set_property_value_by_name('ShareClicks', v); }

    get CreateCommand()  { return this._get_property_value_by_name('CreateCommand'); }
    get UploadCommand()  { return this._get_property_value_by_name('UploadCommand'); }
    get ShareCommand()   { return this._get_property_value_by_name('ShareCommand'); }

    constructor() {
        super();
        this._set_property_value_by_name('CreateCommand',
            new RelayCommand(() => { this.CreateClicks += 1; this.IsOpen = false; }));
        this._set_property_value_by_name('UploadCommand',
            new RelayCommand(() => { this.UploadClicks += 1; this.IsOpen = false; }));
        this._set_property_value_by_name('ShareCommand',
            new RelayCommand(() => { this.ShareClicks  += 1; this.IsOpen = false; }));
    }
}
