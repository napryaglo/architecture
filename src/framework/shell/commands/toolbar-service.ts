import {
    ApplicationService,
    MetaData,
    Model,
    ObservableCollection,
    RelayCommand,
    ServiceBase,
    ServiceKey,
    type IServiceProvider,
    type ServiceToken,
} from '../../../runtime/index.js';
import type { Geometry } from '../../../visual-engine/index.js';
import { CommandManager } from '../../commands/command-manager.js';
import { ContentHostService } from '../services/content-host-service.js';
import { DocumentsContentHostService } from '../services/documents-content-host-service.js';
import { CommandRegistry } from './command-registry.js';
import { CommandDefinition, CommandGroupPresentation } from './command-definition.js';
import { ShellRegion } from './shell-control-definition.js';
import { StatusService } from '../services/status-service.js';
import { CommandToggleViewModel, CommandViewModel } from './command-view-model.js';
import {
    ShellControlViewModel,
    ToolbarFlatGroup,
    ToolbarSeparatorItem,
    ToolbarSplitGridGroup,
    ToolbarSplitMenuGroup,
    ToolbarToggleGroup,
    type ToolbarEntryViewModel,
    type ToolbarGroupViewModel,
} from './toolbar-group-view-model.js';
import { ShellModule } from '../module.js';
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

    // The render list the shell command bar binds: command GROUPS (Flat /
    // SplitMenu / SplitGrid / Toggles) and editor CONTROLS interleaved by Order.
    // Each entry is a ToolbarEntryViewModel subclass the shell dispatches on by
    // type. VisibleCommands stays the flat projection for callers that want the
    // ungrouped command set.
    public static readonly VisibleEntriesKey = Model.RegisterProperty<ObservableCollection<ToolbarEntryViewModel>>(
        ToolbarService, 'VisibleEntries',
        undefined as unknown as ObservableCollection<ToolbarEntryViewModel>, MetaData.None);

    // The FLAT render list the shell command bar's single ToolBar binds. Same
    // entries as VisibleEntries, but Flat / Toggles groups are EXPANDED into their
    // individual command VMs (CommandViewModel / CommandToggleViewModel) and a
    // ToolbarSeparatorItem is inserted between adjacent top-level entries. The one
    // ToolBar then draws each group's buttons as a connected pill (its Position
    // assignment) with the separators marking group boundaries — the WPF
    // ToolBar-with-groups look. Split groups and editor controls ride as single
    // items (their own DataTemplate). VisibleEntries stays the GROUPED projection
    // for callers that want one VM per group.
    public static readonly ToolbarItemsKey = Model.RegisterProperty<ObservableCollection<Model>>(
        ToolbarService, 'ToolbarItems',
        undefined as unknown as ObservableCollection<Model>, MetaData.None);

    // The Toolbar-region editor CONTROLS (font pickers, …), Order-sorted. Rendered
    // in a FIXED region beside the command ToolBar — NOT inside it. A ToolBar
    // overflows its trailing items into a popup and re-parents items across layout
    // passes; a wide interactive editor doesn't survive that (it would vanish into
    // the overflow chevron and its hit-testing breaks). So controls live here and
    // the command groups live in ToolbarItems.
    public static readonly ToolbarControlsKey = Model.RegisterProperty<ObservableCollection<ShellControlViewModel>>(
        ToolbarService, 'ToolbarControls',
        undefined as unknown as ObservableCollection<ShellControlViewModel>, MetaData.None);

    // Cache one VM per definition — rebuilt filtering swaps which are in
    // VisibleCommands, but the VM (and its RelayCommand the button binds) is
    // stable, so a tab switch doesn't churn command instances.
    private readonly _vmById = new Map<string, CommandViewModel>();
    private readonly _host: DocumentsContentHostService | undefined;
    private readonly _requery = (): void => this.RaiseAll();
    // The status-bar cells this service currently owns in StatusService.Items.
    private _statusVMs: ShellControlViewModel[] = [];

    constructor(provider: IServiceProvider)
    {
        super(provider);
        this.set_property_value(ToolbarService.VisibleCommandsKey, new ObservableCollection<CommandViewModel>());
        this.set_property_value(ToolbarService.VisibleEntriesKey, new ObservableCollection<ToolbarEntryViewModel>());
        this.set_property_value(ToolbarService.ToolbarItemsKey, new ObservableCollection<Model>());
        this.set_property_value(ToolbarService.ToolbarControlsKey, new ObservableCollection<ShellControlViewModel>());

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

    public get VisibleEntries(): ObservableCollection<ToolbarEntryViewModel>
    {
        return this.get_property_value(ToolbarService.VisibleEntriesKey);
    }

    public get ToolbarItems(): ObservableCollection<Model>
    {
        return this.get_property_value(ToolbarService.ToolbarItemsKey);
    }

    public get ToolbarControls(): ObservableCollection<ShellControlViewModel>
    {
        return this.get_property_value(ToolbarService.ToolbarControlsKey);
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
        const visible  = this.VisibleCommands;
        const entries  = this.VisibleEntries;
        const items    = this.ToolbarItems;
        const controls = this.ToolbarControls;
        visible.Clear();
        entries.Clear();
        items.Clear();
        controls.Clear();

        const target = this.ActiveTarget();
        this.SyncStatusItems(target);
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
        // groups contiguous); Group is a secondary tiebreak so a group's members
        // stay together and in order.
        matched.sort((a, b) => a.Order - b.Order || a.Group.localeCompare(b.Group));

        // Cluster into presentation groups ONCE. Both the grouped VisibleEntries
        // projection and the flat ToolbarItems render list derive from these.
        const clusters = this.ClusterGroups(matched);

        // VisibleCommands — the flat, ungrouped projection (cached VMs, Order
        // sorted). Every matched def now has a VM (ClusterGroups made them).
        for (const def of matched) visible.Add(this.VmFor(def));

        // Interleave command GROUPS and editor CONTROLS in one Order-sorted list.
        // A group's Order is its first (lowest-Order) member's; a control's is its
        // own. A stable sort keeps groups/controls sharing an Order in declaration
        // order.
        const ordered: OrderedEntry[] = [];
        for (const c of clusters) ordered.push({ order: c.order, kind: 'group', cluster: c });
        for (const ctl of this.BuildControls(contexts)) ordered.push({ order: ctl.order, kind: 'control', control: ctl.vm });
        ordered.sort((a, b) => a.order - b.order);

        // Grouped projection: one VM per group + each control (interleaved by
        // Order — unchanged; the shell's old command host and callers rely on it).
        for (const e of ordered) entries.Add(e.kind === 'group' ? e.cluster.group : e.control);

        // Flat command projection (the command ToolBar) — command GROUPS only:
        // Flat / Toggles groups expand into their command VMs, split groups ride as
        // one item, and a separator sits between adjacent groups (the visible
        // divider AND the ToolBar's connected-run boundary — see
        // ToolbarSeparatorItem). Editor CONTROLS are NOT here; they go to
        // ToolbarControls (rendered outside the overflow ToolBar).
        let first = true;
        for (const e of ordered)
        {
            if (e.kind !== 'group') continue;
            if (!first) items.Add(new ToolbarSeparatorItem());
            first = false;

            if (e.cluster.presentation === CommandGroupPresentation.Flat
             || e.cluster.presentation === CommandGroupPresentation.Toggles)
            {
                for (const vm of e.cluster.commandVms) items.Add(vm);
            }
            else
            {
                items.Add(e.cluster.group);
            }
        }

        // Editor controls, in the same Order sequence, for the fixed control region.
        for (const e of ordered) if (e.kind === 'control') controls.Add(e.control);

        this.RefreshActiveStates();
    }

    // Cluster the (already Order-sorted) definitions into presentation groups.
    // A group's presentation + dropdown face come from its LEADER — the first
    // member whose Presentation is non-Flat; a group with no such member stays
    // Flat. Encounter order follows the global Order sort. Returns the built group
    // VM AND its member command VMs + presentation, so callers can render either
    // the grouped face (VisibleEntries) or the expanded buttons (ToolbarItems)
    // without re-clustering. Toggles-group members are built as
    // CommandToggleViewModels so the flat stream resolves the toggle template.
    private ClusterGroups(matched: readonly CommandDefinition[]): GroupCluster[]
    {
        const order: string[] = [];
        const members = new Map<string, CommandDefinition[]>();
        for (const def of matched)
        {
            let bucket = members.get(def.Group);
            if (bucket === undefined) { bucket = []; members.set(def.Group, bucket); order.push(def.Group); }
            bucket.push(def);
        }

        const out: GroupCluster[] = [];
        for (const group of order)
        {
            const defs = members.get(group)!;
            const leader = defs.find(d => d.Presentation !== CommandGroupPresentation.Flat);
            const presentation = leader?.Presentation ?? CommandGroupPresentation.Flat;
            const isToggle = presentation === CommandGroupPresentation.Toggles;

            const commandVms = defs.map(def => this.VmFor(def, isToggle));
            const items = new ObservableCollection<CommandViewModel>();
            for (const vm of commandVms) items.Add(vm);

            const icon    = leader?.GroupIcon ?? leader?.Icon;
            const title   = (leader?.GroupTitle ?? '') !== '' ? leader!.GroupTitle : (leader?.Title ?? '');
            const columns = leader?.Columns ?? 0;

            out.push({
                order: defs[0]!.Order,
                presentation,
                group: this.MakeGroup(presentation, items, icon, title, columns),
                commandVms,
            });
        }
        return out;
    }

    // Gather the modules' toolbar CONTROLS visible for the active document (Context
    // in the active contexts), each bound to the active document as its DataContext.
    private BuildControls(contexts: readonly ServiceToken<unknown>[]): { order: number; vm: ShellControlViewModel }[]
    {
        const out: { order: number; vm: ShellControlViewModel }[] = [];
        const app = this.Provider.get(ApplicationService.Key);
        if (app === undefined) return out;
        const doc = this._host?.ActiveDocument;
        for (const module of app.Modules)
        {
            for (const def of (module as ShellModule).ShellControls)
            {
                if (def.Region === ShellRegion.Toolbar
                 && def.Context !== undefined && contexts.includes(def.Context))
                {
                    out.push({ order: def.Order, vm: new ShellControlViewModel(def.Template, doc) });
                }
            }
        }
        return out;
    }

    // StatusBar-region toolbar controls go into the StatusService's Items so the
    // shell status bar renders them (bound to the active document, like the toolbar
    // controls). We own only the cells WE add — tracked in `_statusVMs` and removed
    // on the next rebuild — so app-posted status cells are left untouched.
    private SyncStatusItems(target: ICommandTarget | undefined): void
    {
        const status = this.Provider.get(StatusService.Key);
        if (status === undefined) return;

        for (const vm of this._statusVMs)
        {
            const i = status.Items.IndexOf(vm);
            if (i >= 0) status.Items.RemoveAt(i);
        }
        this._statusVMs = [];

        if (target === undefined) return;
        const app = this.Provider.get(ApplicationService.Key);
        if (app === undefined) return;
        const contexts = target.CommandContexts;
        const doc = this._host?.ActiveDocument;
        for (const module of app.Modules)
        {
            for (const def of (module as ShellModule).ShellControls)
            {
                if (def.Region === ShellRegion.StatusBar
                 && def.Context !== undefined && contexts.includes(def.Context))
                {
                    const vm = new ShellControlViewModel(def.Template, doc);
                    status.Items.Add(vm);
                    this._statusVMs.push(vm);
                }
            }
        }
    }

    private MakeGroup(
        presentation: CommandGroupPresentation,
        items: ObservableCollection<CommandViewModel>,
        icon: Geometry | undefined,
        title: string,
        columns: number,
    ): ToolbarGroupViewModel
    {
        switch (presentation)
        {
            case CommandGroupPresentation.SplitMenu: return new ToolbarSplitMenuGroup(items, icon, title, columns);
            case CommandGroupPresentation.SplitGrid: return new ToolbarSplitGridGroup(items, icon, title, columns);
            case CommandGroupPresentation.Toggles:   return new ToolbarToggleGroup(items, icon, title, columns);
            default:                                 return new ToolbarFlatGroup(items, icon, title, columns);
        }
    }

    // Sync every built VM's IsActive from the active target's optional IsActive
    // query. Called whenever CanExecute is re-queried (requery pulse / active-doc
    // change) so a Toggles button's checked state tracks the live selection.
    private RefreshActiveStates(): void
    {
        const target = this.ActiveTarget();
        for (const vm of this._vmById.values())
        {
            vm.IsActive = target?.IsActive?.(vm.Definition) ?? false;
        }
    }

    // Get (or build + cache) the VM for a definition. `isToggle` picks the flavor
    // on FIRST build — a command lives in exactly one group whose presentation is
    // static, so the cached instance's type is stable across rebuilds; the flag is
    // ignored on a cache hit.
    private VmFor(def: CommandDefinition, isToggle = false): CommandViewModel
    {
        let vm = this._vmById.get(def.Id);
        if (vm === undefined)
        {
            const command = new RelayCommand(
                () => this.Invoke(def),
                () => this.CanInvoke(def),
                { Text: def.Title });
            vm = isToggle
                ? new CommandToggleViewModel(def, command)
                : new CommandViewModel(def, command);
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
        // A selection change (the usual requery trigger) also flips toggle state.
        this.RefreshActiveStates();
    }
}

// One clustered command group — the built group VM (for VisibleEntries), the
// member command VMs (for the flat ToolbarItems expansion), and the presentation
// (decides whether the flat stream expands the members or keeps the group face).
interface GroupCluster
{
    readonly order: number;
    readonly presentation: CommandGroupPresentation;
    readonly group: ToolbarGroupViewModel;
    readonly commandVms: CommandViewModel[];
}

// A top-level command-bar entry in Order space: either a clustered command group
// or a single editor control. Both projections (grouped VisibleEntries / flat
// ToolbarItems) walk the same Order-sorted list of these.
type OrderedEntry =
    | { readonly order: number; readonly kind: 'group';   readonly cluster: GroupCluster }
    | { readonly order: number; readonly kind: 'control'; readonly control: ShellControlViewModel };
