import { DragDropVM, ItemVM } from "./drag-drop-vm.mjs";
import { Border, DataTemplate, Dock, DockPanel, Orientation, StackPanel, TextBlock, TextWrapping } from "@pragmatic-lab/mural/basic";
import { ListBox, ListBoxItem } from "@pragmatic-lab/mural/framework/list/list-box.js";
import { DataContextBinding, DynamicResource, NameScope, ResourceDictionary, Setter, SetterFactory, Style, Thickness, VerticalAlignment } from "@pragmatic-lab/mural/runtime";
import { FontWeight } from "@pragmatic-lab/mural/visual-engine";


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
            let _listBox3, _listBox4;
            const _border5 = new Border();
            _border5.SetNameScope(new NameScope());
            _border5.set_property_value(Border.BackgroundKey, DynamicResource(_border5, "Surface"));
            _border5.set_property_value(Border.BorderBrushKey, DynamicResource(_border5, "OutlineVariant"));
            _border5.set_property_value(Border.BorderThicknessKey, new Thickness(1));
            const _rd6 = _border5.Resources;
            const _setter7 = new Setter(ListBoxItem, "IsDraggable", true);
            const _setter8 = new Setter(ListBoxItem, "OnDragStart", new SetterFactory((_t) => DataContextBinding(_t, "BeginDragData")));
            const _style9 = new Style(ListBoxItem, [_setter7, _setter8], undefined, [], []);
            _rd6.Set(ListBoxItem, _style9);
            const _dockPanel10 = new DockPanel();
            const _border11 = new Border();
            _border11.set_property_value(DockPanel.DockKey, Dock.Top);
            _border11.set_property_value(Border.BackgroundKey, DynamicResource(_border11, "Primary"));
            _border11.set_property_value(Border.PaddingKey, new Thickness(16, 12, 16, 12));
            const _stackPanel12 = new StackPanel();
            _stackPanel12.set_property_value(StackPanel.OrientationKey, Orientation.Horizontal);
            const _textBlock13 = new TextBlock();
            _textBlock13.set_property_value(TextBlock.TextKey, "Drag-drop between lists");
            _textBlock13.set_property_value(TextBlock.FontSizeKey, 15);
            _textBlock13.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _textBlock13.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock13, "OnPrimary"));
            _stackPanel12.AddChild(_textBlock13);
            const _textBlock14 = new TextBlock();
            _textBlock14.set_property_value(TextBlock.TextKey, DataContextBinding(_textBlock14, "Status"));
            _textBlock14.set_property_value(TextBlock.FontSizeKey, 12);
            _textBlock14.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock14, "OnPrimary"));
            _textBlock14.set_property_value(TextBlock.MarginKey, new Thickness(20, 4, 0, 0));
            _stackPanel12.AddChild(_textBlock14);
            _border11.SetChild(_stackPanel12);
            _dockPanel10.AddChild(_border11);
            const _textBlock15 = new TextBlock();
            _textBlock15.set_property_value(DockPanel.DockKey, Dock.Bottom);
            _textBlock15.set_property_value(TextBlock.MarginKey, new Thickness(20, 4, 20, 16));
            _textBlock15.set_property_value(TextBlock.FontSizeKey, 11);
            _textBlock15.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock15, "OnSurfaceVariant"));
            _textBlock15.set_property_value(TextBlock.TextWrappingKey, TextWrapping.Wrap);
            _textBlock15.set_property_value(TextBlock.TextKey, "Drag any item from one list to the other to move it. The framework's IsDraggable + OnDragStart binding starts the drag; a Behavior on each ListBox handles DragOver/Drop and dispatches to VM commands.");
            _dockPanel10.AddChild(_textBlock15);
            const _stackPanel16 = new StackPanel();
            _stackPanel16.set_property_value(StackPanel.OrientationKey, Orientation.Horizontal);
            _stackPanel16.set_property_value(StackPanel.MarginKey, new Thickness(20));
            _stackPanel16.set_property_value(StackPanel.VerticalAlignmentKey, VerticalAlignment.Stretch);
            const _border17 = new Border();
            _border17.set_property_value(Border.WidthKey, 220);
            _border17.set_property_value(Border.VerticalAlignmentKey, VerticalAlignment.Stretch);
            _border17.set_property_value(Border.MarginKey, new Thickness(0, 0, 16, 0));
            _border17.set_property_value(Border.BorderBrushKey, DynamicResource(_border17, "OutlineVariant"));
            _border17.set_property_value(Border.BorderThicknessKey, new Thickness(1));
            const _dockPanel18 = new DockPanel();
            const _textBlock19 = new TextBlock();
            _textBlock19.set_property_value(DockPanel.DockKey, Dock.Top);
            _textBlock19.set_property_value(TextBlock.TextKey, "Left");
            _textBlock19.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _textBlock19.set_property_value(TextBlock.FontSizeKey, 12);
            _textBlock19.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock19, "OnSurface"));
            _textBlock19.set_property_value(TextBlock.MarginKey, new Thickness(10, 8, 8, 4));
            _dockPanel18.AddChild(_textBlock19);
            _listBox3 = new ListBox();
            _listBox3.Name = "leftList";
            _listBox3.set_property_value(ListBox.ItemsSourceKey, DataContextBinding(_listBox3, "LeftItems"));
            _dockPanel18.AddChild(_listBox3);
            _border17.SetChild(_dockPanel18);
            _stackPanel16.AddChild(_border17);
            const _border20 = new Border();
            _border20.set_property_value(Border.WidthKey, 220);
            _border20.set_property_value(Border.VerticalAlignmentKey, VerticalAlignment.Stretch);
            _border20.set_property_value(Border.BorderBrushKey, DynamicResource(_border20, "OutlineVariant"));
            _border20.set_property_value(Border.BorderThicknessKey, new Thickness(1));
            const _dockPanel21 = new DockPanel();
            const _textBlock22 = new TextBlock();
            _textBlock22.set_property_value(DockPanel.DockKey, Dock.Top);
            _textBlock22.set_property_value(TextBlock.TextKey, "Right");
            _textBlock22.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _textBlock22.set_property_value(TextBlock.FontSizeKey, 12);
            _textBlock22.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock22, "OnSurface"));
            _textBlock22.set_property_value(TextBlock.MarginKey, new Thickness(10, 8, 8, 4));
            _dockPanel21.AddChild(_textBlock22);
            _listBox4 = new ListBox();
            _listBox4.Name = "rightList";
            _listBox4.set_property_value(ListBox.ItemsSourceKey, DataContextBinding(_listBox4, "RightItems"));
            _dockPanel21.AddChild(_listBox4);
            _border20.SetChild(_dockPanel21);
            _stackPanel16.AddChild(_border20);
            _dockPanel10.AddChild(_stackPanel16);
            _border5.SetChild(_dockPanel10);
            return _border5;
        }, DragDropVM);
        t.Set(DragDropVM, _tmpl2);
        return t;
    }
}
