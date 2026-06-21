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

    get IsOpen()         { return this.get_property_value(FabMenuVM.IsOpenKey); }
    set IsOpen(v)        { this.set_property_value(FabMenuVM.IsOpenKey, v); }
    get Items()          { return this.get_property_value(FabMenuVM.ItemsKey); }
    set Items(v)         { this.set_property_value(FabMenuVM.ItemsKey, v); }

    get CreateClicks()   { return this.get_property_value(FabMenuVM.CreateClicksKey); }
    set CreateClicks(v)  { this.set_property_value(FabMenuVM.CreateClicksKey, v); }
    get UploadClicks()   { return this.get_property_value(FabMenuVM.UploadClicksKey); }
    set UploadClicks(v)  { this.set_property_value(FabMenuVM.UploadClicksKey, v); }
    get ShareClicks()    { return this.get_property_value(FabMenuVM.ShareClicksKey); }
    set ShareClicks(v)   { this.set_property_value(FabMenuVM.ShareClicksKey, v); }

    get CreateCommand()  { return this.get_property_value(FabMenuVM.CreateCommandKey); }
    get UploadCommand()  { return this.get_property_value(FabMenuVM.UploadCommandKey); }
    get ShareCommand()   { return this.get_property_value(FabMenuVM.ShareCommandKey); }

    constructor() {
        super();
        this.set_property_value(FabMenuVM.CreateCommandKey,
            new RelayCommand(() => { this.CreateClicks += 1; this.IsOpen = false; }));
        this.set_property_value(FabMenuVM.UploadCommandKey,
            new RelayCommand(() => { this.UploadClicks += 1; this.IsOpen = false; }));
        this.set_property_value(FabMenuVM.ShareCommandKey,
            new RelayCommand(() => { this.ShareClicks  += 1; this.IsOpen = false; }));
    }
}
