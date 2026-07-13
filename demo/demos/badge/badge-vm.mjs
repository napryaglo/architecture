// BadgeVM — backs the badge demo. Count is a reactive number the Numeric
// badge binds to; Increment / Reset are RelayCommands the markup wires to
// its Buttons so the Count DP visibly drives the pill's label live.
import { Model, MetaData, RelayCommand } from '@pragmatic-lab/mural/runtime';
export class BadgeVM extends Model {
    static CountKey = Model.RegisterProperty(BadgeVM, 'Count', 3, MetaData.None);
    static IncrementKey = Model.RegisterProperty(BadgeVM, 'Increment', null, MetaData.None);
    static ResetKey = Model.RegisterProperty(BadgeVM, 'Reset', null, MetaData.None);
    get Count() { return this.get_property_value(BadgeVM.CountKey); }
    set Count(v) { this.set_property_value(BadgeVM.CountKey, v); }
    get Increment() { return this.get_property_value(BadgeVM.IncrementKey); }
    get Reset() { return this.get_property_value(BadgeVM.ResetKey); }
    constructor() {
        super();
        this.set_property_value(BadgeVM.IncrementKey, new RelayCommand(() => { this.Count += 1; }));
        this.set_property_value(BadgeVM.ResetKey, new RelayCommand(() => { this.Count = 0; }));
    }
}
