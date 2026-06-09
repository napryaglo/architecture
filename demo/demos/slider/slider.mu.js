import { SliderVM } from "./slider-vm.mjs";
import { Border, DataTemplate, Dock, DockPanel, Orientation, Slider, StackPanel, TextBlock } from "@visualisation-sub/mural/Basic";
import { DynamicResource, ResourceDictionary, Thickness } from "@visualisation-sub/mural/runtime";
import { FontWeight } from "@visualisation-sub/mural/visual-engine";


const _gate_SliderDemo = Symbol("SliderDemo.ctor");
export class SliderDemo extends ResourceDictionary {
    constructor(_g) {
        super();
        if (_g !== _gate_SliderDemo) {
            throw new Error("SliderDemo is private — use SliderDemo.Clone()");
        }
    }
    static Clone() {
        const t = new SliderDemo(_gate_SliderDemo);
        const _tmpl0 = new DataTemplate((_data) => {
            const _border1 = new Border();
            _border1._set_property_value_by_name("Background", DynamicResource(_border1, "Surface"));
            _border1._set_property_value_by_name("BorderBrush", DynamicResource(_border1, "OutlineVariant"));
            _border1._set_property_value_by_name("BorderThickness", new Thickness(1));
            const _dockPanel2 = new DockPanel();
            const _border3 = new Border();
            _border3._set_property_value_by_name(DockPanel, "Dock", Dock.Top);
            _border3._set_property_value_by_name("Background", DynamicResource(_border3, "Primary"));
            _border3._set_property_value_by_name("Padding", new Thickness(16, 12, 16, 12));
            const _textBlock4 = new TextBlock();
            _textBlock4._set_property_value_by_name("Text", "Slider demo — single-thumb range, horizontal + vertical");
            _textBlock4._set_property_value_by_name("FontSize", 15);
            _textBlock4._set_property_value_by_name("FontWeight", FontWeight.Bold);
            _textBlock4._set_property_value_by_name("Foreground", DynamicResource(_textBlock4, "OnPrimary"));
            _border3.SetChild(_textBlock4);
            _dockPanel2.AddChild(_border3);
            const _stackPanel5 = new StackPanel();
            _stackPanel5._set_property_value_by_name("Orientation", Orientation.Horizontal);
            const _stackPanel6 = new StackPanel();
            _stackPanel6._set_property_value_by_name("Orientation", Orientation.Vertical);
            _stackPanel6._set_property_value_by_name("Width", 240);
            _stackPanel6._set_property_value_by_name("Margin", new Thickness(16, 24, 8, 16));
            const _textBlock7 = new TextBlock();
            _textBlock7._set_property_value_by_name("Text", "Brightness (0–1):");
            _textBlock7._set_property_value_by_name("FontSize", 12);
            _textBlock7._set_property_value_by_name("FontWeight", FontWeight.Bold);
            _textBlock7._set_property_value_by_name("Margin", new Thickness(0, 0, 0, 12));
            _stackPanel6.AddChild(_textBlock7);
            const _slider8 = new Slider();
            _slider8._set_property_value_by_name("Width", 200);
            _slider8._set_property_value_by_name("Value", 0.6);
            _stackPanel6.AddChild(_slider8);
            const _textBlock9 = new TextBlock();
            _textBlock9._set_property_value_by_name("Text", "Default 0..1 range; SmallChange 0.01, LargeChange 0.1.");
            _textBlock9._set_property_value_by_name("FontSize", 11);
            _textBlock9._set_property_value_by_name("Foreground", DynamicResource(_textBlock9, "OnSurfaceVariant"));
            _textBlock9._set_property_value_by_name("Margin", new Thickness(0, 12, 0, 0));
            _stackPanel6.AddChild(_textBlock9);
            _stackPanel5.AddChild(_stackPanel6);
            const _stackPanel10 = new StackPanel();
            _stackPanel10._set_property_value_by_name("Orientation", Orientation.Vertical);
            _stackPanel10._set_property_value_by_name("Width", 240);
            _stackPanel10._set_property_value_by_name("Margin", new Thickness(8, 24, 8, 16));
            const _textBlock11 = new TextBlock();
            _textBlock11._set_property_value_by_name("Text", "Volume (0–11):");
            _textBlock11._set_property_value_by_name("FontSize", 12);
            _textBlock11._set_property_value_by_name("FontWeight", FontWeight.Bold);
            _textBlock11._set_property_value_by_name("Margin", new Thickness(0, 0, 0, 12));
            _stackPanel10.AddChild(_textBlock11);
            const _slider12 = new Slider();
            _slider12._set_property_value_by_name("Width", 200);
            _slider12._set_property_value_by_name("Minimum", 0);
            _slider12._set_property_value_by_name("Maximum", 11);
            _slider12._set_property_value_by_name("Value", 7);
            _slider12._set_property_value_by_name("SmallChange", 1);
            _slider12._set_property_value_by_name("LargeChange", 2);
            _stackPanel10.AddChild(_slider12);
            const _textBlock13 = new TextBlock();
            _textBlock13._set_property_value_by_name("Text", "Arrow ±1, Page ±2, Home / End snap to 0 / 11.");
            _textBlock13._set_property_value_by_name("FontSize", 11);
            _textBlock13._set_property_value_by_name("Foreground", DynamicResource(_textBlock13, "OnSurfaceVariant"));
            _textBlock13._set_property_value_by_name("Margin", new Thickness(0, 12, 0, 0));
            _stackPanel10.AddChild(_textBlock13);
            _stackPanel5.AddChild(_stackPanel10);
            const _stackPanel14 = new StackPanel();
            _stackPanel14._set_property_value_by_name("Orientation", Orientation.Vertical);
            _stackPanel14._set_property_value_by_name("Width", 240);
            _stackPanel14._set_property_value_by_name("Margin", new Thickness(8, 24, 16, 16));
            const _textBlock15 = new TextBlock();
            _textBlock15._set_property_value_by_name("Text", "Mix (vertical):");
            _textBlock15._set_property_value_by_name("FontSize", 12);
            _textBlock15._set_property_value_by_name("FontWeight", FontWeight.Bold);
            _textBlock15._set_property_value_by_name("Margin", new Thickness(0, 0, 0, 12));
            _stackPanel14.AddChild(_textBlock15);
            const _slider16 = new Slider();
            _slider16._set_property_value_by_name("Orientation", Orientation.Vertical);
            _slider16._set_property_value_by_name("Height", 200);
            _slider16._set_property_value_by_name("Value", 0.35);
            _stackPanel14.AddChild(_slider16);
            const _textBlock17 = new TextBlock();
            _textBlock17._set_property_value_by_name("Text", "Up = higher; thumb sits at Min when at the bottom.");
            _textBlock17._set_property_value_by_name("FontSize", 11);
            _textBlock17._set_property_value_by_name("Foreground", DynamicResource(_textBlock17, "OnSurfaceVariant"));
            _textBlock17._set_property_value_by_name("Margin", new Thickness(0, 12, 0, 0));
            _stackPanel14.AddChild(_textBlock17);
            _stackPanel5.AddChild(_stackPanel14);
            _dockPanel2.AddChild(_stackPanel5);
            _border1.SetChild(_dockPanel2);
            return _border1;
        }, SliderVM);
        t.Set("SliderTemplate", _tmpl0);
        return t;
    }
    get SliderTemplate() { return this.Resolve("SliderTemplate"); }
    set SliderTemplate(v) { this.Set("SliderTemplate", v); }
}
