import { GroupVM, ShapeNodeVM } from "./diagram-vm.mjs";
import { Border, Canvas, DataTemplate, Shape, TargetedSetter, TemplateDataTrigger, TextBlock } from "@visualisation-sub/mural/basic";
import { Color, DataContextBinding, DynamicResource, HorizontalAlignment, NameScope, ResourceDictionary, Thickness, VerticalAlignment } from "@visualisation-sub/mural/runtime";
import { SolidColorBrush } from "@visualisation-sub/mural/visual-engine";


const _gate_DiagramShapeTemplates = Symbol("DiagramShapeTemplates.ctor");
export class DiagramShapeTemplates extends ResourceDictionary {
    constructor(_g) {
        super();
        if (_g !== _gate_DiagramShapeTemplates) {
            throw new Error("DiagramShapeTemplates is private — use DiagramShapeTemplates.Clone()");
        }
    }
    static Clone() {
        const t = new DiagramShapeTemplates(_gate_DiagramShapeTemplates);
        const _tmpl0 = new DataTemplate((_data) => {
            const _canvas1 = new Canvas();
            _canvas1.SetNameScope(new NameScope());
            _canvas1._set_property_value_by_name("Width", DataContextBinding(_canvas1, "Width"));
            _canvas1._set_property_value_by_name("Height", DataContextBinding(_canvas1, "Height"));
            const _shape2 = new Shape();
            _shape2.Name = "chrome";
            _shape2._set_property_value_by_name("Width", DataContextBinding(_shape2, "Width"));
            _shape2._set_property_value_by_name("Height", DataContextBinding(_shape2, "Height"));
            _shape2._set_property_value_by_name("Fill", DataContextBinding(_shape2, "FillBrush"));
            _shape2._set_property_value_by_name("Stroke", DataContextBinding(_shape2, "Stroke"));
            _shape2._set_property_value_by_name("Geometry", DataContextBinding(_shape2, "Geometry"));
            _canvas1.AddChild(_shape2);
            const _textBlock3 = new TextBlock();
            _textBlock3._set_property_value_by_name(Canvas, "Left", 0);
            _textBlock3._set_property_value_by_name(Canvas, "Top", 0);
            _textBlock3._set_property_value_by_name("Width", DataContextBinding(_textBlock3, "Width"));
            _textBlock3._set_property_value_by_name("Height", DataContextBinding(_textBlock3, "Height"));
            _textBlock3._set_property_value_by_name("Text", DataContextBinding(_textBlock3, "LabelText"));
            _textBlock3._set_property_value_by_name("FontSize", 11);
            _textBlock3._set_property_value_by_name("Foreground", DynamicResource(_textBlock3, "OnSurface"));
            _textBlock3._set_property_value_by_name("HorizontalAlignment", HorizontalAlignment.Center);
            _textBlock3._set_property_value_by_name("VerticalAlignment", VerticalAlignment.Center);
            _canvas1.AddChild(_textBlock3);
            return _canvas1;
        }, ShapeNodeVM);
        t.Set(ShapeNodeVM, _tmpl0);
        const _tmpl4 = (() => {
            const _factory = (_data) => {
                const _border5 = new Border();
                _border5.Name = "bbox";
                _border5._set_property_value_by_name("Width", DataContextBinding(_border5, "Width"));
                _border5._set_property_value_by_name("Height", DataContextBinding(_border5, "Height"));
                _border5._set_property_value_by_name("BorderBrush", new SolidColorBrush(Color.FromHex('#00000000')));
                _border5._set_property_value_by_name("BorderThickness", new Thickness(2));
                _border5._set_property_value_by_name("IsHitTestVisible", false);
                return _border5;
            };
            const _tplSet6 = [new TargetedSetter(Border, "BorderBrush", new SolidColorBrush(Color.FromHex('#f97316')), "bbox")];
            const _tplDataTrig7 = new TemplateDataTrigger("IsSelected", true, _tplSet6);
            return new DataTemplate(_factory, GroupVM, [], [_tplDataTrig7]);
        })();
        t.Set(GroupVM, _tmpl4);
        return t;
    }
}
