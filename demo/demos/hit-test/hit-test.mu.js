import { HitTestVM } from "./hit-test-vm.mjs";
import { Border, DataTemplate, Dock, DockPanel, HeartPresenter, Orientation, StackPanel, TargetedSetter, TemplateDataTrigger, TextBlock, TextWrapping } from "@pragmatic-lab/mural/basic";
import { Button } from "@pragmatic-lab/mural/framework/buttons/button.js";
import { Color, DynamicResource, HorizontalAlignment, NameScope, ResourceDictionary, Thickness, VerticalAlignment } from "@pragmatic-lab/mural/runtime";
import { FontWeight, Pen, SolidColorBrush } from "@pragmatic-lab/mural/visual-engine";


const _gate_HitTestDemo = Symbol("HitTestDemo.ctor");
export class HitTestDemo extends ResourceDictionary {
    constructor(_g) {
        super();
        if (_g !== _gate_HitTestDemo) {
            throw new Error("HitTestDemo is private — use HitTestDemo.Clone()");
        }
    }
    static Clone() {
        const t = new HitTestDemo(_gate_HitTestDemo);
        const _pen0 = new Pen();
        _pen0.set_property_value(Pen.BrushKey, new SolidColorBrush(Color.FromHex('#ff00ff')));
        _pen0.set_property_value(Pen.ThicknessKey, 3);
        t.Set("HeartOutlinePen", _pen0);
        const _tmpl1 = (() => {
            const _factory = (_data) => {
                let _heartPresenter2;
                const _border3 = new Border();
                _border3.SetNameScope(new NameScope());
                _border3.set_property_value(Border.FillKey, DynamicResource(_border3, "Surface"));
                const _dockPanel4 = new DockPanel();
                const _border5 = new Border();
                _border5.set_property_value(DockPanel.DockKey, Dock.Top);
                _border5.set_property_value(Border.FillKey, DynamicResource(_border5, "Primary"));
                _border5.set_property_value(Border.PaddingKey, new Thickness(20, 14, 20, 14));
                const _stackPanel6 = new StackPanel();
                _stackPanel6.set_property_value(StackPanel.OrientationKey, Orientation.Vertical);
                const _textBlock7 = new TextBlock();
                _textBlock7.set_property_value(TextBlock.TextKey, "Hit test");
                _textBlock7.set_property_value(TextBlock.FontSizeKey, 18);
                _textBlock7.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
                _textBlock7.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock7, "OnPrimary"));
                _stackPanel6.AddChild(_textBlock7);
                const _textBlock8 = new TextBlock();
                _textBlock8.set_property_value(TextBlock.TextKey, "A single Heart shape. It publishes its own outline as HitTestGeometry, so only clicks inside the heart toggle the fill orange↔white — clicks in the bounding-box corners fall through.");
                _textBlock8.set_property_value(TextBlock.FontSizeKey, 12);
                _textBlock8.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock8, "OnPrimary"));
                _textBlock8.set_property_value(TextBlock.TextWrappingKey, TextWrapping.Wrap);
                _textBlock8.set_property_value(TextBlock.MarginKey, new Thickness(0, 4, 0, 0));
                _stackPanel6.AddChild(_textBlock8);
                _border5.SetChild(_stackPanel6);
                _dockPanel4.AddChild(_border5);
                _heartPresenter2 = new HeartPresenter();
                _heartPresenter2.Name = "heartShape";
                _heartPresenter2.set_property_value(HeartPresenter.FillKey, new SolidColorBrush(Color.FromHex('#ff8c00')));
                _heartPresenter2.set_property_value(HeartPresenter.StrokeKey, DynamicResource(_heartPresenter2, "HeartOutlinePen"));
                _heartPresenter2.set_property_value(HeartPresenter.WidthKey, 260);
                _heartPresenter2.set_property_value(HeartPresenter.HeightKey, 240);
                _heartPresenter2.set_property_value(HeartPresenter.ClipToBoundsKey, true);
                _heartPresenter2.set_property_value(HeartPresenter.HorizontalAlignmentKey, HorizontalAlignment.Center);
                _heartPresenter2.set_property_value(HeartPresenter.VerticalAlignmentKey, VerticalAlignment.Center);
                _heartPresenter2.set_property_value(HeartPresenter.ContentKey, ((_e) => { _e.HorizontalAlignment = HorizontalAlignment.Center; _e.VerticalAlignment = VerticalAlignment.Center; _e.Content = ((_e) => { _e.Text = "Click Me! This is a very long long label that runs well past the heart so you can see the content clipped to the outline."; return _e; })(new TextBlock()); return _e; })(new Button()));
                _dockPanel4.AddChild(_heartPresenter2);
                _border3.SetChild(_dockPanel4);
                return _border3;
            };
            const _tplSet9 = [new TargetedSetter(HeartPresenter, "Fill", new SolidColorBrush(Color.FromHex('#ffffff')), "heartShape")];
            const _tplDataTrig10 = new TemplateDataTrigger("IsToggled", true, _tplSet9);
            return new DataTemplate(_factory, HitTestVM, [], [_tplDataTrig10]);
        })();
        t.Set(HitTestVM, _tmpl1);
        return t;
    }
    get HeartOutlinePen() { return this.Resolve("HeartOutlinePen"); }
    set HeartOutlinePen(v) { this.Set("HeartOutlinePen", v); }
}
