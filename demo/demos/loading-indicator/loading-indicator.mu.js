import { LoadingIndicatorVM } from "./loading-indicator-vm.mjs";
import { Border, DataTemplate, Orientation, StackPanel, TextBlock, TextWrapping } from "@visualisation-sub/mural/basic";
import { Button, ButtonVariant } from "@visualisation-sub/mural/framework/buttons/button.js";
import { LoadingIndicator, LoadingIndicatorVariant } from "@visualisation-sub/mural/framework/notifications/loading-indicator.js";
import { DataContextBinding, DynamicResource, HorizontalAlignment, ResourceDictionary, Thickness } from "@visualisation-sub/mural/runtime";


const _gate_LoadingIndicatorDemo = Symbol("LoadingIndicatorDemo.ctor");
export class LoadingIndicatorDemo extends ResourceDictionary {
    constructor(_g) {
        super();
        if (_g !== _gate_LoadingIndicatorDemo) {
            throw new Error("LoadingIndicatorDemo is private — use LoadingIndicatorDemo.Clone()");
        }
    }
    static Clone() {
        const t = new LoadingIndicatorDemo(_gate_LoadingIndicatorDemo);
        const _tmpl0 = new DataTemplate((_data) => {
            const _border1 = new Border();
            _border1.set_property_value(Border.BackgroundKey, DynamicResource(_border1, "Surface"));
            _border1.set_property_value(Border.BorderBrushKey, DynamicResource(_border1, "OutlineVariant"));
            _border1.set_property_value(Border.BorderThicknessKey, new Thickness(1));
            const _stackPanel2 = new StackPanel();
            _stackPanel2.set_property_value(StackPanel.OrientationKey, Orientation.Vertical);
            _stackPanel2.set_property_value(StackPanel.MarginKey, new Thickness(32, 32, 32, 32));
            const _textBlock3 = new TextBlock();
            _textBlock3.set_property_value(TextBlock.TextKey, "LoadingIndicator — M3's \"still working\" spinner (variable-amplitude sweep)");
            _textBlock3.set_property_value(TextBlock.StyleKey, DynamicResource(_textBlock3, "TitleMedium"));
            _textBlock3.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock3, "OnSurface"));
            _textBlock3.set_property_value(TextBlock.MarginKey, new Thickness(0, 0, 0, 8));
            _stackPanel2.AddChild(_textBlock3);
            const _textBlock4 = new TextBlock();
            _textBlock4.set_property_value(TextBlock.TextKey, "A single @Primary arc rotates while its sweep grows and shrinks — the M3 2024 loading affordance, distinct from ProgressIndicator's fixed ring.");
            _textBlock4.set_property_value(TextBlock.StyleKey, DynamicResource(_textBlock4, "BodyMedium"));
            _textBlock4.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock4, "OnSurfaceVariant"));
            _textBlock4.set_property_value(TextBlock.TextWrappingKey, TextWrapping.Wrap);
            _textBlock4.set_property_value(TextBlock.MarginKey, new Thickness(0, 0, 0, 32));
            _stackPanel2.AddChild(_textBlock4);
            const _stackPanel5 = new StackPanel();
            _stackPanel5.set_property_value(StackPanel.OrientationKey, Orientation.Horizontal);
            _stackPanel5.set_property_value(StackPanel.MarginKey, new Thickness(0, 0, 0, 32));
            const _stackPanel6 = new StackPanel();
            _stackPanel6.set_property_value(StackPanel.OrientationKey, Orientation.Vertical);
            _stackPanel6.set_property_value(StackPanel.MarginKey, new Thickness(0, 0, 64, 0));
            const _loadingIndicator7 = new LoadingIndicator();
            _loadingIndicator7.set_property_value(LoadingIndicator.VariantKey, LoadingIndicatorVariant.ActiveIndicator);
            _loadingIndicator7.set_property_value(LoadingIndicator.IsActiveKey, DataContextBinding(_loadingIndicator7, "IsActive"));
            _loadingIndicator7.set_property_value(LoadingIndicator.HorizontalAlignmentKey, HorizontalAlignment.Center);
            _stackPanel6.AddChild(_loadingIndicator7);
            const _textBlock8 = new TextBlock();
            _textBlock8.set_property_value(TextBlock.TextKey, "Active indicator");
            _textBlock8.set_property_value(TextBlock.StyleKey, DynamicResource(_textBlock8, "LabelMedium"));
            _textBlock8.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock8, "OnSurfaceVariant"));
            _textBlock8.set_property_value(TextBlock.HorizontalAlignmentKey, HorizontalAlignment.Center);
            _textBlock8.set_property_value(TextBlock.MarginKey, new Thickness(0, 16, 0, 0));
            _stackPanel6.AddChild(_textBlock8);
            _stackPanel5.AddChild(_stackPanel6);
            const _stackPanel9 = new StackPanel();
            _stackPanel9.set_property_value(StackPanel.OrientationKey, Orientation.Vertical);
            const _loadingIndicator10 = new LoadingIndicator();
            _loadingIndicator10.set_property_value(LoadingIndicator.VariantKey, LoadingIndicatorVariant.Contained);
            _loadingIndicator10.set_property_value(LoadingIndicator.IsActiveKey, DataContextBinding(_loadingIndicator10, "IsActive"));
            _loadingIndicator10.set_property_value(LoadingIndicator.HorizontalAlignmentKey, HorizontalAlignment.Center);
            _stackPanel9.AddChild(_loadingIndicator10);
            const _textBlock11 = new TextBlock();
            _textBlock11.set_property_value(TextBlock.TextKey, "Contained");
            _textBlock11.set_property_value(TextBlock.StyleKey, DynamicResource(_textBlock11, "LabelMedium"));
            _textBlock11.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock11, "OnSurfaceVariant"));
            _textBlock11.set_property_value(TextBlock.HorizontalAlignmentKey, HorizontalAlignment.Center);
            _textBlock11.set_property_value(TextBlock.MarginKey, new Thickness(0, 16, 0, 0));
            _stackPanel9.AddChild(_textBlock11);
            _stackPanel5.AddChild(_stackPanel9);
            _stackPanel2.AddChild(_stackPanel5);
            const _button12 = new Button();
            _button12.set_property_value(Button.VariantKey, ButtonVariant.Filled);
            _button12.set_property_value(Button.CommandKey, DataContextBinding(_button12, "Toggle"));
            _button12.set_property_value(Button.HorizontalAlignmentKey, HorizontalAlignment.Left);
            const _textBlock13 = new TextBlock();
            _textBlock13.set_property_value(TextBlock.TextKey, DataContextBinding(_textBlock13, "ToggleLabel"));
            _button12.Content = _textBlock13;
            _stackPanel2.AddChild(_button12);
            _border1.SetChild(_stackPanel2);
            return _border1;
        }, LoadingIndicatorVM);
        t.Set(LoadingIndicatorVM, _tmpl0);
        return t;
    }
}
