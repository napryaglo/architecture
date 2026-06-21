import { TreeViewVM } from "./tree-view-vm.mjs";
import { Border, DataTemplate, Dock, DockPanel, Orientation, StackPanel, TextBlock } from "@visualisation-sub/mural/basic";
import { TreeView, TreeViewItem } from "@visualisation-sub/mural/framework/list/tree-view.js";
import { DynamicResource, NameScope, ResourceDictionary, Thickness } from "@visualisation-sub/mural/runtime";
import { FontWeight } from "@visualisation-sub/mural/visual-engine";


const _gate_TreeViewDemo = Symbol("TreeViewDemo.ctor");
export class TreeViewDemo extends ResourceDictionary {
    constructor(_g) {
        super();
        if (_g !== _gate_TreeViewDemo) {
            throw new Error("TreeViewDemo is private — use TreeViewDemo.Clone()");
        }
    }
    static Clone() {
        const t = new TreeViewDemo(_gate_TreeViewDemo);
        const _tmpl0 = new DataTemplate((_data) => {
            const _border1 = new Border();
            _border1.SetNameScope(new NameScope());
            _border1.set_property_value(Border.BackgroundKey, DynamicResource(_border1, "Surface"));
            _border1.set_property_value(Border.BorderBrushKey, DynamicResource(_border1, "OutlineVariant"));
            _border1.set_property_value(Border.BorderThicknessKey, new Thickness(1));
            const _dockPanel2 = new DockPanel();
            const _border3 = new Border();
            _border3.set_property_value(DockPanel.DockKey, Dock.Top);
            _border3.set_property_value(Border.BackgroundKey, DynamicResource(_border3, "Primary"));
            _border3.set_property_value(Border.PaddingKey, new Thickness(16, 12, 16, 12));
            const _textBlock4 = new TextBlock();
            _textBlock4.set_property_value(TextBlock.TextKey, "TreeView — composed markup vs. HierarchicalDataTemplate");
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
            _stackPanel6.set_property_value(StackPanel.MarginKey, new Thickness(12, 12, 6, 12));
            const _textBlock7 = new TextBlock();
            _textBlock7.set_property_value(TextBlock.TextKey, "Composed markup");
            _textBlock7.set_property_value(TextBlock.FontSizeKey, 12);
            _textBlock7.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _textBlock7.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock7, "OnSurfaceVariant"));
            _textBlock7.set_property_value(TextBlock.MarginKey, new Thickness(0, 0, 0, 8));
            _stackPanel6.AddChild(_textBlock7);
            const _treeView8 = new TreeView();
            _treeView8.set_property_value(TreeView.IndentKey, 18);
            const _treeViewItem9 = new TreeViewItem();
            _treeViewItem9.set_property_value(TreeViewItem.HeaderKey, "src/");
            _treeViewItem9.set_property_value(TreeViewItem.IsExpandedKey, true);
            const _treeViewItem10 = new TreeViewItem();
            _treeViewItem10.set_property_value(TreeViewItem.HeaderKey, "runtime/");
            _treeViewItem10.set_property_value(TreeViewItem.IsExpandedKey, true);
            const _treeViewItem11 = new TreeViewItem();
            _treeViewItem11.set_property_value(TreeViewItem.HeaderKey, "visual.ts");
            _treeViewItem10.AddChild(_treeViewItem11);
            const _treeViewItem12 = new TreeViewItem();
            _treeViewItem12.set_property_value(TreeViewItem.HeaderKey, "model.ts");
            _treeViewItem10.AddChild(_treeViewItem12);
            const _treeViewItem13 = new TreeViewItem();
            _treeViewItem13.set_property_value(TreeViewItem.HeaderKey, "routed-event.ts");
            _treeViewItem10.AddChild(_treeViewItem13);
            const _treeViewItem14 = new TreeViewItem();
            _treeViewItem14.set_property_value(TreeViewItem.HeaderKey, "input-manager.ts");
            _treeViewItem10.AddChild(_treeViewItem14);
            _treeViewItem9.AddChild(_treeViewItem10);
            const _treeViewItem15 = new TreeViewItem();
            _treeViewItem15.set_property_value(TreeViewItem.HeaderKey, "visual-engine/");
            const _treeViewItem16 = new TreeViewItem();
            _treeViewItem16.set_property_value(TreeViewItem.HeaderKey, "presentation-target.ts");
            _treeViewItem15.AddChild(_treeViewItem16);
            const _treeViewItem17 = new TreeViewItem();
            _treeViewItem17.set_property_value(TreeViewItem.HeaderKey, "svg-renderer.ts");
            _treeViewItem15.AddChild(_treeViewItem17);
            const _treeViewItem18 = new TreeViewItem();
            _treeViewItem18.set_property_value(TreeViewItem.HeaderKey, "overlay-layer.ts");
            _treeViewItem15.AddChild(_treeViewItem18);
            _treeViewItem9.AddChild(_treeViewItem15);
            const _treeViewItem19 = new TreeViewItem();
            _treeViewItem19.set_property_value(TreeViewItem.HeaderKey, "Controls/");
            _treeViewItem19.set_property_value(TreeViewItem.IsExpandedKey, true);
            const _treeViewItem20 = new TreeViewItem();
            _treeViewItem20.set_property_value(TreeViewItem.HeaderKey, "border.ts");
            _treeViewItem19.AddChild(_treeViewItem20);
            const _treeViewItem21 = new TreeViewItem();
            _treeViewItem21.set_property_value(TreeViewItem.HeaderKey, "button.ts");
            _treeViewItem19.AddChild(_treeViewItem21);
            const _treeViewItem22 = new TreeViewItem();
            _treeViewItem22.set_property_value(TreeViewItem.HeaderKey, "tree-view.ts");
            _treeViewItem19.AddChild(_treeViewItem22);
            _treeViewItem9.AddChild(_treeViewItem19);
            _treeView8.AddChild(_treeViewItem9);
            const _treeViewItem23 = new TreeViewItem();
            _treeViewItem23.set_property_value(TreeViewItem.HeaderKey, "demo/");
            const _treeViewItem24 = new TreeViewItem();
            _treeViewItem24.set_property_value(TreeViewItem.HeaderKey, "counter.mu");
            _treeViewItem23.AddChild(_treeViewItem24);
            const _treeViewItem25 = new TreeViewItem();
            _treeViewItem25.set_property_value(TreeViewItem.HeaderKey, "tree-view.mu");
            _treeViewItem23.AddChild(_treeViewItem25);
            _treeView8.AddChild(_treeViewItem23);
            _stackPanel6.AddChild(_treeView8);
            _stackPanel5.AddChild(_stackPanel6);
            const _border26 = new Border();
            _border26.set_property_value(Border.WidthKey, 1);
            _border26.set_property_value(Border.BackgroundKey, DynamicResource(_border26, "OutlineVariant"));
            _border26.set_property_value(Border.MarginKey, new Thickness(0, 12, 0, 12));
            _stackPanel5.AddChild(_border26);
            const _stackPanel27 = new StackPanel();
            _stackPanel27.set_property_value(StackPanel.OrientationKey, Orientation.Vertical);
            _stackPanel27.set_property_value(StackPanel.WidthKey, 300);
            _stackPanel27.set_property_value(StackPanel.MarginKey, new Thickness(6, 12, 12, 12));
            const _textBlock28 = new TextBlock();
            _textBlock28.set_property_value(TextBlock.TextKey, "HierarchicalDataTemplate");
            _textBlock28.set_property_value(TextBlock.FontSizeKey, 12);
            _textBlock28.set_property_value(TextBlock.FontWeightKey, FontWeight.Bold);
            _textBlock28.set_property_value(TextBlock.ForegroundKey, DynamicResource(_textBlock28, "OnSurfaceVariant"));
            _textBlock28.set_property_value(TextBlock.MarginKey, new Thickness(0, 0, 0, 8));
            _stackPanel27.AddChild(_textBlock28);
            const _treeView29 = new TreeView();
            _treeView29.Name = "bound";
            _treeView29.set_property_value(TreeView.IndentKey, 18);
            _stackPanel27.AddChild(_treeView29);
            _stackPanel5.AddChild(_stackPanel27);
            _dockPanel2.AddChild(_stackPanel5);
            _border1.SetChild(_dockPanel2);
            return _border1;
        }, TreeViewVM);
        t.Set("TreeViewTemplate", _tmpl0);
        return t;
    }
    get TreeViewTemplate() { return this.Resolve("TreeViewTemplate"); }
    set TreeViewTemplate(v) { this.Set("TreeViewTemplate", v); }
}
