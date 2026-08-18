import { SliderVM } from "./slider-vm.mjs";
import { Border, DataTemplate, Dock, DockPanel, Orientation, Slider, StackPanel, TextBlock } from "@pragmatic-lab/mural/basic";
import { DynamicResource, ResourceDictionary, Thickness } from "@pragmatic-lab/mural/runtime";
import { FontWeight } from "@pragmatic-lab/mural/visual-engine";


const _gate_SliderDemo = Symbol("SliderDemo.ctor");
export class SliderDemo extends ResourceDictionary {
    constructor(_g) {
        super();
        if (_g !== _gate_SliderDemo) {
            throw new Error("SliderDemo is private — use SliderDemo.Clone()");
        }
    }
    static Clone() {
        const t = new SliderDemo(_gate_SliderDemo);
        const _tmpl0 = new DataTemplate((_data) => {
            const _border1 = new Border();
            _border1.set_property_value(Border.FillKey, DynamicResource(_border1, "Surface"));
            _border1.set_property_value(Border.BorderBrushKey, DynamicResource(_border1, "OutlineVariant"));
            _border1.set_property_value(Border.BorderThicknessKey, new Thickness(1));
            const _dockPanel2 = new DockPanel();
            const _border3 = new Border();
            _border3.set_property_value(DockPanel.DockKey, Dock.Top);
            _border3.set_property_value(Border.FillKey, DynamicResource(_border3, "Primary"));
            _border3.set_property_value(Border.PaddingKey, new Thickness(16, 12, 16, 12));
            const _textBlock4 = new TextBlock();
            _textBlock4.set_property_value(TextBlock.TextKey, "Slider demo — single-thumb range, horizontal + vertical");
            _textBlock4.set_property_value(TextBlock.FontSizeKey, 15);
            _textBlock4.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _textBlock4.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock4, "OnPrimary"));
            _border3.SetChild(_textBlock4);
            _dockPanel2.AddChild(_border3);
            const _stackPanel5 = new StackPanel();
            _stackPanel5.set_property_value(StackPanel.OrientationKey, Orientation.Horizontal);
            const _stackPanel6 = new StackPanel();
            _stackPanel6.set_property_value(StackPanel.OrientationKey, Orientation.Vertical);
            _stackPanel6.set_property_value(StackPanel.WidthKey, 240);
            _stackPanel6.set_property_value(StackPanel.MarginKey, new Thickness(16, 24, 8, 16));
            const _textBlock7 = new TextBlock();
            _textBlock7.set_property_value(TextBlock.TextKey, "Brightness (0–1):");
            _textBlock7.set_property_value(TextBlock.FontSizeKey, 12);
            _textBlock7.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _textBlock7.set_property_value(TextBlock.MarginKey, new Thickness(0, 0, 0, 12));
            _stackPanel6.AddChild(_textBlock7);
            const _slider8 = new Slider();
            _slider8.set_property_value(Slider.WidthKey, 200);
            _slider8.set_property_value(Slider.ValueKey, 0.6);
            _stackPanel6.AddChild(_slider8);
            const _textBlock9 = new TextBlock();
            _textBlock9.set_property_value(TextBlock.TextKey, "Default 0..1 range; SmallChange 0.01, LargeChange 0.1.");
            _textBlock9.set_property_value(TextBlock.FontSizeKey, 11);
            _textBlock9.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock9, "OnSurfaceVariant"));
            _textBlock9.set_property_value(TextBlock.MarginKey, new Thickness(0, 12, 0, 0));
            _stackPanel6.AddChild(_textBlock9);
            _stackPanel5.AddChild(_stackPanel6);
            const _stackPanel10 = new StackPanel();
            _stackPanel10.set_property_value(StackPanel.OrientationKey, Orientation.Vertical);
            _stackPanel10.set_property_value(StackPanel.WidthKey, 240);
            _stackPanel10.set_property_value(StackPanel.MarginKey, new Thickness(8, 24, 8, 16));
            const _textBlock11 = new TextBlock();
            _textBlock11.set_property_value(TextBlock.TextKey, "Volume (0–11):");
            _textBlock11.set_property_value(TextBlock.FontSizeKey, 12);
            _textBlock11.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _textBlock11.set_property_value(TextBlock.MarginKey, new Thickness(0, 0, 0, 12));
            _stackPanel10.AddChild(_textBlock11);
            const _slider12 = new Slider();
            _slider12.set_property_value(Slider.WidthKey, 200);
            _slider12.set_property_value(Slider.MinimumKey, 0);
            _slider12.set_property_value(Slider.MaximumKey, 11);
            _slider12.set_property_value(Slider.ValueKey, 7);
            _slider12.set_property_value(Slider.SmallChangeKey, 1);
            _slider12.set_property_value(Slider.LargeChangeKey, 2);
            _stackPanel10.AddChild(_slider12);
            const _textBlock13 = new TextBlock();
            _textBlock13.set_property_value(TextBlock.TextKey, "Arrow ±1, Page ±2, Home / End snap to 0 / 11.");
            _textBlock13.set_property_value(TextBlock.FontSizeKey, 11);
            _textBlock13.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock13, "OnSurfaceVariant"));
            _textBlock13.set_property_value(TextBlock.MarginKey, new Thickness(0, 12, 0, 0));
            _stackPanel10.AddChild(_textBlock13);
            _stackPanel5.AddChild(_stackPanel10);
            const _stackPanel14 = new StackPanel();
            _stackPanel14.set_property_value(StackPanel.OrientationKey, Orientation.Vertical);
            _stackPanel14.set_property_value(StackPanel.WidthKey, 240);
            _stackPanel14.set_property_value(StackPanel.MarginKey, new Thickness(8, 24, 16, 16));
            const _textBlock15 = new TextBlock();
            _textBlock15.set_property_value(TextBlock.TextKey, "Mix (vertical):");
            _textBlock15.set_property_value(TextBlock.FontSizeKey, 12);
            _textBlock15.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _textBlock15.set_property_value(TextBlock.MarginKey, new Thickness(0, 0, 0, 12));
            _stackPanel14.AddChild(_textBlock15);
            const _slider16 = new Slider();
            _slider16.set_property_value(Slider.OrientationKey, Orientation.Vertical);
            _slider16.set_property_value(Slider.HeightKey, 200);
            _slider16.set_property_value(Slider.ValueKey, 0.35);
            _stackPanel14.AddChild(_slider16);
            const _textBlock17 = new TextBlock();
            _textBlock17.set_property_value(TextBlock.TextKey, "Up = higher; thumb sits at Min when at the bottom.");
            _textBlock17.set_property_value(TextBlock.FontSizeKey, 11);
            _textBlock17.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock17, "OnSurfaceVariant"));
            _textBlock17.set_property_value(TextBlock.MarginKey, new Thickness(0, 12, 0, 0));
            _stackPanel14.AddChild(_textBlock17);
            _stackPanel5.AddChild(_stackPanel14);
            _dockPanel2.AddChild(_stackPanel5);
            _border1.SetChild(_dockPanel2);
            return _border1;
        }, SliderVM);
        t.Set(SliderVM, _tmpl0);
        return t;
    }
}
