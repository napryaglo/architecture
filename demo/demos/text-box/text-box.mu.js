import { TextBoxVM } from "./text-box-vm.mjs";
import { Border, DataTemplate, Dock, DockPanel, Orientation, StackPanel, TextBlock, TextBox, TextWrapping } from "@pragmatic-lab/mural/basic";
import { DynamicResource, ResourceDictionary, Thickness } from "@pragmatic-lab/mural/runtime";
import { FontWeight } from "@pragmatic-lab/mural/visual-engine";


const _gate_TextBoxDemo = Symbol("TextBoxDemo.ctor");
export class TextBoxDemo extends ResourceDictionary {
    constructor(_g) {
        super();
        if (_g !== _gate_TextBoxDemo) {
            throw new Error("TextBoxDemo is private — use TextBoxDemo.Clone()");
        }
    }
    static Clone() {
        const t = new TextBoxDemo(_gate_TextBoxDemo);
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
            _textBlock4.set_property_value(TextBlock.TextKey, "TextBox demo — single-line + multi-line");
            _textBlock4.set_property_value(TextBlock.FontSizeKey, 15);
            _textBlock4.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _textBlock4.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock4, "OnPrimary"));
            _border3.SetChild(_textBlock4);
            _dockPanel2.AddChild(_border3);
            const _stackPanel5 = new StackPanel();
            _stackPanel5.set_property_value(StackPanel.OrientationKey, Orientation.Horizontal);
            const _stackPanel6 = new StackPanel();
            _stackPanel6.set_property_value(StackPanel.OrientationKey, Orientation.Vertical);
            _stackPanel6.set_property_value(StackPanel.WidthKey, 300);
            _stackPanel6.set_property_value(StackPanel.MarginKey, new Thickness(16, 16, 8, 16));
            const _textBlock7 = new TextBlock();
            _textBlock7.set_property_value(TextBlock.TextKey, "Single-line:");
            _textBlock7.set_property_value(TextBlock.FontSizeKey, 12);
            _textBlock7.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _textBlock7.set_property_value(TextBlock.MarginKey, new Thickness(0, 0, 0, 6));
            _stackPanel6.AddChild(_textBlock7);
            const _textBox8 = new TextBox();
            _textBox8.set_property_value(TextBox.WidthKey, 260);
            _textBox8.set_property_value(TextBox.TextKey, "This is a single-line TextBox whose content overflows the field width.");
            _stackPanel6.AddChild(_textBox8);
            const _textBlock9 = new TextBlock();
            _textBlock9.set_property_value(TextBlock.TextKey, "No scrollbar. Type / Home / End — text follows the caret.");
            _textBlock9.set_property_value(TextBlock.FontSizeKey, 11);
            _textBlock9.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock9, "OnSurfaceVariant"));
            _textBlock9.set_property_value(TextBlock.MarginKey, new Thickness(0, 8, 0, 0));
            _stackPanel6.AddChild(_textBlock9);
            _stackPanel5.AddChild(_stackPanel6);
            const _stackPanel10 = new StackPanel();
            _stackPanel10.set_property_value(StackPanel.OrientationKey, Orientation.Vertical);
            _stackPanel10.set_property_value(StackPanel.WidthKey, 300);
            _stackPanel10.set_property_value(StackPanel.MarginKey, new Thickness(8, 16, 8, 16));
            const _textBlock11 = new TextBlock();
            _textBlock11.set_property_value(TextBlock.TextKey, "Multi-line — Wrap:");
            _textBlock11.set_property_value(TextBlock.FontSizeKey, 12);
            _textBlock11.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _textBlock11.set_property_value(TextBlock.MarginKey, new Thickness(0, 0, 0, 6));
            _stackPanel10.AddChild(_textBlock11);
            const _textBox12 = new TextBox();
            _textBox12.set_property_value(TextBox.WidthKey, 280);
            _textBox12.set_property_value(TextBox.HeightKey, 160);
            _textBox12.set_property_value(TextBox.AcceptsReturnKey, true);
            _textBox12.set_property_value(TextBox.TextKey, "Default wrap mode: this paragraph is long enough that it should break across several visual lines at word boundaries. ArrowDown moves down visual rows.\nA hard newline starts a new logical line that also wraps on overflow.");
            _stackPanel10.AddChild(_textBox12);
            const _textBlock13 = new TextBlock();
            _textBlock13.set_property_value(TextBlock.TextKey, "Word-wrap. Resize the column to see lines re-flow.");
            _textBlock13.set_property_value(TextBlock.FontSizeKey, 11);
            _textBlock13.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock13, "OnSurfaceVariant"));
            _textBlock13.set_property_value(TextBlock.MarginKey, new Thickness(0, 8, 0, 0));
            _stackPanel10.AddChild(_textBlock13);
            _stackPanel5.AddChild(_stackPanel10);
            const _stackPanel14 = new StackPanel();
            _stackPanel14.set_property_value(StackPanel.OrientationKey, Orientation.Vertical);
            _stackPanel14.set_property_value(StackPanel.WidthKey, 300);
            _stackPanel14.set_property_value(StackPanel.MarginKey, new Thickness(8, 16, 16, 16));
            const _textBlock15 = new TextBlock();
            _textBlock15.set_property_value(TextBlock.TextKey, "Multi-line — NoWrap:");
            _textBlock15.set_property_value(TextBlock.FontSizeKey, 12);
            _textBlock15.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _textBlock15.set_property_value(TextBlock.MarginKey, new Thickness(0, 0, 0, 6));
            _stackPanel14.AddChild(_textBlock15);
            const _textBox16 = new TextBox();
            _textBox16.set_property_value(TextBox.WidthKey, 280);
            _textBox16.set_property_value(TextBox.HeightKey, 160);
            _textBox16.set_property_value(TextBox.AcceptsReturnKey, true);
            _textBox16.set_property_value(TextBox.AcceptsTabKey, true);
            _textBox16.set_property_value(TextBox.TextWrappingKey, TextWrapping.NoWrap);
            _textBox16.set_property_value(TextBox.TextKey, "function example() {\n    const longLineThatWillNotWrap = 'extends past the viewport horizontally';\n    return longLineThatWillNotWrap;\n}");
            _stackPanel14.AddChild(_textBox16);
            const _textBlock17 = new TextBlock();
            _textBlock17.set_property_value(TextBlock.TextKey, "Both axes scroll; lines never break.");
            _textBlock17.set_property_value(TextBlock.FontSizeKey, 11);
            _textBlock17.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock17, "OnSurfaceVariant"));
            _textBlock17.set_property_value(TextBlock.MarginKey, new Thickness(0, 8, 0, 0));
            _stackPanel14.AddChild(_textBlock17);
            _stackPanel5.AddChild(_stackPanel14);
            _dockPanel2.AddChild(_stackPanel5);
            _border1.SetChild(_dockPanel2);
            return _border1;
        }, TextBoxVM);
        t.Set(TextBoxVM, _tmpl0);
        return t;
    }
}
