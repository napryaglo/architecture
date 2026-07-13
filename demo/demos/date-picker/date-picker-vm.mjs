// DatePickerVM — backs the date-picker demo. SelectedDate binds TwoWay to
// the DatePicker; SelectedLabel echoes the picked day. Because the picker
// writes SelectedDate through the binding (bypassing the JS setter), the
// label is refreshed from OnPropertyChanged, which fires on every write —
// direct or binding-driven.
import { Model, MetaData } from 'mural/runtime';
export class DatePickerVM extends Model {
    static SelectedDateKey = Model.RegisterProperty(DatePickerVM, 'SelectedDate', undefined, MetaData.None);
    static SelectedLabelKey = Model.RegisterProperty(DatePickerVM, 'SelectedLabel', 'No date selected', MetaData.None);
    get SelectedDate() { return this.get_property_value(DatePickerVM.SelectedDateKey); }
    set SelectedDate(v) { this.set_property_value(DatePickerVM.SelectedDateKey, v); }
    get SelectedLabel() { return this.get_property_value(DatePickerVM.SelectedLabelKey); }
    set SelectedLabel(v) { this.set_property_value(DatePickerVM.SelectedLabelKey, v); }
    OnPropertyChanged(descriptor, oldValue, newValue) {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        if (descriptor.Name === 'SelectedDate') {
            const d = this.SelectedDate;
            this.SelectedLabel = d !== undefined ? d.toDateString() : 'No date selected';
        }
    }
}
