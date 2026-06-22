import { WordToolboxVM, WordVM } from "./word-toolbox-vm.mjs";
import { Border, ContentPresenter, ControlTemplate, DataTemplate, Dock, DockPanel, ItemsPanelTemplate, ListReorderBehavior, Orientation, StackPanel, TargetedSetter, TemplatePropertyTrigger, TextBlock, TextWrapping, VirtualizingStackPanel, VirtualizingWrapPanel } from "@visualisation-sub/mural/basic";
import { ItemsControl } from "@visualisation-sub/mural/framework/base/items-control.js";
import { ListBox, ListBoxItem, SelectionMode } from "@visualisation-sub/mural/framework/list/list-box.js";
import { MarqueeBoundsPolicy } from "@visualisation-sub/mural/framework/list/selector.js";
import { ScrollViewer } from "@visualisation-sub/mural/framework/surfaces/scroll-viewer.js";
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
                let _border8;
                _border8 = new Border();
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
            let _itemsControl17, _listBox18, _listReorderBehavior19;
            const _border20 = new Border();
            _border20.SetNameScope(new NameScope());
            _border20.set_property_value(Border.BackgroundKey, DynamicResource(_border20, "SurfaceContainerLow"));
            _border20.set_property_value(Border.BorderBrushKey, DynamicResource(_border20, "OutlineVariant"));
            _border20.set_property_value(Border.BorderThicknessKey, new Thickness(1));
            const _rd21 = _border20.Resources;
            const _setter22 = new Setter(ContentPresenter, "IsDraggable", true);
            const _setter23 = new Setter(ContentPresenter, "OnDragStart", new SetterFactory((_t) => DataContextBinding(_t, "BeginDragData")));
            const _style24 = new Style(ContentPresenter, [_setter22, _setter23], undefined, [], []);
            _rd21.Set(ContentPresenter, _style24);
            const _dockPanel25 = new DockPanel();
            const _border26 = new Border();
            _border26.set_property_value(DockPanel.DockKey, Dock.Top);
            _border26.set_property_value(Border.BackgroundKey, DynamicResource(_border26, "InverseSurface"));
            _border26.set_property_value(Border.PaddingKey, new Thickness(16, 12, 16, 12));
            const _stackPanel27 = new StackPanel();
            _stackPanel27.set_property_value(StackPanel.OrientationKey, Orientation.Vertical);
            const _textBlock28 = new TextBlock();
            _textBlock28.set_property_value(TextBlock.TextKey, "Word toolbox — drag tiles between panes");
            _textBlock28.set_property_value(TextBlock.FontSizeKey, 15);
            _textBlock28.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _textBlock28.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock28, "InverseOnSurface"));
            _stackPanel27.AddChild(_textBlock28);
            const _textBlock29 = new TextBlock();
            _textBlock29.set_property_value(TextBlock.TextKey, DataContextBinding(_textBlock29, "Status"));
            _textBlock29.set_property_value(TextBlock.FontSizeKey, 11);
            _textBlock29.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock29, "OnSurfaceVariant"));
            _textBlock29.set_property_value(TextBlock.MarginKey, new Thickness(0, 4, 0, 0));
            _stackPanel27.AddChild(_textBlock29);
            _border26.SetChild(_stackPanel27);
            _dockPanel25.AddChild(_border26);
            const _textBlock30 = new TextBlock();
            _textBlock30.set_property_value(DockPanel.DockKey, Dock.Bottom);
            _textBlock30.set_property_value(TextBlock.MarginKey, new Thickness(20, 4, 20, 16));
            _textBlock30.set_property_value(TextBlock.FontSizeKey, 11);
            _textBlock30.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock30, "OnSurfaceVariant"));
            _textBlock30.set_property_value(TextBlock.TextWrappingKey, TextWrapping.Wrap);
            _textBlock30.set_property_value(TextBlock.TextKey, "LEFT pane is a 100-tile palette; drag any tile RIGHT to copy it into the listbox. RIGHT pane is a 2000-tile virtualizing WrapPanel; drag any tile to reorder. Both panes share the same square-tile template (100×100 with 15px gaps).");
            _dockPanel25.AddChild(_textBlock30);
            const _dockPanel31 = new DockPanel();
            _dockPanel31.set_property_value(DockPanel.LastChildFillKey, true);
            const _border32 = new Border();
            _border32.set_property_value(DockPanel.DockKey, Dock.Left);
            _border32.set_property_value(Border.BorderBrushKey, DynamicResource(_border32, "OutlineVariant"));
            _border32.set_property_value(Border.BorderThicknessKey, new Thickness(0, 0, 1, 0));
            const _dockPanel33 = new DockPanel();
            const _border34 = new Border();
            _border34.set_property_value(DockPanel.DockKey, Dock.Top);
            _border34.set_property_value(Border.BackgroundKey, new SolidColorBrush(Color.FromHex('#e0f2fe')));
            _border34.set_property_value(Border.PaddingKey, new Thickness(12, 8, 12, 8));
            const _textBlock35 = new TextBlock();
            _textBlock35.set_property_value(TextBlock.TextKey, "Toolbox — drag a word to the listbox");
            _textBlock35.set_property_value(TextBlock.FontSizeKey, 12);
            _textBlock35.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _textBlock35.set_property_value(TextBlock.ForegroundKey, new SolidColorBrush(Color.FromHex('#075985')));
            _border34.SetChild(_textBlock35);
            _dockPanel33.AddChild(_border34);
            const _scrollViewer36 = new ScrollViewer();
            _scrollViewer36.set_property_value(ScrollViewer.IsAutoHideScrollBarsKey, false);
            _itemsControl17 = new ItemsControl();
            _itemsControl17.Name = "toolbox";
            _itemsControl17.set_property_value(ItemsControl.ItemsSourceKey, DataContextBinding(_itemsControl17, "ToolboxWords"));
            _itemsControl17.set_property_value(ItemsControl.ItemsPanelKey, _tmpl2);
            _scrollViewer36.Content = _itemsControl17;
            _dockPanel33.AddChild(_scrollViewer36);
            _border32.SetChild(_dockPanel33);
            _dockPanel31.AddChild(_border32);
            const _border37 = new Border();
            _border37.set_property_value(Border.BorderBrushKey, DynamicResource(_border37, "OutlineVariant"));
            _border37.set_property_value(Border.BorderThicknessKey, new Thickness(0));
            const _dockPanel38 = new DockPanel();
            const _border39 = new Border();
            _border39.set_property_value(DockPanel.DockKey, Dock.Top);
            _border39.set_property_value(Border.BackgroundKey, new SolidColorBrush(Color.FromHex('#dbeafe')));
            _border39.set_property_value(Border.PaddingKey, new Thickness(12, 8, 12, 8));
            const _textBlock40 = new TextBlock();
            _textBlock40.set_property_value(TextBlock.TextKey, "ListBox — drag tiles to reorder; toolbox words land here");
            _textBlock40.set_property_value(TextBlock.FontSizeKey, 12);
            _textBlock40.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _textBlock40.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock40, "PrimaryContainer"));
            _border39.SetChild(_textBlock40);
            _dockPanel38.AddChild(_border39);
            _listBox18 = new ListBox();
            _listBox18.Name = "listBox";
            _listBox18.set_property_value(ListBox.ItemsSourceKey, DataContextBinding(_listBox18, "ListBoxWords"));
            _listBox18.set_property_value(ListBox.ItemsPanelKey, _tmpl0);
            _listBox18.set_property_value(ListBox.ItemContainerStyleKey, _style15);
            _listBox18.set_property_value(ListBox.SelectionModeKey, SelectionMode.Extended);
            _listBox18.set_property_value(ListBox.MarqueeBoundsPolicyKey, MarqueeBoundsPolicy.Contained);
            _listBox18.set_property_value(ListBox.AllowMarqueeSelectionKey, true);
            _listReorderBehavior19 = new ListReorderBehavior();
            _listReorderBehavior19.Name = "reorder";
            _listReorderBehavior19.set_property_value(ListReorderBehavior.FromIndexFormatKey, "mural/reorder/from-index");
            _listBox18.AddBehavior(_listReorderBehavior19);
            _dockPanel38.AddChild(_listBox18);
            _border37.SetChild(_dockPanel38);
            _dockPanel31.AddChild(_border37);
            _dockPanel25.AddChild(_dockPanel31);
            _border20.SetChild(_dockPanel25);
            return _border20;
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
