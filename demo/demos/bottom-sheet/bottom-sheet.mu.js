import { BottomSheetVM } from "./bottom-sheet-vm.mjs";
import { Border, DataTemplate, Dock, DockPanel, Orientation, StackPanel, TextBlock, TextWrapping } from "@pragmatic-lab/mural/basic";
import { Button, ButtonVariant } from "@pragmatic-lab/mural/framework/buttons/button.js";
import { BottomSheet } from "@pragmatic-lab/mural/framework/surfaces/bottom-sheet.js";
import { DataContextBinding, DynamicResource, HorizontalAlignment, ResourceDictionary, Thickness, VerticalAlignment } from "@pragmatic-lab/mural/runtime";
import { FontWeight, Pen } from "@pragmatic-lab/mural/visual-engine";


const _gate_BottomSheetDemo = Symbol("BottomSheetDemo.ctor");
export class BottomSheetDemo extends ResourceDictionary {
    constructor(_g) {
        super();
        if (_g !== _gate_BottomSheetDemo) {
            throw new Error("BottomSheetDemo is private — use BottomSheetDemo.Clone()");
        }
    }
    static Clone() {
        const t = new BottomSheetDemo(_gate_BottomSheetDemo);
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
            _textBlock4.set_property_value(TextBlock.TextKey, "BottomSheet — M3's bottom-anchored surface. Toggle peek vs expanded posture.");
            _textBlock4.set_property_value(TextBlock.FontSizeKey, 15);
            _textBlock4.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _textBlock4.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock4, "OnPrimary"));
            _border3.SetChild(_textBlock4);
            _dockPanel2.AddChild(_border3);
            const _bottomSheet5 = new BottomSheet();
            _bottomSheet5.set_property_value(DockPanel.DockKey, Dock.Bottom);
            _bottomSheet5.set_property_value(BottomSheet.HeightKey, DataContextBinding(_bottomSheet5, "SheetHeight"));
            const _stackPanel6 = new StackPanel();
            _stackPanel6.set_property_value(StackPanel.OrientationKey, Orientation.Vertical);
            const _border7 = new Border();
            _border7.set_property_value(Border.WidthKey, 32);
            _border7.set_property_value(Border.HeightKey, 4);
            _border7.set_property_value(Border.FillKey, DynamicResource(_border7, "OutlineVariant"));
            _border7.set_property_value(Border.CornerRadiusKey, DynamicResource(_border7, "ShapeFull"));
            _border7.set_property_value(Border.BorderThicknessKey, new Thickness(0));
            _border7.set_property_value(Border.HorizontalAlignmentKey, HorizontalAlignment.Center);
            _border7.set_property_value(Border.MarginKey, new Thickness(0, 0, 0, 12));
            _stackPanel6.AddChild(_border7);
            const _textBlock8 = new TextBlock();
            _textBlock8.set_property_value(TextBlock.TextKey, "Share to…");
            _textBlock8.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _textBlock8.set_property_value(TextBlock.FontSizeKey, 16);
            _textBlock8.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock8, "OnSurface"));
            _textBlock8.set_property_value(TextBlock.MarginKey, new Thickness(0, 0, 0, 8));
            _stackPanel6.AddChild(_textBlock8);
            const _textBlock9 = new TextBlock();
            _textBlock9.set_property_value(TextBlock.TextKey, "Peek shows just the header; expand to reveal the full list of destinations. Toggle the posture from the page body.");
            _textBlock9.set_property_value(TextBlock.TextWrappingKey, TextWrapping.Wrap);
            _textBlock9.set_property_value(TextBlock.FontSizeKey, 13);
            _textBlock9.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock9, "OnSurfaceVariant"));
            _stackPanel6.AddChild(_textBlock9);
            _bottomSheet5.Content = _stackPanel6;
            _dockPanel2.AddChild(_bottomSheet5);
            const _border10 = new Border();
            _border10.set_property_value(Border.FillKey, DynamicResource(_border10, "Surface"));
            _border10.set_property_value(Border.PaddingKey, new Thickness(24));
            const _stackPanel11 = new StackPanel();
            _stackPanel11.set_property_value(StackPanel.OrientationKey, Orientation.Vertical);
            const _textBlock12 = new TextBlock();
            _textBlock12.set_property_value(TextBlock.TextKey, "The sheet below is bottom-anchored. Toggling posture animates its Height between a peek and an expanded stop.");
            _textBlock12.set_property_value(TextBlock.TextWrappingKey, TextWrapping.Wrap);
            _textBlock12.set_property_value(TextBlock.FontSizeKey, 13);
            _textBlock12.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock12, "OnSurface"));
            _textBlock12.set_property_value(TextBlock.MarginKey, new Thickness(0, 0, 0, 16));
            _stackPanel11.AddChild(_textBlock12);
            const _stackPanel13 = new StackPanel();
            _stackPanel13.set_property_value(StackPanel.OrientationKey, Orientation.Horizontal);
            const _button14 = new Button();
            _button14.set_property_value(Button.VariantKey, ButtonVariant.Filled);
            _button14.set_property_value(Button.CommandKey, DataContextBinding(_button14, "TogglePosture"));
            _button14.set_property_value(Button.HorizontalAlignmentKey, HorizontalAlignment.Left);
            _button14.set_property_value(Button.MarginKey, new Thickness(0, 0, 16, 0));
            _button14.set_property_value(Button.ContentKey, ((_e) => { _e.Text = "Toggle posture"; return _e; })(new TextBlock()));
            _stackPanel13.AddChild(_button14);
            const _textBlock15 = new TextBlock();
            _textBlock15.set_property_value(TextBlock.TextKey, "Posture: ");
            _textBlock15.set_property_value(TextBlock.FontSizeKey, 12);
            _textBlock15.set_property_value(TextBlock.VerticalAlignmentKey, VerticalAlignment.Center);
            _textBlock15.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock15, "OnSurfaceVariant"));
            _stackPanel13.AddChild(_textBlock15);
            const _textBlock16 = new TextBlock();
            _textBlock16.set_property_value(TextBlock.TextKey, DataContextBinding(_textBlock16, "PostureLabel"));
            _textBlock16.set_property_value(TextBlock.FontSizeKey, 12);
            _textBlock16.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _textBlock16.set_property_value(TextBlock.VerticalAlignmentKey, VerticalAlignment.Center);
            _textBlock16.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock16, "OnSurface"));
            _stackPanel13.AddChild(_textBlock16);
            _stackPanel11.AddChild(_stackPanel13);
            _border10.SetChild(_stackPanel11);
            _dockPanel2.AddChild(_border10);
            _border1.SetChild(_dockPanel2);
            return _border1;
        }, BottomSheetVM);
        t.Set(BottomSheetVM, _tmpl0);
        return t;
    }
}
