// StatusBarVM — backs the status-bar demo. Holds the status text the
// strip displays, a modified flag, an item-count number, and command
// hooks that flip them.
//
// Strict MVVM: no Visual construction, no view-tree reads, no host
// globals — every piece of state the view shows is a DP, every
// interaction is a command, the only side effect is mutating DPs.
//
// Commands are registered as DPs (not plain JS properties) so the
// markup-side `$AddItemCommand` etc. resolve via DataContextBinding,
// which only walks registered DPs on Models. CounterVM uses the same
// shape for the same reason.

import {
    MetaData,
    Model,
    RelayCommand,
} from '@visualisation-sub/mural/runtime';

export class StatusBarVM extends Model
{
    static {
        Model.RegisterProperty(StatusBarVM, 'StatusText',        'Ready', MetaData.None);
        Model.RegisterProperty(StatusBarVM, 'IsModified',        false,   MetaData.None);
        Model.RegisterProperty(StatusBarVM, 'ItemCount',         0,       MetaData.None);
        Model.RegisterProperty(StatusBarVM, 'LastAction',        '—',     MetaData.None);
        Model.RegisterProperty(StatusBarVM, 'AddItemCommand',    undefined, MetaData.None);
        Model.RegisterProperty(StatusBarVM, 'RemoveItemCommand', undefined, MetaData.None);
        Model.RegisterProperty(StatusBarVM, 'SaveCommand',       undefined, MetaData.None);
    }

    get StatusText()        { return this._get_property_value_by_name('StatusText'); }
    set StatusText(v)       { this._set_property_value_by_name('StatusText', v); }
    get IsModified()        { return this._get_property_value_by_name('IsModified'); }
    set IsModified(v)       { this._set_property_value_by_name('IsModified', v); }
    get ItemCount()         { return this._get_property_value_by_name('ItemCount'); }
    set ItemCount(v)        { this._set_property_value_by_name('ItemCount', v); }
    get LastAction()        { return this._get_property_value_by_name('LastAction'); }
    set LastAction(v)       { this._set_property_value_by_name('LastAction', v); }
    get AddItemCommand()    { return this._get_property_value_by_name('AddItemCommand'); }
    get RemoveItemCommand() { return this._get_property_value_by_name('RemoveItemCommand'); }
    get SaveCommand()       { return this._get_property_value_by_name('SaveCommand'); }

    constructor()
    {
        super();
        // Three demo actions that mutate the status strip in different
        // ways so the user can see each cell react independently.
        const removeCmd = new RelayCommand(
            () => {
                this.ItemCount  = Math.max(0, this.ItemCount - 1);
                this.IsModified = this.ItemCount > 0;
                this.StatusText = this.ItemCount === 0 ? 'Cleared' : 'Item removed';
                this.LastAction = 'Remove';
            },
            // Selection-gated: only when there's something to remove.
            () => this.ItemCount > 0,
        );
        this._set_property_value_by_name('AddItemCommand', new RelayCommand(() => {
            this.ItemCount  = this.ItemCount + 1;
            this.IsModified = true;
            this.StatusText = 'Item added';
            this.LastAction = 'Add';
        }));
        this._set_property_value_by_name('RemoveItemCommand', removeCmd);
        this._set_property_value_by_name('SaveCommand', new RelayCommand(() => {
            this.IsModified = false;
            this.StatusText = 'Saved';
            this.LastAction = 'Save';
        }));
        // Refresh Remove's CanExecute whenever the count changes so its
        // chrome dims / undims live.
        this._add_property_changed_listener_by_name('ItemCount', () => {
            removeCmd.RaiseCanExecuteChanged();
        });
    }
}
