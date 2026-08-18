import { MenuVM } from "./menu-vm.mjs";
import { Border, DataTemplate, Dock, DockPanel, Orientation, StackPanel, TextBlock } from "@pragmatic-lab/mural/basic";
import { MenuButton, MenuItem, MenuSeparator } from "@pragmatic-lab/mural/framework/surface.js";
import { DataContextBinding, DynamicResource, ResourceDictionary, Thickness } from "@pragmatic-lab/mural/runtime";
import { FontWeight } from "@pragmatic-lab/mural/visual-engine";


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
            _border1.set_property_value(Border.FillKey, DynamicResource(_border1, "Surface"));
            _border1.set_property_value(Border.BorderBrushKey, DynamicResource(_border1, "OutlineVariant"));
            _border1.set_property_value(Border.BorderThicknessKey, new Thickness(1));
            const _dockPanel2 = new DockPanel();
            const _border3 = new Border();
            _border3.set_property_value(DockPanel.DockKey, Dock.Top);
            _border3.set_property_value(Border.FillKey, DynamicResource(_border3, "Primary"));
            _border3.set_property_value(Border.PaddingKey, new Thickness(16, 12, 16, 12));
            const _textBlock4 = new TextBlock();
            _textBlock4.set_property_value(TextBlock.TextKey, "MenuButton — hamburger fly-out with checkable items and gesture text.");
            _textBlock4.set_property_value(TextBlock.FontSizeKey, 15);
            _textBlock4.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _textBlock4.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock4, "OnPrimary"));
            _border3.SetChild(_textBlock4);
            _dockPanel2.AddChild(_border3);
            const _stackPanel5 = new StackPanel();
            _stackPanel5.set_property_value(StackPanel.OrientationKey, Orientation.Vertical);
            _stackPanel5.set_property_value(StackPanel.MarginKey, new Thickness(16, 16, 16, 16));
            const _textBlock6 = new TextBlock();
            _textBlock6.set_property_value(TextBlock.TextKey, "Click the button to open the menu:");
            _textBlock6.set_property_value(TextBlock.FontSizeKey, 12);
            _textBlock6.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock6, "OnSurfaceVariant"));
            _textBlock6.set_property_value(TextBlock.MarginKey, new Thickness(0, 0, 0, 8));
            _stackPanel5.AddChild(_textBlock6);
            const _menuButton7 = new MenuButton();
            _menuButton7.set_property_value(MenuButton.HeaderKey, "☰  File");
            const _menuItem8 = new MenuItem();
            _menuItem8.set_property_value(MenuItem.HeaderKey, "New");
            _menuItem8.set_property_value(MenuItem.InputGestureTextKey, "Ctrl+N");
            _menuItem8.set_property_value(MenuItem.CommandKey, DataContextBinding(_menuItem8, "NewCommand"));
            _menuButton7.AddChild(_menuItem8);
            const _menuItem9 = new MenuItem();
            _menuItem9.set_property_value(MenuItem.HeaderKey, "Open…");
            _menuItem9.set_property_value(MenuItem.InputGestureTextKey, "Ctrl+O");
            _menuItem9.set_property_value(MenuItem.CommandKey, DataContextBinding(_menuItem9, "OpenCommand"));
            _menuButton7.AddChild(_menuItem9);
            const _menuSeparator10 = new MenuSeparator();
            _menuButton7.AddChild(_menuSeparator10);
            const _menuItem11 = new MenuItem();
            _menuItem11.set_property_value(MenuItem.HeaderKey, "Save");
            _menuItem11.set_property_value(MenuItem.InputGestureTextKey, "Ctrl+S");
            _menuItem11.set_property_value(MenuItem.CommandKey, DataContextBinding(_menuItem11, "SaveCommand"));
            _menuButton7.AddChild(_menuItem11);
            const _menuItem12 = new MenuItem();
            _menuItem12.set_property_value(MenuItem.HeaderKey, "Save As…");
            _menuItem12.set_property_value(MenuItem.InputGestureTextKey, "Ctrl+Shift+S");
            _menuItem12.set_property_value(MenuItem.CommandKey, DataContextBinding(_menuItem12, "SaveAsCommand"));
            _menuButton7.AddChild(_menuItem12);
            const _menuSeparator13 = new MenuSeparator();
            _menuButton7.AddChild(_menuSeparator13);
            const _menuItem14 = new MenuItem();
            _menuItem14.set_property_value(MenuItem.HeaderKey, "Close");
            _menuItem14.set_property_value(MenuItem.InputGestureTextKey, "Ctrl+F4");
            _menuItem14.set_property_value(MenuItem.CommandKey, DataContextBinding(_menuItem14, "CloseCommand"));
            _menuButton7.AddChild(_menuItem14);
            const _menuSeparator15 = new MenuSeparator();
            _menuButton7.AddChild(_menuSeparator15);
            const _menuItem16 = new MenuItem();
            _menuItem16.set_property_value(MenuItem.HeaderKey, "Undo");
            _menuItem16.set_property_value(MenuItem.InputGestureTextKey, "Ctrl+Z");
            _menuItem16.set_property_value(MenuItem.CommandKey, DataContextBinding(_menuItem16, "UndoCommand"));
            _menuButton7.AddChild(_menuItem16);
            const _menuItem17 = new MenuItem();
            _menuItem17.set_property_value(MenuItem.HeaderKey, "Redo");
            _menuItem17.set_property_value(MenuItem.InputGestureTextKey, "Ctrl+Y");
            _menuItem17.set_property_value(MenuItem.CommandKey, DataContextBinding(_menuItem17, "RedoCommand"));
            _menuButton7.AddChild(_menuItem17);
            const _menuSeparator18 = new MenuSeparator();
            _menuButton7.AddChild(_menuSeparator18);
            const _menuItem19 = new MenuItem();
            _menuItem19.set_property_value(MenuItem.HeaderKey, "Show Grid");
            _menuItem19.set_property_value(MenuItem.IsCheckableKey, true);
            _menuItem19.set_property_value(MenuItem.IsCheckedKey, DataContextBinding(_menuItem19, "ShowGrid"));
            _menuItem19.set_property_value(MenuItem.CommandKey, DataContextBinding(_menuItem19, "ShowGridCommand"));
            _menuButton7.AddChild(_menuItem19);
            const _menuItem20 = new MenuItem();
            _menuItem20.set_property_value(MenuItem.HeaderKey, "Snap to Grid");
            _menuItem20.set_property_value(MenuItem.IsCheckableKey, true);
            _menuItem20.set_property_value(MenuItem.IsCheckedKey, DataContextBinding(_menuItem20, "SnapToGrid"));
            _menuItem20.set_property_value(MenuItem.CommandKey, DataContextBinding(_menuItem20, "SnapToGridCommand"));
            _menuButton7.AddChild(_menuItem20);
            _stackPanel5.AddChild(_menuButton7);
            const _textBlock21 = new TextBlock();
            _textBlock21.set_property_value(TextBlock.TextKey, DataContextBinding(_textBlock21, "Status"));
            _textBlock21.set_property_value(TextBlock.FontSizeKey, 13);
            _textBlock21.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock21, "OnSurface"));
            _textBlock21.set_property_value(TextBlock.MarginKey, new Thickness(0, 16, 0, 0));
            _stackPanel5.AddChild(_textBlock21);
            _dockPanel2.AddChild(_stackPanel5);
            _border1.SetChild(_dockPanel2);
            return _border1;
        }, MenuVM);
        t.Set(MenuVM, _tmpl0);
        return t;
    }
}
