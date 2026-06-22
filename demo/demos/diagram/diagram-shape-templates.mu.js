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
            let _shape1;
            const _canvas2 = new Canvas();
            _canvas2.SetNameScope(new NameScope());
            _canvas2.set_property_value(Canvas.WidthKey, DataContextBinding(_canvas2, "Width"));
            _canvas2.set_property_value(Canvas.HeightKey, DataContextBinding(_canvas2, "Height"));
            _shape1 = new Shape();
            _shape1.Name = "chrome";
            _shape1.set_property_value(Shape.WidthKey, DataContextBinding(_shape1, "Width"));
            _shape1.set_property_value(Shape.HeightKey, DataContextBinding(_shape1, "Height"));
            _shape1.set_property_value(Shape.FillKey, DataContextBinding(_shape1, "FillBrush"));
            _shape1.set_property_value(Shape.StrokeKey, DataContextBinding(_shape1, "Stroke"));
            _shape1.set_property_value(Shape.GeometryKey, DataContextBinding(_shape1, "Geometry"));
            _canvas2.AddChild(_shape1);
            const _textBlock3 = new TextBlock();
            _textBlock3.set_property_value(Canvas.LeftKey, 0);
            _textBlock3.set_property_value(Canvas.TopKey, 0);
            _textBlock3.set_property_value(TextBlock.WidthKey, DataContextBinding(_textBlock3, "Width"));
            _textBlock3.set_property_value(TextBlock.HeightKey, DataContextBinding(_textBlock3, "Height"));
            _textBlock3.set_property_value(TextBlock.TextKey, DataContextBinding(_textBlock3, "LabelText"));
            _textBlock3.set_property_value(TextBlock.FontSizeKey, 11);
            _textBlock3.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock3, "OnSurface"));
            _textBlock3.set_property_value(TextBlock.HorizontalAlignmentKey, HorizontalAlignment.Center);
            _textBlock3.set_property_value(TextBlock.VerticalAlignmentKey, VerticalAlignment.Center);
            _canvas2.AddChild(_textBlock3);
            return _canvas2;
        }, ShapeNodeVM);
        t.Set(ShapeNodeVM, _tmpl0);
        const _tmpl4 = (() => {
            const _factory = (_data) => {
                let _border5;
                _border5 = new Border();
                _border5.Name = "bbox";
                _border5.set_property_value(Border.WidthKey, DataContextBinding(_border5, "Width"));
                _border5.set_property_value(Border.HeightKey, DataContextBinding(_border5, "Height"));
                _border5.set_property_value(Border.BorderBrushKey, new SolidColorBrush(Color.FromHex('#00000000')));
                _border5.set_property_value(Border.BorderThicknessKey, new Thickness(2));
                _border5.set_property_value(Border.IsHitTestVisibleKey, false);
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
