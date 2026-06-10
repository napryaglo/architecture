import { ContextMenuVM } from "./context-menu-vm.mjs";
import { Border, DataTemplate, Dock, DockPanel, LogBehavior, Orientation, StackPanel, TextBlock } from "@visualisation-sub/mural/Basic";
import { ContextMenu, ContextMenuService, MenuItem, MenuSeparator } from "@visualisation-sub/mural/framework/surface.js";
import { Color, DataContextBinding, DynamicResource, HorizontalAlignment, ResourceDictionary, Thickness, VerticalAlignment } from "@visualisation-sub/mural/runtime";
import { FontWeight, SolidColorBrush } from "@visualisation-sub/mural/visual-engine";


const _gate_ContextMenuDemo = Symbol("ContextMenuDemo.ctor");
export class ContextMenuDemo extends ResourceDictionary {
    constructor(_g) {
        super();
        if (_g !== _gate_ContextMenuDemo) {
            throw new Error("ContextMenuDemo is private — use ContextMenuDemo.Clone()");
        }
    }
    static Clone() {
        const t = new ContextMenuDemo(_gate_ContextMenuDemo);
        const _contextMenu0 = new ContextMenu();
        const _menuItem1 = new MenuItem();
        _menuItem1._set_property_value_by_name("Header", "Red — Cut");
        _menuItem1._set_property_value_by_name("Command", DataContextBinding(_menuItem1, "RedCommand"));
        _menuItem1._set_property_value_by_name("CommandParameter", "Cut");
        const _logBehavior2 = new LogBehavior();
        _logBehavior2._set_property_value_by_name("Property", "IsMouseOver");
        _logBehavior2._set_property_value_by_name("Tag", "red-cut");
        _menuItem1.AddBehavior(_logBehavior2);
        _contextMenu0.AddChild(_menuItem1);
        const _menuItem3 = new MenuItem();
        _menuItem3._set_property_value_by_name("Header", "Red — Copy");
        _menuItem3._set_property_value_by_name("Command", DataContextBinding(_menuItem3, "RedCommand"));
        _menuItem3._set_property_value_by_name("CommandParameter", "Copy");
        const _logBehavior4 = new LogBehavior();
        _logBehavior4._set_property_value_by_name("Property", "IsMouseOver");
        _logBehavior4._set_property_value_by_name("Tag", "red-copy");
        _menuItem3.AddBehavior(_logBehavior4);
        _contextMenu0.AddChild(_menuItem3);
        const _menuSeparator5 = new MenuSeparator();
        _contextMenu0.AddChild(_menuSeparator5);
        const _menuItem6 = new MenuItem();
        _menuItem6._set_property_value_by_name("Header", "Red — Delete");
        _menuItem6._set_property_value_by_name("Command", DataContextBinding(_menuItem6, "RedCommand"));
        _menuItem6._set_property_value_by_name("CommandParameter", "Delete");
        const _logBehavior7 = new LogBehavior();
        _logBehavior7._set_property_value_by_name("Property", "IsMouseOver");
        _logBehavior7._set_property_value_by_name("Tag", "red-delete");
        _menuItem6.AddBehavior(_logBehavior7);
        _contextMenu0.AddChild(_menuItem6);
        t.Set("RedMenu", _contextMenu0);
        const _contextMenu8 = new ContextMenu();
        const _menuItem9 = new MenuItem();
        _menuItem9._set_property_value_by_name("Header", "Green — Inspect");
        _menuItem9._set_property_value_by_name("Command", DataContextBinding(_menuItem9, "GreenCommand"));
        _menuItem9._set_property_value_by_name("CommandParameter", "Inspect");
        _contextMenu8.AddChild(_menuItem9);
        const _menuItem10 = new MenuItem();
        _menuItem10._set_property_value_by_name("Header", "Green — Highlight");
        _menuItem10._set_property_value_by_name("Command", DataContextBinding(_menuItem10, "GreenCommand"));
        _menuItem10._set_property_value_by_name("CommandParameter", "Highlight");
        _contextMenu8.AddChild(_menuItem10);
        const _menuSeparator11 = new MenuSeparator();
        _contextMenu8.AddChild(_menuSeparator11);
        const _menuItem12 = new MenuItem();
        _menuItem12._set_property_value_by_name("Header", "Green — Rename");
        _menuItem12._set_property_value_by_name("Command", DataContextBinding(_menuItem12, "GreenCommand"));
        _menuItem12._set_property_value_by_name("CommandParameter", "Rename");
        _contextMenu8.AddChild(_menuItem12);
        t.Set("GreenMenu", _contextMenu8);
        const _contextMenu13 = new ContextMenu();
        const _menuItem14 = new MenuItem();
        _menuItem14._set_property_value_by_name("Header", "Blue — Open");
        _menuItem14._set_property_value_by_name("Command", DataContextBinding(_menuItem14, "BlueCommand"));
        _menuItem14._set_property_value_by_name("CommandParameter", "Open");
        _contextMenu13.AddChild(_menuItem14);
        const _menuItem15 = new MenuItem();
        _menuItem15._set_property_value_by_name("Header", "Blue — Bookmark");
        _menuItem15._set_property_value_by_name("Command", DataContextBinding(_menuItem15, "BlueCommand"));
        _menuItem15._set_property_value_by_name("CommandParameter", "Bookmark");
        _contextMenu13.AddChild(_menuItem15);
        const _menuSeparator16 = new MenuSeparator();
        _contextMenu13.AddChild(_menuSeparator16);
        const _menuItem17 = new MenuItem();
        _menuItem17._set_property_value_by_name("Header", "Blue — Share");
        _menuItem17._set_property_value_by_name("Command", DataContextBinding(_menuItem17, "BlueCommand"));
        _menuItem17._set_property_value_by_name("CommandParameter", "Share");
        _contextMenu13.AddChild(_menuItem17);
        t.Set("BlueMenu", _contextMenu13);
        const _tmpl18 = new DataTemplate((_data) => {
            const _border19 = new Border();
            _border19._set_property_value_by_name("Background", DynamicResource(_border19, "Surface"));
            _border19._set_property_value_by_name("BorderBrush", DynamicResource(_border19, "OutlineVariant"));
            _border19._set_property_value_by_name("BorderThickness", new Thickness(1));
            const _dockPanel20 = new DockPanel();
            const _border21 = new Border();
            _border21._set_property_value_by_name(DockPanel, "Dock", Dock.Top);
            _border21._set_property_value_by_name("Background", DynamicResource(_border21, "Primary"));
            _border21._set_property_value_by_name("Padding", new Thickness(16, 12, 16, 12));
            const _textBlock22 = new TextBlock();
            _textBlock22._set_property_value_by_name("Text", "ContextMenu — right-click any panel; the nearest ancestor's menu opens at the cursor.");
            _textBlock22._set_property_value_by_name("FontSize", 15);
            _textBlock22._set_property_value_by_name("FontWeight", FontWeight.Bold);
            _textBlock22._set_property_value_by_name("Foreground", DynamicResource(_textBlock22, "OnPrimary"));
            _border21.SetChild(_textBlock22);
            _dockPanel20.AddChild(_border21);
            const _stackPanel23 = new StackPanel();
            _stackPanel23._set_property_value_by_name("Orientation", Orientation.Vertical);
            _stackPanel23._set_property_value_by_name("Margin", new Thickness(16, 16, 16, 16));
            const _stackPanel24 = new StackPanel();
            _stackPanel24._set_property_value_by_name("Orientation", Orientation.Horizontal);
            _stackPanel24._set_property_value_by_name("Margin", new Thickness(0, 0, 0, 16));
            const _border25 = new Border();
            _border25._set_property_value_by_name("Background", new SolidColorBrush(Color.FromHex('#ef4444')));
            _border25._set_property_value_by_name("Width", 180);
            _border25._set_property_value_by_name("Height", 120);
            _border25._set_property_value_by_name("Margin", new Thickness(0, 0, 12, 0));
            _border25._set_property_value_by_name(ContextMenuService, "ContextMenu", DynamicResource(_border25, "RedMenu"));
            const _textBlock26 = new TextBlock();
            _textBlock26._set_property_value_by_name("Text", "Right-click me");
            _textBlock26._set_property_value_by_name("Foreground", DynamicResource(_textBlock26, "OnPrimary"));
            _textBlock26._set_property_value_by_name("FontSize", 14);
            _textBlock26._set_property_value_by_name("FontWeight", FontWeight.Bold);
            _textBlock26._set_property_value_by_name("HorizontalAlignment", HorizontalAlignment.Center);
            _textBlock26._set_property_value_by_name("VerticalAlignment", VerticalAlignment.Center);
            _border25.SetChild(_textBlock26);
            _stackPanel24.AddChild(_border25);
            const _border27 = new Border();
            _border27._set_property_value_by_name("Background", new SolidColorBrush(Color.FromHex('#22c55e')));
            _border27._set_property_value_by_name("Width", 180);
            _border27._set_property_value_by_name("Height", 120);
            _border27._set_property_value_by_name("Margin", new Thickness(0, 0, 12, 0));
            _border27._set_property_value_by_name(ContextMenuService, "ContextMenu", DynamicResource(_border27, "GreenMenu"));
            const _textBlock28 = new TextBlock();
            _textBlock28._set_property_value_by_name("Text", "Right-click me");
            _textBlock28._set_property_value_by_name("Foreground", DynamicResource(_textBlock28, "OnPrimary"));
            _textBlock28._set_property_value_by_name("FontSize", 14);
            _textBlock28._set_property_value_by_name("FontWeight", FontWeight.Bold);
            _textBlock28._set_property_value_by_name("HorizontalAlignment", HorizontalAlignment.Center);
            _textBlock28._set_property_value_by_name("VerticalAlignment", VerticalAlignment.Center);
            _border27.SetChild(_textBlock28);
            _stackPanel24.AddChild(_border27);
            const _border29 = new Border();
            _border29._set_property_value_by_name("Background", new SolidColorBrush(Color.FromHex('#3b82f6')));
            _border29._set_property_value_by_name("Width", 180);
            _border29._set_property_value_by_name("Height", 120);
            _border29._set_property_value_by_name(ContextMenuService, "ContextMenu", DynamicResource(_border29, "BlueMenu"));
            const _textBlock30 = new TextBlock();
            _textBlock30._set_property_value_by_name("Text", "Right-click me");
            _textBlock30._set_property_value_by_name("Foreground", DynamicResource(_textBlock30, "OnPrimary"));
            _textBlock30._set_property_value_by_name("FontSize", 14);
            _textBlock30._set_property_value_by_name("FontWeight", FontWeight.Bold);
            _textBlock30._set_property_value_by_name("HorizontalAlignment", HorizontalAlignment.Center);
            _textBlock30._set_property_value_by_name("VerticalAlignment", VerticalAlignment.Center);
            _border29.SetChild(_textBlock30);
            _stackPanel24.AddChild(_border29);
            _stackPanel23.AddChild(_stackPanel24);
            const _textBlock31 = new TextBlock();
            _textBlock31._set_property_value_by_name("Text", DataContextBinding(_textBlock31, "Status"));
            _textBlock31._set_property_value_by_name("FontSize", 13);
            _textBlock31._set_property_value_by_name("Foreground", DynamicResource(_textBlock31, "OnSurface"));
            _stackPanel23.AddChild(_textBlock31);
            _dockPanel20.AddChild(_stackPanel23);
            _border19.SetChild(_dockPanel20);
            return _border19;
        }, ContextMenuVM);
        t.Set("ContextMenuTemplate", _tmpl18);
        return t;
    }
    get RedMenu() { return this.Resolve("RedMenu"); }
    set RedMenu(v) { this.Set("RedMenu", v); }
    get GreenMenu() { return this.Resolve("GreenMenu"); }
    set GreenMenu(v) { this.Set("GreenMenu", v); }
    get BlueMenu() { return this.Resolve("BlueMenu"); }
    set BlueMenu(v) { this.Set("BlueMenu", v); }
    get ContextMenuTemplate() { return this.Resolve("ContextMenuTemplate"); }
    set ContextMenuTemplate(v) { this.Set("ContextMenuTemplate", v); }
}
