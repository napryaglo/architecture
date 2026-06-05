import { BouncingBallVM } from "./bouncing-ball-vm.mjs";
import { Border, Canvas, DataTemplate, Ellipse } from "@visualisation-sub/mural/Controls";
import { Color, DataContextBinding, NameScope, ResourceDictionary, Thickness } from "@visualisation-sub/mural/runtime";
import { SolidColorBrush } from "@visualisation-sub/mural/visual-engine";

export function create() {
    const _rd0 = new ResourceDictionary();
    const _tmpl1 = new DataTemplate((_data) => {
        const _border2 = new Border();
        _border2.SetNameScope(new NameScope());
        _border2._set_property_value_by_name("Background", new SolidColorBrush(Color.FromHex('#0f172a')));
        _border2._set_property_value_by_name("BorderBrush", new SolidColorBrush(Color.FromHex('#334155')));
        _border2._set_property_value_by_name("BorderThickness", new Thickness(1));
        _border2._set_property_value_by_name("Width", 640);
        _border2._set_property_value_by_name("Height", 360);
        const _canvas3 = new Canvas();
        _canvas3.Name = "playArea";
        const _ellipse4 = new Ellipse();
        _ellipse4._set_property_value_by_name(Canvas, "Left", DataContextBinding(_ellipse4, "X"));
        _ellipse4._set_property_value_by_name(Canvas, "Top", DataContextBinding(_ellipse4, "Y"));
        _ellipse4._set_property_value_by_name("Width", DataContextBinding(_ellipse4, "Diameter"));
        _ellipse4._set_property_value_by_name("Height", DataContextBinding(_ellipse4, "Diameter"));
        _ellipse4._set_property_value_by_name("Fill", new SolidColorBrush(Color.FromHex('#fbbf24')));
        _ellipse4._set_property_value_by_name("Stroke", new SolidColorBrush(Color.FromHex('#f59e0b')));
        _ellipse4._set_property_value_by_name("StrokeThickness", 1.5);
        _canvas3.AddChild(_ellipse4);
        _border2.SetChild(_canvas3);
        return _border2;
    }, BouncingBallVM);
    _rd0.Set("BouncingBallTemplate", _tmpl1);
    return _rd0;
}
