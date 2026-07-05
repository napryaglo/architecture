import {
    MetaData,
    Model,
    ObservableCollection,
    RelayCommand,
    ServiceBase,
    ServiceKey,
    type IServiceProvider,
} from '../../../runtime/index.js';
import { CommandManager } from '../../commands/command-manager.js';
import { ContentHostService } from '../services/content-host-service.js';
import { DocumentsContentHostService } from '../services/documents-content-host-service.js';
import { CommandRegistry } from './command-registry.js';
import { CommandDefinition } from './command-definition.js';
import { CommandViewModel } from './command-view-model.js';
import { type ICommandTarget, isCommandTarget } from './command-target.js';

// Turns declared CommandDefinitions into the toolbar the shell shows for the
// ACTIVE document. It:
//   • filters the CommandRegistry by the active document's live CommandContexts
//     (a command is visible iff its Context is one the document activates),
//   • orders the survivors by Group then Order,
//   • wraps each in a CommandViewModel whose RelayCommand dispatches to the
//     active document — `activeDocument.Execute(definition)` — with CanExecute
//     gated by `activeDocument.CanExecute(definition)`.
//
// There is no command routing: the handler is unambiguous (the active document),
// so the RelayCommand closes over THIS service and re-reads the active document
// on every invocation — the VMs stay valid across tab switches; only which are
// visible changes.
//
// Requery: a plain RelayCommand's CanExecuteChanged only fires when we raise it,
// so this service bridges the two "executability may have changed" signals to
// every VM command — CommandManager.RequerySuggested (the global pulse a
// document fires on, e.g., a selection change) and ActiveDocument changes.
//
// The content host is resolved as a DocumentsContentHostService (the document
// workspace). A base ContentHostService (no document set) yields an empty
// toolbar. Auto-registered by EditorShell.
export class ToolbarService extends ServiceBase
{
    public static readonly Key = new ServiceKey<ToolbarService>('ToolbarService');

    // The commands to show for the active document, already filtered by context
    // and ordered by Group/Order. A toolbar binds `ItemsSource = $VisibleCommands`
    // and renders each CommandViewModel through a DataTemplate.
    public static readonly VisibleCommandsKey = Model.RegisterProperty<ObservableCollection<CommandViewModel>>(
        ToolbarService, 'VisibleCommands',
        undefined as unknown as ObservableCollection<CommandViewModel>, MetaData.None);

    // Cache one VM per definition — rebuilt filtering swaps which are in
    // VisibleCommands, but the VM (and its RelayCommand the button binds) is
    // stable, so a tab switch doesn't churn command instances.
    private readonly _vmById = new Map<string, CommandViewModel>();
    private readonly _host: DocumentsContentHostService | undefined;
    private readonly _requery = (): void => this.RaiseAll();

    constructor(provider: IServiceProvider)
    {
        super(provider);
        this.set_property_value(ToolbarService.VisibleCommandsKey, new ObservableCollection<CommandViewModel>());

        // Track the active document. The host is registered under
        // ContentHostService.Key; only a DocumentsContentHostService carries an
        // ActiveDocument, so a plain host leaves the toolbar empty.
        const host = this.Provider.get(ContentHostService.Key);
        if (host instanceof DocumentsContentHostService)
        {
            this._host = host;
            host.AddPropertyChangedListener(
                DocumentsContentHostService.ActiveDocumentKey, () => this.OnActiveDocumentChanged());
        }

        // Bridge the global requery pulse to our VM commands.
        CommandManager.SubscribeRequerySuggested(this._requery);

        this.Rebuild();
    }

    public get VisibleCommands(): ObservableCollection<CommandViewModel>
    {
        return this.get_property_value(ToolbarService.VisibleCommandsKey);
    }

    // Detach the global-pulse subscription when this scoped service is torn down.
    public override Dispose(): void
    {
        CommandManager.UnsubscribeRequerySuggested(this._requery);
        super.Dispose();
    }

    private OnActiveDocumentChanged(): void
    {
        this.Rebuild();
        this.RaiseAll();
    }

    // The active document, if it handles commands. undefined when nothing is
    // active or the active document isn't a command target (e.g. a settings page).
    private ActiveTarget(): ICommandTarget | undefined
    {
        const doc = this._host?.ActiveDocument;
        return isCommandTarget(doc) ? doc : undefined;
    }

    // Recompute VisibleCommands: the registry filtered by the active target's
    // contexts, ordered by Group then Order, mapped to cached VMs.
    private Rebuild(): void
    {
        const visible = this.VisibleCommands;
        visible.Clear();

        const target = this.ActiveTarget();
        if (target === undefined) return;

        const registry = this.Provider.get(CommandRegistry.Key);
        if (registry === undefined) return;

        const contexts = target.CommandContexts;
        const matched: CommandDefinition[] = [];
        for (const def of registry.Commands)
        {
            if (def.Context !== undefined && contexts.includes(def.Context)) matched.push(def);
        }
        // Sort by Order globally (a module assigns order values that keep its
        // groups contiguous); Group is a secondary tiebreak + a tag for future
        // separator rendering.
        matched.sort((a, b) => a.Order - b.Order || a.Group.localeCompare(b.Group));
        for (const def of matched) visible.Add(this.VmFor(def));
    }

    private VmFor(def: CommandDefinition): CommandViewModel
    {
        let vm = this._vmById.get(def.Id);
        if (vm === undefined)
        {
            const command = new RelayCommand(
                () => this.Invoke(def),
                () => this.CanInvoke(def),
                { Text: def.Title });
            vm = new CommandViewModel(def, command);
            this._vmById.set(def.Id, vm);
        }
        return vm;
    }

    private Invoke(def: CommandDefinition): void
    {
        this.ActiveTarget()?.Execute(def);
    }

    private CanInvoke(def: CommandDefinition): boolean
    {
        return this.ActiveTarget()?.CanExecute(def) ?? false;
    }

    // Re-query every built VM command — the button command-sources re-read
    // CanExecute in response. Called on the RequerySuggested pulse and on
    // active-document change.
    private RaiseAll(): void
    {
        for (const vm of this._vmById.values())
        {
            (vm.Command as RelayCommand).RaiseCanExecuteChanged();
        }
    }
}
