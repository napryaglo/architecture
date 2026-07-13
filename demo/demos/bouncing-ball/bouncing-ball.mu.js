import { BouncingBallVM } from "./bouncing-ball-vm.mjs";
import { Border, Canvas, DataTemplate, Ellipse } from "mural/basic";
import { Color, DataContextBinding, DynamicResource, NameScope, ResourceDictionary, Thickness } from "mural/runtime";
import { Pen, SolidColorBrush } from "mural/visual-engine";


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
            let _canvas2;
            const _border3 = new Border();
            _border3.SetNameScope(new NameScope());
            _border3.set_property_value(Border.BackgroundKey, DynamicResource(_border3, "InverseSurface"));
            _border3.set_property_value(Border.BorderBrushKey, DynamicResource(_border3, "Outline"));
            _border3.set_property_value(Border.BorderThicknessKey, new Thickness(1));
            _border3.set_property_value(Border.WidthKey, 640);
            _border3.set_property_value(Border.HeightKey, 360);
            _canvas2 = new Canvas();
            _canvas2.Name = "playArea";
            const _ellipse4 = new Ellipse();
            _ellipse4.set_property_value(Canvas.LeftKey, DataContextBinding(_ellipse4, "X"));
            _ellipse4.set_property_value(Canvas.TopKey, DataContextBinding(_ellipse4, "Y"));
            _ellipse4.set_property_value(Ellipse.WidthKey, DataContextBinding(_ellipse4, "Diameter"));
            _ellipse4.set_property_value(Ellipse.HeightKey, DataContextBinding(_ellipse4, "Diameter"));
            _ellipse4.set_property_value(Ellipse.FillKey, new SolidColorBrush(Color.FromHex('#fbbf24')));
            _ellipse4.set_property_value(Ellipse.StrokeKey, DynamicResource(_ellipse4, "BallPen"));
            _canvas2.AddChild(_ellipse4);
            _border3.SetChild(_canvas2);
            return _border3;
        }, BouncingBallVM);
        t.Set(BouncingBallVM, _tmpl1);
        return t;
    }
    get BallPen() { return this.Resolve("BallPen"); }
    set BallPen(v) { this.Set("BallPen", v); }
}
