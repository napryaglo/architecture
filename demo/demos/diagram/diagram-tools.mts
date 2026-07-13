// DiagramTool — one toolbar-command descriptor: an icon geometry paired
// with the ICommand it invokes. The diagrammer authors inline arrays of
// these in markup (one array per ToolBar group — Align / Distribute /
// Group / Combine) and a single shared DataTemplate renders each as a
// ToolBarButton. Keeping the pair as a tiny DP-backed Model lets the
// template bind $Icon / $Command, and lets the `$nodes.<X>Command`
// element-source binding resolve once the Diagram control materialises.
//
// This is a view-data record, NOT a `*-vm.mts` view-model — it is
// authored where both the Diagram's commands ($nodes) and the demo's
// icon resources (@alignLeft, the baked @join glyphs) are in scope, so
// it legitimately holds a Geometry. The MVVM import rules that forbid
// visual-engine types apply to `*-vm.mts` files; this descriptor is the
// inline-markup data the ToolBars iterate.

import { MetaData, Model, type ICommand } from 'mural/runtime';
import type { Geometry } from 'mural/visual-engine';

export class DiagramTool extends Model
{
    public static readonly IconKey = Model.RegisterProperty<Geometry | undefined>(
        DiagramTool, 'Icon', undefined, MetaData.None);
    public static readonly CommandKey = Model.RegisterProperty<ICommand | undefined>(
        DiagramTool, 'Command', undefined, MetaData.None);

    public get Icon(): Geometry | undefined  { return this.get_property_value(DiagramTool.IconKey); }
    public set Icon(v: Geometry | undefined) { this.set_property_value(DiagramTool.IconKey, v); }
    public get Command(): ICommand | undefined  { return this.get_property_value(DiagramTool.CommandKey); }
    public set Command(v: ICommand | undefined) { this.set_property_value(DiagramTool.CommandKey, v); }
}
