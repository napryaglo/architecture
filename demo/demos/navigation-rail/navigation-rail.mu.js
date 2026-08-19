import { NavigationRailVM } from "./navigation-rail-vm.mjs";
import { Border, DataTemplate, Dock, DockPanel, Orientation, StackPanel, TextBlock } from "@pragmatic-lab/mural/basic";
import { NavigationItem } from "@pragmatic-lab/mural/framework/navigation/navigation-item.js";
import { NavigationRail } from "@pragmatic-lab/mural/framework/navigation/navigation-rail.js";
import { DataContextBinding, DynamicResource, HorizontalAlignment, ResourceDictionary, Thickness, VerticalAlignment } from "@pragmatic-lab/mural/runtime";
import { FontWeight, Pen } from "@pragmatic-lab/mural/visual-engine";


const _gate_NavigationRailDemo = Symbol("NavigationRailDemo.ctor");
export class NavigationRailDemo extends ResourceDictionary {
    constructor(_g) {
        super();
        if (_g !== _gate_NavigationRailDemo) {
            throw new Error("NavigationRailDemo is private — use NavigationRailDemo.Clone()");
        }
    }
    static Clone() {
        const t = new NavigationRailDemo(_gate_NavigationRailDemo);
        const _tmpl0 = new DataTemplate((_data) => {
            const _border1 = new Border();
            _border1.set_property_value(Border.FillKey, DynamicResource(_border1, "Surface"));
            _border1.set_property_value(Border.StrokeKey, ((_e) => { _e.Brush = DynamicResource(_e, "OutlineVariant"); return _e; })(new Pen()));
            _border1.set_property_value(Border.BorderThicknessKey, new Thickness(1));
            const _dockPanel2 = new DockPanel();
            const _border3 = new Border();
            _border3.set_property_value(DockPanel.DockKey, Dock.Top);
            _border3.set_property_value(Border.FillKey, DynamicResource(_border3, "Primary"));
            _border3.set_property_value(Border.PaddingKey, new Thickness(16, 12, 16, 12));
            const _textBlock4 = new TextBlock();
            _textBlock4.set_property_value(TextBlock.TextKey, "NavigationRail — M3 vertical destination strip with selectable items.");
            _textBlock4.set_property_value(TextBlock.FontSizeKey, 15);
            _textBlock4.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _textBlock4.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock4, "OnPrimary"));
            _border3.SetChild(_textBlock4);
            _dockPanel2.AddChild(_border3);
            const _dockPanel5 = new DockPanel();
            _dockPanel5.set_property_value(DockPanel.LastChildFillKey, true);
            const _navigationRail6 = new NavigationRail();
            _navigationRail6.set_property_value(DockPanel.DockKey, Dock.Left);
            _navigationRail6.set_property_value(NavigationRail.SelectedItemKey, DataContextBinding(_navigationRail6, "SelectedItem"));
            const _navigationItem7 = new NavigationItem();
            _navigationItem7.set_property_value(NavigationItem.LabelKey, "Home");
            const _textBlock8 = new TextBlock();
            _textBlock8.set_property_value(TextBlock.TextKey, "home");
            _textBlock8.set_property_value(TextBlock.FontFamilyKey, "Material Symbols Outlined");
            _textBlock8.set_property_value(TextBlock.FontSizeKey, 24);
            _navigationItem7.Content = _textBlock8;
            _navigationRail6.AddChild(_navigationItem7);
            const _navigationItem9 = new NavigationItem();
            _navigationItem9.set_property_value(NavigationItem.LabelKey, "Search");
            const _textBlock10 = new TextBlock();
            _textBlock10.set_property_value(TextBlock.TextKey, "search");
            _textBlock10.set_property_value(TextBlock.FontFamilyKey, "Material Symbols Outlined");
            _textBlock10.set_property_value(TextBlock.FontSizeKey, 24);
            _navigationItem9.Content = _textBlock10;
            _navigationRail6.AddChild(_navigationItem9);
            const _navigationItem11 = new NavigationItem();
            _navigationItem11.set_property_value(NavigationItem.LabelKey, "Library");
            const _textBlock12 = new TextBlock();
            _textBlock12.set_property_value(TextBlock.TextKey, "library_books");
            _textBlock12.set_property_value(TextBlock.FontFamilyKey, "Material Symbols Outlined");
            _textBlock12.set_property_value(TextBlock.FontSizeKey, 24);
            _navigationItem11.Content = _textBlock12;
            _navigationRail6.AddChild(_navigationItem11);
            const _navigationItem13 = new NavigationItem();
            _navigationItem13.set_property_value(NavigationItem.LabelKey, "Settings");
            const _textBlock14 = new TextBlock();
            _textBlock14.set_property_value(TextBlock.TextKey, "settings");
            _textBlock14.set_property_value(TextBlock.FontFamilyKey, "Material Symbols Outlined");
            _textBlock14.set_property_value(TextBlock.FontSizeKey, 24);
            _navigationItem13.Content = _textBlock14;
            _navigationRail6.AddChild(_navigationItem13);
            _dockPanel5.AddChild(_navigationRail6);
            const _stackPanel15 = new StackPanel();
            _stackPanel15.set_property_value(StackPanel.OrientationKey, Orientation.Vertical);
            _stackPanel15.set_property_value(StackPanel.VerticalAlignmentKey, VerticalAlignment.Center);
            _stackPanel15.set_property_value(StackPanel.HorizontalAlignmentKey, HorizontalAlignment.Center);
            const _textBlock16 = new TextBlock();
            _textBlock16.set_property_value(TextBlock.TextKey, "Active destination");
            _textBlock16.set_property_value(TextBlock.FontSizeKey, 12);
            _textBlock16.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock16, "OnSurfaceVariant"));
            _textBlock16.set_property_value(TextBlock.HorizontalAlignmentKey, HorizontalAlignment.Center);
            _stackPanel15.AddChild(_textBlock16);
            const _textBlock17 = new TextBlock();
            _textBlock17.set_property_value(TextBlock.TextKey, DataContextBinding(_textBlock17, "ActiveLabel"));
            _textBlock17.set_property_value(TextBlock.FontSizeKey, 40);
            _textBlock17.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _textBlock17.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock17, "OnSurface"));
            _textBlock17.set_property_value(TextBlock.HorizontalAlignmentKey, HorizontalAlignment.Center);
            _textBlock17.set_property_value(TextBlock.MarginKey, new Thickness(0, 8, 0, 0));
            _stackPanel15.AddChild(_textBlock17);
            _dockPanel5.AddChild(_stackPanel15);
            _dockPanel2.AddChild(_dockPanel5);
            _border1.SetChild(_dockPanel2);
            return _border1;
        }, NavigationRailVM);
        t.Set(NavigationRailVM, _tmpl0);
        return t;
    }
}
