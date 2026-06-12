import { BouncingBallVM } from "./bouncing-ball-vm.mjs";
import { Border, Canvas, DataTemplate, Ellipse } from "@visualisation-sub/mural/basic";
import { Color, DataContextBinding, DynamicResource, NameScope, ResourceDictionary, Thickness } from "@visualisation-sub/mural/runtime";
import { SolidColorBrush } from "@visualisation-sub/mural/visual-engine";


const _gate_BouncingBallDemo = Symbol("BouncingBallDemo.ctor");
export class BouncingBallDemo extends ResourceDictionary {
    constructor(_g) {
        super();
        if (_g !== _gate_BouncingBallDemo) {
            throw new Error("BouncingBallDemo is private — use BouncingBallDemo.Clone()");
        }
    }
    static Clone() {
        const t = new BouncingBallDemo(_gate_BouncingBallDemo);
        const _tmpl0 = new DataTemplate((_data) => {
            const _border1 = new Border();
            _border1.SetNameScope(new NameScope());
            _border1._set_property_value_by_name("Background", DynamicResource(_border1, "InverseSurface"));
            _border1._set_property_value_by_name("BorderBrush", DynamicResource(_border1, "Outline"));
            _border1._set_property_value_by_name("BorderThickness", new Thickness(1));
            _border1._set_property_value_by_name("Width", 640);
            _border1._set_property_value_by_name("Height", 360);
            const _canvas2 = new Canvas();
            _canvas2.Name = "playArea";
            const _ellipse3 = new Ellipse();
            _ellipse3._set_property_value_by_name(Canvas, "Left", DataContextBinding(_ellipse3, "X"));
            _ellipse3._set_property_value_by_name(Canvas, "Top", DataContextBinding(_ellipse3, "Y"));
            _ellipse3._set_property_value_by_name("Width", DataContextBinding(_ellipse3, "Diameter"));
            _ellipse3._set_property_value_by_name("Height", DataContextBinding(_ellipse3, "Diameter"));
            _ellipse3._set_property_value_by_name("Fill", new SolidColorBrush(Color.FromHex('#fbbf24')));
            _ellipse3._set_property_value_by_name("Stroke", new SolidColorBrush(Color.FromHex('#f59e0b')));
            _ellipse3._set_property_value_by_name("StrokeThickness", 1.5);
            _canvas2.AddChild(_ellipse3);
            _border1.SetChild(_canvas2);
            return _border1;
        }, BouncingBallVM);
        t.Set("BouncingBallTemplate", _tmpl0);
        return t;
    }
    get BouncingBallTemplate() { return this.Resolve("BouncingBallTemplate"); }
    set BouncingBallTemplate(v) { this.Set("BouncingBallTemplate", v); }
}
