import { AnimationTriggersVM } from "./animation-triggers-vm.mjs";
import { Border, DataTemplate, Dock, DockPanel, Orientation, StackPanel, TextBlock } from "@visualisation-sub/mural/basic";
import { Button } from "@visualisation-sub/mural/framework/buttons/button.js";
import { BeginStoryboardAction, Color, DoubleAnimation, DynamicResource, EventTrigger, NameScope, PropertyTrigger, ResourceDictionary, Storyboard, Style, Thickness } from "@visualisation-sub/mural/runtime";
import { FontWeight, SolidColorBrush } from "@visualisation-sub/mural/visual-engine";


const _gate_AnimationTriggersDemo = Symbol("AnimationTriggersDemo.ctor");
export class AnimationTriggersDemo extends ResourceDictionary {
    constructor(_g) {
        super();
        if (_g !== _gate_AnimationTriggersDemo) {
            throw new Error("AnimationTriggersDemo is private — use AnimationTriggersDemo.Clone()");
        }
    }
    static Clone() {
        const t = new AnimationTriggersDemo(_gate_AnimationTriggersDemo);
        const _tmpl0 = new DataTemplate((_data) => {
            const _border1 = new Border();
            _border1.SetNameScope(new NameScope());
            _border1.set_property_value(Border.BackgroundKey, DynamicResource(_border1, "Surface"));
            _border1.set_property_value(Border.BorderBrushKey, DynamicResource(_border1, "OutlineVariant"));
            _border1.set_property_value(Border.BorderThicknessKey, new Thickness(1));
            const _rd2 = _border1.Resources;
            const _act4 = new BeginStoryboardAction((_target) => {
                const _sb3 = new Storyboard();
                _sb3.Add(_target, "Width", new DoubleAnimation({ From: 60, To: 140, Duration: 500 }));
                return _sb3;
            });
            const _evt5 = new EventTrigger("Loaded", [_act4]);
            const _act7 = new BeginStoryboardAction((_target) => {
                const _sb6 = new Storyboard();
                _sb6.Add((_target.FindName("banner") ?? _target), "Width", new DoubleAnimation({ From: 80, To: 320, Duration: 500 }));
                return _sb6;
            });
            const _evt8 = new EventTrigger("Click", [_act7]);
            const _act10 = new BeginStoryboardAction((_target) => {
                const _sb9 = new Storyboard();
                _sb9.Add(_target, "Height", new DoubleAnimation({ To: 36, Duration: 180 }));
                return _sb9;
            });
            const _act12 = new BeginStoryboardAction((_target) => {
                const _sb11 = new Storyboard();
                _sb11.Add(_target, "Height", new DoubleAnimation({ To: 28, Duration: 180 }));
                return _sb11;
            });
            const _sArr13 = [];
            const _enter14 = [_act10];
            const _exit15 = [_act12];
            const _trigger16 = new PropertyTrigger(Button, "IsMouseOver", true, _sArr13, _enter14, _exit15);
            const _style17 = new Style(Button, [], undefined, [_trigger16], [], [_evt5, _evt8]);
            _rd2.Set(Button, _style17);
            const _dockPanel18 = new DockPanel();
            const _border19 = new Border();
            _border19.set_property_value(DockPanel.DockKey, Dock.Top);
            _border19.set_property_value(Border.BackgroundKey, DynamicResource(_border19, "Primary"));
            _border19.set_property_value(Border.PaddingKey, new Thickness(16, 12, 16, 12));
            const _textBlock20 = new TextBlock();
            _textBlock20.set_property_value(TextBlock.TextKey, "Trigger actions — enter/exit, Loaded, TargetName");
            _textBlock20.set_property_value(TextBlock.FontSizeKey, 15);
            _textBlock20.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _textBlock20.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock20, "OnPrimary"));
            _border19.SetChild(_textBlock20);
            _dockPanel18.AddChild(_border19);
            const _stackPanel21 = new StackPanel();
            _stackPanel21.set_property_value(StackPanel.OrientationKey, Orientation.Vertical);
            _stackPanel21.set_property_value(StackPanel.MarginKey, new Thickness(20, 24, 20, 20));
            const _stackPanel22 = new StackPanel();
            _stackPanel22.set_property_value(StackPanel.OrientationKey, Orientation.Vertical);
            _stackPanel22.set_property_value(StackPanel.MarginKey, new Thickness(0, 0, 0, 28));
            const _textBlock23 = new TextBlock();
            _textBlock23.set_property_value(TextBlock.TextKey, "Hover an entry — `when(IsMouseOver) { on enter / on exit }` drives Height.");
            _textBlock23.set_property_value(TextBlock.FontSizeKey, 12);
            _textBlock23.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _textBlock23.set_property_value(TextBlock.MarginKey, new Thickness(0, 0, 0, 8));
            _stackPanel22.AddChild(_textBlock23);
            const _stackPanel24 = new StackPanel();
            _stackPanel24.set_property_value(StackPanel.OrientationKey, Orientation.Vertical);
            const _button25 = new Button();
            _button25.set_property_value(Button.HeightKey, 28);
            _button25.set_property_value(Button.MarginKey, new Thickness(0, 0, 0, 6));
            const _textBlock26 = new TextBlock();
            _textBlock26.set_property_value(TextBlock.TextKey, "Hover me");
            _button25.Content = _textBlock26;
            _stackPanel24.AddChild(_button25);
            const _button27 = new Button();
            _button27.set_property_value(Button.HeightKey, 28);
            _button27.set_property_value(Button.MarginKey, new Thickness(0, 0, 0, 6));
            const _textBlock28 = new TextBlock();
            _textBlock28.set_property_value(TextBlock.TextKey, "Hover me too");
            _button27.Content = _textBlock28;
            _stackPanel24.AddChild(_button27);
            const _button29 = new Button();
            _button29.set_property_value(Button.HeightKey, 28);
            _button29.set_property_value(Button.MarginKey, new Thickness(0, 0, 0, 6));
            const _textBlock30 = new TextBlock();
            _textBlock30.set_property_value(TextBlock.TextKey, "And me");
            _button29.Content = _textBlock30;
            _stackPanel24.AddChild(_button29);
            _stackPanel22.AddChild(_stackPanel24);
            const _textBlock31 = new TextBlock();
            _textBlock31.set_property_value(TextBlock.TextKey, "On first mount the same buttons run the Loaded storyboard — Width grows from 60 to 140.");
            _textBlock31.set_property_value(TextBlock.FontSizeKey, 11);
            _textBlock31.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock31, "OnSurfaceVariant"));
            _textBlock31.set_property_value(TextBlock.MarginKey, new Thickness(0, 12, 0, 0));
            _stackPanel22.AddChild(_textBlock31);
            _stackPanel21.AddChild(_stackPanel22);
            const _stackPanel32 = new StackPanel();
            _stackPanel32.set_property_value(StackPanel.OrientationKey, Orientation.Vertical);
            const _textBlock33 = new TextBlock();
            _textBlock33.set_property_value(TextBlock.TextKey, "`TargetName=banner` redirects the storyboard target to the named sibling Border.");
            _textBlock33.set_property_value(TextBlock.FontSizeKey, 12);
            _textBlock33.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _textBlock33.set_property_value(TextBlock.MarginKey, new Thickness(0, 0, 0, 8));
            _stackPanel32.AddChild(_textBlock33);
            const _button34 = new Button();
            _button34.Name = "bannerBtn";
            _button34.set_property_value(Button.WidthKey, 200);
            _button34.set_property_value(Button.HeightKey, 28);
            _button34.set_property_value(Button.MarginKey, new Thickness(0, 0, 0, 12));
            const _textBlock35 = new TextBlock();
            _textBlock35.set_property_value(TextBlock.TextKey, "Animate banner");
            _button34.Content = _textBlock35;
            _stackPanel32.AddChild(_button34);
            const _border36 = new Border();
            _border36.Name = "banner";
            _border36.set_property_value(Border.BackgroundKey, new SolidColorBrush(Color.FromHex('#ff9800')));
            _border36.set_property_value(Border.WidthKey, 80);
            _border36.set_property_value(Border.HeightKey, 20);
            _border36.set_property_value(Border.CornerRadiusKey, 4);
            _stackPanel32.AddChild(_border36);
            _stackPanel21.AddChild(_stackPanel32);
            _dockPanel18.AddChild(_stackPanel21);
            _border1.SetChild(_dockPanel18);
            return _border1;
        }, AnimationTriggersVM);
        t.Set("AnimationTriggersTemplate", _tmpl0);
        return t;
    }
    get AnimationTriggersTemplate() { return this.Resolve("AnimationTriggersTemplate"); }
    set AnimationTriggersTemplate(v) { this.Set("AnimationTriggersTemplate", v); }
}
