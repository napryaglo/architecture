import { ToolBarVM } from "./tool-bar-vm.mjs";
import { Border, DataTemplate, Dock, DockPanel, Orientation, StackPanel, TextBlock } from "@visualisation-sub/mural/basic";
import { ToolBar, ToolBarButton, ToolBarSeparator } from "@visualisation-sub/mural/framework/surface.js";
import { ToggleButton } from "@visualisation-sub/mural/framework/toggle-button.js";
import { DataContextBinding, DynamicResource, ResourceDictionary, Thickness } from "@visualisation-sub/mural/runtime";
import { FontWeight } from "@visualisation-sub/mural/visual-engine";


const _gate_ToolBarDemo = Symbol("ToolBarDemo.ctor");
export class ToolBarDemo extends ResourceDictionary {
    constructor(_g) {
        super();
        if (_g !== _gate_ToolBarDemo) {
            throw new Error("ToolBarDemo is private — use ToolBarDemo.Clone()");
        }
    }
    static Clone() {
        const t = new ToolBarDemo(_gate_ToolBarDemo);
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
            _textBlock4._set_property_value_by_name("Text", "ToolBar — Button rows, separators, and command binding.");
            _textBlock4._set_property_value_by_name("FontSize", 15);
            _textBlock4._set_property_value_by_name("FontWeight", FontWeight.Bold);
            _textBlock4._set_property_value_by_name("Foreground", DynamicResource(_textBlock4, "OnPrimary"));
            _border3.SetChild(_textBlock4);
            _dockPanel2.AddChild(_border3);
            const _stackPanel5 = new StackPanel();
            _stackPanel5._set_property_value_by_name("Orientation", Orientation.Vertical);
            _stackPanel5._set_property_value_by_name("Margin", new Thickness(16, 16, 16, 16));
            const _textBlock6 = new TextBlock();
            _textBlock6._set_property_value_by_name("Text", "A row of command buttons separated into groups:");
            _textBlock6._set_property_value_by_name("FontSize", 12);
            _textBlock6._set_property_value_by_name("FontWeight", FontWeight.Bold);
            _textBlock6._set_property_value_by_name("Margin", new Thickness(0, 0, 0, 8));
            _stackPanel5.AddChild(_textBlock6);
            const _toolBar7 = new ToolBar();
            const _toolBarButton8 = new ToolBarButton();
            _toolBarButton8._set_property_value_by_name("Command", DataContextBinding(_toolBarButton8, "SaveCommand"));
            const _textBlock9 = new TextBlock();
            _textBlock9._set_property_value_by_name("Text", "💾");
            _toolBarButton8.Content = _textBlock9;
            _toolBar7.AddChild(_toolBarButton8);
            const _toolBarSeparator10 = new ToolBarSeparator();
            _toolBar7.AddChild(_toolBarSeparator10);
            const _toolBarButton11 = new ToolBarButton();
            _toolBarButton11._set_property_value_by_name("Command", DataContextBinding(_toolBarButton11, "CutCommand"));
            const _textBlock12 = new TextBlock();
            _textBlock12._set_property_value_by_name("Text", "✂");
            _toolBarButton11.Content = _textBlock12;
            _toolBar7.AddChild(_toolBarButton11);
            const _toolBarButton13 = new ToolBarButton();
            _toolBarButton13._set_property_value_by_name("Command", DataContextBinding(_toolBarButton13, "CopyCommand"));
            const _textBlock14 = new TextBlock();
            _textBlock14._set_property_value_by_name("Text", "📋");
            _toolBarButton13.Content = _textBlock14;
            _toolBar7.AddChild(_toolBarButton13);
            const _toolBarButton15 = new ToolBarButton();
            _toolBarButton15._set_property_value_by_name("Command", DataContextBinding(_toolBarButton15, "DeleteCommand"));
            const _textBlock16 = new TextBlock();
            _textBlock16._set_property_value_by_name("Text", "🗑");
            _toolBarButton15.Content = _textBlock16;
            _toolBar7.AddChild(_toolBarButton15);
            _stackPanel5.AddChild(_toolBar7);
            const _textBlock17 = new TextBlock();
            _textBlock17._set_property_value_by_name("Text", DataContextBinding(_textBlock17, "Status"));
            _textBlock17._set_property_value_by_name("FontSize", 13);
            _textBlock17._set_property_value_by_name("Foreground", DynamicResource(_textBlock17, "OnSurface"));
            _textBlock17._set_property_value_by_name("Margin", new Thickness(0, 16, 0, 4));
            _stackPanel5.AddChild(_textBlock17);
            const _stackPanel18 = new StackPanel();
            _stackPanel18._set_property_value_by_name("Orientation", Orientation.Horizontal);
            _stackPanel18._set_property_value_by_name("Margin", new Thickness(0, 8, 0, 0));
            const _textBlock19 = new TextBlock();
            _textBlock19._set_property_value_by_name("Text", "Selection state:");
            _textBlock19._set_property_value_by_name("FontSize", 12);
            _textBlock19._set_property_value_by_name("Foreground", DynamicResource(_textBlock19, "OnSurfaceVariant"));
            _textBlock19._set_property_value_by_name("Margin", new Thickness(0, 8, 8, 0));
            _stackPanel18.AddChild(_textBlock19);
            const _toggleButton20 = new ToggleButton();
            _toggleButton20._set_property_value_by_name("IsChecked", DataContextBinding(_toggleButton20, "HasSelection"));
            _toggleButton20._set_property_value_by_name("Command", DataContextBinding(_toggleButton20, "ToggleSelectionCommand"));
            const _textBlock21 = new TextBlock();
            _textBlock21._set_property_value_by_name("Text", "HasSelection");
            _toggleButton20.Content = _textBlock21;
            _stackPanel18.AddChild(_toggleButton20);
            const _textBlock22 = new TextBlock();
            _textBlock22._set_property_value_by_name("Text", "  (Delete is selection-gated — toggle to ungate.)");
            _textBlock22._set_property_value_by_name("FontSize", 11);
            _textBlock22._set_property_value_by_name("Foreground", DynamicResource(_textBlock22, "OnSurfaceVariant"));
            _textBlock22._set_property_value_by_name("Margin", new Thickness(8, 8, 0, 0));
            _stackPanel18.AddChild(_textBlock22);
            _stackPanel5.AddChild(_stackPanel18);
            _dockPanel2.AddChild(_stackPanel5);
            _border1.SetChild(_dockPanel2);
            return _border1;
        }, ToolBarVM);
        t.Set("ToolBarTemplate", _tmpl0);
        return t;
    }
    get ToolBarTemplate() { return this.Resolve("ToolBarTemplate"); }
    set ToolBarTemplate(v) { this.Set("ToolBarTemplate", v); }
}
