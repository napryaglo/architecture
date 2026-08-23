import { CounterVM } from "./counter-vm.mjs";
import { Border, Canvas, DataTemplate, TextBlock, TextWrapping } from "@pragmatic-lab/mural/basic";
import { Button } from "@pragmatic-lab/mural/framework/buttons/button.js";
import { ComboBox } from "@pragmatic-lab/mural/framework/list/combo-box.js";
import { DataContextBinding, DynamicResource, MultiBinding, ResourceDictionary } from "@pragmatic-lab/mural/runtime";
import { FontWeight, Pen } from "@pragmatic-lab/mural/visual-engine";


const _gate_CounterDemo = Symbol("CounterDemo.ctor");
export class CounterDemo extends ResourceDictionary {
    constructor(_g) {
        super();
        if (_g !== _gate_CounterDemo) {
            throw new Error("CounterDemo is private — use CounterDemo.Clone()");
        }
    }
    static Clone() {
        const t = new CounterDemo(_gate_CounterDemo);
        const _tmpl0 = new DataTemplate((_data) => {
            const _border1 = new Border();
            _border1.set_property_value(Border.FillKey, DynamicResource(_border1, "Surface"));
            _border1.set_property_value(Border.StrokeKey, ((_e) => { _e.Brush = DynamicResource(_e, "OutlineVariant"); return _e; })(new Pen()));
            const _canvas2 = new Canvas();
            const _textBlock3 = new TextBlock();
            _textBlock3.set_property_value(Canvas.LeftKey, 24);
            _textBlock3.set_property_value(Canvas.TopKey, 20);
            _textBlock3.set_property_value(TextBlock.FontSizeKey, 14);
            _textBlock3.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock3, "OnSurfaceVariant"));
            _textBlock3.set_property_value(TextBlock.TextKey, "Counter:");
            _canvas2.AddChild(_textBlock3);
            const _textBlock4 = new TextBlock();
            _textBlock4.set_property_value(Canvas.LeftKey, 24);
            _textBlock4.set_property_value(Canvas.TopKey, 40);
            _textBlock4.set_property_value(TextBlock.FontSizeKey, 42);
            _textBlock4.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _textBlock4.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock4, "Primary"));
            _textBlock4.set_property_value(TextBlock.TextKey, MultiBinding(_textBlock4, ["Count"], (_p0) => ( String(_p0) )));
            _canvas2.AddChild(_textBlock4);
            const _textBlock5 = new TextBlock();
            _textBlock5.set_property_value(Canvas.LeftKey, 170);
            _textBlock5.set_property_value(Canvas.TopKey, 124);
            _textBlock5.set_property_value(TextBlock.FontSizeKey, 12);
            _textBlock5.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock5, "OnSurfaceVariant"));
            _textBlock5.set_property_value(TextBlock.TextKey, "Step:");
            _canvas2.AddChild(_textBlock5);
            const _comboBox6 = new ComboBox();
            _comboBox6.set_property_value(Canvas.LeftKey, 170);
            _comboBox6.set_property_value(Canvas.TopKey, 140);
            _comboBox6.set_property_value(ComboBox.WidthKey, 164);
            _comboBox6.set_property_value(ComboBox.ItemsKey, DataContextBinding(_comboBox6, "Steps"));
            _comboBox6.set_property_value(ComboBox.SelectedItemKey, DataContextBinding(_comboBox6, "Step"));
            _canvas2.AddChild(_comboBox6);
            const _button7 = new Button();
            _button7.set_property_value(Canvas.LeftKey, 24);
            _button7.set_property_value(Canvas.TopKey, 140);
            _button7.set_property_value(Button.WidthKey, 80);
            _button7.set_property_value(Button.CommandKey, DataContextBinding(_button7, "Increment"));
            const _textBlock8 = new TextBlock();
            _textBlock8.set_property_value(TextBlock.TextKey, "+ Step");
            _button7.Content = _textBlock8;
            _canvas2.AddChild(_button7);
            const _button9 = new Button();
            _button9.set_property_value(Canvas.LeftKey, 24);
            _button9.set_property_value(Canvas.TopKey, 190);
            _button9.set_property_value(Button.WidthKey, 80);
            _button9.set_property_value(Button.CommandKey, DataContextBinding(_button9, "Reset"));
            const _textBlock10 = new TextBlock();
            _textBlock10.set_property_value(TextBlock.TextKey, "Reset");
            _button9.Content = _textBlock10;
            _canvas2.AddChild(_button9);
            const _textBlock11 = new TextBlock();
            _textBlock11.set_property_value(Canvas.LeftKey, 24);
            _textBlock11.set_property_value(Canvas.TopKey, 232);
            _textBlock11.set_property_value(TextBlock.WidthKey, 312);
            _textBlock11.set_property_value(TextBlock.FontSizeKey, 12);
            _textBlock11.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock11, "OnSurfaceVariant"));
            _textBlock11.set_property_value(TextBlock.TextWrappingKey, TextWrapping.Wrap);
            _textBlock11.set_property_value(TextBlock.TextKey, "The ComboBox sets Step. Increment adds Step to Count and stops at 10. Reset always works.");
            _canvas2.AddChild(_textBlock11);
            _border1.SetChild(_canvas2);
            return _border1;
        }, CounterVM);
        t.Set(CounterVM, _tmpl0);
        return t;
    }
}
