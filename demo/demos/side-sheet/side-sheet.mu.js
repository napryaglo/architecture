import { SideSheetVM } from "./side-sheet-vm.mjs";
import { Border, DataTemplate, Dock, Grid, Orientation, StackPanel, TextBlock, TextWrapping } from "@pragmatic-lab/mural/basic";
import { Button, ButtonVariant } from "@pragmatic-lab/mural/framework/buttons/button.js";
import { SideSheet, SideSheetVariant } from "@pragmatic-lab/mural/framework/surfaces/side-sheet.js";
import { DataContextBinding, DynamicResource, HorizontalAlignment, ResourceDictionary, Thickness } from "@pragmatic-lab/mural/runtime";
import { Pen } from "@pragmatic-lab/mural/visual-engine";


const _gate_SideSheetDemo = Symbol("SideSheetDemo.ctor");
export class SideSheetDemo extends ResourceDictionary {
    constructor(_g) {
        super();
        if (_g !== _gate_SideSheetDemo) {
            throw new Error("SideSheetDemo is private — use SideSheetDemo.Clone()");
        }
    }
    static Clone() {
        const t = new SideSheetDemo(_gate_SideSheetDemo);
        const _tmpl0 = new DataTemplate((_data) => {
            const _border1 = new Border();
            _border1.set_property_value(Border.FillKey, DynamicResource(_border1, "Surface"));
            _border1.set_property_value(Border.StrokeKey, ((_e) => { _e.Brush = DynamicResource(_e, "OutlineVariant"); return _e; })(new Pen()));
            const _grid2 = new Grid();
            const _stackPanel3 = new StackPanel();
            _stackPanel3.set_property_value(StackPanel.OrientationKey, Orientation.Vertical);
            _stackPanel3.set_property_value(StackPanel.MarginKey, new Thickness(32, 32, 32, 32));
            const _textBlock4 = new TextBlock();
            _textBlock4.set_property_value(TextBlock.TextKey, "SideSheet — M3's lateral supplementary surface (Modal)");
            _textBlock4.set_property_value(TextBlock.StyleKey, DynamicResource(_textBlock4, "TitleMedium"));
            _textBlock4.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock4, "OnSurface"));
            _textBlock4.set_property_value(TextBlock.MarginKey, new Thickness(0, 0, 0, 8));
            _stackPanel3.AddChild(_textBlock4);
            const _textBlock5 = new TextBlock();
            _textBlock5.set_property_value(TextBlock.TextKey, "The Modal variant floats a trailing-edge sheet over a scrim; dismiss it with the ✕ in the sheet header or by tapping the scrim. IsOpen binds TwoWay, so this stays in sync.");
            _textBlock5.set_property_value(TextBlock.StyleKey, DynamicResource(_textBlock5, "BodyMedium"));
            _textBlock5.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock5, "OnSurfaceVariant"));
            _textBlock5.set_property_value(TextBlock.TextWrappingKey, TextWrapping.Wrap);
            _textBlock5.set_property_value(TextBlock.MarginKey, new Thickness(0, 0, 0, 24));
            _stackPanel3.AddChild(_textBlock5);
            const _button6 = new Button();
            _button6.set_property_value(Button.VariantKey, ButtonVariant.Filled);
            _button6.set_property_value(Button.CommandKey, DataContextBinding(_button6, "Open"));
            _button6.set_property_value(Button.HorizontalAlignmentKey, HorizontalAlignment.Left);
            const _textBlock7 = new TextBlock();
            _textBlock7.set_property_value(TextBlock.TextKey, "Open side sheet");
            _button6.Content = _textBlock7;
            _stackPanel3.AddChild(_button6);
            _grid2.AddChild(_stackPanel3);
            const _sideSheet8 = new SideSheet();
            _sideSheet8.set_property_value(SideSheet.VariantKey, SideSheetVariant.Modal);
            _sideSheet8.set_property_value(SideSheet.AnchorKey, Dock.Right);
            _sideSheet8.set_property_value(SideSheet.TitleKey, "Details");
            _sideSheet8.set_property_value(SideSheet.IsOpenKey, DataContextBinding(_sideSheet8, "IsOpen"));
            const _stackPanel9 = new StackPanel();
            _stackPanel9.set_property_value(StackPanel.OrientationKey, Orientation.Vertical);
            const _textBlock10 = new TextBlock();
            _textBlock10.set_property_value(TextBlock.TextKey, "A Modal side sheet holds supplementary content — filters, details, a tool palette — without leaving the page.");
            _textBlock10.set_property_value(TextBlock.StyleKey, DynamicResource(_textBlock10, "BodyMedium"));
            _textBlock10.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock10, "OnSurface"));
            _textBlock10.set_property_value(TextBlock.TextWrappingKey, TextWrapping.Wrap);
            _textBlock10.set_property_value(TextBlock.MarginKey, new Thickness(0, 0, 0, 12));
            _stackPanel9.AddChild(_textBlock10);
            const _textBlock11 = new TextBlock();
            _textBlock11.set_property_value(TextBlock.TextKey, "Standard side sheets dock in-flow instead, reflowing the page beside them.");
            _textBlock11.set_property_value(TextBlock.StyleKey, DynamicResource(_textBlock11, "BodyMedium"));
            _textBlock11.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock11, "OnSurfaceVariant"));
            _textBlock11.set_property_value(TextBlock.TextWrappingKey, TextWrapping.Wrap);
            _stackPanel9.AddChild(_textBlock11);
            _sideSheet8.Content = _stackPanel9;
            _grid2.AddChild(_sideSheet8);
            _border1.SetChild(_grid2);
            return _border1;
        }, SideSheetVM);
        t.Set(SideSheetVM, _tmpl0);
        return t;
    }
}
