import { MenuVM } from "./menu-vm.mjs";
import { Border, DataTemplate, Dock, DockPanel, Orientation, StackPanel, TextBlock } from "@visualisation-sub/mural/Basic";
import { MenuButton, MenuItem, MenuSeparator } from "@visualisation-sub/mural/framework/surface.js";
import { DataContextBinding, DynamicResource, ResourceDictionary, Thickness } from "@visualisation-sub/mural/runtime";
import { FontWeight } from "@visualisation-sub/mural/visual-engine";


const _gate_MenuDemo = Symbol("MenuDemo.ctor");
export class MenuDemo extends ResourceDictionary {
    constructor(_g) {
        super();
        if (_g !== _gate_MenuDemo) {
            throw new Error("MenuDemo is private — use MenuDemo.Clone()");
        }
    }
    static Clone() {
        const t = new MenuDemo(_gate_MenuDemo);
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
            _textBlock4._set_property_value_by_name("Text", "MenuButton — hamburger fly-out with checkable items and gesture text.");
            _textBlock4._set_property_value_by_name("FontSize", 15);
            _textBlock4._set_property_value_by_name("FontWeight", FontWeight.Bold);
            _textBlock4._set_property_value_by_name("Foreground", DynamicResource(_textBlock4, "OnPrimary"));
            _border3.SetChild(_textBlock4);
            _dockPanel2.AddChild(_border3);
            const _stackPanel5 = new StackPanel();
            _stackPanel5._set_property_value_by_name("Orientation", Orientation.Vertical);
            _stackPanel5._set_property_value_by_name("Margin", new Thickness(16, 16, 16, 16));
            const _textBlock6 = new TextBlock();
            _textBlock6._set_property_value_by_name("Text", "Click the button to open the menu:");
            _textBlock6._set_property_value_by_name("FontSize", 12);
            _textBlock6._set_property_value_by_name("Foreground", DynamicResource(_textBlock6, "OnSurfaceVariant"));
            _textBlock6._set_property_value_by_name("Margin", new Thickness(0, 0, 0, 8));
            _stackPanel5.AddChild(_textBlock6);
            const _menuButton7 = new MenuButton();
            _menuButton7._set_property_value_by_name("Header", "☰  File");
            const _menuItem8 = new MenuItem();
            _menuItem8._set_property_value_by_name("Header", "New");
            _menuItem8._set_property_value_by_name("InputGestureText", "Ctrl+N");
            _menuItem8._set_property_value_by_name("Command", DataContextBinding(_menuItem8, "NewCommand"));
            _menuButton7.AddChild(_menuItem8);
            const _menuItem9 = new MenuItem();
            _menuItem9._set_property_value_by_name("Header", "Open…");
            _menuItem9._set_property_value_by_name("InputGestureText", "Ctrl+O");
            _menuItem9._set_property_value_by_name("Command", DataContextBinding(_menuItem9, "OpenCommand"));
            _menuButton7.AddChild(_menuItem9);
            const _menuSeparator10 = new MenuSeparator();
            _menuButton7.AddChild(_menuSeparator10);
            const _menuItem11 = new MenuItem();
            _menuItem11._set_property_value_by_name("Header", "Save");
            _menuItem11._set_property_value_by_name("InputGestureText", "Ctrl+S");
            _menuItem11._set_property_value_by_name("Command", DataContextBinding(_menuItem11, "SaveCommand"));
            _menuButton7.AddChild(_menuItem11);
            const _menuItem12 = new MenuItem();
            _menuItem12._set_property_value_by_name("Header", "Save As…");
            _menuItem12._set_property_value_by_name("InputGestureText", "Ctrl+Shift+S");
            _menuItem12._set_property_value_by_name("Command", DataContextBinding(_menuItem12, "SaveAsCommand"));
            _menuButton7.AddChild(_menuItem12);
            const _menuSeparator13 = new MenuSeparator();
            _menuButton7.AddChild(_menuSeparator13);
            const _menuItem14 = new MenuItem();
            _menuItem14._set_property_value_by_name("Header", "Close");
            _menuItem14._set_property_value_by_name("InputGestureText", "Ctrl+F4");
            _menuItem14._set_property_value_by_name("Command", DataContextBinding(_menuItem14, "CloseCommand"));
            _menuButton7.AddChild(_menuItem14);
            const _menuSeparator15 = new MenuSeparator();
            _menuButton7.AddChild(_menuSeparator15);
            const _menuItem16 = new MenuItem();
            _menuItem16._set_property_value_by_name("Header", "Undo");
            _menuItem16._set_property_value_by_name("InputGestureText", "Ctrl+Z");
            _menuItem16._set_property_value_by_name("Command", DataContextBinding(_menuItem16, "UndoCommand"));
            _menuButton7.AddChild(_menuItem16);
            const _menuItem17 = new MenuItem();
            _menuItem17._set_property_value_by_name("Header", "Redo");
            _menuItem17._set_property_value_by_name("InputGestureText", "Ctrl+Y");
            _menuItem17._set_property_value_by_name("Command", DataContextBinding(_menuItem17, "RedoCommand"));
            _menuButton7.AddChild(_menuItem17);
            const _menuSeparator18 = new MenuSeparator();
            _menuButton7.AddChild(_menuSeparator18);
            const _menuItem19 = new MenuItem();
            _menuItem19._set_property_value_by_name("Header", "Show Grid");
            _menuItem19._set_property_value_by_name("IsCheckable", true);
            _menuItem19._set_property_value_by_name("IsChecked", DataContextBinding(_menuItem19, "ShowGrid"));
            _menuItem19._set_property_value_by_name("Command", DataContextBinding(_menuItem19, "ShowGridCommand"));
            _menuButton7.AddChild(_menuItem19);
            const _menuItem20 = new MenuItem();
            _menuItem20._set_property_value_by_name("Header", "Snap to Grid");
            _menuItem20._set_property_value_by_name("IsCheckable", true);
            _menuItem20._set_property_value_by_name("IsChecked", DataContextBinding(_menuItem20, "SnapToGrid"));
            _menuItem20._set_property_value_by_name("Command", DataContextBinding(_menuItem20, "SnapToGridCommand"));
            _menuButton7.AddChild(_menuItem20);
            _stackPanel5.AddChild(_menuButton7);
            const _textBlock21 = new TextBlock();
            _textBlock21._set_property_value_by_name("Text", DataContextBinding(_textBlock21, "Status"));
            _textBlock21._set_property_value_by_name("FontSize", 13);
            _textBlock21._set_property_value_by_name("Foreground", DynamicResource(_textBlock21, "OnSurface"));
            _textBlock21._set_property_value_by_name("Margin", new Thickness(0, 16, 0, 0));
            _stackPanel5.AddChild(_textBlock21);
            _dockPanel2.AddChild(_stackPanel5);
            _border1.SetChild(_dockPanel2);
            return _border1;
        }, MenuVM);
        t.Set("MenuTemplate", _tmpl0);
        return t;
    }
    get MenuTemplate() { return this.Resolve("MenuTemplate"); }
    set MenuTemplate(v) { this.Set("MenuTemplate", v); }
}
