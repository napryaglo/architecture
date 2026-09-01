// CardVM — backs the card demo. One RelayCommand per variant button so
// the dynamic-binding chain is visible end-to-end and the cards' action
// row has a real handler attached.
import { MuralBase, MetaData, RelayCommand } from '@pragmatic-tech-ai/mural/runtime';
export class CardVM extends MuralBase {
    static FilledActionsKey = MuralBase.RegisterProperty(CardVM, 'FilledActions', 0, MetaData.None);
    static ElevatedActionsKey = MuralBase.RegisterProperty(CardVM, 'ElevatedActions', 0, MetaData.None);
    static OutlinedActionsKey = MuralBase.RegisterProperty(CardVM, 'OutlinedActions', 0, MetaData.None);
    static FilledActionCommandKey = MuralBase.RegisterProperty(CardVM, 'FilledActionCommand', null, MetaData.None);
    static ElevatedActionCommandKey = MuralBase.RegisterProperty(CardVM, 'ElevatedActionCommand', null, MetaData.None);
    static OutlinedActionCommandKey = MuralBase.RegisterProperty(CardVM, 'OutlinedActionCommand', null, MetaData.None);
    get FilledActions() { return this.get_property_value(CardVM.FilledActionsKey); }
    set FilledActions(v) { this.set_property_value(CardVM.FilledActionsKey, v); }
    get ElevatedActions() { return this.get_property_value(CardVM.ElevatedActionsKey); }
    set ElevatedActions(v) { this.set_property_value(CardVM.ElevatedActionsKey, v); }
    get OutlinedActions() { return this.get_property_value(CardVM.OutlinedActionsKey); }
    set OutlinedActions(v) { this.set_property_value(CardVM.OutlinedActionsKey, v); }
    get FilledActionCommand() { return this.get_property_value(CardVM.FilledActionCommandKey); }
    get ElevatedActionCommand() { return this.get_property_value(CardVM.ElevatedActionCommandKey); }
    get OutlinedActionCommand() { return this.get_property_value(CardVM.OutlinedActionCommandKey); }
    constructor() {
        super();
        this.set_property_value(CardVM.FilledActionCommandKey, new RelayCommand(() => { this.FilledActions += 1; }));
        this.set_property_value(CardVM.ElevatedActionCommandKey, new RelayCommand(() => { this.ElevatedActions += 1; }));
        this.set_property_value(CardVM.OutlinedActionCommandKey, new RelayCommand(() => { this.OutlinedActions += 1; }));
    }
}
