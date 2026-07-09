import { BottomAppBarVM } from "./bottom-app-bar-vm.mjs";
import { Border, DataTemplate, Dock, DockPanel, Orientation, Shape, StackPanel, TextBlock } from "@visualisation-sub/mural/basic";
import { BottomAppBar } from "@visualisation-sub/mural/framework/bottom-app-bar/bottom-app-bar.js";
import { ButtonVariant } from "@visualisation-sub/mural/framework/buttons/button.js";
import { FloatingActionButton } from "@visualisation-sub/mural/framework/buttons/fab.js";
import { IconButton } from "@visualisation-sub/mural/framework/buttons/icon-button.js";
import { DataContextBinding, DynamicResource, ResourceDictionary, Thickness, VerticalAlignment } from "@visualisation-sub/mural/runtime";
import { FontWeight } from "@visualisation-sub/mural/visual-engine";


const _gate_BottomAppBarDemo = Symbol("BottomAppBarDemo.ctor");
export class BottomAppBarDemo extends ResourceDictionary {
    constructor(_g) {
        super();
        if (_g !== _gate_BottomAppBarDemo) {
            throw new Error("BottomAppBarDemo is private — use BottomAppBarDemo.Clone()");
        }
    }
    static Clone() {
        const t = new BottomAppBarDemo(_gate_BottomAppBarDemo);
        const _tmpl0 = new DataTemplate((_data) => {
            const _border1 = new Border();
            _border1.set_property_value(Border.BackgroundKey, DynamicResource(_border1, "Surface"));
            _border1.set_property_value(Border.BorderBrushKey, DynamicResource(_border1, "OutlineVariant"));
            _border1.set_property_value(Border.BorderThicknessKey, new Thickness(1));
            const _dockPanel2 = new DockPanel();
            const _border3 = new Border();
            _border3.set_property_value(DockPanel.DockKey, Dock.Top);
            _border3.set_property_value(Border.BackgroundKey, DynamicResource(_border3, "Primary"));
            _border3.set_property_value(Border.PaddingKey, new Thickness(16, 12, 16, 12));
            const _textBlock4 = new TextBlock();
            _textBlock4.set_property_value(TextBlock.TextKey, "BottomAppBar — M3's bottom action strip: a leading icon-button row plus a trailing FAB.");
            _textBlock4.set_property_value(TextBlock.FontSizeKey, 15);
            _textBlock4.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _textBlock4.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock4, "OnPrimary"));
            _border3.SetChild(_textBlock4);
            _dockPanel2.AddChild(_border3);
            const _bottomAppBar5 = new BottomAppBar();
            _bottomAppBar5.set_property_value(DockPanel.DockKey, Dock.Bottom);
            _bottomAppBar5.set_property_value(BottomAppBar.FloatingActionKey, ((_e) => { _e.Command = DataContextBinding(_e, "Tap"); _e.CommandParameter = "Primary action"; _e.Content = ((_e) => { _e.Geometry = DynamicResource(_e, "IconCheck"); _e.Width = 24; _e.Height = 24; _e.Fill = DynamicResource(_e, "OnPrimaryContainer"); return _e; })(new Shape()); return _e; })(new FloatingActionButton()));
            const _iconButton6 = new IconButton();
            _iconButton6.set_property_value(IconButton.VariantKey, ButtonVariant.Standard);
            _iconButton6.set_property_value(IconButton.CommandKey, DataContextBinding(_iconButton6, "Tap"));
            _iconButton6.set_property_value(IconButton.CommandParameterKey, "Menu");
            const _shape7 = new Shape();
            _shape7.set_property_value(Shape.GeometryKey, DynamicResource(_shape7, "ChevronDown"));
            _shape7.set_property_value(Shape.WidthKey, 20);
            _shape7.set_property_value(Shape.HeightKey, 20);
            _shape7.set_property_value(Shape.FillKey, DynamicResource(_shape7, "OnSurfaceVariant"));
            _iconButton6.Content = _shape7;
            _bottomAppBar5.AddChild(_iconButton6);
            const _iconButton8 = new IconButton();
            _iconButton8.set_property_value(IconButton.VariantKey, ButtonVariant.Standard);
            _iconButton8.set_property_value(IconButton.CommandKey, DataContextBinding(_iconButton8, "Tap"));
            _iconButton8.set_property_value(IconButton.CommandParameterKey, "Up");
            const _shape9 = new Shape();
            _shape9.set_property_value(Shape.GeometryKey, DynamicResource(_shape9, "ChevronUp"));
            _shape9.set_property_value(Shape.WidthKey, 20);
            _shape9.set_property_value(Shape.HeightKey, 20);
            _shape9.set_property_value(Shape.FillKey, DynamicResource(_shape9, "OnSurfaceVariant"));
            _iconButton8.Content = _shape9;
            _bottomAppBar5.AddChild(_iconButton8);
            const _iconButton10 = new IconButton();
            _iconButton10.set_property_value(IconButton.VariantKey, ButtonVariant.Standard);
            _iconButton10.set_property_value(IconButton.CommandKey, DataContextBinding(_iconButton10, "Tap"));
            _iconButton10.set_property_value(IconButton.CommandParameterKey, "Next");
            const _shape11 = new Shape();
            _shape11.set_property_value(Shape.GeometryKey, DynamicResource(_shape11, "ChevronRight"));
            _shape11.set_property_value(Shape.WidthKey, 20);
            _shape11.set_property_value(Shape.HeightKey, 20);
            _shape11.set_property_value(Shape.FillKey, DynamicResource(_shape11, "OnSurfaceVariant"));
            _iconButton10.Content = _shape11;
            _bottomAppBar5.AddChild(_iconButton10);
            const _iconButton12 = new IconButton();
            _iconButton12.set_property_value(IconButton.VariantKey, ButtonVariant.Standard);
            _iconButton12.set_property_value(IconButton.CommandKey, DataContextBinding(_iconButton12, "Tap"));
            _iconButton12.set_property_value(IconButton.CommandParameterKey, "Close");
            const _shape13 = new Shape();
            _shape13.set_property_value(Shape.GeometryKey, DynamicResource(_shape13, "IconClose"));
            _shape13.set_property_value(Shape.WidthKey, 20);
            _shape13.set_property_value(Shape.HeightKey, 20);
            _shape13.set_property_value(Shape.FillKey, DynamicResource(_shape13, "OnSurfaceVariant"));
            _iconButton12.Content = _shape13;
            _bottomAppBar5.AddChild(_iconButton12);
            _dockPanel2.AddChild(_bottomAppBar5);
            const _border14 = new Border();
            _border14.set_property_value(Border.PaddingKey, new Thickness(24, 24, 24, 24));
            const _stackPanel15 = new StackPanel();
            _stackPanel15.set_property_value(StackPanel.OrientationKey, Orientation.Vertical);
            const _textBlock16 = new TextBlock();
            _textBlock16.set_property_value(TextBlock.TextKey, "BottomAppBar — Actions row (Standard IconButtons) + trailing FAB");
            _textBlock16.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _textBlock16.set_property_value(TextBlock.FontSizeKey, 14);
            _textBlock16.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock16, "OnSurface"));
            _textBlock16.set_property_value(TextBlock.MarginKey, new Thickness(0, 0, 0, 12));
            _stackPanel15.AddChild(_textBlock16);
            const _stackPanel17 = new StackPanel();
            _stackPanel17.set_property_value(StackPanel.OrientationKey, Orientation.Horizontal);
            const _textBlock18 = new TextBlock();
            _textBlock18.set_property_value(TextBlock.TextKey, "Last action: ");
            _textBlock18.set_property_value(TextBlock.FontSizeKey, 13);
            _textBlock18.set_property_value(TextBlock.VerticalAlignmentKey, VerticalAlignment.Center);
            _textBlock18.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock18, "OnSurfaceVariant"));
            _stackPanel17.AddChild(_textBlock18);
            const _textBlock19 = new TextBlock();
            _textBlock19.set_property_value(TextBlock.TextKey, DataContextBinding(_textBlock19, "LastAction"));
            _textBlock19.set_property_value(TextBlock.FontSizeKey, 13);
            _textBlock19.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _textBlock19.set_property_value(TextBlock.VerticalAlignmentKey, VerticalAlignment.Center);
            _textBlock19.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock19, "OnSurface"));
            _stackPanel17.AddChild(_textBlock19);
            _stackPanel15.AddChild(_stackPanel17);
            _border14.SetChild(_stackPanel15);
            _dockPanel2.AddChild(_border14);
            _border1.SetChild(_dockPanel2);
            return _border1;
        }, BottomAppBarVM);
        t.Set("BottomAppBarTemplate", _tmpl0);
        return t;
    }
    get BottomAppBarTemplate() { return this.Resolve("BottomAppBarTemplate"); }
    set BottomAppBarTemplate(v) { this.Set("BottomAppBarTemplate", v); }
}
