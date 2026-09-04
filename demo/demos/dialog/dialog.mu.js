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
        const _stackPanel0 = new StackPanel();
        _stackPanel0.set_property_value(StackPanel.OrientationKey, Orientation.Horizontal);
        _stackPanel0.set_property_value(StackPanel.HorizontalAlignmentKey, HorizontalAlignment.Right);
        const _button1 = new Button();
        _button1.set_property_value(Button.VariantKey, ButtonVariant.Text);
        _button1.set_property_value(Button.CommandKey, DataContextBinding(_button1, "CancelCommand"));
        _button1.set_property_value(Button.MarginKey, new Thickness(0, 0, 8, 0));
        const _textBlock2 = new TextBlock();
        _textBlock2.set_property_value(TextBlock.TextKey, "Cancel");
        _button1.Content = _textBlock2;
        _stackPanel0.AddChild(_button1);
        const _button3 = new Button();
        _button3.set_property_value(Button.VariantKey, ButtonVariant.Filled);
        _button3.set_property_value(Button.CommandKey, DataContextBinding(_button3, "DeleteCommand"));
        const _textBlock4 = new TextBlock();
        _textBlock4.set_property_value(TextBlock.TextKey, "Delete");
        _button3.Content = _textBlock4;
        _stackPanel0.AddChild(_button3);
        t.Set("DeleteDialogActions", _stackPanel0);
        const _tmpl5 = new DataTemplate((_data) => {
            const _border6 = new Border();
            _border6.set_property_value(Border.FillKey, DynamicResource(_border6, "Surface"));
            _border6.set_property_value(Border.StrokeKey, ((_e) => { _e.Brush = DynamicResource(_e, "OutlineVariant"); return _e; })(new Pen()));
            const _dockPanel7 = new DockPanel();
            _dockPanel7.set_property_value(DockPanel.LastChildFillKey, true);
            const _border8 = new Border();
            _border8.set_property_value(DockPanel.DockKey, Dock.Top);
            _border8.set_property_value(Border.FillKey, DynamicResource(_border8, "Primary"));
            _border8.set_property_value(Border.PaddingKey, new Thickness(16, 12, 16, 12));
            const _textBlock9 = new TextBlock();
            _textBlock9.set_property_value(TextBlock.TextKey, "Dialog — M3 modal surface (Title · Content · Actions), drawn INLINE over a dim scrim (no popup).");
            _textBlock9.set_property_value(TextBlock.FontSizeKey, 15);
            _textBlock9.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _textBlock9.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock9, "OnPrimary"));
            _border8.SetChild(_textBlock9);
            _dockPanel7.AddChild(_border8);
            const _stackPanel10 = new StackPanel();
            _stackPanel10.set_property_value(DockPanel.DockKey, Dock.Bottom);
            _stackPanel10.set_property_value(StackPanel.OrientationKey, Orientation.Horizontal);
            _stackPanel10.set_property_value(StackPanel.MarginKey, new Thickness(24, 0, 24, 16));
            _stackPanel10.set_property_value(StackPanel.VerticalAlignmentKey, VerticalAlignment.Center);
            const _button11 = new Button();
            _button11.set_property_value(Button.VariantKey, ButtonVariant.Tonal);
            _button11.set_property_value(Button.CommandKey, DataContextBinding(_button11, "ShowCommand"));
            _button11.set_property_value(Button.MarginKey, new Thickness(0, 0, 16, 0));
            const _textBlock12 = new TextBlock();
            _textBlock12.set_property_value(TextBlock.TextKey, "Show dialog");
            _button11.Content = _textBlock12;
            _stackPanel10.AddChild(_button11);
            const _textBlock13 = new TextBlock();
            _textBlock13.set_property_value(TextBlock.TextKey, "Result: ");
            _textBlock13.set_property_value(TextBlock.FontSizeKey, 13);
            _textBlock13.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock13, "OnSurfaceVariant"));
            _textBlock13.set_property_value(TextBlock.VerticalAlignmentKey, VerticalAlignment.Center);
            _stackPanel10.AddChild(_textBlock13);
            const _textBlock14 = new TextBlock();
            _textBlock14.set_property_value(TextBlock.TextKey, DataContextBinding(_textBlock14, "Result"));
            _textBlock14.set_property_value(TextBlock.FontSizeKey, 13);
            _textBlock14.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _textBlock14.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock14, "OnSurface"));
            _textBlock14.set_property_value(TextBlock.VerticalAlignmentKey, VerticalAlignment.Center);
            _stackPanel10.AddChild(_textBlock14);
            _dockPanel7.AddChild(_stackPanel10);
            const _border15 = new Border();
            _border15.set_property_value(Border.FillKey, new SolidColorBrush(Color.FromHex('#52000000')));
            _border15.set_property_value(Border.VisibilityKey, DataContextBinding(_border15, "IsOpen", ToVisibility));
            const _dialog16 = new Dialog();
            _dialog16.set_property_value(Dialog.TitleKey, "Delete file?");
            _dialog16.set_property_value(Dialog.WidthKey, 360);
            _dialog16.set_property_value(Dialog.HorizontalAlignmentKey, HorizontalAlignment.Center);
            _dialog16.set_property_value(Dialog.VerticalAlignmentKey, VerticalAlignment.Center);
            _dialog16.set_property_value(Dialog.ActionsKey, DynamicResource(_dialog16, "DeleteDialogActions"));
            const _textBlock17 = new TextBlock();
            _textBlock17.set_property_value(TextBlock.TextKey, "This permanently deletes report.pdf. This action can't be undone.");
            _textBlock17.set_property_value(TextBlock.TextWrappingKey, TextWrapping.Wrap);
            _textBlock17.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock17, "OnSurfaceVariant"));
            _dialog16.Content = _textBlock17;
            _border15.SetChild(_dialog16);
            _dockPanel7.AddChild(_border15);
            _border6.SetChild(_dockPanel7);
            return _border6;
        }, DialogDemoVM);
        t.Set(DialogDemoVM, _tmpl5);
        return t;
    }
    get DeleteDialogActions() { return this.Resolve("DeleteDialogActions"); }
    set DeleteDialogActions(v) { this.Set("DeleteDialogActions", v); }
}
