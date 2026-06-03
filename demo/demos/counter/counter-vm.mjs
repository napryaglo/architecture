// CounterVM — the model the counter demo binds against. The .mu file
// (counter.mu) declares a DataTemplate parameterized by this type;
// ContentControl auto-resolves the template by matching
// CounterVM.constructor.name against the template's DataType.
import { MetaData, Model, RelayCommand } from '@visualisation-sub/mural/runtime';

export class CounterVM extends Model
{
    static {
        Model.RegisterProperty(CounterVM, 'Count',     0,         MetaData.None);
        Model.RegisterProperty(CounterVM, 'Step',      1,         MetaData.None);
        Model.RegisterProperty(CounterVM, 'Steps',     undefined, MetaData.None);
        Model.RegisterProperty(CounterVM, 'Increment', undefined, MetaData.None);
        Model.RegisterProperty(CounterVM, 'Reset',     undefined, MetaData.None);
    }

    get Count()     { return this._get_property_value_by_name('Count'); }
    set Count(v)    { this._set_property_value_by_name('Count', v); }
    get Step()      { return this._get_property_value_by_name('Step'); }
    set Step(v)     { this._set_property_value_by_name('Step', v); }
    get Steps()     { return this._get_property_value_by_name('Steps'); }
    get Increment() { return this._get_property_value_by_name('Increment'); }
    get Reset()     { return this._get_property_value_by_name('Reset'); }

    constructor() {
        super();
        this._set_property_value_by_name('Steps', Object.freeze([1, 2, 5]));
        const inc = new RelayCommand(
            () => { this.Count = Math.min(10, this.Count + this.Step); },
            () => this.Count < 10,
        );
        this._set_property_value_by_name('Increment', inc);
        this._set_property_value_by_name('Reset',
            new RelayCommand(() => { this.Count = 0; }));
        this._add_property_changed_listener_by_name('Count', () => {
            inc.RaiseCanExecuteChanged();
        });
    }
}
