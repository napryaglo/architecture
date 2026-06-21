import { DragDropVM, ItemVM } from "./drag-drop-vm.mjs";
import { Border, DataTemplate, Dock, DockPanel, Orientation, StackPanel, TextBlock, TextWrapping } from "@visualisation-sub/mural/basic";
import { ListBox, ListBoxItem } from "@visualisation-sub/mural/framework/list/list-box.js";
import { DataContextBinding, DynamicResource, NameScope, ResourceDictionary, Setter, SetterFactory, Style, Thickness, VerticalAlignment } from "@visualisation-sub/mural/runtime";
import { FontWeight } from "@visualisation-sub/mural/visual-engine";


const _gate_DragDropDemo = Symbol("DragDropDemo.ctor");
export class DragDropDemo extends ResourceDictionary {
    constructor(_g) {
        super();
        if (_g !== _gate_DragDropDemo) {
            throw new Error("DragDropDemo is private — use DragDropDemo.Clone()");
        }
    }
    static Clone() {
        const t = new DragDropDemo(_gate_DragDropDemo);
        const _tmpl0 = new DataTemplate((_data) => {
            const _textBlock1 = new TextBlock();
            _textBlock1.set_property_value(TextBlock.TextKey, DataContextBinding(_textBlock1, "Label"));
            _textBlock1.set_property_value(TextBlock.MarginKey, new Thickness(8, 4, 8, 4));
            _textBlock1.set_property_value(TextBlock.FontSizeKey, 12);
            return _textBlock1;
        }, ItemVM);
        t.Set(ItemVM, _tmpl0);
        const _tmpl2 = new DataTemplate((_data) => {
            const _border3 = new Border();
            _border3.SetNameScope(new NameScope());
            _border3.set_property_value(Border.BackgroundKey, DynamicResource(_border3, "Surface"));
            _border3.set_property_value(Border.BorderBrushKey, DynamicResource(_border3, "OutlineVariant"));
            _border3.set_property_value(Border.BorderThicknessKey, new Thickness(1));
            const _rd4 = _border3.Resources;
            const _setter5 = new Setter(ListBoxItem, "IsDraggable", true);
            const _setter6 = new Setter(ListBoxItem, "OnDragStart", new SetterFactory((_t) => DataContextBinding(_t, "BeginDragData")));
            const _style7 = new Style(ListBoxItem, [_setter5, _setter6], undefined, [], []);
            _rd4.Set(ListBoxItem, _style7);
            const _dockPanel8 = new DockPanel();
            const _border9 = new Border();
            _border9.set_property_value(DockPanel.DockKey, Dock.Top);
            _border9.set_property_value(Border.BackgroundKey, DynamicResource(_border9, "Primary"));
            _border9.set_property_value(Border.PaddingKey, new Thickness(16, 12, 16, 12));
            const _stackPanel10 = new StackPanel();
            _stackPanel10.set_property_value(StackPanel.OrientationKey, Orientation.Horizontal);
            const _textBlock11 = new TextBlock();
            _textBlock11.set_property_value(TextBlock.TextKey, "Drag-drop between lists");
            _textBlock11.set_property_value(TextBlock.FontSizeKey, 15);
            _textBlock11.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _textBlock11.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock11, "OnPrimary"));
            _stackPanel10.AddChild(_textBlock11);
            const _textBlock12 = new TextBlock();
            _textBlock12.set_property_value(TextBlock.TextKey, DataContextBinding(_textBlock12, "Status"));
            _textBlock12.set_property_value(TextBlock.FontSizeKey, 12);
            _textBlock12.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock12, "OnPrimary"));
            _textBlock12.set_property_value(TextBlock.MarginKey, new Thickness(20, 4, 0, 0));
            _stackPanel10.AddChild(_textBlock12);
            _border9.SetChild(_stackPanel10);
            _dockPanel8.AddChild(_border9);
            const _textBlock13 = new TextBlock();
            _textBlock13.set_property_value(DockPanel.DockKey, Dock.Bottom);
            _textBlock13.set_property_value(TextBlock.MarginKey, new Thickness(20, 4, 20, 16));
            _textBlock13.set_property_value(TextBlock.FontSizeKey, 11);
            _textBlock13.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock13, "OnSurfaceVariant"));
            _textBlock13.set_property_value(TextBlock.TextWrappingKey, TextWrapping.Wrap);
            _textBlock13.set_property_value(TextBlock.TextKey, "Drag any item from one list to the other to move it. The framework's IsDraggable + OnDragStart binding starts the drag; a Behavior on each ListBox handles DragOver/Drop and dispatches to VM commands.");
            _dockPanel8.AddChild(_textBlock13);
            const _stackPanel14 = new StackPanel();
            _stackPanel14.set_property_value(StackPanel.OrientationKey, Orientation.Horizontal);
            _stackPanel14.set_property_value(StackPanel.MarginKey, new Thickness(20));
            _stackPanel14.set_property_value(StackPanel.VerticalAlignmentKey, VerticalAlignment.Stretch);
            const _border15 = new Border();
            _border15.set_property_value(Border.WidthKey, 220);
            _border15.set_property_value(Border.VerticalAlignmentKey, VerticalAlignment.Stretch);
            _border15.set_property_value(Border.MarginKey, new Thickness(0, 0, 16, 0));
            _border15.set_property_value(Border.BorderBrushKey, DynamicResource(_border15, "OutlineVariant"));
            _border15.set_property_value(Border.BorderThicknessKey, new Thickness(1));
            const _dockPanel16 = new DockPanel();
            const _textBlock17 = new TextBlock();
            _textBlock17.set_property_value(DockPanel.DockKey, Dock.Top);
            _textBlock17.set_property_value(TextBlock.TextKey, "Left");
            _textBlock17.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _textBlock17.set_property_value(TextBlock.FontSizeKey, 12);
            _textBlock17.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock17, "OnSurface"));
            _textBlock17.set_property_value(TextBlock.MarginKey, new Thickness(10, 8, 8, 4));
            _dockPanel16.AddChild(_textBlock17);
            const _listBox18 = new ListBox();
            _listBox18.Name = "leftList";
            _listBox18.set_property_value(ListBox.ItemsSourceKey, DataContextBinding(_listBox18, "LeftItems"));
            _dockPanel16.AddChild(_listBox18);
            _border15.SetChild(_dockPanel16);
            _stackPanel14.AddChild(_border15);
            const _border19 = new Border();
            _border19.set_property_value(Border.WidthKey, 220);
            _border19.set_property_value(Border.VerticalAlignmentKey, VerticalAlignment.Stretch);
            _border19.set_property_value(Border.BorderBrushKey, DynamicResource(_border19, "OutlineVariant"));
            _border19.set_property_value(Border.BorderThicknessKey, new Thickness(1));
            const _dockPanel20 = new DockPanel();
            const _textBlock21 = new TextBlock();
            _textBlock21.set_property_value(DockPanel.DockKey, Dock.Top);
            _textBlock21.set_property_value(TextBlock.TextKey, "Right");
            _textBlock21.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _textBlock21.set_property_value(TextBlock.FontSizeKey, 12);
            _textBlock21.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock21, "OnSurface"));
            _textBlock21.set_property_value(TextBlock.MarginKey, new Thickness(10, 8, 8, 4));
            _dockPanel20.AddChild(_textBlock21);
            const _listBox22 = new ListBox();
            _listBox22.Name = "rightList";
            _listBox22.set_property_value(ListBox.ItemsSourceKey, DataContextBinding(_listBox22, "RightItems"));
            _dockPanel20.AddChild(_listBox22);
            _border19.SetChild(_dockPanel20);
            _stackPanel14.AddChild(_border19);
            _dockPanel8.AddChild(_stackPanel14);
            _border3.SetChild(_dockPanel8);
            return _border3;
        }, DragDropVM);
        t.Set(DragDropVM, _tmpl2);
        return t;
    }
}
