import { ToggleButtonVM } from "./toggle-button-vm.mjs";
import { Border, ContentPresenter, ControlTemplate, DataTemplate, Dock, DockPanel, Orientation, StackPanel, TargetedSetter, TemplatePropertyTrigger, TextBlock } from "@visualisation-sub/mural/basic";
import { ToggleButton } from "@visualisation-sub/mural/framework/toggle-button.js";
import { DataContextBinding, DynamicResource, ResourceDictionary, Setter, SetterFactory, Style, Thickness } from "@visualisation-sub/mural/runtime";
import { FontStyle, FontWeight } from "@visualisation-sub/mural/visual-engine";


const _gate_ToggleButtonDemo = Symbol("ToggleButtonDemo.ctor");
export class ToggleButtonDemo extends ResourceDictionary {
    constructor(_g) {
        super();
        if (_g !== _gate_ToggleButtonDemo) {
            throw new Error("ToggleButtonDemo is private — use ToggleButtonDemo.Clone()");
        }
    }
    static Clone() {
        const t = new ToggleButtonDemo(_gate_ToggleButtonDemo);
        const _tmpl0 = (() => {
            const _factory = (_templatedParent) => {
                const _border1 = new Border();
                _border1.Name = "PART_Border";
                _border1._set_property_value_by_name("Background", DynamicResource(_border1, "Surface"));
                _border1._set_property_value_by_name("BorderBrush", DynamicResource(_border1, "Outline"));
                _border1._set_property_value_by_name("BorderThickness", new Thickness(1));
                _border1._set_property_value_by_name("CornerRadius", DynamicResource(_border1, "ShapeSmall"));
                _border1._set_property_value_by_name("Padding", new Thickness(16, 8, 16, 8));
                const _contentPresenter2 = new ContentPresenter();
                _border1.SetChild(_contentPresenter2);
                return _border1;
            };
            const _tplSet3 = [new TargetedSetter(Border, "Background", new SetterFactory((_t) => DynamicResource(_t, "Primary")), "PART_Border"), new TargetedSetter(Border, "BorderBrush", new SetterFactory((_t) => DynamicResource(_t, "PrimaryPress")), "PART_Border")];
            const _tplTrig4 = new TemplatePropertyTrigger(ToggleButton, "IsChecked", true, _tplSet3, undefined);
            return new ControlTemplate(_factory, [_tplTrig4]);
        })();
        t.Set("ToggleChromeTemplate", _tmpl0);
        const _setter5 = new Setter(ToggleButton, "Template", _tmpl0);
        const _style6 = new Style(ToggleButton, [_setter5], undefined, [], []);
        t.Set("StyleToggle", _style6);
        const _tmpl7 = new DataTemplate((_data) => {
            const _border8 = new Border();
            _border8._set_property_value_by_name("Background", DynamicResource(_border8, "Surface"));
            _border8._set_property_value_by_name("BorderBrush", DynamicResource(_border8, "OutlineVariant"));
            _border8._set_property_value_by_name("BorderThickness", new Thickness(1));
            const _dockPanel9 = new DockPanel();
            const _border10 = new Border();
            _border10._set_property_value_by_name(DockPanel, "Dock", Dock.Top);
            _border10._set_property_value_by_name("Background", DynamicResource(_border10, "Primary"));
            _border10._set_property_value_by_name("Padding", new Thickness(16, 12, 16, 12));
            const _textBlock11 = new TextBlock();
            _textBlock11._set_property_value_by_name("Text", "ToggleButton — IsChecked flips on click; TwoWay binding keeps the VM in sync.");
            _textBlock11._set_property_value_by_name("FontSize", 15);
            _textBlock11._set_property_value_by_name("FontWeight", FontWeight.Bold);
            _textBlock11._set_property_value_by_name("Foreground", DynamicResource(_textBlock11, "OnPrimary"));
            _border10.SetChild(_textBlock11);
            _dockPanel9.AddChild(_border10);
            const _stackPanel12 = new StackPanel();
            _stackPanel12._set_property_value_by_name("Orientation", Orientation.Vertical);
            _stackPanel12._set_property_value_by_name("Margin", new Thickness(16, 16, 16, 16));
            const _stackPanel13 = new StackPanel();
            _stackPanel13._set_property_value_by_name("Orientation", Orientation.Horizontal);
            _stackPanel13._set_property_value_by_name("Margin", new Thickness(0, 0, 0, 16));
            const _toggleButton14 = new ToggleButton();
            _toggleButton14._set_property_value_by_name("Style", _style6);
            _toggleButton14._set_property_value_by_name("IsChecked", DataContextBinding(_toggleButton14, "IsBold"));
            _toggleButton14._set_property_value_by_name("Margin", new Thickness(0, 0, 8, 0));
            const _textBlock15 = new TextBlock();
            _textBlock15._set_property_value_by_name("Text", "B");
            _textBlock15._set_property_value_by_name("FontWeight", FontWeight.Bold);
            _textBlock15._set_property_value_by_name("Foreground", DynamicResource(_textBlock15, "OnSurface"));
            _toggleButton14.Content = _textBlock15;
            _stackPanel13.AddChild(_toggleButton14);
            const _toggleButton16 = new ToggleButton();
            _toggleButton16._set_property_value_by_name("Style", _style6);
            _toggleButton16._set_property_value_by_name("IsChecked", DataContextBinding(_toggleButton16, "IsItalic"));
            _toggleButton16._set_property_value_by_name("Margin", new Thickness(0, 0, 8, 0));
            const _textBlock17 = new TextBlock();
            _textBlock17._set_property_value_by_name("Text", "I");
            _textBlock17._set_property_value_by_name("FontStyle", FontStyle.Italic);
            _textBlock17._set_property_value_by_name("Foreground", DynamicResource(_textBlock17, "OnSurface"));
            _toggleButton16.Content = _textBlock17;
            _stackPanel13.AddChild(_toggleButton16);
            const _toggleButton18 = new ToggleButton();
            _toggleButton18._set_property_value_by_name("Style", _style6);
            _toggleButton18._set_property_value_by_name("IsChecked", DataContextBinding(_toggleButton18, "IsUnderline"));
            const _textBlock19 = new TextBlock();
            _textBlock19._set_property_value_by_name("Text", "U");
            _textBlock19._set_property_value_by_name("FontWeight", FontWeight.Bold);
            _textBlock19._set_property_value_by_name("Foreground", DynamicResource(_textBlock19, "OnSurface"));
            _toggleButton18.Content = _textBlock19;
            _stackPanel13.AddChild(_toggleButton18);
            _stackPanel12.AddChild(_stackPanel13);
            const _border20 = new Border();
            _border20._set_property_value_by_name("Background", DynamicResource(_border20, "SurfaceContainerLow"));
            _border20._set_property_value_by_name("Padding", new Thickness(12, 12, 12, 12));
            _border20._set_property_value_by_name("BorderBrush", DynamicResource(_border20, "Outline"));
            _border20._set_property_value_by_name("BorderThickness", new Thickness(1));
            const _stackPanel21 = new StackPanel();
            _stackPanel21._set_property_value_by_name("Orientation", Orientation.Vertical);
            const _textBlock22 = new TextBlock();
            _textBlock22._set_property_value_by_name("Text", DataContextBinding(_textBlock22, "PreviewText"));
            _textBlock22._set_property_value_by_name("FontSize", 16);
            _textBlock22._set_property_value_by_name("Foreground", DynamicResource(_textBlock22, "OnSurface"));
            _stackPanel21.AddChild(_textBlock22);
            const _textBlock23 = new TextBlock();
            _textBlock23._set_property_value_by_name("Text", "(Bold / Italic / Underline DPs above drive this preview's chrome via TwoWay bindings.)");
            _textBlock23._set_property_value_by_name("FontSize", 11);
            _textBlock23._set_property_value_by_name("Foreground", DynamicResource(_textBlock23, "OnSurfaceVariant"));
            _textBlock23._set_property_value_by_name("Margin", new Thickness(0, 8, 0, 0));
            _stackPanel21.AddChild(_textBlock23);
            _border20.SetChild(_stackPanel21);
            _stackPanel12.AddChild(_border20);
            _dockPanel9.AddChild(_stackPanel12);
            _border8.SetChild(_dockPanel9);
            return _border8;
        }, ToggleButtonVM);
        t.Set("ToggleButtonTemplate", _tmpl7);
        return t;
    }
    get ToggleChromeTemplate() { return this.Resolve("ToggleChromeTemplate"); }
    set ToggleChromeTemplate(v) { this.Set("ToggleChromeTemplate", v); }
    get StyleToggle() { return this.Resolve("StyleToggle"); }
    set StyleToggle(v) { this.Set("StyleToggle", v); }
    get ToggleButtonTemplate() { return this.Resolve("ToggleButtonTemplate"); }
    set ToggleButtonTemplate(v) { this.Set("ToggleButtonTemplate", v); }
}
