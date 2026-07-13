// DatePickerVM — backs the date-picker demo. SelectedDate binds TwoWay to
// the DatePicker; SelectedLabel echoes the picked day. Because the picker
// writes SelectedDate through the binding (bypassing the JS setter), the
// label is refreshed from OnPropertyChanged, which fires on every write —
// direct or binding-driven.
import { Model, MetaData, type PropertyDescriptor } from '@pragmatic-lab/mural/runtime';

export class DatePickerVM extends Model
{
    static SelectedDateKey  = Model.RegisterProperty<Date | undefined>(DatePickerVM, 'SelectedDate', undefined, MetaData.None);
    static SelectedLabelKey = Model.RegisterProperty<string>(DatePickerVM, 'SelectedLabel', 'No date selected', MetaData.None);

    get SelectedDate():  Date | undefined { return this.get_property_value(DatePickerVM.SelectedDateKey); }
    set SelectedDate(v:  Date | undefined) { this.set_property_value(DatePickerVM.SelectedDateKey, v); }

    get SelectedLabel(): string { return this.get_property_value(DatePickerVM.SelectedLabelKey); }
    set SelectedLabel(v: string) { this.set_property_value(DatePickerVM.SelectedLabelKey, v); }

    protected override OnPropertyChanged(descriptor: PropertyDescriptor, oldValue: unknown, newValue: unknown): void
    {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        if (descriptor.Name === 'SelectedDate')
        {
            const d = this.SelectedDate;
            this.SelectedLabel = d !== undefined ? d.toDateString() : 'No date selected';
        }
    }
}
