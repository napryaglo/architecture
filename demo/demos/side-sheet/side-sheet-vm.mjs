// SideSheetVM — backs the side-sheet demo. IsOpen (TwoWay to the Modal
// SideSheet) drives the overlay; the Open command raises it, while the
// sheet's own close button / scrim lower it — and, because SideSheet.IsOpen
// binds TwoWay, the VM stays in sync so Open works again after a dismiss.
import { Model, MetaData, RelayCommand } from '@visualisation-sub/mural/runtime';
export class SideSheetVM extends Model {
    static IsOpenKey = Model.RegisterProperty(SideSheetVM, 'IsOpen', false, MetaData.None);
    static OpenKey = Model.RegisterProperty(SideSheetVM, 'Open', null, MetaData.None);
    get IsOpen() { return this.get_property_value(SideSheetVM.IsOpenKey); }
    set IsOpen(v) { this.set_property_value(SideSheetVM.IsOpenKey, v); }
    get Open() { return this.get_property_value(SideSheetVM.OpenKey); }
    constructor() {
        super();
        this.set_property_value(SideSheetVM.OpenKey, new RelayCommand(() => { this.IsOpen = true; }));
    }
}
