import { FabMenuVM } from "./fab-menu-vm.mjs";
import { Border, DataTemplate, Dock, DockPanel, Orientation, StackPanel, TextBlock } from "@pragmatic-tech-ai/mural/basic";
import { FabMenu } from "@pragmatic-tech-ai/mural/framework/buttons/fab-menu.js";
import { DataContextBinding, DynamicResource, HorizontalAlignment, ResourceDictionary, Thickness } from "@pragmatic-tech-ai/mural/runtime";
import { FontWeight, Pen } from "@pragmatic-tech-ai/mural/visual-engine";


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
            _border1.set_property_value(Border.FillKey, DynamicResource(_border1, "Surface"));
            _border1.set_property_value(Border.StrokeKey, ((_e) => { _e.Brush = DynamicResource(_e, "OutlineVariant"); return _e; })(new Pen()));
            const _dockPanel2 = new DockPanel();
            const _border3 = new Border();
            _border3.set_property_value(DockPanel.DockKey, Dock.Top);
            _border3.set_property_value(Border.FillKey, DynamicResource(_border3, "Primary"));
            _border3.set_property_value(Border.PaddingKey, new Thickness(16, 12, 16, 12));
            const _textBlock4 = new TextBlock();
            _textBlock4.set_property_value(TextBlock.TextKey, "FabMenu — M3 2024 FAB that reveals secondary actions on tap. Stagger-fade reveal; tap the FAB again or click the scrim to dismiss.");
            _textBlock4.set_property_value(TextBlock.FontSizeKey, 15);
            _textBlock4.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _textBlock4.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock4, "OnPrimary"));
            _border3.SetChild(_textBlock4);
            _dockPanel2.AddChild(_border3);
            const _stackPanel5 = new StackPanel();
            _stackPanel5.set_property_value(StackPanel.OrientationKey, Orientation.Vertical);
            _stackPanel5.set_property_value(StackPanel.MarginKey, new Thickness(24, 24, 24, 24));
            const _textBlock6 = new TextBlock();
            _textBlock6.set_property_value(TextBlock.TextKey, "Tap the FAB");
            _textBlock6.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _textBlock6.set_property_value(TextBlock.FontSizeKey, 14);
            _textBlock6.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock6, "OnSurface"));
            _textBlock6.set_property_value(TextBlock.MarginKey, new Thickness(0, 0, 0, 12));
            _stackPanel5.AddChild(_textBlock6);
            const _fabMenu7 = new FabMenu();
            _fabMenu7.set_property_value(FabMenu.ItemsKey, DataContextBinding(_fabMenu7, "Items"));
            _fabMenu7.set_property_value(FabMenu.IsOpenKey, DataContextBinding(_fabMenu7, "IsOpen"));
            _fabMenu7.set_property_value(FabMenu.StaggerMsKey, 60);
            _fabMenu7.set_property_value(FabMenu.DurationMsKey, 200);
            _fabMenu7.set_property_value(FabMenu.HorizontalAlignmentKey, HorizontalAlignment.Left);
            _fabMenu7.set_property_value(FabMenu.MarginKey, new Thickness(0, 0, 0, 24));
            _stackPanel5.AddChild(_fabMenu7);
            const _stackPanel8 = new StackPanel();
            _stackPanel8.set_property_value(StackPanel.OrientationKey, Orientation.Horizontal);
            _stackPanel8.set_property_value(StackPanel.MarginKey, new Thickness(0, 0, 0, 4));
            const _textBlock9 = new TextBlock();
            _textBlock9.set_property_value(TextBlock.TextKey, "IsOpen: ");
            _textBlock9.set_property_value(TextBlock.FontSizeKey, 12);
            _textBlock9.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock9, "OnSurfaceVariant"));
            _stackPanel8.AddChild(_textBlock9);
            const _textBlock10 = new TextBlock();
            _textBlock10.set_property_value(TextBlock.TextKey, DataContextBinding(_textBlock10, "IsOpen"));
            _textBlock10.set_property_value(TextBlock.FontSizeKey, 12);
            _textBlock10.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _textBlock10.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock10, "OnSurface"));
            _stackPanel8.AddChild(_textBlock10);
            _stackPanel5.AddChild(_stackPanel8);
            const _stackPanel11 = new StackPanel();
            _stackPanel11.set_property_value(StackPanel.OrientationKey, Orientation.Horizontal);
            const _textBlock12 = new TextBlock();
            _textBlock12.set_property_value(TextBlock.TextKey, "Clicks — Create: ");
            _textBlock12.set_property_value(TextBlock.FontSizeKey, 12);
            _textBlock12.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock12, "OnSurfaceVariant"));
            _stackPanel11.AddChild(_textBlock12);
            const _textBlock13 = new TextBlock();
            _textBlock13.set_property_value(TextBlock.TextKey, DataContextBinding(_textBlock13, "CreateClicks"));
            _textBlock13.set_property_value(TextBlock.FontSizeKey, 12);
            _textBlock13.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _textBlock13.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock13, "OnSurface"));
            _stackPanel11.AddChild(_textBlock13);
            const _textBlock14 = new TextBlock();
            _textBlock14.set_property_value(TextBlock.TextKey, "  Upload: ");
            _textBlock14.set_property_value(TextBlock.FontSizeKey, 12);
            _textBlock14.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock14, "OnSurfaceVariant"));
            _stackPanel11.AddChild(_textBlock14);
            const _textBlock15 = new TextBlock();
            _textBlock15.set_property_value(TextBlock.TextKey, DataContextBinding(_textBlock15, "UploadClicks"));
            _textBlock15.set_property_value(TextBlock.FontSizeKey, 12);
            _textBlock15.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _textBlock15.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock15, "OnSurface"));
            _stackPanel11.AddChild(_textBlock15);
            const _textBlock16 = new TextBlock();
            _textBlock16.set_property_value(TextBlock.TextKey, "  Share: ");
            _textBlock16.set_property_value(TextBlock.FontSizeKey, 12);
            _textBlock16.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock16, "OnSurfaceVariant"));
            _stackPanel11.AddChild(_textBlock16);
            const _textBlock17 = new TextBlock();
            _textBlock17.set_property_value(TextBlock.TextKey, DataContextBinding(_textBlock17, "ShareClicks"));
            _textBlock17.set_property_value(TextBlock.FontSizeKey, 12);
            _textBlock17.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _textBlock17.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock17, "OnSurface"));
            _stackPanel11.AddChild(_textBlock17);
            _stackPanel5.AddChild(_stackPanel11);
            _dockPanel2.AddChild(_stackPanel5);
            _border1.SetChild(_dockPanel2);
            return _border1;
        }, FabMenuVM);
        t.Set(FabMenuVM, _tmpl0);
        return t;
    }
}
