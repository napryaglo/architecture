// TimePickerVM — backs the time-picker demo. Hour (0-23) + Minute bind
// TwoWay to the dial; TimeLabel echoes the picked time in 12h form,
// refreshed from OnPropertyChanged so both direct and binding-driven
// writes update it.
import { MuralBase, MetaData, type PropertyDescriptor } from '@pragmatic-tech-ai/mural/runtime';

export class TimePickerVM extends MuralBase
{
    static HourKey      = MuralBase.RegisterProperty<number>(TimePickerVM, 'Hour', 9, MetaData.None);
    static MinuteKey    = MuralBase.RegisterProperty<number>(TimePickerVM, 'Minute', 30, MetaData.None);
    static TimeLabelKey = MuralBase.RegisterProperty<string>(TimePickerVM, 'TimeLabel', '', MetaData.None);

    get Hour():      number { return this.get_property_value(TimePickerVM.HourKey); }
    set Hour(v:      number) { this.set_property_value(TimePickerVM.HourKey, v); }
    get Minute():    number { return this.get_property_value(TimePickerVM.MinuteKey); }
    set Minute(v:    number) { this.set_property_value(TimePickerVM.MinuteKey, v); }
    get TimeLabel(): string { return this.get_property_value(TimePickerVM.TimeLabelKey); }
    set TimeLabel(v: string) { this.set_property_value(TimePickerVM.TimeLabelKey, v); }

    constructor()
    {
        super();
        this.refresh();
    }

    private refresh(): void
    {
        const h = this.Hour;
        const h12 = (h % 12) === 0 ? 12 : (h % 12);
        const ampm = h < 12 ? 'AM' : 'PM';
        this.TimeLabel = `${h12}:${this.Minute.toString().padStart(2, '0')} ${ampm}`;
    }

    protected override OnPropertyChanged(descriptor: PropertyDescriptor, oldValue: unknown, newValue: unknown): void
    {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        if (descriptor.Name === 'Hour' || descriptor.Name === 'Minute') this.refresh();
    }
}
