import { StatusBarVM } from "./status-bar-vm.mjs";
import { Border, DataTemplate, Dock, DockPanel, Orientation, StackPanel, TextBlock } from "@visualisation-sub/mural/Basic";
import { Button } from "@visualisation-sub/mural/framework/button.js";
import { StatusBar, StatusBarItem, StatusBarSeparator } from "@visualisation-sub/mural/framework/surface.js";
import { DataContextBinding, DynamicResource, MultiBinding, ResourceDictionary, Thickness, VerticalAlignment } from "@visualisation-sub/mural/runtime";
import { FontWeight } from "@visualisation-sub/mural/visual-engine";


const _gate_StatusBarDemo = Symbol("StatusBarDemo.ctor");
export class StatusBarDemo extends ResourceDictionary {
    constructor(_g) {
        super();
        if (_g !== _gate_StatusBarDemo) {
            throw new Error("StatusBarDemo is private — use StatusBarDemo.Clone()");
        }
    }
    static Clone() {
        const t = new StatusBarDemo(_gate_StatusBarDemo);
        const _tmpl0 = new DataTemplate((_data) => {
            const _border1 = new Border();
            _border1._set_property_value_by_name("Background", DynamicResource(_border1, "Surface"));
            _border1._set_property_value_by_name("BorderBrush", DynamicResource(_border1, "OutlineVariant"));
            _border1._set_property_value_by_name("BorderThickness", new Thickness(1));
            _border1._set_property_value_by_name("CornerRadius", 4);
            _border1._set_property_value_by_name("VerticalAlignment", VerticalAlignment.Top);
            _border1._set_property_value_by_name("Margin", new Thickness(16, 16, 16, 16));
            const _dockPanel2 = new DockPanel();
            const _border3 = new Border();
            _border3._set_property_value_by_name(DockPanel, "Dock", Dock.Top);
            _border3._set_property_value_by_name("Background", DynamicResource(_border3, "Primary"));
            _border3._set_property_value_by_name("Padding", new Thickness(16, 12, 16, 12));
            const _textBlock4 = new TextBlock();
            _textBlock4._set_property_value_by_name("Text", "StatusBar — docked cells with separators.");
            _textBlock4._set_property_value_by_name("FontSize", 15);
            _textBlock4._set_property_value_by_name("FontWeight", FontWeight.Bold);
            _textBlock4._set_property_value_by_name("Foreground", DynamicResource(_textBlock4, "OnPrimary"));
            _border3.SetChild(_textBlock4);
            _dockPanel2.AddChild(_border3);
            const _statusBar5 = new StatusBar();
            _statusBar5._set_property_value_by_name(DockPanel, "Dock", Dock.Bottom);
            const _statusBarItem6 = new StatusBarItem();
            _statusBarItem6._set_property_value_by_name(DockPanel, "Dock", Dock.Left);
            const _textBlock7 = new TextBlock();
            _textBlock7._set_property_value_by_name("Text", MultiBinding(_textBlock7, ["IsModified"], (_p0) => ( _p0 ? "● Modified" : "✓ Saved" )));
            _textBlock7._set_property_value_by_name("Foreground", DynamicResource(_textBlock7, "OnSurfaceVariant"));
            _textBlock7._set_property_value_by_name("FontSize", 12);
            _statusBarItem6.Content = _textBlock7;
            _statusBar5.AddChild(_statusBarItem6);
            const _statusBarSeparator8 = new StatusBarSeparator();
            _statusBarSeparator8._set_property_value_by_name(DockPanel, "Dock", Dock.Left);
            _statusBar5.AddChild(_statusBarSeparator8);
            const _statusBarItem9 = new StatusBarItem();
            _statusBarItem9._set_property_value_by_name(DockPanel, "Dock", Dock.Right);
            const _textBlock10 = new TextBlock();
            _textBlock10._set_property_value_by_name("Text", MultiBinding(_textBlock10, ["ItemCount"], (_p0) => ( "Items: " + String(_p0) )));
            _textBlock10._set_property_value_by_name("Foreground", DynamicResource(_textBlock10, "OnSurfaceVariant"));
            _textBlock10._set_property_value_by_name("FontSize", 12);
            _statusBarItem9.Content = _textBlock10;
            _statusBar5.AddChild(_statusBarItem9);
            const _statusBarSeparator11 = new StatusBarSeparator();
            _statusBarSeparator11._set_property_value_by_name(DockPanel, "Dock", Dock.Right);
            _statusBar5.AddChild(_statusBarSeparator11);
            const _statusBarItem12 = new StatusBarItem();
            _statusBarItem12._set_property_value_by_name(DockPanel, "Dock", Dock.Right);
            const _textBlock13 = new TextBlock();
            _textBlock13._set_property_value_by_name("Text", MultiBinding(_textBlock13, ["LastAction"], (_p0) => ( "Last: " + String(_p0) )));
            _textBlock13._set_property_value_by_name("Foreground", DynamicResource(_textBlock13, "OnSurfaceVariant"));
            _textBlock13._set_property_value_by_name("FontSize", 12);
            _statusBarItem12.Content = _textBlock13;
            _statusBar5.AddChild(_statusBarItem12);
            const _statusBarSeparator14 = new StatusBarSeparator();
            _statusBarSeparator14._set_property_value_by_name(DockPanel, "Dock", Dock.Right);
            _statusBar5.AddChild(_statusBarSeparator14);
            const _statusBarItem15 = new StatusBarItem();
            _statusBar5.AddChild(_statusBarItem15);
            _dockPanel2.AddChild(_statusBar5);
            const _stackPanel16 = new StackPanel();
            _stackPanel16._set_property_value_by_name("Orientation", Orientation.Vertical);
            _stackPanel16._set_property_value_by_name("Margin", new Thickness(16, 16, 16, 16));
            const _textBlock17 = new TextBlock();
            _textBlock17._set_property_value_by_name("Text", "Use these buttons to change the cells in the bottom strip:");
            _textBlock17._set_property_value_by_name("FontSize", 12);
            _textBlock17._set_property_value_by_name("FontWeight", FontWeight.Bold);
            _textBlock17._set_property_value_by_name("Margin", new Thickness(0, 0, 0, 8));
            _stackPanel16.AddChild(_textBlock17);
            const _stackPanel18 = new StackPanel();
            _stackPanel18._set_property_value_by_name("Orientation", Orientation.Horizontal);
            const _button19 = new Button();
            _button19._set_property_value_by_name("Command", DataContextBinding(_button19, "AddItemCommand"));
            _button19._set_property_value_by_name("Margin", new Thickness(0, 0, 8, 0));
            const _textBlock20 = new TextBlock();
            _textBlock20._set_property_value_by_name("Text", "Add item");
            _button19.Content = _textBlock20;
            _stackPanel18.AddChild(_button19);
            const _button21 = new Button();
            _button21._set_property_value_by_name("Command", DataContextBinding(_button21, "RemoveItemCommand"));
            _button21._set_property_value_by_name("Margin", new Thickness(0, 0, 8, 0));
            const _textBlock22 = new TextBlock();
            _textBlock22._set_property_value_by_name("Text", "Remove item");
            _button21.Content = _textBlock22;
            _stackPanel18.AddChild(_button21);
            const _button23 = new Button();
            _button23._set_property_value_by_name("Command", DataContextBinding(_button23, "SaveCommand"));
            const _textBlock24 = new TextBlock();
            _textBlock24._set_property_value_by_name("Text", "Save");
            _button23.Content = _textBlock24;
            _stackPanel18.AddChild(_button23);
            _stackPanel16.AddChild(_stackPanel18);
            const _textBlock25 = new TextBlock();
            _textBlock25._set_property_value_by_name("Text", "Remove is gated by item count — its chrome dims when there's nothing to remove.");
            _textBlock25._set_property_value_by_name("FontSize", 11);
            _textBlock25._set_property_value_by_name("Foreground", DynamicResource(_textBlock25, "OnSurfaceVariant"));
            _textBlock25._set_property_value_by_name("Margin", new Thickness(0, 12, 0, 0));
            _stackPanel16.AddChild(_textBlock25);
            _dockPanel2.AddChild(_stackPanel16);
            _border1.SetChild(_dockPanel2);
            return _border1;
        }, StatusBarVM);
        t.Set("StatusBarTemplate", _tmpl0);
        return t;
    }
    get StatusBarTemplate() { return this.Resolve("StatusBarTemplate"); }
    set StatusBarTemplate(v) { this.Set("StatusBarTemplate", v); }
}
