import { DatePickerVM } from "./date-picker-vm.mjs";
import { Border, DataTemplate, Orientation, StackPanel, TextBlock } from "@pragmatic-lab/mural/basic";
import { DatePicker } from "@pragmatic-lab/mural/framework/pickers/date-picker.js";
import { DataContextBinding, DynamicResource, HorizontalAlignment, ResourceDictionary, Thickness, VerticalAlignment } from "@pragmatic-lab/mural/runtime";
import { FontWeight, Pen } from "@pragmatic-lab/mural/visual-engine";


const _gate_DatePickerDemo = Symbol("DatePickerDemo.ctor");
export class DatePickerDemo extends ResourceDictionary {
    constructor(_g) {
        super();
        if (_g !== _gate_DatePickerDemo) {
            throw new Error("DatePickerDemo is private — use DatePickerDemo.Clone()");
        }
    }
    static Clone() {
        const t = new DatePickerDemo(_gate_DatePickerDemo);
        const _tmpl0 = new DataTemplate((_data) => {
            const _border1 = new Border();
            _border1.set_property_value(Border.FillKey, DynamicResource(_border1, "Surface"));
            _border1.set_property_value(Border.StrokeKey, ((_e) => { _e.Brush = DynamicResource(_e, "OutlineVariant"); return _e; })(new Pen()));
            _border1.set_property_value(Border.BorderThicknessKey, new Thickness(1));
            const _stackPanel2 = new StackPanel();
            _stackPanel2.set_property_value(StackPanel.OrientationKey, Orientation.Vertical);
            _stackPanel2.set_property_value(StackPanel.MarginKey, new Thickness(32, 32, 32, 32));
            const _textBlock3 = new TextBlock();
            _textBlock3.set_property_value(TextBlock.TextKey, "DatePicker — M3 Docked calendar (month paging + day selection)");
            _textBlock3.set_property_value(TextBlock.StyleKey, DynamicResource(_textBlock3, "TitleMedium"));
            _textBlock3.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock3, "OnSurface"));
            _textBlock3.set_property_value(TextBlock.MarginKey, new Thickness(0, 0, 0, 24));
            _stackPanel2.AddChild(_textBlock3);
            const _datePicker4 = new DatePicker();
            _datePicker4.set_property_value(DatePicker.SelectedDateKey, DataContextBinding(_datePicker4, "SelectedDate"));
            _datePicker4.set_property_value(DatePicker.HorizontalAlignmentKey, HorizontalAlignment.Left);
            _stackPanel2.AddChild(_datePicker4);
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
            _textBlock7.set_property_value(TextBlock.TextKey, DataContextBinding(_textBlock7, "SelectedLabel"));
            _textBlock7.set_property_value(TextBlock.StyleKey, DynamicResource(_textBlock7, "BodyMedium"));
            _textBlock7.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _textBlock7.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock7, "OnSurface"));
            _textBlock7.set_property_value(TextBlock.VerticalAlignmentKey, VerticalAlignment.Center);
            _stackPanel5.AddChild(_textBlock7);
            _stackPanel2.AddChild(_stackPanel5);
            _border1.SetChild(_stackPanel2);
            return _border1;
        }, DatePickerVM);
        t.Set(DatePickerVM, _tmpl0);
        return t;
    }
}
