import {
    type ICommand,
    type IServiceProvider,
    MetaData,
    Model,
    ObservableCollection,
    RelayCommand,
    ServiceBase,
    ServiceKey,
} from '../../../runtime/index.js';
import type { IDockPanel } from './dock-panel.js';

// Backs the shell's right-side tabbed dock: a HOST for multiple panels
// (agent chat, inspectors, …) shown as tabs. Anything in the app resolves this
// service and Add()s a panel; the region binds `Content = $service(PanelDockService)`
// and renders the Panels as a TabControl whose header strip lists the panels and
// whose body shows SelectedPanel through its own DataTemplate. Empty ⇒ the region
// collapses.
//
// Parallels InspectorService (the retired stack host) and
// DocumentsContentHostService (the editor group): a stable per-instance
// collection a view binds, plus Add/Close lifecycle. The difference from the old
// inspector stack is presentation (tabs, one SelectedPanel) instead of a
// simultaneous stack.
export class PanelDockService extends ServiceBase
{
    public static readonly Key = new ServiceKey<PanelDockService>('PanelDockService');

    // The hosted panel set — a stable per-instance collection the region's
    // TabControl binds (`ItemsSource = $Panels`); the reference never changes.
    public static readonly PanelsKey = Model.RegisterProperty<ObservableCollection<IDockPanel>>(
        PanelDockService, 'Panels',
        undefined as unknown as ObservableCollection<IDockPanel>, MetaData.None);

    // The active tab — TwoWay-bound to TabControl.SelectedItem so clicking a tab
    // updates it and Add()/Close() re-select programmatically.
    public static readonly SelectedPanelKey = Model.RegisterProperty<IDockPanel | undefined>(
        PanelDockService, 'SelectedPanel', undefined, MetaData.None | MetaData.BindsTwoWayByDefault);

    // True while at least one panel is hosted — the region binds its Visibility
    // (and its resize Splitter's) to this so an empty dock collapses out of layout.
    private static readonly _HasPanelsPriv = Model.RegisterReadOnlyProperty<boolean>(
        PanelDockService, 'HasPanels', false, MetaData.None);
    public static readonly HasPanelsKey = PanelDockService._HasPanelsPriv;

    // Command a menu binds to open a panel (`Command = $service(PanelDockService)
    // .AddPanelCommand, CommandParameter = $Panel`). Non-IDockPanel params no-op.
    public static readonly AddPanelCommandKey = Model.RegisterProperty<ICommand>(
        PanelDockService, 'AddPanelCommand', undefined as unknown as ICommand, MetaData.None);

    // Command a tab's close affordance binds (`CommandParameter = $Id`).
    public static readonly ClosePanelCommandKey = Model.RegisterProperty<ICommand>(
        PanelDockService, 'ClosePanelCommand', undefined as unknown as ICommand, MetaData.None);

    constructor(provider: IServiceProvider)
    {
        super(provider);
        const panels = new ObservableCollection<IDockPanel>();
        this.set_property_value(PanelDockService.PanelsKey, panels);
        panels.Subscribe(() => this.refreshHasPanels());
        this.set_property_value(
            PanelDockService.AddPanelCommandKey,
            new RelayCommand((p) => { if (isDockPanel(p)) this.Add(p); }, undefined,
                { Text: 'Add Panel', Description: 'Show a panel in the dock.' }));
        this.set_property_value(
            PanelDockService.ClosePanelCommandKey,
            new RelayCommand((id) => this.CloseById(id as string), undefined,
                { Text: 'Close', Description: 'Close this dock panel.' }));
    }

    public get Panels(): ObservableCollection<IDockPanel> { return this.get_property_value(PanelDockService.PanelsKey); }
    public get SelectedPanel(): IDockPanel | undefined { return this.get_property_value(PanelDockService.SelectedPanelKey); }
    public set SelectedPanel(v: IDockPanel | undefined) { this.set_property_value(PanelDockService.SelectedPanelKey, v); }
    public get HasPanels(): boolean { return this.get_property_value(PanelDockService.HasPanelsKey); }
    public get AddPanelCommand(): ICommand { return this.get_property_value(PanelDockService.AddPanelCommandKey); }
    public get ClosePanelCommand(): ICommand { return this.get_property_value(PanelDockService.ClosePanelCommandKey); }

    private refreshHasPanels(): void
    {
        this.set_property_value_with_key(PanelDockService._HasPanelsPriv, this.Panels.Count > 0);
    }

    // Add a panel, deduping by Id. Existing Id → re-select the existing instance
    // and return it. Otherwise append. Either way SelectedPanel ends on the
    // added-or-existing panel so opening a panel surfaces its tab.
    public Add(panel: IDockPanel): IDockPanel
    {
        const existing = this.find(panel.Id);
        if (existing !== undefined) { this.SelectedPanel = existing; return existing; }
        this.Panels.Add(panel);
        this.SelectedPanel = panel;
        return panel;
    }

    // Remove a hosted panel. When it was the selection, fall back to an adjacent
    // survivor (or undefined when none remain).
    public Remove(panel: IDockPanel): void
    {
        const index = this.Panels.IndexOf(panel);
        if (index < 0) return;
        const wasSelected = this.SelectedPanel === panel;
        this.Panels.RemoveAt(index);
        if (wasSelected)
        {
            const next = this.Panels.Count === 0
                ? undefined
                : this.Panels.Get(Math.min(index, this.Panels.Count - 1));
            this.SelectedPanel = next;
        }
    }

    public CloseById(id: string): void
    {
        if (typeof id !== 'string') return;
        const panel = this.find(id);
        if (panel !== undefined) this.Remove(panel);
    }

    public Clear(): void
    {
        this.Panels.Clear();
        this.SelectedPanel = undefined;
    }

    private find(id: string): IDockPanel | undefined
    {
        for (let i = 0; i < this.Panels.Count; i++)
        {
            const p = this.Panels.Get(i);
            if (p?.Id === id) return p;
        }
        return undefined;
    }
}

function isDockPanel(value: unknown): value is IDockPanel
{
    return value !== null
        && typeof value === 'object'
        && typeof (value as IDockPanel).Id === 'string'
        && typeof (value as IDockPanel).Title === 'string';
}
