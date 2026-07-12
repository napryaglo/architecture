import { AnimationNamedVM } from "./animation-named-vm.mjs";
import { Border, DataTemplate, Dock, DockPanel, Orientation, StackPanel, TextBlock } from "@visualisation-sub/mural/basic";
import { Button } from "@visualisation-sub/mural/framework/buttons/button.js";
import { BeginStoryboardAction, DoubleAnimation, DynamicResource, EventTrigger, PauseStoryboardAction, PropertyTrigger, ResourceDictionary, ResumeStoryboardAction, StopStoryboardAction, Storyboard, Style, Thickness } from "@visualisation-sub/mural/runtime";
import { FontWeight } from "@visualisation-sub/mural/visual-engine";


const _gate_AnimationNamedDemo = Symbol("AnimationNamedDemo.ctor");
export class AnimationNamedDemo extends ResourceDictionary {
    constructor(_g) {
        super();
        if (_g !== _gate_AnimationNamedDemo) {
            throw new Error("AnimationNamedDemo is private — use AnimationNamedDemo.Clone()");
        }
    }
    static Clone() {
        const t = new AnimationNamedDemo(_gate_AnimationNamedDemo);
        const _tmpl0 = new DataTemplate((_data) => {
            const _border1 = new Border();
            _border1.set_property_value(Border.BackgroundKey, DynamicResource(_border1, "Surface"));
            _border1.set_property_value(Border.BorderBrushKey, DynamicResource(_border1, "OutlineVariant"));
            _border1.set_property_value(Border.BorderThicknessKey, new Thickness(1));
            const _rd2 = _border1.Resources;
            const _act4 = new BeginStoryboardAction((_target) => {
                const _sb3 = new Storyboard();
                _sb3.Add(_target, "Width", new DoubleAnimation({ From: 80, To: 240, Duration: 800, AutoReverse: true, RepeatBehavior: Infinity }));
                return _sb3;
            }, "loop");
            const _evt5 = new EventTrigger("Loaded", [_act4]);
            const _act6 = new PauseStoryboardAction("loop");
            const _act7 = new ResumeStoryboardAction("loop");
            const _sArr8 = [];
            const _enter9 = [_act6];
            const _exit10 = [_act7];
            const _trigger11 = new PropertyTrigger(Button, "IsMouseOver", true, _sArr8, _enter9, _exit10);
            const _act12 = new StopStoryboardAction("loop");
            const _evt13 = new EventTrigger("Click", [_act12]);
            const _style14 = new Style(Button, [], undefined, [_trigger11], [], [_evt5, _evt13]);
            _rd2.Set(Button, _style14);
            const _dockPanel15 = new DockPanel();
            const _border16 = new Border();
            _border16.set_property_value(DockPanel.DockKey, Dock.Top);
            _border16.set_property_value(Border.BackgroundKey, DynamicResource(_border16, "Primary"));
            _border16.set_property_value(Border.PaddingKey, new Thickness(16, 12, 16, 12));
            const _textBlock17 = new TextBlock();
            _textBlock17.set_property_value(TextBlock.TextKey, "Named storyboards — Begin / Pause / Resume / Stop");
            _textBlock17.set_property_value(TextBlock.FontSizeKey, 15);
            _textBlock17.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _textBlock17.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock17, "OnPrimary"));
            _border16.SetChild(_textBlock17);
            _dockPanel15.AddChild(_border16);
            const _stackPanel18 = new StackPanel();
            _stackPanel18.set_property_value(StackPanel.OrientationKey, Orientation.Vertical);
            _stackPanel18.set_property_value(StackPanel.MarginKey, new Thickness(20, 24, 20, 20));
            const _textBlock19 = new TextBlock();
            _textBlock19.set_property_value(TextBlock.TextKey, "Each button starts a looping Width animation on Loaded. Hover pauses; un-hover resumes; click stops for good.");
            _textBlock19.set_property_value(TextBlock.FontSizeKey, 12);
            _textBlock19.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock19, "OnSurfaceVariant"));
            _textBlock19.set_property_value(TextBlock.MarginKey, new Thickness(0, 0, 0, 16));
            _stackPanel18.AddChild(_textBlock19);
            const _stackPanel20 = new StackPanel();
            _stackPanel20.set_property_value(StackPanel.OrientationKey, Orientation.Vertical);
            const _button21 = new Button();
            _button21.set_property_value(Button.HeightKey, 28);
            _button21.set_property_value(Button.MarginKey, new Thickness(0, 0, 0, 8));
            const _textBlock22 = new TextBlock();
            _textBlock22.set_property_value(TextBlock.TextKey, "Loop A");
            _button21.Content = _textBlock22;
            _stackPanel20.AddChild(_button21);
            const _button23 = new Button();
            _button23.set_property_value(Button.HeightKey, 28);
            _button23.set_property_value(Button.MarginKey, new Thickness(0, 0, 0, 8));
            const _textBlock24 = new TextBlock();
            _textBlock24.set_property_value(TextBlock.TextKey, "Loop B");
            _button23.Content = _textBlock24;
            _stackPanel20.AddChild(_button23);
            const _button25 = new Button();
            _button25.set_property_value(Button.HeightKey, 28);
            _button25.set_property_value(Button.MarginKey, new Thickness(0, 0, 0, 8));
            const _textBlock26 = new TextBlock();
            _textBlock26.set_property_value(TextBlock.TextKey, "Loop C");
            _button25.Content = _textBlock26;
            _stackPanel20.AddChild(_button25);
            _stackPanel18.AddChild(_stackPanel20);
            const _textBlock27 = new TextBlock();
            _textBlock27.set_property_value(TextBlock.TextKey, "The named registry is per-Visual — pausing Loop A doesn't pause Loop B or C.");
            _textBlock27.set_property_value(TextBlock.FontSizeKey, 11);
            _textBlock27.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock27, "OnSurfaceVariant"));
            _textBlock27.set_property_value(TextBlock.MarginKey, new Thickness(0, 16, 0, 0));
            _stackPanel18.AddChild(_textBlock27);
            _dockPanel15.AddChild(_stackPanel18);
            _border1.SetChild(_dockPanel15);
            return _border1;
        }, AnimationNamedVM);
        t.Set(AnimationNamedVM, _tmpl0);
        return t;
    }
}
