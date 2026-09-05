import { DialogDemoVM } from "./dialog-vm.mjs";
import { Border, DataTemplate, Dock, DockPanel, Orientation, StackPanel, TextBlock, TextWrapping } from "@pragmatic-tech-ai/mural/basic";
import { Button, ButtonVariant } from "@pragmatic-tech-ai/mural/framework/buttons/button.js";
import { Dialog } from "@pragmatic-tech-ai/mural/framework/surfaces/dialog.js";
import { Color, DataContextBinding, DynamicResource, HorizontalAlignment, ResourceDictionary, Thickness, ToVisibility, VerticalAlignment } from "@pragmatic-tech-ai/mural/runtime";
import { FontWeight, Pen, SolidColorBrush } from "@pragmatic-tech-ai/mural/visual-engine";


const _gate_DialogDemo = Symbol("DialogDemo.ctor");
export class DialogDemo extends ResourceDictionary {
    constructor(_g) {
        super();
        if (_g !== _gate_DialogDemo) {
            throw new Error("DialogDemo is private — use DialogDemo.Clone()");
        }
    }
    static Clone() {
        const t = new DialogDemo(_gate_DialogDemo);
        const _tmpl0 = new DataTemplate((_data) => {
            const _border1 = new Border();
            _border1.set_property_value(Border.FillKey, DynamicResource(_border1, "Surface"));
            _border1.set_property_value(Border.StrokeKey, ((_e) => { _e.Brush = DynamicResource(_e, "OutlineVariant"); return _e; })(new Pen()));
            const _dockPanel2 = new DockPanel();
            _dockPanel2.set_property_value(DockPanel.LastChildFillKey, true);
            const _border3 = new Border();
            _border3.set_property_value(DockPanel.DockKey, Dock.Top);
            _border3.set_property_value(Border.FillKey, DynamicResource(_border3, "Primary"));
            _border3.set_property_value(Border.PaddingKey, new Thickness(16, 12, 16, 12));
            const _textBlock4 = new TextBlock();
            _textBlock4.set_property_value(TextBlock.TextKey, "Dialog — M3 modal surface (Title · Content · Actions), drawn INLINE over a dim scrim (no popup).");
            _textBlock4.set_property_value(TextBlock.FontSizeKey, 15);
            _textBlock4.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _textBlock4.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock4, "OnPrimary"));
            _border3.SetChild(_textBlock4);
            _dockPanel2.AddChild(_border3);
            const _stackPanel5 = new StackPanel();
            _stackPanel5.set_property_value(DockPanel.DockKey, Dock.Bottom);
            _stackPanel5.set_property_value(StackPanel.OrientationKey, Orientation.Horizontal);
            _stackPanel5.set_property_value(StackPanel.MarginKey, new Thickness(24, 0, 24, 16));
            _stackPanel5.set_property_value(StackPanel.VerticalAlignmentKey, VerticalAlignment.Center);
            const _button6 = new Button();
            _button6.set_property_value(Button.VariantKey, ButtonVariant.Tonal);
            _button6.set_property_value(Button.CommandKey, DataContextBinding(_button6, "ShowCommand"));
            _button6.set_property_value(Button.MarginKey, new Thickness(0, 0, 16, 0));
            const _textBlock7 = new TextBlock();
            _textBlock7.set_property_value(TextBlock.TextKey, "Show dialog");
            _button6.Content = _textBlock7;
            _stackPanel5.AddChild(_button6);
            const _textBlock8 = new TextBlock();
            _textBlock8.set_property_value(TextBlock.TextKey, "Result: ");
            _textBlock8.set_property_value(TextBlock.FontSizeKey, 13);
            _textBlock8.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock8, "OnSurfaceVariant"));
            _textBlock8.set_property_value(TextBlock.VerticalAlignmentKey, VerticalAlignment.Center);
            _stackPanel5.AddChild(_textBlock8);
            const _textBlock9 = new TextBlock();
            _textBlock9.set_property_value(TextBlock.TextKey, DataContextBinding(_textBlock9, "Result"));
            _textBlock9.set_property_value(TextBlock.FontSizeKey, 13);
            _textBlock9.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _textBlock9.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock9, "OnSurface"));
            _textBlock9.set_property_value(TextBlock.VerticalAlignmentKey, VerticalAlignment.Center);
            _stackPanel5.AddChild(_textBlock9);
            _dockPanel2.AddChild(_stackPanel5);
            const _border10 = new Border();
            _border10.set_property_value(Border.FillKey, new SolidColorBrush(Color.FromHex('#52000000')));
            _border10.set_property_value(Border.VisibilityKey, DataContextBinding(_border10, "IsOpen", ToVisibility));
            const _dialog11 = new Dialog();
            _dialog11.set_property_value(Dialog.TitleKey, "Delete file?");
            _dialog11.set_property_value(Dialog.WidthKey, 360);
            _dialog11.set_property_value(Dialog.HorizontalAlignmentKey, HorizontalAlignment.Center);
            _dialog11.set_property_value(Dialog.VerticalAlignmentKey, VerticalAlignment.Center);
            _dialog11.set_property_value(Dialog.ActionsKey, DataContextBinding(_dialog11, "Actions"));
            const _textBlock12 = new TextBlock();
            _textBlock12.set_property_value(TextBlock.TextKey, "This permanently deletes report.pdf. This action can't be undone.");
            _textBlock12.set_property_value(TextBlock.TextWrappingKey, TextWrapping.Wrap);
            _textBlock12.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock12, "OnSurfaceVariant"));
            _dialog11.Content = _textBlock12;
            _border10.SetChild(_dialog11);
            _dockPanel2.AddChild(_border10);
            _border1.SetChild(_dockPanel2);
            return _border1;
        }, DialogDemoVM);
        t.Set(DialogDemoVM, _tmpl0);
        return t;
    }
}
