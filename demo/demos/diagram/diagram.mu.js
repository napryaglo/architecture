import { DiagramVM, EllipseNodeVM, NoteNodeVM, RectNodeVM, ToolboxShapeVM } from "./diagram-vm.mjs";
import { Border, Canvas, DataTemplate, Dock, DockPanel, Ellipse, ItemsPanelTemplate, Orientation, StackPanel, TargetedSetter, TemplateDataTrigger, TextBlock, TextWrapping } from "@visualisation-sub/mural/basic";
import { Button } from "@visualisation-sub/mural/framework/button.js";
import { DiagramNode } from "@visualisation-sub/mural/framework/diagram/diagram-node.js";
import { Diagram } from "@visualisation-sub/mural/framework/diagram/diagram.js";
import { ItemsControl } from "@visualisation-sub/mural/framework/items-control.js";
import { SelectionMode } from "@visualisation-sub/mural/framework/list/list-box.js";
import { Color, DataContextBinding, DynamicResource, HorizontalAlignment, NameScope, ResourceDictionary, Setter, SetterFactory, Style, Thickness, VerticalAlignment } from "@visualisation-sub/mural/runtime";
import { FontWeight, SolidColorBrush } from "@visualisation-sub/mural/visual-engine";


const _gate_DiagramDemo = Symbol("DiagramDemo.ctor");
export class DiagramDemo extends ResourceDictionary {
    constructor(_g) {
        super();
        if (_g !== _gate_DiagramDemo) {
            throw new Error("DiagramDemo is private — use DiagramDemo.Clone()");
        }
    }
    static Clone() {
        const t = new DiagramDemo(_gate_DiagramDemo);
        const _setter0 = new Setter(DiagramNode, "X", new SetterFactory((_t) => DataContextBinding(_t, "X")));
        const _setter1 = new Setter(DiagramNode, "Y", new SetterFactory((_t) => DataContextBinding(_t, "Y")));
        const _style2 = new Style(DiagramNode, [_setter0, _setter1], undefined, [], []);
        t.Set("DiagramNodeStyle", _style2);
        const _tmpl3 = new ItemsPanelTemplate(() => {
            const _canvas4 = new Canvas();
            return _canvas4;
        });
        t.Set("DiagramCanvasPanel", _tmpl3);
        const _tmpl5 = new ItemsPanelTemplate(() => {
            const _stackPanel6 = new StackPanel();
            return _stackPanel6;
        });
        t.Set("DiagramToolboxPanel", _tmpl5);
        const _setter7 = new Setter(Border, "BorderBrush", new SetterFactory((_t) => DynamicResource(_t, "Primary")));
        const _style8 = new Style(Border, [_setter7], undefined, [], []);
        t.Set("DiagramRectChromeStyle", _style8);
        const _setter9 = new Setter(Border, "BorderBrush", new SolidColorBrush(Color.FromHex('#a16207')));
        const _style10 = new Style(Border, [_setter9], undefined, [], []);
        t.Set("DiagramNoteChromeStyle", _style10);
        const _setter11 = new Setter(Ellipse, "Stroke", new SolidColorBrush(Color.FromHex('#15803d')));
        const _style12 = new Style(Ellipse, [_setter11], undefined, [], []);
        t.Set("DiagramEllipseChromeStyle", _style12);
        const _tmpl13 = new DataTemplate((_data) => {
            const _border14 = new Border();
            _border14.SetNameScope(new NameScope());
            _border14._set_property_value_by_name("IsDraggable", true);
            _border14._set_property_value_by_name("OnDragStart", DataContextBinding(_border14, "BeginKindDragData"));
            _border14._set_property_value_by_name("Background", DynamicResource(_border14, "Surface"));
            _border14._set_property_value_by_name("BorderBrush", DynamicResource(_border14, "OutlineVariant"));
            _border14._set_property_value_by_name("BorderThickness", new Thickness(1));
            _border14._set_property_value_by_name("Padding", new Thickness(8));
            _border14._set_property_value_by_name("Margin", new Thickness(0, 0, 0, 8));
            const _stackPanel15 = new StackPanel();
            _stackPanel15._set_property_value_by_name("Orientation", Orientation.Horizontal);
            const _border16 = new Border();
            _border16._set_property_value_by_name("Width", 28);
            _border16._set_property_value_by_name("Height", 18);
            _border16._set_property_value_by_name("Background", DataContextBinding(_border16, "Swatch"));
            _border16._set_property_value_by_name("Margin", new Thickness(0, 4, 8, 0));
            _stackPanel15.AddChild(_border16);
            const _textBlock17 = new TextBlock();
            _textBlock17._set_property_value_by_name("Text", DataContextBinding(_textBlock17, "Label"));
            _textBlock17._set_property_value_by_name("FontSize", 12);
            _textBlock17._set_property_value_by_name("Foreground", DynamicResource(_textBlock17, "OnSurface"));
            _textBlock17._set_property_value_by_name("Margin", new Thickness(0, 6, 0, 0));
            _stackPanel15.AddChild(_textBlock17);
            _border14.SetChild(_stackPanel15);
            return _border14;
        }, ToolboxShapeVM);
        t.Set("DiagramTileTemplate", _tmpl13);
        const _tmpl18 = (() => {
            const _factory = (_data) => {
                const _border19 = new Border();
                _border19.Name = "chrome";
                _border19._set_property_value_by_name("Style", _style8);
                _border19._set_property_value_by_name("Width", 130);
                _border19._set_property_value_by_name("Height", 60);
                _border19._set_property_value_by_name("Background", DataContextBinding(_border19, "FillBrush"));
                _border19._set_property_value_by_name("BorderThickness", new Thickness(1.5));
                _border19._set_property_value_by_name("CornerRadius", 4);
                const _textBlock20 = new TextBlock();
                _textBlock20._set_property_value_by_name("Text", DataContextBinding(_textBlock20, "LabelText"));
                _textBlock20._set_property_value_by_name("FontSize", 13);
                _textBlock20._set_property_value_by_name("Foreground", DynamicResource(_textBlock20, "OnSurface"));
                _textBlock20._set_property_value_by_name("HorizontalAlignment", HorizontalAlignment.Center);
                _textBlock20._set_property_value_by_name("VerticalAlignment", VerticalAlignment.Center);
                _border19.SetChild(_textBlock20);
                return _border19;
            };
            const _tplSet21 = [new TargetedSetter(Border, "BorderBrush", new SolidColorBrush(Color.FromHex('#f97316')), "chrome")];
            const _tplDataTrig22 = new TemplateDataTrigger("IsSelected", true, _tplSet21);
            return new DataTemplate(_factory, RectNodeVM, [], [_tplDataTrig22]);
        })();
        t.Set(RectNodeVM, _tmpl18);
        const _tmpl23 = (() => {
            const _factory = (_data) => {
                const _canvas24 = new Canvas();
                _canvas24.SetNameScope(new NameScope());
                _canvas24._set_property_value_by_name("Width", 130);
                _canvas24._set_property_value_by_name("Height", 60);
                const _ellipse25 = new Ellipse();
                _ellipse25.Name = "chrome";
                _ellipse25._set_property_value_by_name("Style", _style12);
                _ellipse25._set_property_value_by_name("Width", 130);
                _ellipse25._set_property_value_by_name("Height", 60);
                _ellipse25._set_property_value_by_name("Fill", DataContextBinding(_ellipse25, "FillBrush"));
                _ellipse25._set_property_value_by_name("StrokeThickness", 1.5);
                _canvas24.AddChild(_ellipse25);
                const _textBlock26 = new TextBlock();
                _textBlock26._set_property_value_by_name(Canvas, "Left", 0);
                _textBlock26._set_property_value_by_name(Canvas, "Top", 0);
                _textBlock26._set_property_value_by_name("Width", 130);
                _textBlock26._set_property_value_by_name("Height", 60);
                _textBlock26._set_property_value_by_name("Text", DataContextBinding(_textBlock26, "LabelText"));
                _textBlock26._set_property_value_by_name("FontSize", 13);
                _textBlock26._set_property_value_by_name("Foreground", DynamicResource(_textBlock26, "OnSurface"));
                _textBlock26._set_property_value_by_name("HorizontalAlignment", HorizontalAlignment.Center);
                _textBlock26._set_property_value_by_name("VerticalAlignment", VerticalAlignment.Center);
                _canvas24.AddChild(_textBlock26);
                return _canvas24;
            };
            const _tplSet27 = [new TargetedSetter(Ellipse, "Stroke", new SolidColorBrush(Color.FromHex('#f97316')), "chrome")];
            const _tplDataTrig28 = new TemplateDataTrigger("IsSelected", true, _tplSet27);
            return new DataTemplate(_factory, EllipseNodeVM, [], [_tplDataTrig28]);
        })();
        t.Set(EllipseNodeVM, _tmpl23);
        const _tmpl29 = (() => {
            const _factory = (_data) => {
                const _border30 = new Border();
                _border30.Name = "chrome";
                _border30._set_property_value_by_name("Style", _style10);
                _border30._set_property_value_by_name("Width", 130);
                _border30._set_property_value_by_name("Height", 60);
                _border30._set_property_value_by_name("Background", DataContextBinding(_border30, "FillBrush"));
                _border30._set_property_value_by_name("BorderThickness", new Thickness(1.5));
                _border30._set_property_value_by_name("CornerRadius", 2);
                const _textBlock31 = new TextBlock();
                _textBlock31._set_property_value_by_name("Text", DataContextBinding(_textBlock31, "LabelText"));
                _textBlock31._set_property_value_by_name("FontSize", 13);
                _textBlock31._set_property_value_by_name("Foreground", DynamicResource(_textBlock31, "OnSurface"));
                _textBlock31._set_property_value_by_name("HorizontalAlignment", HorizontalAlignment.Center);
                _textBlock31._set_property_value_by_name("VerticalAlignment", VerticalAlignment.Center);
                _border30.SetChild(_textBlock31);
                return _border30;
            };
            const _tplSet32 = [new TargetedSetter(Border, "BorderBrush", new SolidColorBrush(Color.FromHex('#f97316')), "chrome")];
            const _tplDataTrig33 = new TemplateDataTrigger("IsSelected", true, _tplSet32);
            return new DataTemplate(_factory, NoteNodeVM, [], [_tplDataTrig33]);
        })();
        t.Set(NoteNodeVM, _tmpl29);
        const _tmpl34 = new DataTemplate((_data) => {
            const _border35 = new Border();
            _border35.SetNameScope(new NameScope());
            _border35._set_property_value_by_name("Background", DynamicResource(_border35, "Surface"));
            _border35._set_property_value_by_name("BorderBrush", DynamicResource(_border35, "OutlineVariant"));
            _border35._set_property_value_by_name("BorderThickness", new Thickness(1));
            const _dockPanel36 = new DockPanel();
            const _border37 = new Border();
            _border37._set_property_value_by_name(DockPanel, "Dock", Dock.Top);
            _border37._set_property_value_by_name("Height", 44);
            _border37._set_property_value_by_name("Background", DynamicResource(_border37, "Primary"));
            const _stackPanel38 = new StackPanel();
            _stackPanel38._set_property_value_by_name("Orientation", Orientation.Horizontal);
            _stackPanel38._set_property_value_by_name("Margin", new Thickness(16, 10, 0, 0));
            const _textBlock39 = new TextBlock();
            _textBlock39._set_property_value_by_name("Text", "Diagrammer");
            _textBlock39._set_property_value_by_name("FontSize", 15);
            _textBlock39._set_property_value_by_name("FontWeight", FontWeight.Bold);
            _textBlock39._set_property_value_by_name("Foreground", DynamicResource(_textBlock39, "OnPrimary"));
            _stackPanel38.AddChild(_textBlock39);
            const _textBlock40 = new TextBlock();
            _textBlock40._set_property_value_by_name("Text", DataContextBinding(_textBlock40, "Status"));
            _textBlock40._set_property_value_by_name("FontSize", 12);
            _textBlock40._set_property_value_by_name("Foreground", DynamicResource(_textBlock40, "OnPrimary"));
            _textBlock40._set_property_value_by_name("Margin", new Thickness(20, 3, 0, 0));
            _stackPanel38.AddChild(_textBlock40);
            _border37.SetChild(_stackPanel38);
            _dockPanel36.AddChild(_border37);
            const _border41 = new Border();
            _border41._set_property_value_by_name(DockPanel, "Dock", Dock.Left);
            _border41._set_property_value_by_name("Width", 140);
            _border41._set_property_value_by_name("Background", DynamicResource(_border41, "SurfaceContainerLow"));
            _border41._set_property_value_by_name("BorderBrush", DynamicResource(_border41, "OutlineVariant"));
            _border41._set_property_value_by_name("BorderThickness", new Thickness(0, 0, 1, 0));
            _border41._set_property_value_by_name("Padding", new Thickness(12));
            const _stackPanel42 = new StackPanel();
            const _textBlock43 = new TextBlock();
            _textBlock43._set_property_value_by_name("Text", "Shapes");
            _textBlock43._set_property_value_by_name("FontSize", 11);
            _textBlock43._set_property_value_by_name("FontWeight", FontWeight.Bold);
            _textBlock43._set_property_value_by_name("Foreground", DynamicResource(_textBlock43, "OnSurfaceVariant"));
            _textBlock43._set_property_value_by_name("Margin", new Thickness(2, 0, 0, 8));
            _stackPanel42.AddChild(_textBlock43);
            const _itemsControl44 = new ItemsControl();
            _itemsControl44.Name = "toolbox";
            _itemsControl44._set_property_value_by_name("ItemsSource", DataContextBinding(_itemsControl44, "ToolboxShapes"));
            _itemsControl44._set_property_value_by_name("ItemsPanel", _tmpl5);
            _stackPanel42.AddChild(_itemsControl44);
            const _textBlock45 = new TextBlock();
            _textBlock45._set_property_value_by_name("Text", "Document");
            _textBlock45._set_property_value_by_name("FontSize", 11);
            _textBlock45._set_property_value_by_name("FontWeight", FontWeight.Bold);
            _textBlock45._set_property_value_by_name("Foreground", DynamicResource(_textBlock45, "OnSurfaceVariant"));
            _textBlock45._set_property_value_by_name("Margin", new Thickness(2, 12, 0, 8));
            _stackPanel42.AddChild(_textBlock45);
            const _stackPanel46 = new StackPanel();
            _stackPanel46._set_property_value_by_name("Orientation", Orientation.Horizontal);
            _stackPanel46._set_property_value_by_name("Margin", new Thickness(0, 0, 0, 8));
            const _button47 = new Button();
            _button47.Name = "btnSave";
            _button47._set_property_value_by_name("Command", DataContextBinding(_button47, "SaveCommand"));
            _button47._set_property_value_by_name("Margin", new Thickness(0, 0, 4, 0));
            const _textBlock48 = new TextBlock();
            _textBlock48._set_property_value_by_name("Text", "Save");
            _textBlock48._set_property_value_by_name("FontSize", 11);
            _button47.Content = _textBlock48;
            _stackPanel46.AddChild(_button47);
            const _button49 = new Button();
            _button49.Name = "btnLoad";
            _button49._set_property_value_by_name("Command", DataContextBinding(_button49, "LoadCommand"));
            const _textBlock50 = new TextBlock();
            _textBlock50._set_property_value_by_name("Text", "Load");
            _textBlock50._set_property_value_by_name("FontSize", 11);
            _button49.Content = _textBlock50;
            _stackPanel46.AddChild(_button49);
            _stackPanel42.AddChild(_stackPanel46);
            const _textBlock51 = new TextBlock();
            _textBlock51._set_property_value_by_name("Text", "Drag a shape onto the canvas to\n                                        place it. Click a node to\n                                        select; Ctrl-click to toggle;\n                                        Shift-click to range-extend.\n                                        Drag-rectangle on empty space\n                                        for marquee. Click empty space\n                                        to clear. Drag a node to move.\n                                        Delete removes every selected\n                                        node.");
            _textBlock51._set_property_value_by_name("TextWrapping", TextWrapping.Wrap);
            _textBlock51._set_property_value_by_name("FontSize", 10);
            _textBlock51._set_property_value_by_name("Foreground", DynamicResource(_textBlock51, "OnSurfaceVariant"));
            _textBlock51._set_property_value_by_name("Margin", new Thickness(2, 16, 2, 0));
            _stackPanel42.AddChild(_textBlock51);
            _border41.SetChild(_stackPanel42);
            _dockPanel36.AddChild(_border41);
            const _border52 = new Border();
            _border52.Name = "surface";
            _border52._set_property_value_by_name("Background", DynamicResource(_border52, "SurfaceContainerLow"));
            const _diagram53 = new Diagram();
            _diagram53.Name = "nodes";
            _diagram53._set_property_value_by_name("ItemsSource", DataContextBinding(_diagram53, "Nodes"));
            _diagram53._set_property_value_by_name("ItemsPanel", _tmpl3);
            _diagram53._set_property_value_by_name("ItemContainerStyle", _style2);
            _diagram53._set_property_value_by_name("SelectionMode", SelectionMode.Extended);
            _diagram53._set_property_value_by_name("AllowMarqueeSelection", true);
            _border52.SetChild(_diagram53);
            _dockPanel36.AddChild(_border52);
            _border35.SetChild(_dockPanel36);
            return _border35;
        }, DiagramVM);
        t.Set("DiagramTemplate", _tmpl34);
        return t;
    }
    get DiagramNodeStyle() { return this.Resolve("DiagramNodeStyle"); }
    set DiagramNodeStyle(v) { this.Set("DiagramNodeStyle", v); }
    get DiagramCanvasPanel() { return this.Resolve("DiagramCanvasPanel"); }
    set DiagramCanvasPanel(v) { this.Set("DiagramCanvasPanel", v); }
    get DiagramToolboxPanel() { return this.Resolve("DiagramToolboxPanel"); }
    set DiagramToolboxPanel(v) { this.Set("DiagramToolboxPanel", v); }
    get DiagramRectChromeStyle() { return this.Resolve("DiagramRectChromeStyle"); }
    set DiagramRectChromeStyle(v) { this.Set("DiagramRectChromeStyle", v); }
    get DiagramNoteChromeStyle() { return this.Resolve("DiagramNoteChromeStyle"); }
    set DiagramNoteChromeStyle(v) { this.Set("DiagramNoteChromeStyle", v); }
    get DiagramEllipseChromeStyle() { return this.Resolve("DiagramEllipseChromeStyle"); }
    set DiagramEllipseChromeStyle(v) { this.Set("DiagramEllipseChromeStyle", v); }
    get DiagramTileTemplate() { return this.Resolve("DiagramTileTemplate"); }
    set DiagramTileTemplate(v) { this.Set("DiagramTileTemplate", v); }
    get DiagramTemplate() { return this.Resolve("DiagramTemplate"); }
    set DiagramTemplate(v) { this.Set("DiagramTemplate", v); }
}
