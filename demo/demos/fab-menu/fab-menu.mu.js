import { FabMenuVM } from "./fab-menu-vm.mjs";
import { Border, DataTemplate, Dock, DockPanel, Orientation, StackPanel, TextBlock } from "@visualisation-sub/mural/basic";
import { FabMenu } from "@visualisation-sub/mural/framework/fab-menu.js";
import { DataContextBinding, DynamicResource, HorizontalAlignment, ResourceDictionary, Thickness } from "@visualisation-sub/mural/runtime";
import { FontWeight } from "@visualisation-sub/mural/visual-engine";


const _gate_FabMenuDemo = Symbol("FabMenuDemo.ctor");
export class FabMenuDemo extends ResourceDictionary {
    constructor(_g) {
        super();
        if (_g !== _gate_FabMenuDemo) {
            throw new Error("FabMenuDemo is private — use FabMenuDemo.Clone()");
        }
    }
    static Clone() {
        const t = new FabMenuDemo(_gate_FabMenuDemo);
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
            _textBlock4._set_property_value_by_name("Text", "FabMenu — M3 2024 FAB that reveals secondary actions on tap. Stagger-fade reveal; tap the FAB again or click the scrim to dismiss.");
            _textBlock4._set_property_value_by_name("FontSize", 15);
            _textBlock4._set_property_value_by_name("FontWeight", FontWeight.Bold);
            _textBlock4._set_property_value_by_name("Foreground", DynamicResource(_textBlock4, "OnPrimary"));
            _border3.SetChild(_textBlock4);
            _dockPanel2.AddChild(_border3);
            const _stackPanel5 = new StackPanel();
            _stackPanel5._set_property_value_by_name("Orientation", Orientation.Vertical);
            _stackPanel5._set_property_value_by_name("Margin", new Thickness(24, 24, 24, 24));
            const _textBlock6 = new TextBlock();
            _textBlock6._set_property_value_by_name("Text", "Tap the FAB");
            _textBlock6._set_property_value_by_name("FontWeight", FontWeight.Bold);
            _textBlock6._set_property_value_by_name("FontSize", 14);
            _textBlock6._set_property_value_by_name("Foreground", DynamicResource(_textBlock6, "OnSurface"));
            _textBlock6._set_property_value_by_name("Margin", new Thickness(0, 0, 0, 12));
            _stackPanel5.AddChild(_textBlock6);
            const _fabMenu7 = new FabMenu();
            _fabMenu7._set_property_value_by_name("Items", DataContextBinding(_fabMenu7, "Items"));
            _fabMenu7._set_property_value_by_name("IsOpen", DataContextBinding(_fabMenu7, "IsOpen"));
            _fabMenu7._set_property_value_by_name("StaggerMs", 60);
            _fabMenu7._set_property_value_by_name("DurationMs", 200);
            _fabMenu7._set_property_value_by_name("HorizontalAlignment", HorizontalAlignment.Left);
            _fabMenu7._set_property_value_by_name("Margin", new Thickness(0, 0, 0, 24));
            _stackPanel5.AddChild(_fabMenu7);
            const _stackPanel8 = new StackPanel();
            _stackPanel8._set_property_value_by_name("Orientation", Orientation.Horizontal);
            _stackPanel8._set_property_value_by_name("Margin", new Thickness(0, 0, 0, 4));
            const _textBlock9 = new TextBlock();
            _textBlock9._set_property_value_by_name("Text", "IsOpen: ");
            _textBlock9._set_property_value_by_name("FontSize", 12);
            _textBlock9._set_property_value_by_name("Foreground", DynamicResource(_textBlock9, "OnSurfaceVariant"));
            _stackPanel8.AddChild(_textBlock9);
            const _textBlock10 = new TextBlock();
            _textBlock10._set_property_value_by_name("Text", DataContextBinding(_textBlock10, "IsOpen"));
            _textBlock10._set_property_value_by_name("FontSize", 12);
            _textBlock10._set_property_value_by_name("FontWeight", FontWeight.Bold);
            _textBlock10._set_property_value_by_name("Foreground", DynamicResource(_textBlock10, "OnSurface"));
            _stackPanel8.AddChild(_textBlock10);
            _stackPanel5.AddChild(_stackPanel8);
            const _stackPanel11 = new StackPanel();
            _stackPanel11._set_property_value_by_name("Orientation", Orientation.Horizontal);
            const _textBlock12 = new TextBlock();
            _textBlock12._set_property_value_by_name("Text", "Clicks — Create: ");
            _textBlock12._set_property_value_by_name("FontSize", 12);
            _textBlock12._set_property_value_by_name("Foreground", DynamicResource(_textBlock12, "OnSurfaceVariant"));
            _stackPanel11.AddChild(_textBlock12);
            const _textBlock13 = new TextBlock();
            _textBlock13._set_property_value_by_name("Text", DataContextBinding(_textBlock13, "CreateClicks"));
            _textBlock13._set_property_value_by_name("FontSize", 12);
            _textBlock13._set_property_value_by_name("FontWeight", FontWeight.Bold);
            _textBlock13._set_property_value_by_name("Foreground", DynamicResource(_textBlock13, "OnSurface"));
            _stackPanel11.AddChild(_textBlock13);
            const _textBlock14 = new TextBlock();
            _textBlock14._set_property_value_by_name("Text", "  Upload: ");
            _textBlock14._set_property_value_by_name("FontSize", 12);
            _textBlock14._set_property_value_by_name("Foreground", DynamicResource(_textBlock14, "OnSurfaceVariant"));
            _stackPanel11.AddChild(_textBlock14);
            const _textBlock15 = new TextBlock();
            _textBlock15._set_property_value_by_name("Text", DataContextBinding(_textBlock15, "UploadClicks"));
            _textBlock15._set_property_value_by_name("FontSize", 12);
            _textBlock15._set_property_value_by_name("FontWeight", FontWeight.Bold);
            _textBlock15._set_property_value_by_name("Foreground", DynamicResource(_textBlock15, "OnSurface"));
            _stackPanel11.AddChild(_textBlock15);
            const _textBlock16 = new TextBlock();
            _textBlock16._set_property_value_by_name("Text", "  Share: ");
            _textBlock16._set_property_value_by_name("FontSize", 12);
            _textBlock16._set_property_value_by_name("Foreground", DynamicResource(_textBlock16, "OnSurfaceVariant"));
            _stackPanel11.AddChild(_textBlock16);
            const _textBlock17 = new TextBlock();
            _textBlock17._set_property_value_by_name("Text", DataContextBinding(_textBlock17, "ShareClicks"));
            _textBlock17._set_property_value_by_name("FontSize", 12);
            _textBlock17._set_property_value_by_name("FontWeight", FontWeight.Bold);
            _textBlock17._set_property_value_by_name("Foreground", DynamicResource(_textBlock17, "OnSurface"));
            _stackPanel11.AddChild(_textBlock17);
            _stackPanel5.AddChild(_stackPanel11);
            _dockPanel2.AddChild(_stackPanel5);
            _border1.SetChild(_dockPanel2);
            return _border1;
        }, FabMenuVM);
        t.Set("FabMenuTemplate", _tmpl0);
        return t;
    }
    get FabMenuTemplate() { return this.Resolve("FabMenuTemplate"); }
    set FabMenuTemplate(v) { this.Set("FabMenuTemplate", v); }
}
