// BottomAppBarVM — backs the bottom-app-bar demo. LastAction echoes which
// action (or the FAB) was tapped last; Tap is a single parameterised
// RelayCommand every action button invokes with its own label, so the
// BottomAppBar's Actions row + FloatingAction slot are visibly live
// without a command-per-button.
import { MuralBase, MetaData, RelayCommand } from '@pragmatic-tech-ai/mural/runtime';
export class BottomAppBarVM extends MuralBase {
    static LastActionKey = MuralBase.RegisterProperty(BottomAppBarVM, 'LastAction', '—', MetaData.None);
    static TapKey = MuralBase.RegisterProperty(BottomAppBarVM, 'Tap', null, MetaData.None);
    get LastAction() { return this.get_property_value(BottomAppBarVM.LastActionKey); }
    set LastAction(v) { this.set_property_value(BottomAppBarVM.LastActionKey, v); }
    get Tap() { return this.get_property_value(BottomAppBarVM.TapKey); }
    constructor() {
        super();
        this.set_property_value(BottomAppBarVM.TapKey, new RelayCommand((p) => { this.LastAction = p ?? '—'; }));
    }
}
