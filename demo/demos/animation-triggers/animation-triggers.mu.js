import { AnimationTriggersVM } from "./animation-triggers-vm.mjs";
import { Border, DataTemplate, Dock, DockPanel, Orientation, StackPanel, TextBlock } from "@pragmatic-lab/mural/basic";
import { Button } from "@pragmatic-lab/mural/framework/buttons/button.js";
import { BeginStoryboardAction, Color, DoubleAnimation, DynamicResource, EventTrigger, NameScope, PropertyTrigger, ResourceDictionary, Storyboard, Style, Thickness } from "@pragmatic-lab/mural/runtime";
import { FontWeight, Pen, SolidColorBrush } from "@pragmatic-lab/mural/visual-engine";


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
            let _button1, _border2;
            const _border3 = new Border();
            _border3.SetNameScope(new NameScope());
            _border3.set_property_value(Border.FillKey, DynamicResource(_border3, "Surface"));
            _border3.set_property_value(Border.StrokeKey, ((_e) => { _e.Brush = DynamicResource(_e, "OutlineVariant"); return _e; })(new Pen()));
            const _rd4 = _border3.Resources;
            const _act6 = new BeginStoryboardAction((_target) => {
                const _sb5 = new Storyboard();
                _sb5.Add(_target, "Width", new DoubleAnimation({ From: 60, To: 140, Duration: 500 }));
                return _sb5;
            });
            const _evt7 = new EventTrigger("Loaded", [_act6]);
            const _act9 = new BeginStoryboardAction((_target) => {
                const _sb8 = new Storyboard();
                _sb8.Add((_target.FindName("banner") ?? _target), "Width", new DoubleAnimation({ From: 80, To: 320, Duration: 500 }));
                return _sb8;
            });
            const _evt10 = new EventTrigger("Click", [_act9]);
            const _act12 = new BeginStoryboardAction((_target) => {
                const _sb11 = new Storyboard();
                _sb11.Add(_target, "Height", new DoubleAnimation({ To: 36, Duration: 180 }));
                return _sb11;
            });
            const _act14 = new BeginStoryboardAction((_target) => {
                const _sb13 = new Storyboard();
                _sb13.Add(_target, "Height", new DoubleAnimation({ To: 28, Duration: 180 }));
                return _sb13;
            });
            const _sArr15 = [];
            const _enter16 = [_act12];
            const _exit17 = [_act14];
            const _trigger18 = new PropertyTrigger(Button, "IsMouseOver", true, _sArr15, _enter16, _exit17);
            const _style19 = new Style(Button, [], undefined, [_trigger18], [], [_evt7, _evt10]);
            _rd4.Set(Button, _style19);
            const _dockPanel20 = new DockPanel();
            const _border21 = new Border();
            _border21.set_property_value(DockPanel.DockKey, Dock.Top);
            _border21.set_property_value(Border.FillKey, DynamicResource(_border21, "Primary"));
            _border21.set_property_value(Border.PaddingKey, new Thickness(16, 12, 16, 12));
            const _textBlock22 = new TextBlock();
            _textBlock22.set_property_value(TextBlock.TextKey, "Trigger actions — enter/exit, Loaded, TargetName");
            _textBlock22.set_property_value(TextBlock.FontSizeKey, 15);
            _textBlock22.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _textBlock22.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock22, "OnPrimary"));
            _border21.SetChild(_textBlock22);
            _dockPanel20.AddChild(_border21);
            const _stackPanel23 = new StackPanel();
            _stackPanel23.set_property_value(StackPanel.OrientationKey, Orientation.Vertical);
            _stackPanel23.set_property_value(StackPanel.MarginKey, new Thickness(20, 24, 20, 20));
            const _stackPanel24 = new StackPanel();
            _stackPanel24.set_property_value(StackPanel.OrientationKey, Orientation.Vertical);
            _stackPanel24.set_property_value(StackPanel.MarginKey, new Thickness(0, 0, 0, 28));
            const _textBlock25 = new TextBlock();
            _textBlock25.set_property_value(TextBlock.TextKey, "Hover an entry — `when(IsMouseOver) { on enter / on exit }` drives Height.");
            _textBlock25.set_property_value(TextBlock.FontSizeKey, 12);
            _textBlock25.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _textBlock25.set_property_value(TextBlock.MarginKey, new Thickness(0, 0, 0, 8));
            _stackPanel24.AddChild(_textBlock25);
            const _stackPanel26 = new StackPanel();
            _stackPanel26.set_property_value(StackPanel.OrientationKey, Orientation.Vertical);
            const _button27 = new Button();
            _button27.set_property_value(Button.HeightKey, 28);
            _button27.set_property_value(Button.MarginKey, new Thickness(0, 0, 0, 6));
            const _textBlock28 = new TextBlock();
            _textBlock28.set_property_value(TextBlock.TextKey, "Hover me");
            _button27.Content = _textBlock28;
            _stackPanel26.AddChild(_button27);
            const _button29 = new Button();
            _button29.set_property_value(Button.HeightKey, 28);
            _button29.set_property_value(Button.MarginKey, new Thickness(0, 0, 0, 6));
            const _textBlock30 = new TextBlock();
            _textBlock30.set_property_value(TextBlock.TextKey, "Hover me too");
            _button29.Content = _textBlock30;
            _stackPanel26.AddChild(_button29);
            const _button31 = new Button();
            _button31.set_property_value(Button.HeightKey, 28);
            _button31.set_property_value(Button.MarginKey, new Thickness(0, 0, 0, 6));
            const _textBlock32 = new TextBlock();
            _textBlock32.set_property_value(TextBlock.TextKey, "And me");
            _button31.Content = _textBlock32;
            _stackPanel26.AddChild(_button31);
            _stackPanel24.AddChild(_stackPanel26);
            const _textBlock33 = new TextBlock();
            _textBlock33.set_property_value(TextBlock.TextKey, "On first mount the same buttons run the Loaded storyboard — Width grows from 60 to 140.");
            _textBlock33.set_property_value(TextBlock.FontSizeKey, 11);
            _textBlock33.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock33, "OnSurfaceVariant"));
            _textBlock33.set_property_value(TextBlock.MarginKey, new Thickness(0, 12, 0, 0));
            _stackPanel24.AddChild(_textBlock33);
            _stackPanel23.AddChild(_stackPanel24);
            const _stackPanel34 = new StackPanel();
            _stackPanel34.set_property_value(StackPanel.OrientationKey, Orientation.Vertical);
            const _textBlock35 = new TextBlock();
            _textBlock35.set_property_value(TextBlock.TextKey, "`TargetName=banner` redirects the storyboard target to the named sibling Border.");
            _textBlock35.set_property_value(TextBlock.FontSizeKey, 12);
            _textBlock35.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _textBlock35.set_property_value(TextBlock.MarginKey, new Thickness(0, 0, 0, 8));
            _stackPanel34.AddChild(_textBlock35);
            _button1 = new Button();
            _button1.Name = "bannerBtn";
            _button1.set_property_value(Button.WidthKey, 200);
            _button1.set_property_value(Button.HeightKey, 28);
            _button1.set_property_value(Button.MarginKey, new Thickness(0, 0, 0, 12));
            const _textBlock36 = new TextBlock();
            _textBlock36.set_property_value(TextBlock.TextKey, "Animate banner");
            _button1.Content = _textBlock36;
            _stackPanel34.AddChild(_button1);
            _border2 = new Border();
            _border2.Name = "banner";
            _border2.set_property_value(Border.FillKey, new SolidColorBrush(Color.FromHex('#ff9800')));
            _border2.set_property_value(Border.WidthKey, 80);
            _border2.set_property_value(Border.HeightKey, 20);
            _border2.set_property_value(Border.CornerRadiusKey, 4);
            _stackPanel34.AddChild(_border2);
            _stackPanel23.AddChild(_stackPanel34);
            _dockPanel20.AddChild(_stackPanel23);
            _border3.SetChild(_dockPanel20);
            return _border3;
        }, AnimationTriggersVM);
        t.Set(AnimationTriggersVM, _tmpl0);
        return t;
    }
}
