import { AnimationDeclarativeVM } from "./animation-declarative-vm.mjs";
import { Border, DataTemplate, Dock, DockPanel, Orientation, StackPanel, TextBlock } from "mural/basic";
import { Button } from "mural/framework/buttons/button.js";
import { BeginStoryboardAction, DoubleAnimation, DynamicResource, EventTrigger, ResourceDictionary, Storyboard, Style, Thickness } from "mural/runtime";
import { FontWeight } from "mural/visual-engine";


const _gate_AnimationDeclarativeDemo = Symbol("AnimationDeclarativeDemo.ctor");
export class AnimationDeclarativeDemo extends ResourceDictionary {
    constructor(_g) {
        super();
        if (_g !== _gate_AnimationDeclarativeDemo) {
            throw new Error("AnimationDeclarativeDemo is private — use AnimationDeclarativeDemo.Clone()");
        }
    }
    static Clone() {
        const t = new AnimationDeclarativeDemo(_gate_AnimationDeclarativeDemo);
        const _tmpl0 = new DataTemplate((_data) => {
            const _border1 = new Border();
            _border1.set_property_value(Border.BackgroundKey, DynamicResource(_border1, "Surface"));
            _border1.set_property_value(Border.BorderBrushKey, DynamicResource(_border1, "OutlineVariant"));
            _border1.set_property_value(Border.BorderThicknessKey, new Thickness(1));
            const _rd2 = _border1.Resources;
            const _act4 = new BeginStoryboardAction((_target) => {
                const _sb3 = new Storyboard();
                _sb3.Add(_target, "Width", new DoubleAnimation({ From: 80, To: 240, Duration: 400 }));
                return _sb3;
            });
            const _evt5 = new EventTrigger("Click", [_act4]);
            const _style6 = new Style(Button, [], undefined, [], [], [_evt5]);
            _rd2.Set(Button, _style6);
            const _dockPanel7 = new DockPanel();
            const _border8 = new Border();
            _border8.set_property_value(DockPanel.DockKey, Dock.Top);
            _border8.set_property_value(Border.BackgroundKey, DynamicResource(_border8, "Primary"));
            _border8.set_property_value(Border.PaddingKey, new Thickness(16, 12, 16, 12));
            const _textBlock9 = new TextBlock();
            _textBlock9.set_property_value(TextBlock.TextKey, "Declarative animation — on Click { BeginStoryboard { ... } }");
            _textBlock9.set_property_value(TextBlock.FontSizeKey, 15);
            _textBlock9.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _textBlock9.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock9, "OnPrimary"));
            _border8.SetChild(_textBlock9);
            _dockPanel7.AddChild(_border8);
            const _stackPanel10 = new StackPanel();
            _stackPanel10.set_property_value(StackPanel.OrientationKey, Orientation.Vertical);
            _stackPanel10.set_property_value(StackPanel.MarginKey, new Thickness(20, 24, 20, 20));
            const _textBlock11 = new TextBlock();
            _textBlock11.set_property_value(TextBlock.TextKey, "Click any Button. The style's EventTrigger animates the Button's own Width from 80 to 240 over 400 ms — no host-side handler wired.");
            _textBlock11.set_property_value(TextBlock.FontSizeKey, 12);
            _textBlock11.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock11, "OnSurfaceVariant"));
            _textBlock11.set_property_value(TextBlock.MarginKey, new Thickness(0, 0, 0, 16));
            _stackPanel10.AddChild(_textBlock11);
            const _stackPanel12 = new StackPanel();
            _stackPanel12.set_property_value(StackPanel.OrientationKey, Orientation.Vertical);
            const _button13 = new Button();
            _button13.set_property_value(Button.WidthKey, 80);
            _button13.set_property_value(Button.MarginKey, new Thickness(0, 0, 0, 8));
            const _textBlock14 = new TextBlock();
            _textBlock14.set_property_value(TextBlock.TextKey, "Slide A");
            _button13.Content = _textBlock14;
            _stackPanel12.AddChild(_button13);
            const _button15 = new Button();
            _button15.set_property_value(Button.WidthKey, 80);
            _button15.set_property_value(Button.MarginKey, new Thickness(0, 0, 0, 8));
            const _textBlock16 = new TextBlock();
            _textBlock16.set_property_value(TextBlock.TextKey, "Slide B");
            _button15.Content = _textBlock16;
            _stackPanel12.AddChild(_button15);
            const _button17 = new Button();
            _button17.set_property_value(Button.WidthKey, 80);
            _button17.set_property_value(Button.MarginKey, new Thickness(0, 0, 0, 8));
            const _textBlock18 = new TextBlock();
            _textBlock18.set_property_value(TextBlock.TextKey, "Slide C");
            _button17.Content = _textBlock18;
            _stackPanel12.AddChild(_button17);
            _stackPanel10.AddChild(_stackPanel12);
            const _textBlock19 = new TextBlock();
            _textBlock19.set_property_value(TextBlock.TextKey, "Each Button carries its own animation instance — clicking them simultaneously plays independent storyboards (each baseline-captures From=80 at fire time).");
            _textBlock19.set_property_value(TextBlock.FontSizeKey, 11);
            _textBlock19.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock19, "OnSurfaceVariant"));
            _textBlock19.set_property_value(TextBlock.MarginKey, new Thickness(0, 16, 0, 0));
            _stackPanel10.AddChild(_textBlock19);
            _dockPanel7.AddChild(_stackPanel10);
            _border1.SetChild(_dockPanel7);
            return _border1;
        }, AnimationDeclarativeVM);
        t.Set(AnimationDeclarativeVM, _tmpl0);
        return t;
    }
}
