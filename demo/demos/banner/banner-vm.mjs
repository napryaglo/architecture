// BannerVM — backs the banner demo. Dismissed is a reactive boolean the
// template binds to (collapsing the Banner when the action fires); the
// Dismiss / Restore RelayCommands the markup wires to the trailing action
// Button and a Restore button so the in-flow Banner can be shown again.
import { Model, MetaData, RelayCommand } from '@visualisation-sub/mural/runtime';
export class BannerVM extends Model {
    static DismissedKey = Model.RegisterProperty(BannerVM, 'Dismissed', false, MetaData.None);
    static DismissKey = Model.RegisterProperty(BannerVM, 'Dismiss', null, MetaData.None);
    static RestoreKey = Model.RegisterProperty(BannerVM, 'Restore', null, MetaData.None);
    get Dismissed() { return this.get_property_value(BannerVM.DismissedKey); }
    set Dismissed(v) { this.set_property_value(BannerVM.DismissedKey, v); }
    get Dismiss() { return this.get_property_value(BannerVM.DismissKey); }
    get Restore() { return this.get_property_value(BannerVM.RestoreKey); }
    constructor() {
        super();
        this.set_property_value(BannerVM.DismissKey, new RelayCommand(() => { this.Dismissed = true; }));
        this.set_property_value(BannerVM.RestoreKey, new RelayCommand(() => { this.Dismissed = false; }));
    }
}
