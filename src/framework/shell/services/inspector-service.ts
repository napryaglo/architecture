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
import type { IInspector } from './inspector.js';

// Backs the shell's Inspector region as a HOST for multiple inspectors that can
// be added and removed dynamically — the VS-style pinned, collapsible property
// stack. Anything in the app can resolve this service and Add() an inspector
// (e.g. a diagram's "Format Shape" command adds a DiagramInspector); the region
// binds `Content = $service(InspectorService)` and renders the Inspectors
// collection as a stack of titled, collapsible panels (each inspector's body via
// its own DataTemplate). Empty ⇒ the region collapses.
//
// Parallels DocumentsContentHostService (the multi-document editor group): a
// stable per-instance collection a view binds, plus Add / Close lifecycle. The
// difference is presentation — inspectors coexist as stacked panels, documents
// swap as tabs.
export class InspectorService extends ServiceBase
{
    public static readonly Key = new ServiceKey<InspectorService>('InspectorService');

    // The hosted inspector set. A stable per-instance collection the region's
    // InspectorStack binds (`ItemsSource = $Inspectors`); the reference never
    // changes, so this DP only hands it back — mirrors NavigationService.Items /
    // DocumentsContentHostService.OpenDocuments.
    public static readonly InspectorsKey = Model.RegisterProperty<ObservableCollection<IInspector>>(
        InspectorService, 'Inspectors',
        undefined as unknown as ObservableCollection<IInspector>, MetaData.None);

    // Add an inspector (dedupe by Id) — the command a "Format Shape"-style menu
    // item binds (`Command = $service(InspectorService).AddInspectorCommand,
    // CommandParameter = $Inspector`). Non-IInspector parameters no-op.
    public static readonly AddInspectorCommandKey = Model.RegisterProperty<ICommand>(
        InspectorService, 'AddInspectorCommand',
        undefined as unknown as ICommand, MetaData.None);

    // Close an inspector by Id — the command a panel's close affordance binds
    // (`Command = $service(InspectorService).CloseInspectorCommand,
    // CommandParameter = $Id`). Mirrors DocumentsContentHostService's
    // CloseDocumentCommand: a per-panel template binds a plain path segment (the
    // Id) rather than the whole DataContext object.
    public static readonly CloseInspectorCommandKey = Model.RegisterProperty<ICommand>(
        InspectorService, 'CloseInspectorCommand',
        undefined as unknown as ICommand, MetaData.None);

    constructor(provider: IServiceProvider)
    {
        super(provider);
        this.set_property_value(
            InspectorService.InspectorsKey, new ObservableCollection<IInspector>());
        this.set_property_value(
            InspectorService.AddInspectorCommandKey,
            new RelayCommand((i) => { if (isInspector(i)) this.Add(i); }, undefined,
                { Text: 'Add Inspector', Description: 'Show an inspector panel.' }));
        this.set_property_value(
            InspectorService.CloseInspectorCommandKey,
            new RelayCommand((id) => this.CloseById(id as string), undefined,
                { Text: 'Close', Description: 'Close this inspector panel.' }));
    }

    public get Inspectors(): ObservableCollection<IInspector>
    {
        return this.get_property_value(InspectorService.InspectorsKey);
    }

    public get AddInspectorCommand(): ICommand
    {
        return this.get_property_value(InspectorService.AddInspectorCommandKey);
    }

    public get CloseInspectorCommand(): ICommand
    {
        return this.get_property_value(InspectorService.CloseInspectorCommandKey);
    }

    // Add an inspector, deduping by Id. When an inspector with the same Id is
    // already hosted, the existing instance is re-surfaced (expanded) and
    // returned — invoking "Format Shape" twice re-opens the one panel rather
    // than stacking a duplicate. Otherwise the inspector is appended. Returns
    // the instance actually hosted (existing on dedupe, else the argument).
    public Add(inspector: IInspector): IInspector
    {
        const existing = this.find(inspector.Id);
        if (existing !== undefined)
        {
            existing.IsExpanded = true;
            return existing;
        }
        this.Inspectors.Add(inspector);
        return inspector;
    }

    // Remove a hosted inspector. No-op when it isn't hosted.
    public Remove(inspector: IInspector): void
    {
        const index = this.Inspectors.IndexOf(inspector);
        if (index >= 0) this.Inspectors.RemoveAt(index);
    }

    // Close the inspector with the given Id (the CloseInspectorCommand target).
    // Silently no-ops on an unknown or non-string id.
    public CloseById(id: string): void
    {
        if (typeof id !== 'string') return;
        const inspector = this.find(id);
        if (inspector !== undefined) this.Remove(inspector);
    }

    // Remove every hosted inspector — the region collapses to its empty state.
    public Clear(): void
    {
        this.Inspectors.Clear();
    }

    private find(id: string): IInspector | undefined
    {
        for (let i = 0; i < this.Inspectors.Count; i++)
        {
            const inspector = this.Inspectors.Get(i);
            if (inspector?.Id === id) return inspector;
        }
        return undefined;
    }
}

// Duck-typed IInspector guard for the AddInspectorCommand parameter (a markup
// CommandParameter arrives as `unknown`). An inspector carries a string Id +
// Title and a boolean IsExpanded.
function isInspector(value: unknown): value is IInspector
{
    return value !== null
        && typeof value === 'object'
        && typeof (value as IInspector).Id === 'string'
        && typeof (value as IInspector).Title === 'string';
}
