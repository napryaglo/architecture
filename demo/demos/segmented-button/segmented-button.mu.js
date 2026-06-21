import { SegmentedButtonVM } from "./segmented-button-vm.mjs";
import { Border, DataTemplate, Dock, DockPanel, Orientation, StackPanel, TextBlock } from "@visualisation-sub/mural/basic";
import { SegmentedButton } from "@visualisation-sub/mural/framework/button-groups/segmented-button.js";
import { SelectionMode } from "@visualisation-sub/mural/framework/list/list-box.js";
import { DataContextBinding, DynamicResource, HorizontalAlignment, ResourceDictionary, Thickness } from "@visualisation-sub/mural/runtime";
import { FontWeight } from "@visualisation-sub/mural/visual-engine";


const _gate_SegmentedButtonDemo = Symbol("SegmentedButtonDemo.ctor");
export class SegmentedButtonDemo extends ResourceDictionary {
    constructor(_g) {
        super();
        if (_g !== _gate_SegmentedButtonDemo) {
            throw new Error("SegmentedButtonDemo is private — use SegmentedButtonDemo.Clone()");
        }
    }
    static Clone() {
        const t = new SegmentedButtonDemo(_gate_SegmentedButtonDemo);
        const _tmpl0 = new DataTemplate((_data) => {
            const _border1 = new Border();
            _border1.set_property_value(Border.BackgroundKey, DynamicResource(_border1, "Surface"));
            _border1.set_property_value(Border.BorderBrushKey, DynamicResource(_border1, "OutlineVariant"));
            _border1.set_property_value(Border.BorderThicknessKey, new Thickness(1));
            const _dockPanel2 = new DockPanel();
            const _border3 = new Border();
            _border3.set_property_value(DockPanel.DockKey, Dock.Top);
            _border3.set_property_value(Border.BackgroundKey, DynamicResource(_border3, "Primary"));
            _border3.set_property_value(Border.PaddingKey, new Thickness(16, 12, 16, 12));
            const _textBlock4 = new TextBlock();
            _textBlock4.set_property_value(TextBlock.TextKey, "SegmentedButton — M3's connected-segment selection row. Single-select and Multi-select variants drive off SelectionMode.");
            _textBlock4.set_property_value(TextBlock.FontSizeKey, 15);
            _textBlock4.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _textBlock4.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock4, "OnPrimary"));
            _border3.SetChild(_textBlock4);
            _dockPanel2.AddChild(_border3);
            const _stackPanel5 = new StackPanel();
            _stackPanel5.set_property_value(StackPanel.OrientationKey, Orientation.Vertical);
            _stackPanel5.set_property_value(StackPanel.MarginKey, new Thickness(24, 24, 24, 24));
            const _textBlock6 = new TextBlock();
            _textBlock6.set_property_value(TextBlock.TextKey, "Single-select — pick one timeframe");
            _textBlock6.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _textBlock6.set_property_value(TextBlock.FontSizeKey, 14);
            _textBlock6.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock6, "OnSurface"));
            _textBlock6.set_property_value(TextBlock.MarginKey, new Thickness(0, 0, 0, 12));
            _stackPanel5.AddChild(_textBlock6);
            const _segmentedButton7 = new SegmentedButton();
            _segmentedButton7.set_property_value(SegmentedButton.ItemsKey, DataContextBinding(_segmentedButton7, "Timeframes"));
            _segmentedButton7.set_property_value(SegmentedButton.SelectedItemKey, DataContextBinding(_segmentedButton7, "SelectedTimeframe"));
            _segmentedButton7.set_property_value(SegmentedButton.SelectionModeKey, SelectionMode.Single);
            _segmentedButton7.set_property_value(SegmentedButton.HorizontalAlignmentKey, HorizontalAlignment.Left);
            _segmentedButton7.set_property_value(SegmentedButton.MarginKey, new Thickness(0, 0, 0, 8));
            _stackPanel5.AddChild(_segmentedButton7);
            const _stackPanel8 = new StackPanel();
            _stackPanel8.set_property_value(StackPanel.OrientationKey, Orientation.Horizontal);
            _stackPanel8.set_property_value(StackPanel.MarginKey, new Thickness(0, 0, 0, 24));
            const _textBlock9 = new TextBlock();
            _textBlock9.set_property_value(TextBlock.TextKey, "Selected: ");
            _textBlock9.set_property_value(TextBlock.FontSizeKey, 12);
            _textBlock9.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock9, "OnSurfaceVariant"));
            _stackPanel8.AddChild(_textBlock9);
            const _textBlock10 = new TextBlock();
            _textBlock10.set_property_value(TextBlock.TextKey, DataContextBinding(_textBlock10, "SelectedTimeframe"));
            _textBlock10.set_property_value(TextBlock.FontSizeKey, 12);
            _textBlock10.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _textBlock10.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock10, "OnSurface"));
            _stackPanel8.AddChild(_textBlock10);
            _stackPanel5.AddChild(_stackPanel8);
            const _textBlock11 = new TextBlock();
            _textBlock11.set_property_value(TextBlock.TextKey, "Multi-select — pick one or more formats");
            _textBlock11.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _textBlock11.set_property_value(TextBlock.FontSizeKey, 14);
            _textBlock11.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock11, "OnSurface"));
            _textBlock11.set_property_value(TextBlock.MarginKey, new Thickness(0, 0, 0, 12));
            _stackPanel5.AddChild(_textBlock11);
            const _segmentedButton12 = new SegmentedButton();
            _segmentedButton12.set_property_value(SegmentedButton.ItemsKey, DataContextBinding(_segmentedButton12, "FormatChoices"));
            _segmentedButton12.set_property_value(SegmentedButton.SelectionModeKey, SelectionMode.Multiple);
            _segmentedButton12.set_property_value(SegmentedButton.HorizontalAlignmentKey, HorizontalAlignment.Left);
            _segmentedButton12.set_property_value(SegmentedButton.MarginKey, new Thickness(0, 0, 0, 8));
            _stackPanel5.AddChild(_segmentedButton12);
            const _stackPanel13 = new StackPanel();
            _stackPanel13.set_property_value(StackPanel.OrientationKey, Orientation.Horizontal);
            const _textBlock14 = new TextBlock();
            _textBlock14.set_property_value(TextBlock.TextKey, "Selected: ");
            _textBlock14.set_property_value(TextBlock.FontSizeKey, 12);
            _textBlock14.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock14, "OnSurfaceVariant"));
            _stackPanel13.AddChild(_textBlock14);
            const _textBlock15 = new TextBlock();
            _textBlock15.set_property_value(TextBlock.TextKey, DataContextBinding(_textBlock15, "SelectedFormatsLabel"));
            _textBlock15.set_property_value(TextBlock.FontSizeKey, 12);
            _textBlock15.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _textBlock15.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock15, "OnSurface"));
            _stackPanel13.AddChild(_textBlock15);
            _stackPanel5.AddChild(_stackPanel13);
            _dockPanel2.AddChild(_stackPanel5);
            _border1.SetChild(_dockPanel2);
            return _border1;
        }, SegmentedButtonVM);
        t.Set("SegmentedButtonTemplate", _tmpl0);
        return t;
    }
    get SegmentedButtonTemplate() { return this.Resolve("SegmentedButtonTemplate"); }
    set SegmentedButtonTemplate(v) { this.Set("SegmentedButtonTemplate", v); }
}
