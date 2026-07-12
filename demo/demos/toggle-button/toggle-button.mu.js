import { ToggleButtonVM } from "./toggle-button-vm.mjs";
import { Border, ContentPresenter, ControlTemplate, DataTemplate, Dock, DockPanel, Orientation, StackPanel, TargetedSetter, TemplatePropertyTrigger, TextBlock } from "@visualisation-sub/mural/basic";
import { ToggleButton } from "@visualisation-sub/mural/framework/buttons/toggle-button.js";
import { Color, DataContextBinding, DynamicResource, PropertyTrigger, ResourceDictionary, Setter, SetterFactory, Style, Thickness } from "@visualisation-sub/mural/runtime";
import { FontStyle, FontWeight, SolidColorBrush } from "@visualisation-sub/mural/visual-engine";


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
                let _border1, _border2;
                _border1 = new Border();
                _border1.Name = "PART_Border";
                _border1.set_property_value(Border.BackgroundKey, DynamicResource(_border1, "Surface"));
                _border1.set_property_value(Border.BorderBrushKey, DynamicResource(_border1, "Outline"));
                _border1.set_property_value(Border.BorderThicknessKey, new Thickness(1));
                _border1.set_property_value(Border.CornerRadiusKey, DynamicResource(_border1, "ShapeSmall"));
                _border2 = new Border();
                _border2.Name = "PART_StateLayer";
                _border2.set_property_value(Border.BackgroundKey, new SolidColorBrush(Color.FromHex('#00000000')));
                _border2.set_property_value(Border.CornerRadiusKey, DynamicResource(_border2, "ShapeSmall"));
                _border2.set_property_value(Border.PaddingKey, new Thickness(16, 8, 16, 8));
                const _contentPresenter3 = new ContentPresenter();
                _border2.SetChild(_contentPresenter3);
                _border1.SetChild(_border2);
                return _border1;
            };
            const _tplSet4 = [new TargetedSetter(Border, "Background", new SetterFactory((_t) => DynamicResource(_t, "Primary")), "PART_Border"), new TargetedSetter(Border, "BorderBrush", new SetterFactory((_t) => DynamicResource(_t, "PrimaryPress")), "PART_Border")];
            const _tplTrig5 = new TemplatePropertyTrigger(ToggleButton, "IsChecked", true, _tplSet4, undefined);
            const _tplSet6 = [new TargetedSetter(Border, "Background", new SetterFactory((_t) => DynamicResource(_t, "StateHoverOverlay")), "PART_StateLayer")];
            const _tplTrig7 = new TemplatePropertyTrigger(ToggleButton, "IsMouseOver", true, _tplSet6, undefined);
            const _tplSet8 = [new TargetedSetter(Border, "Background", new SetterFactory((_t) => DynamicResource(_t, "StatePressOverlay")), "PART_StateLayer")];
            const _tplTrig9 = new TemplatePropertyTrigger(ToggleButton, "IsPressed", true, _tplSet8, undefined);
            return new ControlTemplate(_factory, [_tplTrig5, _tplTrig7, _tplTrig9]);
        })();
        t.Set("ToggleChromeTemplate", _tmpl0);
        const _setter10 = new Setter(ToggleButton, "Template", _tmpl0);
        const _setter11 = new Setter(TextBlock, "Foreground", new SetterFactory((_t) => DynamicResource(_t, "OnSurface")));
        const _setter12 = new Setter(TextBlock, "Foreground", new SetterFactory((_t) => DynamicResource(_t, "OnPrimary")));
        const _sArr13 = [_setter12];
        const _trigger14 = new PropertyTrigger(ToggleButton, "IsChecked", true, _sArr13);
        const _style15 = new Style(ToggleButton, [_setter10, _setter11], undefined, [_trigger14], []);
        t.Set("StyleToggle", _style15);
        const _tmpl16 = new DataTemplate((_data) => {
            const _border17 = new Border();
            _border17.set_property_value(Border.BackgroundKey, DynamicResource(_border17, "Surface"));
            _border17.set_property_value(Border.BorderBrushKey, DynamicResource(_border17, "OutlineVariant"));
            _border17.set_property_value(Border.BorderThicknessKey, new Thickness(1));
            const _dockPanel18 = new DockPanel();
            const _border19 = new Border();
            _border19.set_property_value(DockPanel.DockKey, Dock.Top);
            _border19.set_property_value(Border.BackgroundKey, DynamicResource(_border19, "Primary"));
            _border19.set_property_value(Border.PaddingKey, new Thickness(16, 12, 16, 12));
            const _textBlock20 = new TextBlock();
            _textBlock20.set_property_value(TextBlock.TextKey, "ToggleButton — IsChecked flips on click; TwoWay binding keeps the VM in sync.");
            _textBlock20.set_property_value(TextBlock.FontSizeKey, 15);
            _textBlock20.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _textBlock20.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock20, "OnPrimary"));
            _border19.SetChild(_textBlock20);
            _dockPanel18.AddChild(_border19);
            const _stackPanel21 = new StackPanel();
            _stackPanel21.set_property_value(StackPanel.OrientationKey, Orientation.Vertical);
            _stackPanel21.set_property_value(StackPanel.MarginKey, new Thickness(16, 16, 16, 16));
            const _stackPanel22 = new StackPanel();
            _stackPanel22.set_property_value(StackPanel.OrientationKey, Orientation.Horizontal);
            _stackPanel22.set_property_value(StackPanel.MarginKey, new Thickness(0, 0, 0, 16));
            const _toggleButton23 = new ToggleButton();
            _toggleButton23.set_property_value(ToggleButton.StyleKey, _style15);
            _toggleButton23.set_property_value(ToggleButton.IsCheckedKey, DataContextBinding(_toggleButton23, "IsBold"));
            _toggleButton23.set_property_value(ToggleButton.MarginKey, new Thickness(0, 0, 8, 0));
            const _textBlock24 = new TextBlock();
            _textBlock24.set_property_value(TextBlock.TextKey, "B");
            _textBlock24.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _toggleButton23.Content = _textBlock24;
            _stackPanel22.AddChild(_toggleButton23);
            const _toggleButton25 = new ToggleButton();
            _toggleButton25.set_property_value(ToggleButton.StyleKey, _style15);
            _toggleButton25.set_property_value(ToggleButton.IsCheckedKey, DataContextBinding(_toggleButton25, "IsItalic"));
            _toggleButton25.set_property_value(ToggleButton.MarginKey, new Thickness(0, 0, 8, 0));
            const _textBlock26 = new TextBlock();
            _textBlock26.set_property_value(TextBlock.TextKey, "I");
            _textBlock26.set_property_value(TextBlock.FontStyleKey, FontStyle.Italic);
            _toggleButton25.Content = _textBlock26;
            _stackPanel22.AddChild(_toggleButton25);
            const _toggleButton27 = new ToggleButton();
            _toggleButton27.set_property_value(ToggleButton.StyleKey, _style15);
            _toggleButton27.set_property_value(ToggleButton.IsCheckedKey, DataContextBinding(_toggleButton27, "IsUnderline"));
            const _textBlock28 = new TextBlock();
            _textBlock28.set_property_value(TextBlock.TextKey, "U");
            _textBlock28.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _toggleButton27.Content = _textBlock28;
            _stackPanel22.AddChild(_toggleButton27);
            _stackPanel21.AddChild(_stackPanel22);
            const _border29 = new Border();
            _border29.set_property_value(Border.BackgroundKey, DynamicResource(_border29, "SurfaceContainerLow"));
            _border29.set_property_value(Border.PaddingKey, new Thickness(12, 12, 12, 12));
            _border29.set_property_value(Border.BorderBrushKey, DynamicResource(_border29, "Outline"));
            _border29.set_property_value(Border.BorderThicknessKey, new Thickness(1));
            const _stackPanel30 = new StackPanel();
            _stackPanel30.set_property_value(StackPanel.OrientationKey, Orientation.Vertical);
            const _textBlock31 = new TextBlock();
            _textBlock31.set_property_value(TextBlock.TextKey, DataContextBinding(_textBlock31, "PreviewText"));
            _textBlock31.set_property_value(TextBlock.FontSizeKey, 16);
            _textBlock31.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock31, "OnSurface"));
            _stackPanel30.AddChild(_textBlock31);
            const _textBlock32 = new TextBlock();
            _textBlock32.set_property_value(TextBlock.TextKey, "(Bold / Italic / Underline DPs above drive this preview's chrome via TwoWay bindings.)");
            _textBlock32.set_property_value(TextBlock.FontSizeKey, 11);
            _textBlock32.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock32, "OnSurfaceVariant"));
            _textBlock32.set_property_value(TextBlock.MarginKey, new Thickness(0, 8, 0, 0));
            _stackPanel30.AddChild(_textBlock32);
            _border29.SetChild(_stackPanel30);
            _stackPanel21.AddChild(_border29);
            _dockPanel18.AddChild(_stackPanel21);
            _border17.SetChild(_dockPanel18);
            return _border17;
        }, ToggleButtonVM);
        t.Set(ToggleButtonVM, _tmpl16);
        return t;
    }
    get ToggleChromeTemplate() { return this.Resolve("ToggleChromeTemplate"); }
    set ToggleChromeTemplate(v) { this.Set("ToggleChromeTemplate", v); }
    get StyleToggle() { return this.Resolve("StyleToggle"); }
    set StyleToggle(v) { this.Set("StyleToggle", v); }
}
