import {
    MetaData,
    Model,
    type ServiceToken,
} from '../../../runtime/index.js';
import type { Geometry } from '../../../visual-engine/index.js';

// A COMMAND's schema — what a module declares in its `.commands:` block. It is
// pure chrome + context + identity: what the command looks like (Title, Icon),
// where it sits on a toolbar (Group, Order), which command context it belongs to
// (Context), and a stable Id. The behaviour lives on the active document, NOT
// here — a command has no Execute of its own; it is dispatched to whatever
// document is active (see ICommandTarget).
//
// A Model so it is DP-backed, bindable, and declarable in markup — the same
// shape as SettingDefinition / DocumentDefinition:
//
//     module DiagramModule [ Name = "Diagram" ] {
//         .commands: {
//             CommandDefinition
//                 [ Id      = "diagram.align.left", Title = "Align Left",
//                   Icon    = @alignLeft, Context = DiagramEditingContext,
//                   Group   = "align", Order = 10 ]
//         }
//     }
//
// `.commands:` is a generic member-block: each entry lowers to
// `module.Commands.Add(def)` (the compiler remaps the lowercase section to the
// PascalCase `Commands` collection, exactly as `.settings:` → `Settings` and
// `.documents:` → `Documents`). CommandRegistry aggregates these across modules;
// ToolbarService adapts each into a button-bindable CommandViewModel.
//
// Why the behaviour isn't here: the target is always the active document (there
// is no handler ambiguity to route through the tree), so a command is dispatched
// as `activeDocument.Execute(definition)`. Routed commands solve handler-
// discovery-by-focus-scope — a non-problem here — so this stays a plain
// declaration and the document interprets it.
export class CommandDefinition extends Model
{
    // Stable id ("diagram.align.left"). The token a document's Execute /
    // CanExecute switches on. Namespace by module.
    public static readonly IdKey = Model.RegisterProperty<string>(
        CommandDefinition, 'Id', '', MetaData.None);

    // Display name — a toolbar button's tooltip / a menu item's header.
    public static readonly TitleKey = Model.RegisterProperty<string>(
        CommandDefinition, 'Title', '', MetaData.None);

    // Vector icon painted onto the button (Shape[Geometry=Icon]).
    public static readonly IconKey = Model.RegisterProperty<Geometry | undefined>(
        CommandDefinition, 'Icon', undefined, MetaData.None);

    // The command context this command belongs to — the join to a document's
    // live CommandContexts. The command is visible on the toolbar iff the active
    // document activates this context. A ServiceToken used purely as an identity
    // tag (never resolved), so contexts are shareable across document types and
    // authored as real references (`Context = DiagramEditingContext`).
    public static readonly ContextKey = Model.RegisterProperty<ServiceToken<unknown> | undefined>(
        CommandDefinition, 'Context', undefined, MetaData.None);

    // Toolbar group id — commands with the same Group cluster together (a
    // ToolBar / separator boundary is a presentation choice on top of this).
    public static readonly GroupKey = Model.RegisterProperty<string>(
        CommandDefinition, 'Group', '', MetaData.None);

    // Sort order within the group (ascending). Ties break on declaration order.
    public static readonly OrderKey = Model.RegisterProperty<number>(
        CommandDefinition, 'Order', 0, MetaData.None);

    public get Id(): string  { return this.get_property_value(CommandDefinition.IdKey); }
    public set Id(v: string) { this.set_property_value(CommandDefinition.IdKey, v); }

    public get Title(): string  { return this.get_property_value(CommandDefinition.TitleKey); }
    public set Title(v: string) { this.set_property_value(CommandDefinition.TitleKey, v); }

    public get Icon(): Geometry | undefined  { return this.get_property_value(CommandDefinition.IconKey); }
    public set Icon(v: Geometry | undefined) { this.set_property_value(CommandDefinition.IconKey, v); }

    public get Context(): ServiceToken<unknown> | undefined  { return this.get_property_value(CommandDefinition.ContextKey); }
    public set Context(v: ServiceToken<unknown> | undefined) { this.set_property_value(CommandDefinition.ContextKey, v); }

    public get Group(): string  { return this.get_property_value(CommandDefinition.GroupKey); }
    public set Group(v: string) { this.set_property_value(CommandDefinition.GroupKey, v); }

    public get Order(): number  { return this.get_property_value(CommandDefinition.OrderKey); }
    public set Order(v: number) { this.set_property_value(CommandDefinition.OrderKey, v); }
}
