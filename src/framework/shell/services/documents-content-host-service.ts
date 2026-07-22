import {
    type ICommand,
    MetaData,
    Model,
    ObservableCollection,
    RelayCommand,
    type IServiceProvider,
    type PropertyDescriptor,
} from '../../../runtime/index.js';
import { ContentHostService } from './content-host-service.js';

// A document the DocumentsContentHostService manages. The host owns the
// open-set + active-document lifecycle; the document owns its own identity,
// dirty state, and persistence. Kept minimal — an app's concrete document
// Model implements this and carries whatever payload it needs.
export interface IDocument
{
    // Stable identity — dedupes opens and locates a document to close. Two
    // opens of the same Id re-activate the existing document rather than
    // adding a duplicate.
    readonly Id: string;
    // Display label (a tab / title bar binds this).
    readonly Title: string;
    // Unsaved-changes flag — a dirty indicator / close prompt reads it.
    readonly IsDirty: boolean;
    // Persist this document. save() delegates here — the document owns the
    // actual IO (or delegates internally). May be async.
    Save(): void | Promise<void>;
}

// Content host that manages a workspace of open documents — the classic
// tabbed-document (TDI) shape. Extends ContentHostService: the ActiveDocument
// is what the base presents (View(ActiveDocument)), so the shell's content
// region shows the active document rendered through its DataTemplate. Register
// this against `ContentHostService.Key` to drive the region with documents
// instead of the plain single-object host; document commands resolve that same
// key and cast to this type to call Open / Close / Save.
export class DocumentsContentHostService extends ContentHostService
{
    // The open document set. A stable per-instance collection a tab strip
    // binds (`ItemsSource = $OpenDocuments`); the reference never changes, so
    // this DP only hands it back — mirrors NavigationService.Items.
    public static readonly OpenDocumentsKey = Model.RegisterProperty<ObservableCollection<IDocument>>(
        DocumentsContentHostService, 'OpenDocuments',
        undefined as unknown as ObservableCollection<IDocument>, MetaData.None);

    // The active document — what the host presents. Written through Open() /
    // Close(); a tab strip may also bind SelectedItem TwoWay to it. Every
    // write routes View() (see OnPropertyChanged), so activation and the
    // presented content stay in lock-step.
    public static readonly ActiveDocumentKey = Model.RegisterProperty<IDocument | undefined>(
        DocumentsContentHostService, 'ActiveDocument', undefined, MetaData.None);

    // Close a document by its Id — the command a tab strip's close button binds
    // (`Command = $service(ContentHostService).CloseDocumentCommand`,
    // `CommandParameter = $Id`). Takes the Id string (not the document) because
    // a per-item template can bind a plain path segment but has no binding for
    // "the whole DataContext object". Non-string / unknown-id parameters no-op.
    public static readonly CloseDocumentCommandKey = Model.RegisterProperty<ICommand>(
        DocumentsContentHostService, 'CloseDocumentCommand',
        undefined as unknown as ICommand, MetaData.None);

    // Close EVERY open document (the "Close All" tab-strip action). Parameterless
    // — a menu item binds `Command = $service(ContentHostService).CloseAllCommand`
    // with no CommandParameter. Ends with an empty open-set and no active
    // document, so the content region clears.
    public static readonly CloseAllCommandKey = Model.RegisterProperty<ICommand>(
        DocumentsContentHostService, 'CloseAllCommand',
        undefined as unknown as ICommand, MetaData.None);

    // Activate (make current) a document by its Id — the command an open-tabs
    // menu binds (`Command = $service(ContentHostService).ActivateDocumentCommand`,
    // `CommandParameter = $Id`) so clicking a tab entry switches to it. Takes the
    // Id string for the same reason as CloseDocumentCommand (a per-item template
    // binds a path segment, not the whole object). Unknown / non-string ids no-op.
    public static readonly ActivateDocumentCommandKey = Model.RegisterProperty<ICommand>(
        DocumentsContentHostService, 'ActivateDocumentCommand',
        undefined as unknown as ICommand, MetaData.None);

    constructor(provider: IServiceProvider)
    {
        super(provider);
        this.set_property_value(
            DocumentsContentHostService.OpenDocumentsKey, new ObservableCollection<IDocument>());
        this.set_property_value(
            DocumentsContentHostService.CloseDocumentCommandKey,
            new RelayCommand((id) => this.CloseById(id as string), undefined,
                { Text: 'Close', Description: 'Close this document.' }));
        this.set_property_value(
            DocumentsContentHostService.CloseAllCommandKey,
            new RelayCommand(() => this.CloseAll(), undefined,
                { Text: 'Close All', Description: 'Close all open documents.' }));
        this.set_property_value(
            DocumentsContentHostService.ActivateDocumentCommandKey,
            new RelayCommand((id) => this.ActivateById(id as string), undefined,
                { Text: 'Activate', Description: 'Switch to this document.' }));
    }

    public get CloseDocumentCommand(): ICommand
    {
        return this.get_property_value(DocumentsContentHostService.CloseDocumentCommandKey);
    }

    public get CloseAllCommand(): ICommand
    {
        return this.get_property_value(DocumentsContentHostService.CloseAllCommandKey);
    }

    public get ActivateDocumentCommand(): ICommand
    {
        return this.get_property_value(DocumentsContentHostService.ActivateDocumentCommandKey);
    }

    public get OpenDocuments(): ObservableCollection<IDocument>
    {
        return this.get_property_value(DocumentsContentHostService.OpenDocumentsKey);
    }

    public get ActiveDocument(): IDocument | undefined
    {
        return this.get_property_value(DocumentsContentHostService.ActiveDocumentKey);
    }
    // Settable so a TwoWay tab-strip SelectedItem binding can re-activate;
    // activation drives View() via OnPropertyChanged.
    public set ActiveDocument(doc: IDocument | undefined)
    {
        this.set_property_value(DocumentsContentHostService.ActiveDocumentKey, doc);
    }

    // Open a document: add it to the open set if new (dedupe by Id) and make
    // it active. Re-opening an already-open document just re-activates the
    // existing instance. Activation presents it via the base View().
    public Open(document: IDocument): void
    {
        const existing = this.find(document.Id);
        if (existing === undefined) this.OpenDocuments.Add(document);
        this.ActiveDocument = existing ?? document;
    }

    // Close a document: remove it from the open set. If it was active,
    // activate a neighbour (the one that shifts into its slot, else the last,
    // else none) so the region never strands on a closed document.
    public Close(document: IDocument): void
    {
        const index = this.OpenDocuments.IndexOf(document);
        if (index < 0) return;
        const wasActive = this.ActiveDocument === document;
        this.OpenDocuments.RemoveAt(index);
        if (!wasActive) return;
        const count = this.OpenDocuments.Count;
        this.ActiveDocument = count === 0
            ? undefined
            : this.OpenDocuments.Get(Math.min(index, count - 1));
    }

    // Persist a document (defaults to the active one). Delegates to the
    // document's own Save() — the host owns lifecycle, not IO. Returns the
    // Save() result so an async caller can await it. No-op when nothing is
    // active and no document is passed.
    public Save(document?: IDocument): void | Promise<void>
    {
        const target = document ?? this.ActiveDocument;
        return target?.Save();
    }

    // Close every open document. Iterates a snapshot so each removal goes
    // through Close() (keeping the neighbour-reactivation invariant per step);
    // the set ends empty and ActiveDocument settles to undefined. No-op when
    // nothing is open.
    public CloseAll(): void
    {
        for (const doc of [...this.OpenDocuments]) this.Close(doc);
    }

    // Activate the document with the given Id (the ActivateDocumentCommand
    // target) — makes it the ActiveDocument, which routes View(). No-op on an
    // unknown or non-string id.
    public ActivateById(id: string): void
    {
        if (typeof id !== 'string') return;
        const doc = this.find(id);
        if (doc !== undefined) this.ActiveDocument = doc;
    }

    // Close the document with the given Id (the CloseDocumentCommand target).
    // Silently no-ops on an unknown or non-string id.
    public CloseById(id: string): void
    {
        if (typeof id !== 'string') return;
        const doc = this.find(id);
        if (doc !== undefined) this.Close(doc);
    }

    private find(id: string): IDocument | undefined
    {
        for (let i = 0; i < this.OpenDocuments.Count; i++)
        {
            const doc = this.OpenDocuments.Get(i);
            if (doc?.Id === id) return doc;
        }
        return undefined;
    }

    protected override OnPropertyChanged(
        descriptor: PropertyDescriptor, oldValue: unknown, newValue: unknown): void
    {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        // ActiveDocument IS what the host presents — route it through the base
        // View() so the content region always tracks the active document.
        if (descriptor.Name === 'ActiveDocument')
        {
            this.View(newValue as IDocument | undefined);
        }
    }
}
