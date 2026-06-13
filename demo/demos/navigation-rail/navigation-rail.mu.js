import { NavigationRailVM } from "./navigation-rail-vm.mjs";
import { Border, DataTemplate, Dock, DockPanel, Orientation, StackPanel, TextBlock } from "@visualisation-sub/mural/basic";
import { NavigationItem } from "@visualisation-sub/mural/framework/navigation/navigation-item.js";
import { NavigationRail } from "@visualisation-sub/mural/framework/navigation/navigation-rail.js";
import { DataContextBinding, DynamicResource, HorizontalAlignment, ResourceDictionary, Thickness, VerticalAlignment } from "@visualisation-sub/mural/runtime";
import { FontWeight } from "@visualisation-sub/mural/visual-engine";


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
            _border1._set_property_value_by_name("Background", DynamicResource(_border1, "Surface"));
            _border1._set_property_value_by_name("BorderBrush", DynamicResource(_border1, "OutlineVariant"));
            _border1._set_property_value_by_name("BorderThickness", new Thickness(1));
            const _dockPanel2 = new DockPanel();
            const _border3 = new Border();
            _border3._set_property_value_by_name(DockPanel, "Dock", Dock.Top);
            _border3._set_property_value_by_name("Background", DynamicResource(_border3, "Primary"));
            _border3._set_property_value_by_name("Padding", new Thickness(16, 12, 16, 12));
            const _textBlock4 = new TextBlock();
            _textBlock4._set_property_value_by_name("Text", "NavigationRail — M3 vertical destination strip with selectable items.");
            _textBlock4._set_property_value_by_name("FontSize", 15);
            _textBlock4._set_property_value_by_name("FontWeight", FontWeight.Bold);
            _textBlock4._set_property_value_by_name("Foreground", DynamicResource(_textBlock4, "OnPrimary"));
            _border3.SetChild(_textBlock4);
            _dockPanel2.AddChild(_border3);
            const _dockPanel5 = new DockPanel();
            _dockPanel5._set_property_value_by_name("LastChildFill", true);
            const _navigationRail6 = new NavigationRail();
            _navigationRail6._set_property_value_by_name(DockPanel, "Dock", Dock.Left);
            _navigationRail6._set_property_value_by_name("SelectedItem", DataContextBinding(_navigationRail6, "SelectedItem"));
            const _navigationItem7 = new NavigationItem();
            _navigationItem7._set_property_value_by_name("Label", "Home");
            const _textBlock8 = new TextBlock();
            _textBlock8._set_property_value_by_name("Text", "home");
            _textBlock8._set_property_value_by_name("FontFamily", "Material Symbols Outlined");
            _textBlock8._set_property_value_by_name("FontSize", 24);
            _navigationItem7.Content = _textBlock8;
            _navigationRail6.AddChild(_navigationItem7);
            const _navigationItem9 = new NavigationItem();
            _navigationItem9._set_property_value_by_name("Label", "Search");
            const _textBlock10 = new TextBlock();
            _textBlock10._set_property_value_by_name("Text", "search");
            _textBlock10._set_property_value_by_name("FontFamily", "Material Symbols Outlined");
            _textBlock10._set_property_value_by_name("FontSize", 24);
            _navigationItem9.Content = _textBlock10;
            _navigationRail6.AddChild(_navigationItem9);
            const _navigationItem11 = new NavigationItem();
            _navigationItem11._set_property_value_by_name("Label", "Library");
            const _textBlock12 = new TextBlock();
            _textBlock12._set_property_value_by_name("Text", "library_books");
            _textBlock12._set_property_value_by_name("FontFamily", "Material Symbols Outlined");
            _textBlock12._set_property_value_by_name("FontSize", 24);
            _navigationItem11.Content = _textBlock12;
            _navigationRail6.AddChild(_navigationItem11);
            const _navigationItem13 = new NavigationItem();
            _navigationItem13._set_property_value_by_name("Label", "Settings");
            const _textBlock14 = new TextBlock();
            _textBlock14._set_property_value_by_name("Text", "settings");
            _textBlock14._set_property_value_by_name("FontFamily", "Material Symbols Outlined");
            _textBlock14._set_property_value_by_name("FontSize", 24);
            _navigationItem13.Content = _textBlock14;
            _navigationRail6.AddChild(_navigationItem13);
            _dockPanel5.AddChild(_navigationRail6);
            const _stackPanel15 = new StackPanel();
            _stackPanel15._set_property_value_by_name("Orientation", Orientation.Vertical);
            _stackPanel15._set_property_value_by_name("VerticalAlignment", VerticalAlignment.Center);
            _stackPanel15._set_property_value_by_name("HorizontalAlignment", HorizontalAlignment.Center);
            const _textBlock16 = new TextBlock();
            _textBlock16._set_property_value_by_name("Text", "Active destination");
            _textBlock16._set_property_value_by_name("FontSize", 12);
            _textBlock16._set_property_value_by_name("Foreground", DynamicResource(_textBlock16, "OnSurfaceVariant"));
            _textBlock16._set_property_value_by_name("HorizontalAlignment", HorizontalAlignment.Center);
            _stackPanel15.AddChild(_textBlock16);
            const _textBlock17 = new TextBlock();
            _textBlock17._set_property_value_by_name("Text", DataContextBinding(_textBlock17, "ActiveLabel"));
            _textBlock17._set_property_value_by_name("FontSize", 40);
            _textBlock17._set_property_value_by_name("FontWeight", FontWeight.Bold);
            _textBlock17._set_property_value_by_name("Foreground", DynamicResource(_textBlock17, "OnSurface"));
            _textBlock17._set_property_value_by_name("HorizontalAlignment", HorizontalAlignment.Center);
            _textBlock17._set_property_value_by_name("Margin", new Thickness(0, 8, 0, 0));
            _stackPanel15.AddChild(_textBlock17);
            _dockPanel5.AddChild(_stackPanel15);
            _dockPanel2.AddChild(_dockPanel5);
            _border1.SetChild(_dockPanel2);
            return _border1;
        }, NavigationRailVM);
        t.Set("NavigationRailTemplate", _tmpl0);
        return t;
    }
    get NavigationRailTemplate() { return this.Resolve("NavigationRailTemplate"); }
    set NavigationRailTemplate(v) { this.Set("NavigationRailTemplate", v); }
}
