import { FillEditorDemoVM } from "./fill-editor-vm.mjs";
import { Border, DataTemplate, Dock, DockPanel, Orientation, Rectangle, StackPanel, TextBlock } from "mural/basic";
import { FillEditor } from "mural/framework";
import { DataContextBinding, DynamicResource, NameScope, ResourceDictionary, Thickness } from "mural/runtime";
import { FontWeight } from "mural/visual-engine";


const _gate_FillEditorDemo = Symbol("FillEditorDemo.ctor");
export class FillEditorDemo extends ResourceDictionary {
    constructor(_g) {
        super();
        if (_g !== _gate_FillEditorDemo) {
            throw new Error("FillEditorDemo is private — use FillEditorDemo.Clone()");
        }
    }
    static Clone() {
        const t = new FillEditorDemo(_gate_FillEditorDemo);
        const _tmpl0 = new DataTemplate((_data) => {
            const _border1 = new Border();
            _border1.SetNameScope(new NameScope());
            _border1.set_property_value(Border.BackgroundKey, DynamicResource(_border1, "Surface"));
            const _dockPanel2 = new DockPanel();
            const _border3 = new Border();
            _border3.set_property_value(DockPanel.DockKey, Dock.Top);
            _border3.set_property_value(Border.BackgroundKey, DynamicResource(_border3, "Primary"));
            _border3.set_property_value(Border.PaddingKey, new Thickness(20, 14, 20, 14));
            const _stackPanel4 = new StackPanel();
            _stackPanel4.set_property_value(StackPanel.OrientationKey, Orientation.Vertical);
            const _textBlock5 = new TextBlock();
            _textBlock5.set_property_value(TextBlock.TextKey, "PowerPoint-style Fill editor");
            _textBlock5.set_property_value(TextBlock.FontSizeKey, 18);
            _textBlock5.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _textBlock5.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock5, "OnPrimary"));
            _stackPanel4.AddChild(_textBlock5);
            const _textBlock6 = new TextBlock();
            _textBlock6.set_property_value(TextBlock.TextKey, "Inline panel: None / Solid / Linear / Radial / Pattern / Picture + transparency.");
            _textBlock6.set_property_value(TextBlock.FontSizeKey, 12);
            _textBlock6.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock6, "OnPrimary"));
            _textBlock6.set_property_value(TextBlock.MarginKey, new Thickness(0, 4, 0, 0));
            _stackPanel4.AddChild(_textBlock6);
            _border3.SetChild(_stackPanel4);
            _dockPanel2.AddChild(_border3);
            const _border7 = new Border();
            _border7.set_property_value(DockPanel.DockKey, Dock.Bottom);
            _border7.set_property_value(Border.BackgroundKey, DynamicResource(_border7, "SurfaceContainerLow"));
            _border7.set_property_value(Border.BorderBrushKey, DynamicResource(_border7, "OutlineVariant"));
            _border7.set_property_value(Border.BorderThicknessKey, new Thickness(0, 1, 0, 0));
            _border7.set_property_value(Border.PaddingKey, new Thickness(20, 10, 20, 10));
            const _textBlock8 = new TextBlock();
            _textBlock8.set_property_value(TextBlock.TextKey, DataContextBinding(_textBlock8, "FillSummary"));
            _textBlock8.set_property_value(TextBlock.FontSizeKey, 11);
            _textBlock8.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock8, "OnSurfaceVariant"));
            _border7.SetChild(_textBlock8);
            _dockPanel2.AddChild(_border7);
            const _border9 = new Border();
            _border9.set_property_value(Border.BackgroundKey, DynamicResource(_border9, "SurfaceContainerLowest"));
            _border9.set_property_value(Border.PaddingKey, new Thickness(20, 20, 20, 20));
            const _stackPanel10 = new StackPanel();
            _stackPanel10.set_property_value(StackPanel.OrientationKey, Orientation.Horizontal);
            const _border11 = new Border();
            _border11.set_property_value(Border.WidthKey, 380);
            _border11.set_property_value(Border.PaddingKey, new Thickness(16, 16, 16, 16));
            _border11.set_property_value(Border.BackgroundKey, DynamicResource(_border11, "SurfaceContainerLow"));
            _border11.set_property_value(Border.BorderBrushKey, DynamicResource(_border11, "OutlineVariant"));
            _border11.set_property_value(Border.BorderThicknessKey, new Thickness(1));
            _border11.set_property_value(Border.CornerRadiusKey, 8);
            _border11.set_property_value(Border.MarginKey, new Thickness(0, 0, 20, 0));
            const _stackPanel12 = new StackPanel();
            _stackPanel12.set_property_value(StackPanel.OrientationKey, Orientation.Vertical);
            const _textBlock13 = new TextBlock();
            _textBlock13.set_property_value(TextBlock.TextKey, "Fill");
            _textBlock13.set_property_value(TextBlock.FontSizeKey, 14);
            _textBlock13.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _textBlock13.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock13, "OnSurface"));
            _textBlock13.set_property_value(TextBlock.MarginKey, new Thickness(0, 0, 0, 12));
            _stackPanel12.AddChild(_textBlock13);
            const _fillEditor14 = new FillEditor();
            _fillEditor14.set_property_value(FillEditor.FillKey, DataContextBinding(_fillEditor14, "Fill"));
            _stackPanel12.AddChild(_fillEditor14);
            _border11.SetChild(_stackPanel12);
            _stackPanel10.AddChild(_border11);
            const _border15 = new Border();
            _border15.set_property_value(Border.WidthKey, 520);
            _border15.set_property_value(Border.HeightKey, 420);
            _border15.set_property_value(Border.PaddingKey, new Thickness(20));
            _border15.set_property_value(Border.BackgroundKey, DynamicResource(_border15, "SurfaceContainer"));
            _border15.set_property_value(Border.BorderBrushKey, DynamicResource(_border15, "OutlineVariant"));
            _border15.set_property_value(Border.BorderThicknessKey, new Thickness(1));
            _border15.set_property_value(Border.CornerRadiusKey, 8);
            const _rectangle16 = new Rectangle();
            _rectangle16.set_property_value(Rectangle.WidthKey, 480);
            _rectangle16.set_property_value(Rectangle.HeightKey, 380);
            _rectangle16.set_property_value(Rectangle.FillKey, DataContextBinding(_rectangle16, "Fill"));
            _rectangle16.set_property_value(Rectangle.StrokeKey, DataContextBinding(_rectangle16, "OutlinePen"));
            _border15.SetChild(_rectangle16);
            _stackPanel10.AddChild(_border15);
            _border9.SetChild(_stackPanel10);
            _dockPanel2.AddChild(_border9);
            _border1.SetChild(_dockPanel2);
            return _border1;
        }, FillEditorDemoVM);
        t.Set(FillEditorDemoVM, _tmpl0);
        return t;
    }
}
