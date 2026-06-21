import { BouncingBallVM } from "./bouncing-ball-vm.mjs";
import { Border, Canvas, DataTemplate, Ellipse } from "@visualisation-sub/mural/basic";
import { Color, DataContextBinding, DynamicResource, NameScope, ResourceDictionary, Thickness } from "@visualisation-sub/mural/runtime";
import { Pen, SolidColorBrush } from "@visualisation-sub/mural/visual-engine";


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
        const _pen0 = new Pen();
        _pen0.set_property_value(Pen.BrushKey, new SolidColorBrush(Color.FromHex('#f59e0b')));
        _pen0.set_property_value(Pen.ThicknessKey, 1.5);
        t.Set("BallPen", _pen0);
        const _tmpl1 = new DataTemplate((_data) => {
            const _border2 = new Border();
            _border2.SetNameScope(new NameScope());
            _border2.set_property_value(Border.BackgroundKey, DynamicResource(_border2, "InverseSurface"));
            _border2.set_property_value(Border.BorderBrushKey, DynamicResource(_border2, "Outline"));
            _border2.set_property_value(Border.BorderThicknessKey, new Thickness(1));
            _border2.set_property_value(Border.WidthKey, 640);
            _border2.set_property_value(Border.HeightKey, 360);
            const _canvas3 = new Canvas();
            _canvas3.Name = "playArea";
            const _ellipse4 = new Ellipse();
            _ellipse4.set_property_value(Canvas.LeftKey, DataContextBinding(_ellipse4, "X"));
            _ellipse4.set_property_value(Canvas.TopKey, DataContextBinding(_ellipse4, "Y"));
            _ellipse4.set_property_value(Ellipse.WidthKey, DataContextBinding(_ellipse4, "Diameter"));
            _ellipse4.set_property_value(Ellipse.HeightKey, DataContextBinding(_ellipse4, "Diameter"));
            _ellipse4.set_property_value(Ellipse.FillKey, new SolidColorBrush(Color.FromHex('#fbbf24')));
            _ellipse4.set_property_value(Ellipse.StrokeKey, DynamicResource(_ellipse4, "BallPen"));
            _canvas3.AddChild(_ellipse4);
            _border2.SetChild(_canvas3);
            return _border2;
        }, BouncingBallVM);
        t.Set("BouncingBallTemplate", _tmpl1);
        return t;
    }
    get BallPen() { return this.Resolve("BallPen"); }
    set BallPen(v) { this.Set("BallPen", v); }
    get BouncingBallTemplate() { return this.Resolve("BouncingBallTemplate"); }
    set BouncingBallTemplate(v) { this.Set("BouncingBallTemplate", v); }
}
