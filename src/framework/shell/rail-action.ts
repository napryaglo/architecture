import {
    MetaData,
    Model,
    type ICommand,
} from '../../runtime/index.js';
import type { Geometry } from '../../visual-engine/index.js';

// RailAction — one icon-button entry in a NavigationRail's Header or Footer
// slot (the shell's activity bar). A small view-data record (like the rail's
// destinations, but a command action rather than a navigation target): an icon
// geometry paired with the ICommand it invokes, plus an optional tooltip.
//
// The NavigationService exposes HeaderActions / FooterActions collections of
// these; the framework rail template renders each as an IconButton via a
// `DataTemplate [DataType = RailAction]`. Apps contribute actions (e.g. a
// settings gear) by adding RailActions to those collections — no rail-template
// override. Icons are app-supplied (the framework ships none): a RailAction
// carries a Geometry the app resolved from its own icon dictionary.
export class RailAction extends Model
{
    public static readonly IconKey = Model.RegisterProperty<Geometry | undefined>(
        RailAction, 'Icon', undefined, MetaData.None);
    public static readonly CommandKey = Model.RegisterProperty<ICommand | undefined>(
        RailAction, 'Command', undefined, MetaData.None);
    public static readonly TooltipKey = Model.RegisterProperty<string>(
        RailAction, 'Tooltip', '', MetaData.None);

    constructor(icon?: Geometry, command?: ICommand, tooltip = '')
    {
        super();
        this.set_property_value(RailAction.IconKey, icon);
        this.set_property_value(RailAction.CommandKey, command);
        this.set_property_value(RailAction.TooltipKey, tooltip);
    }

    public get Icon(): Geometry | undefined  { return this.get_property_value(RailAction.IconKey); }
    public set Icon(v: Geometry | undefined) { this.set_property_value(RailAction.IconKey, v); }
    public get Command(): ICommand | undefined  { return this.get_property_value(RailAction.CommandKey); }
    public set Command(v: ICommand | undefined) { this.set_property_value(RailAction.CommandKey, v); }
    public get Tooltip(): string  { return this.get_property_value(RailAction.TooltipKey); }
    public set Tooltip(v: string) { this.set_property_value(RailAction.TooltipKey, v); }
}
