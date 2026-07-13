import { ContextMenuVM } from "./context-menu-vm.mjs";
import { Border, DataTemplate, Dock, DockPanel, Orientation, StackPanel, TextBlock } from "@pragmatic-lab/mural/basic";
import { ContextMenu, ContextMenuService, MenuItem, MenuSeparator } from "@pragmatic-lab/mural/framework/surface.js";
import { Color, DataContextBinding, DynamicResource, HorizontalAlignment, ResourceDictionary, Thickness, VerticalAlignment } from "@pragmatic-lab/mural/runtime";
import { FontWeight, SolidColorBrush } from "@pragmatic-lab/mural/visual-engine";


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
        _menuItem1.set_property_value(MenuItem.HeaderKey, "Red — Cut");
        _menuItem1.set_property_value(MenuItem.CommandKey, DataContextBinding(_menuItem1, "RedCommand"));
        _menuItem1.set_property_value(MenuItem.CommandParameterKey, "Cut");
        _contextMenu0.AddChild(_menuItem1);
        const _menuItem2 = new MenuItem();
        _menuItem2.set_property_value(MenuItem.HeaderKey, "Red — Copy");
        _menuItem2.set_property_value(MenuItem.CommandKey, DataContextBinding(_menuItem2, "RedCommand"));
        _menuItem2.set_property_value(MenuItem.CommandParameterKey, "Copy");
        _contextMenu0.AddChild(_menuItem2);
        const _menuSeparator3 = new MenuSeparator();
        _contextMenu0.AddChild(_menuSeparator3);
        const _menuItem4 = new MenuItem();
        _menuItem4.set_property_value(MenuItem.HeaderKey, "Red — Delete");
        _menuItem4.set_property_value(MenuItem.CommandKey, DataContextBinding(_menuItem4, "RedCommand"));
        _menuItem4.set_property_value(MenuItem.CommandParameterKey, "Delete");
        _contextMenu0.AddChild(_menuItem4);
        t.Set("RedMenu", _contextMenu0);
        const _contextMenu5 = new ContextMenu();
        const _menuItem6 = new MenuItem();
        _menuItem6.set_property_value(MenuItem.HeaderKey, "Green — Inspect");
        _menuItem6.set_property_value(MenuItem.CommandKey, DataContextBinding(_menuItem6, "GreenCommand"));
        _menuItem6.set_property_value(MenuItem.CommandParameterKey, "Inspect");
        _contextMenu5.AddChild(_menuItem6);
        const _menuItem7 = new MenuItem();
        _menuItem7.set_property_value(MenuItem.HeaderKey, "Green — Highlight");
        _menuItem7.set_property_value(MenuItem.CommandKey, DataContextBinding(_menuItem7, "GreenCommand"));
        _menuItem7.set_property_value(MenuItem.CommandParameterKey, "Highlight");
        _contextMenu5.AddChild(_menuItem7);
        const _menuSeparator8 = new MenuSeparator();
        _contextMenu5.AddChild(_menuSeparator8);
        const _menuItem9 = new MenuItem();
        _menuItem9.set_property_value(MenuItem.HeaderKey, "Green — Rename");
        _menuItem9.set_property_value(MenuItem.CommandKey, DataContextBinding(_menuItem9, "GreenCommand"));
        _menuItem9.set_property_value(MenuItem.CommandParameterKey, "Rename");
        _contextMenu5.AddChild(_menuItem9);
        t.Set("GreenMenu", _contextMenu5);
        const _contextMenu10 = new ContextMenu();
        const _menuItem11 = new MenuItem();
        _menuItem11.set_property_value(MenuItem.HeaderKey, "Blue — Open");
        _menuItem11.set_property_value(MenuItem.CommandKey, DataContextBinding(_menuItem11, "BlueCommand"));
        _menuItem11.set_property_value(MenuItem.CommandParameterKey, "Open");
        _contextMenu10.AddChild(_menuItem11);
        const _menuItem12 = new MenuItem();
        _menuItem12.set_property_value(MenuItem.HeaderKey, "Blue — Bookmark");
        _menuItem12.set_property_value(MenuItem.CommandKey, DataContextBinding(_menuItem12, "BlueCommand"));
        _menuItem12.set_property_value(MenuItem.CommandParameterKey, "Bookmark");
        _contextMenu10.AddChild(_menuItem12);
        const _menuSeparator13 = new MenuSeparator();
        _contextMenu10.AddChild(_menuSeparator13);
        const _menuItem14 = new MenuItem();
        _menuItem14.set_property_value(MenuItem.HeaderKey, "Blue — Share");
        _menuItem14.set_property_value(MenuItem.CommandKey, DataContextBinding(_menuItem14, "BlueCommand"));
        _menuItem14.set_property_value(MenuItem.CommandParameterKey, "Share");
        _contextMenu10.AddChild(_menuItem14);
        t.Set("BlueMenu", _contextMenu10);
        const _tmpl15 = new DataTemplate((_data) => {
            const _border16 = new Border();
            _border16.set_property_value(Border.BackgroundKey, DynamicResource(_border16, "Surface"));
            _border16.set_property_value(Border.BorderBrushKey, DynamicResource(_border16, "OutlineVariant"));
            _border16.set_property_value(Border.BorderThicknessKey, new Thickness(1));
            const _dockPanel17 = new DockPanel();
            const _border18 = new Border();
            _border18.set_property_value(DockPanel.DockKey, Dock.Top);
            _border18.set_property_value(Border.BackgroundKey, DynamicResource(_border18, "Primary"));
            _border18.set_property_value(Border.PaddingKey, new Thickness(16, 12, 16, 12));
            const _textBlock19 = new TextBlock();
            _textBlock19.set_property_value(TextBlock.TextKey, "ContextMenu — right-click any panel; the nearest ancestor's menu opens at the cursor.");
            _textBlock19.set_property_value(TextBlock.FontSizeKey, 15);
            _textBlock19.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _textBlock19.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock19, "OnPrimary"));
            _border18.SetChild(_textBlock19);
            _dockPanel17.AddChild(_border18);
            const _stackPanel20 = new StackPanel();
            _stackPanel20.set_property_value(StackPanel.OrientationKey, Orientation.Vertical);
            _stackPanel20.set_property_value(StackPanel.MarginKey, new Thickness(16, 16, 16, 16));
            const _stackPanel21 = new StackPanel();
            _stackPanel21.set_property_value(StackPanel.OrientationKey, Orientation.Horizontal);
            _stackPanel21.set_property_value(StackPanel.MarginKey, new Thickness(0, 0, 0, 16));
            const _border22 = new Border();
            _border22.set_property_value(Border.BackgroundKey, new SolidColorBrush(Color.FromHex('#ef4444')));
            _border22.set_property_value(Border.WidthKey, 180);
            _border22.set_property_value(Border.HeightKey, 120);
            _border22.set_property_value(Border.MarginKey, new Thickness(0, 0, 12, 0));
            _border22.set_property_value(ContextMenuService.ContextMenuKey, DynamicResource(_border22, "RedMenu"));
            const _textBlock23 = new TextBlock();
            _textBlock23.set_property_value(TextBlock.TextKey, "Right-click me");
            _textBlock23.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock23, "OnPrimary"));
            _textBlock23.set_property_value(TextBlock.FontSizeKey, 14);
            _textBlock23.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _textBlock23.set_property_value(TextBlock.HorizontalAlignmentKey, HorizontalAlignment.Center);
            _textBlock23.set_property_value(TextBlock.VerticalAlignmentKey, VerticalAlignment.Center);
            _border22.SetChild(_textBlock23);
            _stackPanel21.AddChild(_border22);
            const _border24 = new Border();
            _border24.set_property_value(Border.BackgroundKey, new SolidColorBrush(Color.FromHex('#22c55e')));
            _border24.set_property_value(Border.WidthKey, 180);
            _border24.set_property_value(Border.HeightKey, 120);
            _border24.set_property_value(Border.MarginKey, new Thickness(0, 0, 12, 0));
            _border24.set_property_value(ContextMenuService.ContextMenuKey, DynamicResource(_border24, "GreenMenu"));
            const _textBlock25 = new TextBlock();
            _textBlock25.set_property_value(TextBlock.TextKey, "Right-click me");
            _textBlock25.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock25, "OnPrimary"));
            _textBlock25.set_property_value(TextBlock.FontSizeKey, 14);
            _textBlock25.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _textBlock25.set_property_value(TextBlock.HorizontalAlignmentKey, HorizontalAlignment.Center);
            _textBlock25.set_property_value(TextBlock.VerticalAlignmentKey, VerticalAlignment.Center);
            _border24.SetChild(_textBlock25);
            _stackPanel21.AddChild(_border24);
            const _border26 = new Border();
            _border26.set_property_value(Border.BackgroundKey, new SolidColorBrush(Color.FromHex('#3b82f6')));
            _border26.set_property_value(Border.WidthKey, 180);
            _border26.set_property_value(Border.HeightKey, 120);
            _border26.set_property_value(ContextMenuService.ContextMenuKey, DynamicResource(_border26, "BlueMenu"));
            const _textBlock27 = new TextBlock();
            _textBlock27.set_property_value(TextBlock.TextKey, "Right-click me");
            _textBlock27.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock27, "OnPrimary"));
            _textBlock27.set_property_value(TextBlock.FontSizeKey, 14);
            _textBlock27.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _textBlock27.set_property_value(TextBlock.HorizontalAlignmentKey, HorizontalAlignment.Center);
            _textBlock27.set_property_value(TextBlock.VerticalAlignmentKey, VerticalAlignment.Center);
            _border26.SetChild(_textBlock27);
            _stackPanel21.AddChild(_border26);
            _stackPanel20.AddChild(_stackPanel21);
            const _textBlock28 = new TextBlock();
            _textBlock28.set_property_value(TextBlock.TextKey, DataContextBinding(_textBlock28, "Status"));
            _textBlock28.set_property_value(TextBlock.FontSizeKey, 13);
            _textBlock28.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock28, "OnSurface"));
            _stackPanel20.AddChild(_textBlock28);
            _dockPanel17.AddChild(_stackPanel20);
            _border16.SetChild(_dockPanel17);
            return _border16;
        }, ContextMenuVM);
        t.Set(ContextMenuVM, _tmpl15);
        return t;
    }
    get RedMenu() { return this.Resolve("RedMenu"); }
    set RedMenu(v) { this.Set("RedMenu", v); }
    get GreenMenu() { return this.Resolve("GreenMenu"); }
    set GreenMenu(v) { this.Set("GreenMenu", v); }
    get BlueMenu() { return this.Resolve("BlueMenu"); }
    set BlueMenu(v) { this.Set("BlueMenu", v); }
}
