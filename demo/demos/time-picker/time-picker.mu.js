import { TimePickerVM } from "./time-picker-vm.mjs";
import { Border, DataTemplate, Orientation, StackPanel, TextBlock } from "@visualisation-sub/mural/basic";
import { TimePicker } from "@visualisation-sub/mural/framework/pickers/time-picker.js";
import { DataContextBinding, DynamicResource, HorizontalAlignment, ResourceDictionary, Thickness, VerticalAlignment } from "@visualisation-sub/mural/runtime";
import { FontWeight } from "@visualisation-sub/mural/visual-engine";


const _gate_TimePickerDemo = Symbol("TimePickerDemo.ctor");
export class TimePickerDemo extends ResourceDictionary {
    constructor(_g) {
        super();
        if (_g !== _gate_TimePickerDemo) {
            throw new Error("TimePickerDemo is private — use TimePickerDemo.Clone()");
        }
    }
    static Clone() {
        const t = new TimePickerDemo(_gate_TimePickerDemo);
        const _tmpl0 = new DataTemplate((_data) => {
            const _border1 = new Border();
            _border1.set_property_value(Border.BackgroundKey, DynamicResource(_border1, "Surface"));
            _border1.set_property_value(Border.BorderBrushKey, DynamicResource(_border1, "OutlineVariant"));
            _border1.set_property_value(Border.BorderThicknessKey, new Thickness(1));
            const _stackPanel2 = new StackPanel();
            _stackPanel2.set_property_value(StackPanel.OrientationKey, Orientation.Vertical);
            _stackPanel2.set_property_value(StackPanel.MarginKey, new Thickness(32, 32, 32, 32));
            const _textBlock3 = new TextBlock();
            _textBlock3.set_property_value(TextBlock.TextKey, "TimePicker — M3 analog clock dial (hour / minute rings + AM/PM)");
            _textBlock3.set_property_value(TextBlock.StyleKey, DynamicResource(_textBlock3, "TitleMedium"));
            _textBlock3.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock3, "OnSurface"));
            _textBlock3.set_property_value(TextBlock.MarginKey, new Thickness(0, 0, 0, 24));
            _stackPanel2.AddChild(_textBlock3);
            const _timePicker4 = new TimePicker();
            _timePicker4.set_property_value(TimePicker.HourKey, DataContextBinding(_timePicker4, "Hour"));
            _timePicker4.set_property_value(TimePicker.MinuteKey, DataContextBinding(_timePicker4, "Minute"));
            _timePicker4.set_property_value(TimePicker.HorizontalAlignmentKey, HorizontalAlignment.Left);
            _stackPanel2.AddChild(_timePicker4);
            const _stackPanel5 = new StackPanel();
            _stackPanel5.set_property_value(StackPanel.OrientationKey, Orientation.Horizontal);
            _stackPanel5.set_property_value(StackPanel.MarginKey, new Thickness(0, 24, 0, 0));
            const _textBlock6 = new TextBlock();
            _textBlock6.set_property_value(TextBlock.TextKey, "Selected: ");
            _textBlock6.set_property_value(TextBlock.StyleKey, DynamicResource(_textBlock6, "BodyMedium"));
            _textBlock6.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock6, "OnSurfaceVariant"));
            _textBlock6.set_property_value(TextBlock.VerticalAlignmentKey, VerticalAlignment.Center);
            _stackPanel5.AddChild(_textBlock6);
            const _textBlock7 = new TextBlock();
            _textBlock7.set_property_value(TextBlock.TextKey, DataContextBinding(_textBlock7, "TimeLabel"));
            _textBlock7.set_property_value(TextBlock.StyleKey, DynamicResource(_textBlock7, "BodyMedium"));
            _textBlock7.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _textBlock7.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock7, "OnSurface"));
            _textBlock7.set_property_value(TextBlock.VerticalAlignmentKey, VerticalAlignment.Center);
            _stackPanel5.AddChild(_textBlock7);
            _stackPanel2.AddChild(_stackPanel5);
            _border1.SetChild(_stackPanel2);
            return _border1;
        }, TimePickerVM);
        t.Set(TimePickerVM, _tmpl0);
        return t;
    }
}
