// CardVM — backs the card demo. One RelayCommand per variant button so
// the dynamic-binding chain is visible end-to-end and the cards' action
// row has a real handler attached.
import { Model, MetaData, RelayCommand } from '@visualisation-sub/mural/runtime';

export class CardVM extends Model
{
    static FilledActionsKey   = Model.RegisterProperty(CardVM, 'FilledActions',   0, MetaData.None);
    static ElevatedActionsKey = Model.RegisterProperty(CardVM, 'ElevatedActions', 0, MetaData.None);
    static OutlinedActionsKey = Model.RegisterProperty(CardVM, 'OutlinedActions', 0, MetaData.None);

    static FilledActionCommandKey   = Model.RegisterProperty(CardVM, 'FilledActionCommand',   null, MetaData.None);
    static ElevatedActionCommandKey = Model.RegisterProperty(CardVM, 'ElevatedActionCommand', null, MetaData.None);
    static OutlinedActionCommandKey = Model.RegisterProperty(CardVM, 'OutlinedActionCommand', null, MetaData.None);

    get FilledActions()    { return this._get_property_value_by_name('FilledActions'); }
    set FilledActions(v)   { this._set_property_value_by_name('FilledActions', v); }
    get ElevatedActions()  { return this._get_property_value_by_name('ElevatedActions'); }
    set ElevatedActions(v) { this._set_property_value_by_name('ElevatedActions', v); }
    get OutlinedActions()  { return this._get_property_value_by_name('OutlinedActions'); }
    set OutlinedActions(v) { this._set_property_value_by_name('OutlinedActions', v); }

    get FilledActionCommand()   { return this._get_property_value_by_name('FilledActionCommand'); }
    get ElevatedActionCommand() { return this._get_property_value_by_name('ElevatedActionCommand'); }
    get OutlinedActionCommand() { return this._get_property_value_by_name('OutlinedActionCommand'); }

    constructor() {
        super();
        this._set_property_value_by_name('FilledActionCommand',   new RelayCommand(() => { this.FilledActions   += 1; }));
        this._set_property_value_by_name('ElevatedActionCommand', new RelayCommand(() => { this.ElevatedActions += 1; }));
        this._set_property_value_by_name('OutlinedActionCommand', new RelayCommand(() => { this.OutlinedActions += 1; }));
    }
}
