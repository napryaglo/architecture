import {
    MetaData,
    Model,
    type ServiceToken,
} from '../../../runtime/index.js';
import type { DataTemplate } from '../../../basic/templates/data-template.js';

// Which shell region hosts a shell control. Markup-facing (`Region = StatusBar`),
// so it is registered in the compiler's ENUM_MEMBERS / DEFAULT_SYMBOLS.
export enum ShellRegion
{
    // The command bar (default) — interleaved with command groups by Order.
    Toolbar   = 'toolbar',
    // The bottom status bar — a status cell (e.g. a mode indicator).
    StatusBar = 'status-bar',
}

// A non-command shell contribution: an arbitrary editor CONTROL a module drops
// into a shell region (command bar or status bar), bound to the active document.
// Where a CommandDefinition is a button that DISPATCHES to the document, a
// ShellControlDefinition is a TEMPLATE the shell hosts with the document as its
// DataContext — the escape hatch for value editors (font pickers, a mode
// indicator, a zoom box, …) that read/write live state rather than fire a
// one-shot command.
//
// Declared in a module's `.ShellControls:` block (a generic member-block, so
// each entry lowers to `module.ShellControls.Add(def)`):
//
//     module DiagramModule [ Name = "Diagram" ] {
//         .ShellControls: {
//             ShellControlDefinition
//                 [ Template = @FontFormatEditor, Context = DiagramEditingContext, Order = 330 ]
//         }
//     }
//
// For the Toolbar region the ToolbarService filters by Context (like commands)
// and interleaves the control with the command GROUPS by Order — so a control can
// sit between two command groups. A StatusBar-region control is synced into the
// StatusService's Items instead. The template binds against the active document
// (e.g. through an IFontFormatSink the document implements); the shell stays
// domain-agnostic.
export class ShellControlDefinition extends Model
{
    // The editor UI. A keyed DataTemplate the shell applies with the active
    // document as Content/DataContext.
    public static readonly TemplateKey = Model.RegisterProperty<DataTemplate | undefined>(
        ShellControlDefinition, 'Template', undefined, MetaData.None);

    // The command context that gates visibility — the control shows iff the active
    // document activates this context (same join as CommandDefinition.Context).
    public static readonly ContextKey = Model.RegisterProperty<ServiceToken<unknown> | undefined>(
        ShellControlDefinition, 'Context', undefined, MetaData.None);

    // Placement in the shared Order space with command groups (Toolbar region).
    public static readonly OrderKey = Model.RegisterProperty<number>(
        ShellControlDefinition, 'Order', 0, MetaData.None);

    // Which shell region hosts this control — the command bar (default) or the
    // status bar.
    public static readonly RegionKey = Model.RegisterProperty<ShellRegion>(
        ShellControlDefinition, 'Region', ShellRegion.Toolbar, MetaData.None);

    public get Template(): DataTemplate | undefined  { return this.get_property_value(ShellControlDefinition.TemplateKey); }
    public set Template(v: DataTemplate | undefined) { this.set_property_value(ShellControlDefinition.TemplateKey, v); }

    public get Context(): ServiceToken<unknown> | undefined  { return this.get_property_value(ShellControlDefinition.ContextKey); }
    public set Context(v: ServiceToken<unknown> | undefined) { this.set_property_value(ShellControlDefinition.ContextKey, v); }

    public get Order(): number  { return this.get_property_value(ShellControlDefinition.OrderKey); }
    public set Order(v: number) { this.set_property_value(ShellControlDefinition.OrderKey, v); }

    public get Region(): ShellRegion  { return this.get_property_value(ShellControlDefinition.RegionKey); }
    public set Region(v: ShellRegion) { this.set_property_value(ShellControlDefinition.RegionKey, v); }
}
