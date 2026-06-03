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

    get Count()     { return this.get_property_value('Count'); }
    set Count(v)    { this.set_property_value('Count', v); }
    get Step()      { return this.get_property_value('Step'); }
    set Step(v)     { this.set_property_value('Step', v); }
    get Steps()     { return this.get_property_value('Steps'); }
    get Increment() { return this.get_property_value('Increment'); }
    get Reset()     { return this.get_property_value('Reset'); }

    constructor() {
        super();
        this.set_property_value('Steps', Object.freeze([1, 2, 5]));
        const inc = new RelayCommand(
            () => { this.Count = Math.min(10, this.Count + this.Step); },
            () => this.Count < 10,
        );
        this.set_property_value('Increment', inc);
        this.set_property_value('Reset',
            new RelayCommand(() => { this.Count = 0; }));
        this.AddPropertyChangedListener('Count', () => {
            inc.RaiseCanExecuteChanged();
        });
    }
}
