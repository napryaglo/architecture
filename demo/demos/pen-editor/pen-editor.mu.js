import { PenEditorDemoVM } from "./pen-editor-vm.mjs";
import { Border, DataTemplate, Dock, DockPanel, Ellipse, Orientation, StackPanel, TextBlock } from "@visualisation-sub/mural/basic";
import { PenEditor } from "@visualisation-sub/mural/framework";
import { DataContextBinding, DynamicResource, NameScope, ResourceDictionary, Thickness } from "@visualisation-sub/mural/runtime";
import { FontWeight } from "@visualisation-sub/mural/visual-engine";


const _gate_PenEditorDemo = Symbol("PenEditorDemo.ctor");
export class PenEditorDemo extends ResourceDictionary {
    constructor(_g) {
        super();
        if (_g !== _gate_PenEditorDemo) {
            throw new Error("PenEditorDemo is private — use PenEditorDemo.Clone()");
        }
    }
    static Clone() {
        const t = new PenEditorDemo(_gate_PenEditorDemo);
        const _tmpl0 = new DataTemplate((_data) => {
            const _border1 = new Border();
            _border1.SetNameScope(new NameScope());
            _border1._set_property_value_by_name("Background", DynamicResource(_border1, "Surface"));
            const _dockPanel2 = new DockPanel();
            const _border3 = new Border();
            _border3._set_property_value_by_name(DockPanel, "Dock", Dock.Top);
            _border3._set_property_value_by_name("Background", DynamicResource(_border3, "Primary"));
            _border3._set_property_value_by_name("Padding", new Thickness(20, 14, 20, 14));
            const _stackPanel4 = new StackPanel();
            _stackPanel4._set_property_value_by_name("Orientation", Orientation.Vertical);
            const _textBlock5 = new TextBlock();
            _textBlock5._set_property_value_by_name("Text", "PowerPoint-style Pen editor");
            _textBlock5._set_property_value_by_name("FontSize", 18);
            _textBlock5._set_property_value_by_name("FontWeight", FontWeight.Bold);
            _textBlock5._set_property_value_by_name("Foreground", DynamicResource(_textBlock5, "OnPrimary"));
            _stackPanel4.AddChild(_textBlock5);
            const _textBlock6 = new TextBlock();
            _textBlock6._set_property_value_by_name("Text", "Inline panel: brush + thickness + dash + cap + join + miter. Edits push live onto the preview Pen.");
            _textBlock6._set_property_value_by_name("FontSize", 12);
            _textBlock6._set_property_value_by_name("Foreground", DynamicResource(_textBlock6, "OnPrimary"));
            _textBlock6._set_property_value_by_name("Margin", new Thickness(0, 4, 0, 0));
            _stackPanel4.AddChild(_textBlock6);
            _border3.SetChild(_stackPanel4);
            _dockPanel2.AddChild(_border3);
            const _border7 = new Border();
            _border7._set_property_value_by_name(DockPanel, "Dock", Dock.Bottom);
            _border7._set_property_value_by_name("Background", DynamicResource(_border7, "SurfaceContainerLow"));
            _border7._set_property_value_by_name("BorderBrush", DynamicResource(_border7, "OutlineVariant"));
            _border7._set_property_value_by_name("BorderThickness", new Thickness(0, 1, 0, 0));
            _border7._set_property_value_by_name("Padding", new Thickness(20, 10, 20, 10));
            const _stackPanel8 = new StackPanel();
            _stackPanel8._set_property_value_by_name("Orientation", Orientation.Horizontal);
            const _textBlock9 = new TextBlock();
            _textBlock9._set_property_value_by_name("Text", DataContextBinding(_textBlock9, "BrushSummary"));
            _textBlock9._set_property_value_by_name("FontSize", 11);
            _textBlock9._set_property_value_by_name("Foreground", DynamicResource(_textBlock9, "OnSurfaceVariant"));
            _textBlock9._set_property_value_by_name("Margin", new Thickness(0, 0, 16, 0));
            _stackPanel8.AddChild(_textBlock9);
            const _textBlock10 = new TextBlock();
            _textBlock10._set_property_value_by_name("Text", DataContextBinding(_textBlock10, "ThicknessReadout"));
            _textBlock10._set_property_value_by_name("FontSize", 11);
            _textBlock10._set_property_value_by_name("Foreground", DynamicResource(_textBlock10, "OnSurfaceVariant"));
            _textBlock10._set_property_value_by_name("Margin", new Thickness(0, 0, 16, 0));
            _stackPanel8.AddChild(_textBlock10);
            const _textBlock11 = new TextBlock();
            _textBlock11._set_property_value_by_name("Text", DataContextBinding(_textBlock11, "DashReadout"));
            _textBlock11._set_property_value_by_name("FontSize", 11);
            _textBlock11._set_property_value_by_name("Foreground", DynamicResource(_textBlock11, "OnSurfaceVariant"));
            _textBlock11._set_property_value_by_name("Margin", new Thickness(0, 0, 16, 0));
            _stackPanel8.AddChild(_textBlock11);
            const _textBlock12 = new TextBlock();
            _textBlock12._set_property_value_by_name("Text", DataContextBinding(_textBlock12, "CapReadout"));
            _textBlock12._set_property_value_by_name("FontSize", 11);
            _textBlock12._set_property_value_by_name("Foreground", DynamicResource(_textBlock12, "OnSurfaceVariant"));
            _textBlock12._set_property_value_by_name("Margin", new Thickness(0, 0, 16, 0));
            _stackPanel8.AddChild(_textBlock12);
            const _textBlock13 = new TextBlock();
            _textBlock13._set_property_value_by_name("Text", DataContextBinding(_textBlock13, "JoinReadout"));
            _textBlock13._set_property_value_by_name("FontSize", 11);
            _textBlock13._set_property_value_by_name("Foreground", DynamicResource(_textBlock13, "OnSurfaceVariant"));
            _textBlock13._set_property_value_by_name("Margin", new Thickness(0, 0, 16, 0));
            _stackPanel8.AddChild(_textBlock13);
            const _textBlock14 = new TextBlock();
            _textBlock14._set_property_value_by_name("Text", DataContextBinding(_textBlock14, "MiterReadout"));
            _textBlock14._set_property_value_by_name("FontSize", 11);
            _textBlock14._set_property_value_by_name("Foreground", DynamicResource(_textBlock14, "OnSurfaceVariant"));
            _stackPanel8.AddChild(_textBlock14);
            _border7.SetChild(_stackPanel8);
            _dockPanel2.AddChild(_border7);
            const _border15 = new Border();
            _border15._set_property_value_by_name("Background", DynamicResource(_border15, "SurfaceContainerLowest"));
            _border15._set_property_value_by_name("Padding", new Thickness(20, 20, 20, 20));
            const _stackPanel16 = new StackPanel();
            _stackPanel16._set_property_value_by_name("Orientation", Orientation.Horizontal);
            const _border17 = new Border();
            _border17._set_property_value_by_name("Width", 320);
            _border17._set_property_value_by_name("Padding", new Thickness(16, 16, 16, 16));
            _border17._set_property_value_by_name("Background", DynamicResource(_border17, "SurfaceContainerLow"));
            _border17._set_property_value_by_name("BorderBrush", DynamicResource(_border17, "OutlineVariant"));
            _border17._set_property_value_by_name("BorderThickness", new Thickness(1));
            _border17._set_property_value_by_name("CornerRadius", 8);
            _border17._set_property_value_by_name("Margin", new Thickness(0, 0, 20, 0));
            const _stackPanel18 = new StackPanel();
            _stackPanel18._set_property_value_by_name("Orientation", Orientation.Vertical);
            const _textBlock19 = new TextBlock();
            _textBlock19._set_property_value_by_name("Text", "Pen");
            _textBlock19._set_property_value_by_name("FontSize", 14);
            _textBlock19._set_property_value_by_name("FontWeight", FontWeight.Bold);
            _textBlock19._set_property_value_by_name("Foreground", DynamicResource(_textBlock19, "OnSurface"));
            _textBlock19._set_property_value_by_name("Margin", new Thickness(0, 0, 0, 12));
            _stackPanel18.AddChild(_textBlock19);
            const _penEditor20 = new PenEditor();
            _penEditor20._set_property_value_by_name("Pen", DataContextBinding(_penEditor20, "Pen"));
            _stackPanel18.AddChild(_penEditor20);
            _border17.SetChild(_stackPanel18);
            _stackPanel16.AddChild(_border17);
            const _border21 = new Border();
            _border21._set_property_value_by_name("Width", 520);
            _border21._set_property_value_by_name("Height", 420);
            _border21._set_property_value_by_name("Padding", new Thickness(20));
            _border21._set_property_value_by_name("Background", DynamicResource(_border21, "SurfaceContainer"));
            _border21._set_property_value_by_name("BorderBrush", DynamicResource(_border21, "OutlineVariant"));
            _border21._set_property_value_by_name("BorderThickness", new Thickness(1));
            _border21._set_property_value_by_name("CornerRadius", 8);
            const _ellipse22 = new Ellipse();
            _ellipse22._set_property_value_by_name("Width", 480);
            _ellipse22._set_property_value_by_name("Height", 380);
            _ellipse22._set_property_value_by_name("Stroke", DataContextBinding(_ellipse22, "Pen"));
            _border21.SetChild(_ellipse22);
            _stackPanel16.AddChild(_border21);
            _border15.SetChild(_stackPanel16);
            _dockPanel2.AddChild(_border15);
            _border1.SetChild(_dockPanel2);
            return _border1;
        }, PenEditorDemoVM);
        t.Set("PenEditorTemplate", _tmpl0);
        return t;
    }
    get PenEditorTemplate() { return this.Resolve("PenEditorTemplate"); }
    set PenEditorTemplate(v) { this.Set("PenEditorTemplate", v); }
}
