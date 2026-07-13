import { DashboardVM } from "./dashboard-vm.mjs";
import { Border, Canvas, DataTemplate, TextBlock, TextWrapping } from "@pragmatic-lab/mural/basic";
import { Color, CornerRadius, DynamicResource, PropertyTrigger, ResourceDictionary, Setter, SetterFactory, Style, Thickness } from "@pragmatic-lab/mural/runtime";
import { SolidColorBrush } from "@pragmatic-lab/mural/visual-engine";


const _gate_DashboardDemo = Symbol("DashboardDemo.ctor");
export class DashboardDemo extends ResourceDictionary {
    constructor(_g) {
        super();
        if (_g !== _gate_DashboardDemo) {
            throw new Error("DashboardDemo is private — use DashboardDemo.Clone()");
        }
    }
    static Clone() {
        const t = new DashboardDemo(_gate_DashboardDemo);
        const _setter0 = new Setter(Border, "Background", new SolidColorBrush(Color.FromHex('#4caf50')));
        const _setter1 = new Setter(Border, "BorderBrush", new SolidColorBrush(Color.FromHex('#1b5e20')));
        const _setter2 = new Setter(Border, "BorderThickness", new Thickness(2));
        const _setter3 = new Setter(Border, "CornerRadius", new CornerRadius(8));
        const _setter4 = new Setter(Border, "Padding", new Thickness(16));
        const _setter5 = new Setter(Border, "Background", new SolidColorBrush(Color.FromHex('#66bb6a')));
        const _setter6 = new Setter(Border, "BorderThickness", new Thickness(3));
        const _sArr7 = [_setter5, _setter6];
        const _trigger8 = new PropertyTrigger(Border, "IsMouseOver", true, _sArr7);
        const _setter9 = new Setter(Border, "Background", new SolidColorBrush(Color.FromHex('#2e7d32')));
        const _setter10 = new Setter(Border, "BorderThickness", new Thickness(4));
        const _sArr11 = [_setter9, _setter10];
        const _trigger12 = new PropertyTrigger(Border, "IsPressed", true, _sArr11);
        const _style13 = new Style(Border, [_setter0, _setter1, _setter2, _setter3, _setter4], undefined, [_trigger8, _trigger12], []);
        t.Set("DashboardPrimaryCard", _style13);
        const _setter14 = new Setter(Border, "Background", new SolidColorBrush(Color.FromHex('#d32f2f')));
        const _setter15 = new Setter(Border, "BorderBrush", new SolidColorBrush(Color.FromHex('#7f0000')));
        const _setter16 = new Setter(Border, "BorderThickness", new Thickness(2));
        const _setter17 = new Setter(Border, "CornerRadius", new CornerRadius(8));
        const _setter18 = new Setter(Border, "Padding", new Thickness(16));
        const _setter19 = new Setter(Border, "Background", new SolidColorBrush(Color.FromHex('#ef5350')));
        const _setter20 = new Setter(Border, "BorderThickness", new Thickness(3));
        const _sArr21 = [_setter19, _setter20];
        const _trigger22 = new PropertyTrigger(Border, "IsMouseOver", true, _sArr21);
        const _setter23 = new Setter(Border, "Background", new SolidColorBrush(Color.FromHex('#b71c1c')));
        const _setter24 = new Setter(Border, "BorderThickness", new Thickness(4));
        const _sArr25 = [_setter23, _setter24];
        const _trigger26 = new PropertyTrigger(Border, "IsPressed", true, _sArr25);
        const _style27 = new Style(Border, [_setter14, _setter15, _setter16, _setter17, _setter18], undefined, [_trigger22, _trigger26], []);
        t.Set("DashboardDangerCard", _style27);
        const _setter28 = new Setter(Border, "Background", new SetterFactory((_t) => DynamicResource(_t, "Surface")));
        const _setter29 = new Setter(Border, "BorderBrush", new SetterFactory((_t) => DynamicResource(_t, "OutlineVariant")));
        const _setter30 = new Setter(Border, "BorderThickness", new Thickness(1));
        const _setter31 = new Setter(Border, "CornerRadius", new CornerRadius(6));
        const _setter32 = new Setter(Border, "Padding", new Thickness(20));
        const _setter33 = new Setter(Border, "Background", new SetterFactory((_t) => DynamicResource(_t, "SurfaceContainerHigh")));
        const _setter34 = new Setter(Border, "BorderThickness", new Thickness(2));
        const _sArr35 = [_setter33, _setter34];
        const _trigger36 = new PropertyTrigger(Border, "IsMouseOver", true, _sArr35);
        const _setter37 = new Setter(Border, "Background", new SetterFactory((_t) => DynamicResource(_t, "OutlineVariant")));
        const _setter38 = new Setter(Border, "BorderThickness", new Thickness(3));
        const _sArr39 = [_setter37, _setter38];
        const _trigger40 = new PropertyTrigger(Border, "IsPressed", true, _sArr39);
        const _style41 = new Style(Border, [_setter28, _setter29, _setter30, _setter31, _setter32], undefined, [_trigger36, _trigger40], []);
        t.Set("DashboardPaperCard", _style41);
        const _tmpl42 = new DataTemplate((_data) => {
            const _canvas43 = new Canvas();
            const _border44 = new Border();
            _border44.set_property_value(Border.StyleKey, _style13);
            _border44.set_property_value(Canvas.LeftKey, 20);
            _border44.set_property_value(Canvas.TopKey, 20);
            _border44.set_property_value(Border.WidthKey, 200);
            _border44.set_property_value(Border.HeightKey, 80);
            const _textBlock45 = new TextBlock();
            _textBlock45.set_property_value(TextBlock.TextKey, "Hello mural");
            _textBlock45.set_property_value(TextBlock.FontSizeKey, 20);
            _textBlock45.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock45, "OnPrimary"));
            _border44.SetChild(_textBlock45);
            _canvas43.AddChild(_border44);
            const _border46 = new Border();
            _border46.set_property_value(Border.StyleKey, _style27);
            _border46.set_property_value(Canvas.LeftKey, 240);
            _border46.set_property_value(Canvas.TopKey, 20);
            _border46.set_property_value(Border.WidthKey, 200);
            _border46.set_property_value(Border.HeightKey, 80);
            const _textBlock47 = new TextBlock();
            _textBlock47.set_property_value(TextBlock.TextKey, "Danger zone");
            _textBlock47.set_property_value(TextBlock.FontSizeKey, 20);
            _textBlock47.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock47, "OnPrimary"));
            _border46.SetChild(_textBlock47);
            _canvas43.AddChild(_border46);
            const _border48 = new Border();
            _border48.set_property_value(Border.StyleKey, _style41);
            _border48.set_property_value(Canvas.LeftKey, 20);
            _border48.set_property_value(Canvas.TopKey, 140);
            _border48.set_property_value(Border.WidthKey, 420);
            _border48.set_property_value(Border.HeightKey, 160);
            const _textBlock49 = new TextBlock();
            _textBlock49.set_property_value(TextBlock.TextKey, "Hover over the cards above to see Style triggers fire on IsMouseOver. Press and hold to see the IsPressed trigger lock in.");
            _textBlock49.set_property_value(TextBlock.FontSizeKey, 14);
            _textBlock49.set_property_value(TextBlock.TextWrappingKey, TextWrapping.Wrap);
            _textBlock49.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock49, "OnSurface"));
            _border48.SetChild(_textBlock49);
            _canvas43.AddChild(_border48);
            return _canvas43;
        }, DashboardVM);
        t.Set(DashboardVM, _tmpl42);
        return t;
    }
    get DashboardPrimaryCard() { return this.Resolve("DashboardPrimaryCard"); }
    set DashboardPrimaryCard(v) { this.Set("DashboardPrimaryCard", v); }
    get DashboardDangerCard() { return this.Resolve("DashboardDangerCard"); }
    set DashboardDangerCard(v) { this.Set("DashboardDangerCard", v); }
    get DashboardPaperCard() { return this.Resolve("DashboardPaperCard"); }
    set DashboardPaperCard(v) { this.Set("DashboardPaperCard", v); }
}
