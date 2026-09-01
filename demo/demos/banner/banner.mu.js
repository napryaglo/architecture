import { BannerVM } from "./banner-vm.mjs";
import { Border, DataTemplate, Dock, DockPanel, Orientation, StackPanel, TargetedSetter, TemplateDataTrigger, TextBlock, TextWrapping } from "@pragmatic-tech-ai/mural/basic";
import { Button, ButtonVariant } from "@pragmatic-tech-ai/mural/framework/buttons/button.js";
import { Banner } from "@pragmatic-tech-ai/mural/framework/notifications/banner.js";
import { DataContextBinding, DynamicResource, HorizontalAlignment, ResourceDictionary, Thickness, Visibility } from "@pragmatic-tech-ai/mural/runtime";
import { FontWeight, Pen } from "@pragmatic-tech-ai/mural/visual-engine";


const _gate_BannerDemo = Symbol("BannerDemo.ctor");
export class BannerDemo extends ResourceDictionary {
    constructor(_g) {
        super();
        if (_g !== _gate_BannerDemo) {
            throw new Error("BannerDemo is private — use BannerDemo.Clone()");
        }
    }
    static Clone() {
        const t = new BannerDemo(_gate_BannerDemo);
        const _tmpl0 = (() => {
            const _factory = (_data) => {
                let _banner1;
                const _border2 = new Border();
                _border2.set_property_value(Border.FillKey, DynamicResource(_border2, "Surface"));
                _border2.set_property_value(Border.StrokeKey, ((_e) => { _e.Brush = DynamicResource(_e, "OutlineVariant"); return _e; })(new Pen()));
                const _dockPanel3 = new DockPanel();
                const _border4 = new Border();
                _border4.set_property_value(DockPanel.DockKey, Dock.Top);
                _border4.set_property_value(Border.FillKey, DynamicResource(_border4, "Primary"));
                _border4.set_property_value(Border.PaddingKey, new Thickness(16, 12, 16, 12));
                const _textBlock5 = new TextBlock();
                _textBlock5.set_property_value(TextBlock.TextKey, "Banner — M3's in-flow alert strip: Leading icon | message | trailing Actions.");
                _textBlock5.set_property_value(TextBlock.FontSizeKey, 15);
                _textBlock5.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
                _textBlock5.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock5, "OnPrimary"));
                _border4.SetChild(_textBlock5);
                _dockPanel3.AddChild(_border4);
                const _stackPanel6 = new StackPanel();
                _stackPanel6.set_property_value(StackPanel.OrientationKey, Orientation.Vertical);
                _stackPanel6.set_property_value(StackPanel.MarginKey, new Thickness(24, 24, 24, 24));
                const _textBlock7 = new TextBlock();
                _textBlock7.set_property_value(TextBlock.TextKey, "Banner — Content + Leading + Actions slots");
                _textBlock7.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
                _textBlock7.set_property_value(TextBlock.FontSizeKey, 14);
                _textBlock7.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock7, "OnSurface"));
                _textBlock7.set_property_value(TextBlock.MarginKey, new Thickness(0, 0, 0, 16));
                _stackPanel6.AddChild(_textBlock7);
                _banner1 = new Banner();
                _banner1.Name = "AnnounceBanner";
                _banner1.set_property_value(Banner.LeadingKey, ((_e) => { _e.Text = "⚠"; _e.FontSize = 20; _e.Foreground = DynamicResource(_e, "Primary"); return _e; })(new TextBlock()));
                _banner1.set_property_value(Banner.ActionsKey, ((_e) => { _e.Variant = ButtonVariant.Text; _e.Command = DataContextBinding(_e, "Dismiss"); _e.Content = ((_e) => { _e.Text = "Dismiss"; return _e; })(new TextBlock()); return _e; })(new Button()));
                const _textBlock8 = new TextBlock();
                _textBlock8.set_property_value(TextBlock.TextKey, "Your session will expire soon. Save your work to avoid losing changes.");
                _textBlock8.set_property_value(TextBlock.TextWrappingKey, TextWrapping.Wrap);
                _textBlock8.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock8, "OnSurface"));
                _banner1.Content = _textBlock8;
                _stackPanel6.AddChild(_banner1);
                const _button9 = new Button();
                _button9.set_property_value(Button.VariantKey, ButtonVariant.Filled);
                _button9.set_property_value(Button.CommandKey, DataContextBinding(_button9, "Restore"));
                _button9.set_property_value(Button.HorizontalAlignmentKey, HorizontalAlignment.Left);
                _button9.set_property_value(Button.MarginKey, new Thickness(0, 24, 0, 0));
                _button9.set_property_value(Button.ContentKey, ((_e) => { _e.Text = "Restore banner"; return _e; })(new TextBlock()));
                _stackPanel6.AddChild(_button9);
                _dockPanel3.AddChild(_stackPanel6);
                _border2.SetChild(_dockPanel3);
                return _border2;
            };
            const _tplSet10 = [new TargetedSetter(Banner, "Visibility", Visibility.Collapsed, "AnnounceBanner")];
            const _tplDataTrig11 = new TemplateDataTrigger("Dismissed", true, _tplSet10);
            return new DataTemplate(_factory, BannerVM, [], [_tplDataTrig11]);
        })();
        t.Set(BannerVM, _tmpl0);
        return t;
    }
}
