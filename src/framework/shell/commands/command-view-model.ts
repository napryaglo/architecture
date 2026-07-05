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

    constructor(definition: CommandDefinition, command: ICommand)
    {
        super();
        this.set_property_value(CommandViewModel.DefinitionKey, definition);
        this.set_property_value(CommandViewModel.CommandKey, command);
    }

    public get Definition(): CommandDefinition { return this.get_property_value(CommandViewModel.DefinitionKey); }
    public get Command(): ICommand { return this.get_property_value(CommandViewModel.CommandKey); }
}
