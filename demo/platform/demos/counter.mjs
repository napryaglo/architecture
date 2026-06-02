// counter demo — Button + ICommand + ComboBox. The platform factory
// builds a fresh CounterVM the first time the demo is activated and
// wires the ComboBox SelectedItem → VM.Step back-channel (mural's
// DataContextBinding is OneWay only). Subsequent activations re-use
// the same VM, so the user's counter / step survive a nav trip away
// and back.
import { app } from '../../counter.mu.js';
import { MetaData, Model, RelayCommand } from '@visualisation-sub/mural/runtime';
import { ComboBox } from '@visualisation-sub/mural/Controls';
import { register } from '../registry.mjs';

class CounterVM extends Model {
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

function findFirstByType(visual, ctor) {
    if (visual instanceof ctor) return visual;
    for (const child of visual.visualChildren) {
        const hit = findFirstByType(child, ctor);
        if (hit !== undefined) return hit;
    }
    return undefined;
}

let initialized = false;

register({
    id:       'counter',
    group:    'Patterns',
    title:    'Counter',
    subtitle: 'Button + ICommand + ComboBox. Increment.CanExecute gates the button at 10.',
    factory: () => {
        if (!initialized) {
            const vm = new CounterVM();
            app.Root.DataContext = vm;
            // ComboBox → VM.Step back-channel. Run on a microtask so
            // the visual tree is wired before we hook AddPropertyChanged.
            queueMicrotask(() => {
                const combo = findFirstByType(app.Root, ComboBox);
                if (combo !== undefined) {
                    combo.AddPropertyChangedListener('SelectedItem', () => {
                        const v = combo.SelectedItem;
                        if (typeof v === 'number') vm.Step = v;
                    });
                }
            });
            initialized = true;
        }
        return app.Root;
    },
});
