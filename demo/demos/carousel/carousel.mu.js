import { CarouselCard, CarouselVM } from "./carousel-vm.mjs";
import { Border, DataTemplate, Orientation, StackPanel, TextBlock, TextWrapping } from "@pragmatic-lab/mural/basic";
import { ButtonVariant } from "@pragmatic-lab/mural/framework/buttons/button.js";
import { Carousel } from "@pragmatic-lab/mural/framework/carousel/carousel.js";
import { Card } from "@pragmatic-lab/mural/framework/surfaces/card.js";
import { DataContextBinding, DynamicResource, ResourceDictionary, Thickness, VerticalAlignment } from "@pragmatic-lab/mural/runtime";


const _gate_CarouselDemo = Symbol("CarouselDemo.ctor");
export class CarouselDemo extends ResourceDictionary {
    constructor(_g) {
        super();
        if (_g !== _gate_CarouselDemo) {
            throw new Error("CarouselDemo is private — use CarouselDemo.Clone()");
        }
    }
    static Clone() {
        const t = new CarouselDemo(_gate_CarouselDemo);
        const _tmpl0 = new DataTemplate((_data) => {
            const _card1 = new Card();
            _card1.set_property_value(Card.VariantKey, ButtonVariant.Filled);
            const _stackPanel2 = new StackPanel();
            _stackPanel2.set_property_value(StackPanel.OrientationKey, Orientation.Vertical);
            _stackPanel2.set_property_value(StackPanel.VerticalAlignmentKey, VerticalAlignment.Bottom);
            const _textBlock3 = new TextBlock();
            _textBlock3.set_property_value(TextBlock.TextKey, DataContextBinding(_textBlock3, "Title"));
            _textBlock3.set_property_value(TextBlock.StyleKey, DynamicResource(_textBlock3, "HeadlineSmall"));
            _textBlock3.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock3, "OnSurface"));
            _stackPanel2.AddChild(_textBlock3);
            const _textBlock4 = new TextBlock();
            _textBlock4.set_property_value(TextBlock.TextKey, DataContextBinding(_textBlock4, "Subtitle"));
            _textBlock4.set_property_value(TextBlock.StyleKey, DynamicResource(_textBlock4, "BodyMedium"));
            _textBlock4.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock4, "OnSurfaceVariant"));
            _textBlock4.set_property_value(TextBlock.TextWrappingKey, TextWrapping.Wrap);
            _textBlock4.set_property_value(TextBlock.MarginKey, new Thickness(0, 4, 0, 0));
            _stackPanel2.AddChild(_textBlock4);
            _card1.Content = _stackPanel2;
            return _card1;
        }, CarouselCard);
        t.Set("CarouselCardTemplate", _tmpl0);
        const _tmpl5 = new DataTemplate((_data) => {
            const _border6 = new Border();
            _border6.set_property_value(Border.BackgroundKey, DynamicResource(_border6, "Surface"));
            _border6.set_property_value(Border.BorderBrushKey, DynamicResource(_border6, "OutlineVariant"));
            _border6.set_property_value(Border.BorderThicknessKey, new Thickness(1));
            const _stackPanel7 = new StackPanel();
            _stackPanel7.set_property_value(StackPanel.OrientationKey, Orientation.Vertical);
            _stackPanel7.set_property_value(StackPanel.MarginKey, new Thickness(32, 32, 32, 32));
            const _textBlock8 = new TextBlock();
            _textBlock8.set_property_value(TextBlock.TextKey, "Carousel — M3 multi-browse hero-card scroller");
            _textBlock8.set_property_value(TextBlock.StyleKey, DynamicResource(_textBlock8, "TitleMedium"));
            _textBlock8.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock8, "OnSurface"));
            _textBlock8.set_property_value(TextBlock.MarginKey, new Thickness(0, 0, 0, 24));
            _stackPanel7.AddChild(_textBlock8);
            const _carousel9 = new Carousel();
            _carousel9.set_property_value(Carousel.ItemsSourceKey, DataContextBinding(_carousel9, "Items"));
            _carousel9.set_property_value(Carousel.ItemTemplateKey, _tmpl0);
            _carousel9.set_property_value(Carousel.ActiveIndexKey, DataContextBinding(_carousel9, "ActiveIndex"));
            _carousel9.set_property_value(Carousel.VisibleCountKey, 3);
            _carousel9.set_property_value(Carousel.ItemWidthKey, 220);
            _carousel9.set_property_value(Carousel.ItemHeightKey, 240);
            _stackPanel7.AddChild(_carousel9);
            const _textBlock10 = new TextBlock();
            _textBlock10.set_property_value(TextBlock.TextKey, DataContextBinding(_textBlock10, "Caption"));
            _textBlock10.set_property_value(TextBlock.StyleKey, DynamicResource(_textBlock10, "LabelLarge"));
            _textBlock10.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock10, "OnSurfaceVariant"));
            _textBlock10.set_property_value(TextBlock.MarginKey, new Thickness(0, 16, 0, 0));
            _stackPanel7.AddChild(_textBlock10);
            _border6.SetChild(_stackPanel7);
            return _border6;
        }, CarouselVM);
        t.Set(CarouselVM, _tmpl5);
        return t;
    }
    get CarouselCardTemplate() { return this.Resolve("CarouselCardTemplate"); }
    set CarouselCardTemplate(v) { this.Set("CarouselCardTemplate", v); }
}
