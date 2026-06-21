import { WordToolboxVM, WordVM } from "./word-toolbox-vm.mjs";
import { Border, ContentPresenter, ControlTemplate, DataTemplate, Dock, DockPanel, ItemsPanelTemplate, ListReorderBehavior, Orientation, StackPanel, TargetedSetter, TemplatePropertyTrigger, TextBlock, TextWrapping, VirtualizingStackPanel, VirtualizingWrapPanel } from "@visualisation-sub/mural/basic";
import { ItemsControl } from "@visualisation-sub/mural/framework/items-control.js";
import { ListBox, ListBoxItem, SelectionMode } from "@visualisation-sub/mural/framework/list/list-box.js";
import { MarqueeBoundsPolicy } from "@visualisation-sub/mural/framework/list/selector.js";
import { ScrollViewer } from "@visualisation-sub/mural/framework/scroll-viewer.js";
import { Color, DataContextBinding, DynamicResource, HorizontalAlignment, NameScope, ResourceDictionary, Setter, SetterFactory, Style, Thickness, VerticalAlignment } from "@visualisation-sub/mural/runtime";
import { FontWeight, SolidColorBrush } from "@visualisation-sub/mural/visual-engine";


const _gate_WordToolboxDemo = Symbol("WordToolboxDemo.ctor");
export class WordToolboxDemo extends ResourceDictionary {
    constructor(_g) {
        super();
        if (_g !== _gate_WordToolboxDemo) {
            throw new Error("WordToolboxDemo is private — use WordToolboxDemo.Clone()");
        }
    }
    static Clone() {
        const t = new WordToolboxDemo(_gate_WordToolboxDemo);
        const _tmpl0 = new ItemsPanelTemplate(() => {
            const _virtualizingWrapPanel1 = new VirtualizingWrapPanel();
            _virtualizingWrapPanel1.set_property_value(VirtualizingWrapPanel.HorizontalSpacingKey, 15);
            _virtualizingWrapPanel1.set_property_value(VirtualizingWrapPanel.VerticalSpacingKey, 15);
            return _virtualizingWrapPanel1;
        });
        t.Set("ListBoxItemsPanel", _tmpl0);
        const _tmpl2 = new ItemsPanelTemplate(() => {
            const _virtualizingStackPanel3 = new VirtualizingStackPanel();
            return _virtualizingStackPanel3;
        });
        t.Set("ToolboxItemsPanel", _tmpl2);
        const _tmpl4 = new DataTemplate((_data) => {
            const _border5 = new Border();
            _border5.set_property_value(Border.BorderBrushKey, DynamicResource(_border5, "Outline"));
            _border5.set_property_value(Border.BorderThicknessKey, new Thickness(1));
            const _textBlock6 = new TextBlock();
            _textBlock6.set_property_value(TextBlock.TextKey, DataContextBinding(_textBlock6, "Word"));
            _textBlock6.set_property_value(TextBlock.FontSizeKey, 14);
            _textBlock6.set_property_value(TextBlock.HorizontalAlignmentKey, HorizontalAlignment.Center);
            _textBlock6.set_property_value(TextBlock.VerticalAlignmentKey, VerticalAlignment.Center);
            _textBlock6.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock6, "OnSurface"));
            _border5.SetChild(_textBlock6);
            return _border5;
        }, WordVM);
        t.Set(WordVM, _tmpl4);
        const _tmpl7 = (() => {
            const _factory = (_templatedParent) => {
                const _border8 = new Border();
                _border8.Name = "PART_Border";
                _border8.set_property_value(Border.BorderThicknessKey, new Thickness(0));
                _border8.set_property_value(Border.PaddingKey, new Thickness(3));
                const _contentPresenter9 = new ContentPresenter();
                _border8.SetChild(_contentPresenter9);
                return _border8;
            };
            const _tplSet10 = [new TargetedSetter(Border, "Background", new SetterFactory((_t) => DynamicResource(_t, "SecondaryContainer")), "PART_Border")];
            const _tplTrig11 = new TemplatePropertyTrigger(ListBoxItem, "IsSelected", true, _tplSet10, undefined);
            return new ControlTemplate(_factory, [_tplTrig11]);
        })();
        t.Set("WordTileItemTemplate", _tmpl7);
        const _setter12 = new Setter(ListBoxItem, "Template", _tmpl7);
        const _setter13 = new Setter(ListBoxItem, "IsDraggable", true);
        const _setter14 = new Setter(ListBoxItem, "OnDragStart", new SetterFactory((_t) => DataContextBinding(_t, "BeginDragData")));
        const _style15 = new Style(ListBoxItem, [_setter12, _setter13, _setter14], undefined, [], []);
        t.Set("WordTileItemStyle", _style15);
        const _tmpl16 = new DataTemplate((_data) => {
            const _border17 = new Border();
            _border17.SetNameScope(new NameScope());
            _border17.set_property_value(Border.BackgroundKey, DynamicResource(_border17, "SurfaceContainerLow"));
            _border17.set_property_value(Border.BorderBrushKey, DynamicResource(_border17, "OutlineVariant"));
            _border17.set_property_value(Border.BorderThicknessKey, new Thickness(1));
            const _rd18 = _border17.Resources;
            const _setter19 = new Setter(ContentPresenter, "IsDraggable", true);
            const _setter20 = new Setter(ContentPresenter, "OnDragStart", new SetterFactory((_t) => DataContextBinding(_t, "BeginDragData")));
            const _style21 = new Style(ContentPresenter, [_setter19, _setter20], undefined, [], []);
            _rd18.Set(ContentPresenter, _style21);
            const _dockPanel22 = new DockPanel();
            const _border23 = new Border();
            _border23.set_property_value(DockPanel.DockKey, Dock.Top);
            _border23.set_property_value(Border.BackgroundKey, DynamicResource(_border23, "InverseSurface"));
            _border23.set_property_value(Border.PaddingKey, new Thickness(16, 12, 16, 12));
            const _stackPanel24 = new StackPanel();
            _stackPanel24.set_property_value(StackPanel.OrientationKey, Orientation.Vertical);
            const _textBlock25 = new TextBlock();
            _textBlock25.set_property_value(TextBlock.TextKey, "Word toolbox — drag tiles between panes");
            _textBlock25.set_property_value(TextBlock.FontSizeKey, 15);
            _textBlock25.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _textBlock25.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock25, "InverseOnSurface"));
            _stackPanel24.AddChild(_textBlock25);
            const _textBlock26 = new TextBlock();
            _textBlock26.set_property_value(TextBlock.TextKey, DataContextBinding(_textBlock26, "Status"));
            _textBlock26.set_property_value(TextBlock.FontSizeKey, 11);
            _textBlock26.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock26, "OnSurfaceVariant"));
            _textBlock26.set_property_value(TextBlock.MarginKey, new Thickness(0, 4, 0, 0));
            _stackPanel24.AddChild(_textBlock26);
            _border23.SetChild(_stackPanel24);
            _dockPanel22.AddChild(_border23);
            const _textBlock27 = new TextBlock();
            _textBlock27.set_property_value(DockPanel.DockKey, Dock.Bottom);
            _textBlock27.set_property_value(TextBlock.MarginKey, new Thickness(20, 4, 20, 16));
            _textBlock27.set_property_value(TextBlock.FontSizeKey, 11);
            _textBlock27.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock27, "OnSurfaceVariant"));
            _textBlock27.set_property_value(TextBlock.TextWrappingKey, TextWrapping.Wrap);
            _textBlock27.set_property_value(TextBlock.TextKey, "LEFT pane is a 100-tile palette; drag any tile RIGHT to copy it into the listbox. RIGHT pane is a 2000-tile virtualizing WrapPanel; drag any tile to reorder. Both panes share the same square-tile template (100×100 with 15px gaps).");
            _dockPanel22.AddChild(_textBlock27);
            const _dockPanel28 = new DockPanel();
            _dockPanel28.set_property_value(DockPanel.LastChildFillKey, true);
            const _border29 = new Border();
            _border29.set_property_value(DockPanel.DockKey, Dock.Left);
            _border29.set_property_value(Border.BorderBrushKey, DynamicResource(_border29, "OutlineVariant"));
            _border29.set_property_value(Border.BorderThicknessKey, new Thickness(0, 0, 1, 0));
            const _dockPanel30 = new DockPanel();
            const _border31 = new Border();
            _border31.set_property_value(DockPanel.DockKey, Dock.Top);
            _border31.set_property_value(Border.BackgroundKey, new SolidColorBrush(Color.FromHex('#e0f2fe')));
            _border31.set_property_value(Border.PaddingKey, new Thickness(12, 8, 12, 8));
            const _textBlock32 = new TextBlock();
            _textBlock32.set_property_value(TextBlock.TextKey, "Toolbox — drag a word to the listbox");
            _textBlock32.set_property_value(TextBlock.FontSizeKey, 12);
            _textBlock32.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _textBlock32.set_property_value(TextBlock.ForegroundKey, new SolidColorBrush(Color.FromHex('#075985')));
            _border31.SetChild(_textBlock32);
            _dockPanel30.AddChild(_border31);
            const _scrollViewer33 = new ScrollViewer();
            _scrollViewer33.set_property_value(ScrollViewer.IsAutoHideScrollBarsKey, false);
            const _itemsControl34 = new ItemsControl();
            _itemsControl34.Name = "toolbox";
            _itemsControl34.set_property_value(ItemsControl.ItemsSourceKey, DataContextBinding(_itemsControl34, "ToolboxWords"));
            _itemsControl34.set_property_value(ItemsControl.ItemsPanelKey, _tmpl2);
            _scrollViewer33.Content = _itemsControl34;
            _dockPanel30.AddChild(_scrollViewer33);
            _border29.SetChild(_dockPanel30);
            _dockPanel28.AddChild(_border29);
            const _border35 = new Border();
            _border35.set_property_value(Border.BorderBrushKey, DynamicResource(_border35, "OutlineVariant"));
            _border35.set_property_value(Border.BorderThicknessKey, new Thickness(0));
            const _dockPanel36 = new DockPanel();
            const _border37 = new Border();
            _border37.set_property_value(DockPanel.DockKey, Dock.Top);
            _border37.set_property_value(Border.BackgroundKey, new SolidColorBrush(Color.FromHex('#dbeafe')));
            _border37.set_property_value(Border.PaddingKey, new Thickness(12, 8, 12, 8));
            const _textBlock38 = new TextBlock();
            _textBlock38.set_property_value(TextBlock.TextKey, "ListBox — drag tiles to reorder; toolbox words land here");
            _textBlock38.set_property_value(TextBlock.FontSizeKey, 12);
            _textBlock38.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _textBlock38.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock38, "PrimaryContainer"));
            _border37.SetChild(_textBlock38);
            _dockPanel36.AddChild(_border37);
            const _listBox39 = new ListBox();
            _listBox39.Name = "listBox";
            _listBox39.set_property_value(ListBox.ItemsSourceKey, DataContextBinding(_listBox39, "ListBoxWords"));
            _listBox39.set_property_value(ListBox.ItemsPanelKey, _tmpl0);
            _listBox39.set_property_value(ListBox.ItemContainerStyleKey, _style15);
            _listBox39.set_property_value(ListBox.SelectionModeKey, SelectionMode.Extended);
            _listBox39.set_property_value(ListBox.MarqueeBoundsPolicyKey, MarqueeBoundsPolicy.Contained);
            _listBox39.set_property_value(ListBox.AllowMarqueeSelectionKey, true);
            const _listReorderBehavior40 = new ListReorderBehavior();
            _listReorderBehavior40.Name = "reorder";
            _listReorderBehavior40.set_property_value(ListReorderBehavior.FromIndexFormatKey, "mural/reorder/from-index");
            _listBox39.AddBehavior(_listReorderBehavior40);
            _dockPanel36.AddChild(_listBox39);
            _border35.SetChild(_dockPanel36);
            _dockPanel28.AddChild(_border35);
            _dockPanel22.AddChild(_dockPanel28);
            _border17.SetChild(_dockPanel22);
            return _border17;
        }, WordToolboxVM);
        t.Set(WordToolboxVM, _tmpl16);
        return t;
    }
    get ListBoxItemsPanel() { return this.Resolve("ListBoxItemsPanel"); }
    set ListBoxItemsPanel(v) { this.Set("ListBoxItemsPanel", v); }
    get ToolboxItemsPanel() { return this.Resolve("ToolboxItemsPanel"); }
    set ToolboxItemsPanel(v) { this.Set("ToolboxItemsPanel", v); }
    get WordTileItemTemplate() { return this.Resolve("WordTileItemTemplate"); }
    set WordTileItemTemplate(v) { this.Set("WordTileItemTemplate", v); }
    get WordTileItemStyle() { return this.Resolve("WordTileItemStyle"); }
    set WordTileItemStyle(v) { this.Set("WordTileItemStyle", v); }
}
