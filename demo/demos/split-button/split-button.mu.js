import { SplitButtonVM } from "./split-button-vm.mjs";
import { Border, DataTemplate, Dock, DockPanel, Orientation, StackPanel, TextBlock } from "@visualisation-sub/mural/basic";
import { SplitButton } from "@visualisation-sub/mural/framework/split-button.js";
import { DataContextBinding, DynamicResource, HorizontalAlignment, ResourceDictionary, Thickness } from "@visualisation-sub/mural/runtime";
import { FontWeight } from "@visualisation-sub/mural/visual-engine";


const _gate_SplitButtonDemo = Symbol("SplitButtonDemo.ctor");
export class SplitButtonDemo extends ResourceDictionary {
    constructor(_g) {
        super();
        if (_g !== _gate_SplitButtonDemo) {
            throw new Error("SplitButtonDemo is private — use SplitButtonDemo.Clone()");
        }
    }
    static Clone() {
        const t = new SplitButtonDemo(_gate_SplitButtonDemo);
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
            _textBlock4._set_property_value_by_name("Text", "SplitButton — M3 dual-target chrome. Primary fires Command; chevron toggles a dropdown.");
            _textBlock4._set_property_value_by_name("FontSize", 15);
            _textBlock4._set_property_value_by_name("FontWeight", FontWeight.Bold);
            _textBlock4._set_property_value_by_name("Foreground", DynamicResource(_textBlock4, "OnPrimary"));
            _border3.SetChild(_textBlock4);
            _dockPanel2.AddChild(_border3);
            const _stackPanel5 = new StackPanel();
            _stackPanel5._set_property_value_by_name("Orientation", Orientation.Vertical);
            _stackPanel5._set_property_value_by_name("Margin", new Thickness(24, 24, 24, 24));
            const _textBlock6 = new TextBlock();
            _textBlock6._set_property_value_by_name("Text", "Send email");
            _textBlock6._set_property_value_by_name("FontWeight", FontWeight.Bold);
            _textBlock6._set_property_value_by_name("FontSize", 14);
            _textBlock6._set_property_value_by_name("Foreground", DynamicResource(_textBlock6, "OnSurface"));
            _textBlock6._set_property_value_by_name("Margin", new Thickness(0, 0, 0, 12));
            _stackPanel5.AddChild(_textBlock6);
            const _splitButton7 = new SplitButton();
            _splitButton7._set_property_value_by_name("Command", DataContextBinding(_splitButton7, "SendCommand"));
            _splitButton7._set_property_value_by_name("IsOpen", DataContextBinding(_splitButton7, "IsOpen"));
            _splitButton7._set_property_value_by_name("MenuContent", DataContextBinding(_splitButton7, "MenuPopup"));
            _splitButton7._set_property_value_by_name("HorizontalAlignment", HorizontalAlignment.Left);
            _splitButton7._set_property_value_by_name("Margin", new Thickness(0, 0, 0, 24));
            const _textBlock8 = new TextBlock();
            _textBlock8._set_property_value_by_name("Text", "Send");
            _splitButton7.Content = _textBlock8;
            _stackPanel5.AddChild(_splitButton7);
            const _stackPanel9 = new StackPanel();
            _stackPanel9._set_property_value_by_name("Orientation", Orientation.Horizontal);
            _stackPanel9._set_property_value_by_name("Margin", new Thickness(0, 0, 0, 4));
            const _textBlock10 = new TextBlock();
            _textBlock10._set_property_value_by_name("Text", "Primary clicks: ");
            _textBlock10._set_property_value_by_name("FontSize", 12);
            _textBlock10._set_property_value_by_name("Foreground", DynamicResource(_textBlock10, "OnSurfaceVariant"));
            _stackPanel9.AddChild(_textBlock10);
            const _textBlock11 = new TextBlock();
            _textBlock11._set_property_value_by_name("Text", DataContextBinding(_textBlock11, "SendCount"));
            _textBlock11._set_property_value_by_name("FontSize", 12);
            _textBlock11._set_property_value_by_name("FontWeight", FontWeight.Bold);
            _textBlock11._set_property_value_by_name("Foreground", DynamicResource(_textBlock11, "OnSurface"));
            _stackPanel9.AddChild(_textBlock11);
            _stackPanel5.AddChild(_stackPanel9);
            const _stackPanel12 = new StackPanel();
            _stackPanel12._set_property_value_by_name("Orientation", Orientation.Horizontal);
            _stackPanel12._set_property_value_by_name("Margin", new Thickness(0, 0, 0, 4));
            const _textBlock13 = new TextBlock();
            _textBlock13._set_property_value_by_name("Text", "Last menu action: ");
            _textBlock13._set_property_value_by_name("FontSize", 12);
            _textBlock13._set_property_value_by_name("Foreground", DynamicResource(_textBlock13, "OnSurfaceVariant"));
            _stackPanel12.AddChild(_textBlock13);
            const _textBlock14 = new TextBlock();
            _textBlock14._set_property_value_by_name("Text", DataContextBinding(_textBlock14, "MenuActionTaken"));
            _textBlock14._set_property_value_by_name("FontSize", 12);
            _textBlock14._set_property_value_by_name("FontWeight", FontWeight.Bold);
            _textBlock14._set_property_value_by_name("Foreground", DynamicResource(_textBlock14, "OnSurface"));
            _stackPanel12.AddChild(_textBlock14);
            _stackPanel5.AddChild(_stackPanel12);
            const _stackPanel15 = new StackPanel();
            _stackPanel15._set_property_value_by_name("Orientation", Orientation.Horizontal);
            const _textBlock16 = new TextBlock();
            _textBlock16._set_property_value_by_name("Text", "IsOpen: ");
            _textBlock16._set_property_value_by_name("FontSize", 12);
            _textBlock16._set_property_value_by_name("Foreground", DynamicResource(_textBlock16, "OnSurfaceVariant"));
            _stackPanel15.AddChild(_textBlock16);
            const _textBlock17 = new TextBlock();
            _textBlock17._set_property_value_by_name("Text", DataContextBinding(_textBlock17, "IsOpen"));
            _textBlock17._set_property_value_by_name("FontSize", 12);
            _textBlock17._set_property_value_by_name("FontWeight", FontWeight.Bold);
            _textBlock17._set_property_value_by_name("Foreground", DynamicResource(_textBlock17, "OnSurface"));
            _stackPanel15.AddChild(_textBlock17);
            _stackPanel5.AddChild(_stackPanel15);
            _dockPanel2.AddChild(_stackPanel5);
            _border1.SetChild(_dockPanel2);
            return _border1;
        }, SplitButtonVM);
        t.Set("SplitButtonTemplate", _tmpl0);
        return t;
    }
    get SplitButtonTemplate() { return this.Resolve("SplitButtonTemplate"); }
    set SplitButtonTemplate(v) { this.Set("SplitButtonTemplate", v); }
}
