import {
    type ICommand,
    MetaData,
    Model,
} from '../../../runtime/index.js';
import { CommandDefinition } from './command-definition.js';

// The button-bindable adapter the ToolbarService builds for one CommandDefinition.
// A pure holder: `Definition` supplies the chrome (a toolbar template binds
// `$Definition.Icon` / `$Definition.Title`); `Command` is the RelayCommand the
// ToolbarService wired to dispatch to the active document. The VM has NO logic —
// dispatch and CanExecute live in the ToolbarService (which the RelayCommand
// closes over), so the VM stays a dumb, cacheable view-model.
//
// Both are DPs so a `DataTemplate[DataType=CommandViewModel]` can bind them
// (`Command = $Command`, `Content = Shape[Geometry=$Definition.Icon]`) — a
// `$path` binding's first segment must be a DP.
export class CommandViewModel extends Model
{
    public static readonly DefinitionKey = Model.RegisterProperty<CommandDefinition>(
        CommandViewModel, 'Definition',
        undefined as unknown as CommandDefinition, MetaData.None);

    public static readonly CommandKey = Model.RegisterProperty<ICommand>(
        CommandViewModel, 'Command',
        undefined as unknown as ICommand, MetaData.None);

    // The command's active / checked state — a Toggles-presentation button binds
    // `IsChecked = $IsActive`. Kept in sync by the ToolbarService, which reads the
    // active document's IsActive(definition) on every requery pulse. A plain DP
    // (default false) so it's bindable; irrelevant for non-toggle presentations.
    public static readonly IsActiveKey = Model.RegisterProperty<boolean>(
        CommandViewModel, 'IsActive', false, MetaData.None);

    constructor(definition: CommandDefinition, command: ICommand)
    {
        super();
        this.set_property_value(CommandViewModel.DefinitionKey, definition);
        this.set_property_value(CommandViewModel.CommandKey, command);
    }

    public get Definition(): CommandDefinition { return this.get_property_value(CommandViewModel.DefinitionKey); }
    public get Command(): ICommand { return this.get_property_value(CommandViewModel.CommandKey); }

    public get IsActive(): boolean { return this.get_property_value(CommandViewModel.IsActiveKey); }
    public set IsActive(v: boolean) { this.set_property_value(CommandViewModel.IsActiveKey, v); }
}

// A toggle-presentation command VM — identical data to CommandViewModel, a
// distinct TYPE only. The command bar renders its FLAT item stream by implicit
// DataTemplate-by-type (no ItemTemplate → one ContentPresenter per item), so a
// Toggles-group member needs its own class to resolve
// `DataTemplate[CommandToggleViewModel]` (a ToolBarToggleButton, IsChecked =
// $IsActive) instead of the plain `DataTemplate[CommandViewModel]` button. This
// mirrors the "a type per presentation" rule the group VMs use. Because
// findDataTemplateForType walks the prototype chain, a CommandToggleViewModel
// with no own template would fall back to CommandViewModel's button template —
// so the shell registers a template for it explicitly.
export class CommandToggleViewModel extends CommandViewModel { }
