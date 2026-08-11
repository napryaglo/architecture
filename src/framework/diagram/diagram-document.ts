import {
    type ICommand,
    MetaData,
    Model,
    ObservableCollection,
    type PropertyDescriptor,
    RelayCommand,
    ServiceKey,
    type ServiceToken,
} from '../../runtime/index.js';
import { Point, TextAlignment } from '../../visual-engine/index.js';
import { Figure } from './figure.js';
import { Group } from './group.js';
import { NodeViewModel } from './node-view-model.js';
import { ShapeNodeVM } from './shape-node-vm.js';
import { TextNodeVM } from './text-node-vm.js';
import { CalloutNodeVM } from './callout-node-vm.js';
import { SHAPE_CATALOG_MAP, mergeShapes } from './shape-catalog.js';
import { serializerFor, serializerByType, type NodeBaseRecord } from './node-serialization.js';
// Importing node-serializers-default.js registers the built-in
// 'shape' / 'text' / 'callout' serializers as a side effect and
// also exports the text helpers used by connector serialization.
import {
    serializeShapeText,
    applySerializedText,
    type SerializedText,
} from './node-serializers-default.js';
import { GeometryCombineMode } from './commands/combine.js';
import type { DiagramMutator } from './behaviors/attach-standard-mutations.js';
import { Connector } from './connector.js';
import { waypoint } from './route-waypoint.js';
import { ConnectorEndpoint } from './connector-endpoint.js';
import type { IDocument } from '../shell/services/documents-content-host-service.js';
import type { ICommandTarget } from '../shell/commands/command-target.js';
import type { CommandDefinition } from '../shell/commands/command-definition.js';
import { DiagramEditingContext, DiagramCommandId } from './diagram-command-contexts.js';
import { DiagramInspector } from './diagram-inspector.js';
import type { IFontFormatSink } from './font-format-sink.js';
import { Diagram } from './diagram.js';

// Minimal storage contract Diagram.Save / Load wire against. Subset of
// the Web Storage API (localStorage / sessionStorage). Demos plug in
// whichever backend suits.
export interface DiagramStorage
{
    GetItem(key: string): string | null;
    SetItem(key: string, value: string): void;
}

// Service token for the diagram persistence backend. The composition
// root (the app/platform bootstrap) registers a concrete DiagramStorage
// implementation against this on Application.current.Services; demo
// factories resolve it to inject into a DiagramDocument instead of each
// hand-rolling its own localStorage object. A real exported token, not
// a string.
export const DiagramStorageKey = new ServiceKey<DiagramStorage>('DiagramStorage');

// V2 node record — typed registry format.
// `type`  = stable serializer tag ('shape' | 'text' | 'callout' | …)
// `data`  = type-specific payload; exact fields are owned by each NodeSerializer.
//
// Legacy (V1) nodes have no `type` field and carry flat fields (`kind`, `d`,
// `text`, `leaderTargetId`).  _deserialize tolerates both shapes.
interface SerializedNode
{
    // V2 fields (typed registry).
    readonly type?: string;
    readonly data?: Record<string, unknown>;

    // V1 legacy fields (flat format — kept for backward compat).
    readonly id:             string;
    readonly left:           number;
    readonly top:            number;
    readonly w:              number;
    readonly h:              number;
    // V1-only geometry/kind fields.
    readonly kind?:          string;
    readonly d?:             string;
    readonly text?:          SerializedText;
    readonly leaderTargetId?: string;
}

// (serializeShapeText, applySerializedText, placeNode are now imported from
// node-serializers-default.ts so the built-in NodeSerializer registrations
// can use them without a circular dependency.)

interface SerializedConnectorEndpoint
{
    readonly nodeId?:   string;
    readonly portName?: string;
    readonly freeX?:    number;
    readonly freeY?:    number;
}

interface SerializedConnector
{
    readonly source:      SerializedConnectorEndpoint;
    readonly target:      SerializedConnectorEndpoint;
    readonly waypoints?:  ReadonlyArray<{ readonly x: number; readonly y: number; readonly userAltered?: boolean }>;
    readonly routingMode?: string;
    // Connector label (Slice 5). `text` reuses the node text block form;
    // `labelPos` is the arc-length fraction, omitted when the default 0.5.
    readonly text?:       SerializedText;
    readonly labelPos?:   number;
}

interface SerializedDiagram
{
    readonly nodes:       readonly SerializedNode[];
    readonly connectors?: readonly SerializedConnector[];
    readonly nextId:      number;
}

const STORAGE_KEY = 'mural-diagram-state-v1';

// The contexts a diagram document activates — just DiagramEditingContext (the
// toolbar shows the align/distribute/group/combine commands while a diagram is
// the active document). Frozen: it is the live CommandContexts a ToolbarService
// reads; a document that varied contexts by mode would return a different array.
const DIAGRAM_COMMAND_CONTEXTS: readonly ServiceToken<unknown>[] = Object.freeze([DiagramEditingContext]);

// Maps each diagram command id → the Diagram control command that performs it.
// DiagramDocument.Execute / CanExecute resolve through this against the currently
// published ActiveView, so the commands stay where they naturally live (the
// control, driven by view selection) while the document is the dispatch target.
const DIAGRAM_COMMAND_GETTERS: ReadonlyMap<string, (v: Diagram) => ICommand | undefined> = new Map<string, (v: Diagram) => ICommand | undefined>([
    [DiagramCommandId.AlignLeft,            (v) => v.AlignLeftCommand],
    [DiagramCommandId.AlignRight,           (v) => v.AlignRightCommand],
    [DiagramCommandId.AlignTop,             (v) => v.AlignTopCommand],
    [DiagramCommandId.AlignMiddle,          (v) => v.AlignMiddleCommand],
    [DiagramCommandId.AlignCenter,          (v) => v.AlignCenterCommand],
    [DiagramCommandId.DistributeHorizontal, (v) => v.DistributeHorizontalCommand],
    [DiagramCommandId.DistributeVertical,   (v) => v.DistributeVerticalCommand],
    [DiagramCommandId.Group,                (v) => v.GroupCommand],
    [DiagramCommandId.Ungroup,              (v) => v.UngroupCommand],
    [DiagramCommandId.CombineUnion,         (v) => v.CombineUnionCommand],
    [DiagramCommandId.CombineIntersect,     (v) => v.CombineIntersectCommand],
    [DiagramCommandId.CombineSubtract,      (v) => v.CombineSubtractCommand],
    [DiagramCommandId.CombineExclude,       (v) => v.CombineExcludeCommand],
    [DiagramCommandId.TextAlignLeft,        (v) => v.SetTextAlignLeftCommand],
    [DiagramCommandId.TextAlignCenter,      (v) => v.SetTextAlignCenterCommand],
    [DiagramCommandId.TextAlignRight,       (v) => v.SetTextAlignRightCommand],
    [DiagramCommandId.TextAlignJustify,     (v) => v.SetTextAlignJustifyCommand],
    [DiagramCommandId.TextPlaceTopLeft,     (v) => v.SetTextPlacementTopLeftCommand],
    [DiagramCommandId.TextPlaceTop,         (v) => v.SetTextPlacementTopCommand],
    [DiagramCommandId.TextPlaceTopRight,    (v) => v.SetTextPlacementTopRightCommand],
    [DiagramCommandId.TextPlaceLeft,        (v) => v.SetTextPlacementLeftCommand],
    [DiagramCommandId.TextPlaceCenter,      (v) => v.SetTextPlacementCenterCommand],
    [DiagramCommandId.TextPlaceRight,       (v) => v.SetTextPlacementRightCommand],
    [DiagramCommandId.TextPlaceBottomLeft,  (v) => v.SetTextPlacementBottomLeftCommand],
    [DiagramCommandId.TextPlaceBottom,      (v) => v.SetTextPlacementBottomCommand],
    [DiagramCommandId.TextPlaceBottomRight, (v) => v.SetTextPlacementBottomRightCommand],
    [DiagramCommandId.TextBold,             (v) => v.SetTextBoldCommand],
    [DiagramCommandId.TextItalic,           (v) => v.SetTextItalicCommand],
    [DiagramCommandId.TextUnderline,        (v) => v.SetTextUnderlineCommand],
    [DiagramCommandId.TextStrikethrough,    (v) => v.SetTextStrikethroughCommand],
    [DiagramCommandId.TextSizeIncrease,     (v) => v.IncreaseFontSizeCommand],
    [DiagramCommandId.TextSizeDecrease,     (v) => v.DecreaseFontSizeCommand],
]);

// Active-state predicates for the Toggles-presentation commands — the paragraph
// alignment and character-decoration toggles. DiagramDocument.IsActive resolves
// through this against the published ActiveView so a toolbar toggle's IsChecked
// reflects the current selection's text state (the same Selection* DPs the
// diagram demo binds directly). Commands absent here are never "active".
const DIAGRAM_COMMAND_ACTIVE: ReadonlyMap<string, (v: Diagram) => boolean> = new Map<string, (v: Diagram) => boolean>([
    [DiagramCommandId.TextAlignLeft,     (v) => v.SelectionTextAlignment === TextAlignment.Left],
    [DiagramCommandId.TextAlignCenter,   (v) => v.SelectionTextAlignment === TextAlignment.Center],
    [DiagramCommandId.TextAlignRight,    (v) => v.SelectionTextAlignment === TextAlignment.Right],
    [DiagramCommandId.TextAlignJustify,  (v) => v.SelectionTextAlignment === TextAlignment.Justify],
    [DiagramCommandId.TextBold,          (v) => v.SelectionBold],
    [DiagramCommandId.TextItalic,        (v) => v.SelectionItalic],
    [DiagramCommandId.TextUnderline,     (v) => v.SelectionUnderline],
    [DiagramCommandId.TextStrikethrough, (v) => v.SelectionStrikethrough],
]);

// Monotonic per-session document id source. Every DiagramDocument gets a
// stable, unique Id so DocumentsContentHostService can dedupe opens and locate
// a document to close (IDocument.Id contract). Not persisted — ids are only
// meaningful within a running session's open-set.
let _diagramDocSeq = 0;

// Top-level Document for a diagrammer-style workspace. Owns the flat
// `Nodes` collection (Figures + Groups),
// status feedback, Save / Load commands, and the structural mutation
// methods (Group / Ungroup / Combine / Delete / Place) the framework
// Diagram routes its gesture events to.
//
// DiagramDocument IS a `DiagramMutator` structurally — set it as the
// Diagram's DataContext and the Diagram auto-wires Mutator off the
// DC (no explicit `Mutator=…` binding needed). GroupRequested /
// UngroupRequested / CombineRequested / DeleteRequested / ItemDropped
// then route directly here.
//
// Customise by subclassing (override CreateNode for custom Figure
// shapes, etc.) or by composing — the Document doesn't lock methods
// down.
export class DiagramDocument extends Model implements DiagramMutator, IDocument, ICommandTarget, IFontFormatSink
{
    // ── IDocument surface — lets a DocumentsContentHostService host this
    // document (open-set dedupe, tab title, dirty indicator, Save). ──
    public static readonly IdKey            = Model.RegisterProperty<string>(
        DiagramDocument, 'Id',            '', MetaData.None);
    public static readonly TitleKey         = Model.RegisterProperty<string>(
        DiagramDocument, 'Title',         'Diagram', MetaData.None);
    public static readonly IsDirtyKey       = Model.RegisterProperty<boolean>(
        DiagramDocument, 'IsDirty',       false, MetaData.None);
    // The Diagram control currently presenting this document. Published by the
    // control itself when this document becomes its DataContext (see
    // Diagram / IDiagramViewHost). Sibling shell regions (toolbars, format
    // pane) bind the active document's editing commands + selection-format
    // state THROUGH this: `$service(ContentHostService).ActiveDocument.ActiveView.<X>`.
    // undefined when no view is materialized (e.g. the document isn't active).
    public static readonly ActiveViewKey    = Model.RegisterProperty<Diagram | undefined>(
        DiagramDocument, 'ActiveView',    undefined, MetaData.None);

    // The inspector VM the shell's inspector region presents for this document
    // (a DataTemplate[DataType=DiagramInspector] renders the Format Shape pane).
    // A stable per-document instance whose `View` this document keeps synced with
    // ActiveView — so the inspector reaches the live control's selection-format
    // state. A DP so `ActiveDocument.Inspector` resolves as a bindable path.
    public static readonly InspectorKey     = Model.RegisterProperty<DiagramInspector>(
        DiagramDocument, 'Inspector',     undefined as unknown as DiagramInspector, MetaData.None);

    public static readonly NodesKey         = Model.RegisterProperty<ObservableCollection<Figure | Group | NodeViewModel>>(
        DiagramDocument, 'Nodes',         undefined as unknown as ObservableCollection<Figure | Group | NodeViewModel>, MetaData.None);
    public static readonly ConnectorsKey    = Model.RegisterProperty<ObservableCollection<Connector>>(
        DiagramDocument, 'Connectors',    undefined as unknown as ObservableCollection<Connector>, MetaData.None);
    public static readonly StatusKey        = Model.RegisterProperty<string>(
        DiagramDocument, 'Status',        '', MetaData.None);
    public static readonly StorageKey       = Model.RegisterProperty<DiagramStorage | undefined>(
        DiagramDocument, 'Storage',       undefined, MetaData.None);
    public static readonly SaveCommandKey   = Model.RegisterProperty<RelayCommand | undefined>(
        DiagramDocument, 'SaveCommand',   undefined, MetaData.None);
    public static readonly LoadCommandKey   = Model.RegisterProperty<RelayCommand | undefined>(
        DiagramDocument, 'LoadCommand',   undefined, MetaData.None);

    // ── IFontFormatSink surface — the font-format editor the shell toolbar hosts
    // binds these two-way. They MIRROR the published ActiveView's Selection* DPs:
    // a picker write flows out to the control (→ FormatMirror → selection), and a
    // selection change flows back here. Defaults match the Diagram control's.
    public static readonly FontFamilyKey   = Model.RegisterProperty<string>(
        DiagramDocument, 'FontFamily',   '', MetaData.None);
    public static readonly FontSizeKey     = Model.RegisterProperty<number>(
        DiagramDocument, 'FontSize',     12, MetaData.None);
    public static readonly FontColorHexKey = Model.RegisterProperty<string>(
        DiagramDocument, 'FontColorHex', '#000000', MetaData.None);
    // The size steppers bind these; sourced from the live view (undefined with no
    // view). Read-only to the world — set only from the mirrored ActiveView.
    public static readonly IncreaseFontSizeCommandKey = Model.RegisterProperty<ICommand | undefined>(
        DiagramDocument, 'IncreaseFontSizeCommand', undefined, MetaData.None);
    public static readonly DecreaseFontSizeCommandKey = Model.RegisterProperty<ICommand | undefined>(
        DiagramDocument, 'DecreaseFontSizeCommand', undefined, MetaData.None);

    // Connectors-mode pin — mirrors the live view's ConnectorsModePinned two-way.
    // The shell status bar's connector indicator binds this: writing it toggles
    // the mode on the control, and the control's changes flow back here.
    public static readonly ConnectorsModePinnedKey = Model.RegisterProperty<boolean>(
        DiagramDocument, 'ConnectorsModePinned', false, MetaData.None);

    private _nextId = 1;

    // Guards the view→document mirror so a pulled value isn't written straight
    // back out to the view (which would loop).
    private _syncingFromView = false;
    // The view we're currently mirroring state from — kept so we can detach.
    private _mirrorView: Diagram | undefined;
    private readonly _onViewMirrorChanged = (): void => this._pullFromView();

    constructor(storage?: DiagramStorage)
    {
        super();
        this.set_property_value(DiagramDocument.IdKey,            'diagram-' + (++_diagramDocSeq));
        this.set_property_value(DiagramDocument.InspectorKey,     new DiagramInspector());
        this.set_property_value(DiagramDocument.NodesKey,         new ObservableCollection<Figure | Group | NodeViewModel>());
        this.set_property_value(DiagramDocument.ConnectorsKey,    new ObservableCollection<Connector>());
        this.set_property_value(DiagramDocument.StorageKey,       storage);
        // The palette lives in the framework ToolboxRepository (a Services
        // singleton the Diagram first-inits with a built-in Shapes page); the
        // document no longer owns a ToolboxShapes collection.

        // Save / Load RelayCommands — gated on Storage presence.
        const canPersist = (): boolean => this.Storage !== undefined;
        this.set_property_value(DiagramDocument.SaveCommandKey,
            new RelayCommand(() => this.Save(), canPersist,
                { Text: 'Save',
                  Description: 'Serialize the current canvas to the configured storage.' }));
        this.set_property_value(DiagramDocument.LoadCommandKey,
            new RelayCommand(() => this.Load(), canPersist,
                { Text: 'Load',
                  Description: 'Restore the most recently saved canvas.' }));
    }

    // IDocument accessors. Id is stable; Title is settable (a tab strip binds
    // it); IsDirty is read-only to the world — flipped internally by mutations
    // and cleared by Save / Load.
    public get Id():            string  { return this.get_property_value(DiagramDocument.IdKey); }
    public get Title():         string  { return this.get_property_value(DiagramDocument.TitleKey); }
    public set Title(v: string)         { this.set_property_value(DiagramDocument.TitleKey, v); }
    public get IsDirty():       boolean { return this.get_property_value(DiagramDocument.IsDirtyKey); }
    public get ActiveView():    Diagram | undefined { return this.get_property_value(DiagramDocument.ActiveViewKey); }
    public set ActiveView(v: Diagram | undefined)   { this.set_property_value(DiagramDocument.ActiveViewKey, v); }
    public get Inspector():     DiagramInspector { return this.get_property_value(DiagramDocument.InspectorKey); }

    // Mark the document as having unsaved edits. Called from every structural
    // mutation; cleared by Save / Load. Private — dirtiness is derived, not set
    // from outside.
    private _markDirty(): void { this.set_property_value(DiagramDocument.IsDirtyKey, true); }

    // ── ICommandTarget surface — the diagram as a command dispatch target ──
    // The ToolbarService reads CommandContexts to decide which commands show,
    // and calls Execute / CanExecute to run / gate them. Each is resolved through
    // DIAGRAM_COMMAND_GETTERS against the published ActiveView (the control that
    // owns the selection-driven commands); an unrecognised id or a document with
    // no live view is a no-op / disabled.
    public get CommandContexts(): readonly ServiceToken<unknown>[] { return DIAGRAM_COMMAND_CONTEXTS; }

    public Execute(definition: CommandDefinition): void
    {
        this._commandFor(definition.Id)?.Execute(undefined);
    }

    public CanExecute(definition: CommandDefinition): boolean
    {
        return this._commandFor(definition.Id)?.CanExecute(undefined) ?? false;
    }

    // Toggle state for the Toggles-presentation commands (text-align / text-style)
    // — read off the live view's Selection* DPs. Non-toggle or unknown ids, or no
    // active view, are never active.
    public IsActive(definition: CommandDefinition): boolean
    {
        const view = this.ActiveView;
        if (view === undefined) return false;
        return DIAGRAM_COMMAND_ACTIVE.get(definition.Id)?.(view) ?? false;
    }

    private _commandFor(id: string): ICommand | undefined
    {
        const view = this.ActiveView;
        if (view === undefined) return undefined;
        return DIAGRAM_COMMAND_GETTERS.get(id)?.(view);
    }

    // ── IFontFormatSink accessors ──────────────────────────────────────────
    public get FontFamily(): string  { return this.get_property_value(DiagramDocument.FontFamilyKey); }
    public set FontFamily(v: string) { this.set_property_value(DiagramDocument.FontFamilyKey, v); }
    public get FontSize(): number  { return this.get_property_value(DiagramDocument.FontSizeKey); }
    public set FontSize(v: number) { this.set_property_value(DiagramDocument.FontSizeKey, v); }
    public get FontColorHex(): string  { return this.get_property_value(DiagramDocument.FontColorHexKey); }
    public set FontColorHex(v: string) { this.set_property_value(DiagramDocument.FontColorHexKey, v); }
    public get IncreaseFontSizeCommand(): ICommand | undefined { return this.get_property_value(DiagramDocument.IncreaseFontSizeCommandKey); }
    public get DecreaseFontSizeCommand(): ICommand | undefined { return this.get_property_value(DiagramDocument.DecreaseFontSizeCommandKey); }

    public get ConnectorsModePinned(): boolean  { return this.get_property_value(DiagramDocument.ConnectorsModePinnedKey); }
    public set ConnectorsModePinned(v: boolean) { this.set_property_value(DiagramDocument.ConnectorsModePinnedKey, v); }

    // Re-point the view mirror at a new ActiveView: detach the old view's mirrored
    // listeners (font selection + connectors mode), attach the new one's, refresh
    // the step commands, and pull the initial values. With no view the step
    // commands clear.
    private _rebindViewMirror(view: Diagram | undefined): void
    {
        if (this._mirrorView !== undefined)
        {
            this._mirrorView.RemovePropertyChangedListener(Diagram.SelectionFontFamilyKey,   this._onViewMirrorChanged);
            this._mirrorView.RemovePropertyChangedListener(Diagram.SelectionFontSizeKey,     this._onViewMirrorChanged);
            this._mirrorView.RemovePropertyChangedListener(Diagram.SelectionFontColorHexKey, this._onViewMirrorChanged);
            this._mirrorView.RemovePropertyChangedListener(Diagram.ConnectorsModePinnedKey,  this._onViewMirrorChanged);
        }
        this._mirrorView = view;
        this.set_property_value(DiagramDocument.IncreaseFontSizeCommandKey, view?.IncreaseFontSizeCommand);
        this.set_property_value(DiagramDocument.DecreaseFontSizeCommandKey, view?.DecreaseFontSizeCommand);
        if (view !== undefined)
        {
            view.AddPropertyChangedListener(Diagram.SelectionFontFamilyKey,   this._onViewMirrorChanged);
            view.AddPropertyChangedListener(Diagram.SelectionFontSizeKey,     this._onViewMirrorChanged);
            view.AddPropertyChangedListener(Diagram.SelectionFontColorHexKey, this._onViewMirrorChanged);
            view.AddPropertyChangedListener(Diagram.ConnectorsModePinnedKey,  this._onViewMirrorChanged);
            this._pullFromView();
        }
    }

    // Mirror the live view's editable state onto our DPs (guarded so the write-
    // through in OnPropertyChanged doesn't echo it straight back).
    private _pullFromView(): void
    {
        const view = this._mirrorView;
        if (view === undefined) return;
        this._syncingFromView = true;
        try
        {
            this.FontFamily           = view.SelectionFontFamily;
            this.FontSize             = view.SelectionFontSize;
            this.FontColorHex         = view.SelectionFontColorHex;
            this.ConnectorsModePinned = view.ConnectorsModePinned;
        }
        finally { this._syncingFromView = false; }
    }

    protected override OnPropertyChanged(
        descriptor: PropertyDescriptor, oldValue: unknown, newValue: unknown): void
    {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        // Keep the inspector's View in lock-step with the published control, so
        // the Format Shape pane reaches the live selection-format state.
        if (descriptor.Name === 'ActiveView')
        {
            this.Inspector.View = newValue as Diagram | undefined;
            this._rebindViewMirror(newValue as Diagram | undefined);
        }
        // An editor write flows OUT to the view (unless it's the mirror pulling IN).
        else if (!this._syncingFromView && this._mirrorView !== undefined)
        {
            if      (descriptor.Name === 'FontFamily')           this._mirrorView.SelectionFontFamily   = newValue as string;
            else if (descriptor.Name === 'FontSize')             this._mirrorView.SelectionFontSize     = newValue as number;
            else if (descriptor.Name === 'FontColorHex')         this._mirrorView.SelectionFontColorHex = newValue as string;
            else if (descriptor.Name === 'ConnectorsModePinned') this._mirrorView.ConnectorsModePinned  = newValue as boolean;
        }
    }

    public get Nodes():         ObservableCollection<Figure | Group | NodeViewModel> { return this.get_property_value(DiagramDocument.NodesKey); }
    public get Connectors():    ObservableCollection<Connector>      { return this.get_property_value(DiagramDocument.ConnectorsKey); }
    public get Status():        string                               { return this.get_property_value(DiagramDocument.StatusKey); }
    public set Status(v: string)                                     { this.set_property_value(DiagramDocument.StatusKey, v); }
    public get Storage():       DiagramStorage | undefined           { return this.get_property_value(DiagramDocument.StorageKey); }
    public set Storage(v: DiagramStorage | undefined)                { this.set_property_value(DiagramDocument.StorageKey, v); }
    public get SaveCommand():   RelayCommand | undefined             { return this.get_property_value(DiagramDocument.SaveCommandKey); }
    public get LoadCommand():   RelayCommand | undefined             { return this.get_property_value(DiagramDocument.LoadCommandKey); }

    // ── Mutation API (DiagramMutator surface) ──────────────────────

    public CreateNode(kind: string, x: number, y: number): ShapeNodeVM | null
    {
        if (!SHAPE_CATALOG_MAP.has(kind)) return null;
        const vm = ShapeNodeVM.fromKind(kind, x, y);
        vm.Id = 'n' + this._nextId++;
        this.Nodes.Add(vm);
        this.Status = `Placed ${kind}. ${this.Nodes.Count} nodes.`;
        this._markDirty();
        return vm;
    }

    public AddNode(node: NodeViewModel): void
    {
        this.Nodes.Add(node);
    }

    public DeleteNodes(items: readonly unknown[]): void
    {
        if (items.length === 0) return;
        let removed = 0;
        for (const item of items)
        {
            if (!(item instanceof Figure || item instanceof Group || item instanceof NodeViewModel)) continue;
            // Detach from parent group bookkeeping first if any.
            if ((item instanceof Figure || item instanceof Group) && item.Parent !== undefined) item.Parent._removeMember(item);
            const idx = this.Nodes.IndexOf(item);
            if (idx < 0) continue;
            this.Nodes.RemoveAt(idx);
            removed++;
        }
        // Cascade: drop any connector whose endpoint references a
        // removed node. Without this, a Figure deletion leaves the
        // connector pointing at a detached Visual.
        if (removed > 0)
        {
            const orphaned: Connector[] = [];
            for (let i = 0; i < this.Connectors.Count; i++)
            {
                const c = this.Connectors.Get(i)!;
                const sn = c.Source?.Node, tn = c.Target?.Node;
                if ((sn !== undefined && items.includes(sn))
                 || (tn !== undefined && items.includes(tn)))
                {
                    orphaned.push(c);
                }
            }
            for (const o of orphaned)
            {
                const idx = this.Connectors.IndexOf(o);
                if (idx >= 0) this.Connectors.RemoveAt(idx);
                // Release the connector's host subscriptions so the siblings
                // that share a side rebalance to the smaller slot count.
                o.DetachFromHosts();
            }
            // Callout cleanup: detach any removed callout from its target, and
            // clear the leader on any surviving callout whose target was removed
            // (mirrors the connector DetachFromHosts cascade above).
            for (const item of items)
            {
                if (item instanceof CalloutNodeVM) item.Detach();
            }
            for (let i = 0; i < this.Nodes.Count; i++)
            {
                const n = this.Nodes.Get(i);
                if (n instanceof CalloutNodeVM
                    && n.LeaderTargetNode !== undefined
                    && items.includes(n.LeaderTargetNode as unknown))
                {
                    n.LeaderTargetNode = undefined;
                }
            }
            const orphanSuffix = orphaned.length > 0
                ? ` + ${orphaned.length} orphaned connector${orphaned.length === 1 ? '' : 's'}`
                : '';
            this.Status = `Deleted ${removed} node${removed === 1 ? '' : 's'}${orphanSuffix}. `
                        + `${this.Nodes.Count} remain.`;
            this._markDirty();
        }
    }

    public CreateConnector(source: ConnectorEndpoint, target: ConnectorEndpoint): Connector | null
    {
        // items-are-Connectors convention. The materializer in
        // [collaborators/diagram-connectors-materializer.ts] recognizes
        // a Connector entry as already-a-Visual and skips template
        // application, so the freshly-constructed instance below IS
        // what renders on the diagram.
        const c = new Connector();
        c.Source = source;
        c.Target = target;
        this.Connectors.Add(c);
        this.Status = `Added connector. ${this.Connectors.Count} connectors total.`;
        this._markDirty();
        return c;
    }

    public DeleteConnectors(connectors: readonly Connector[]): void
    {
        if (connectors.length === 0) return;
        let removed = 0;
        for (const c of connectors)
        {
            const idx = this.Connectors.IndexOf(c);
            if (idx < 0) continue;
            this.Connectors.RemoveAt(idx);
            // Release the connector's host subscriptions so the siblings
            // that share a side rebalance to the smaller slot count.
            c.DetachFromHosts();
            removed++;
        }
        if (removed > 0)
        {
            this.Status = `Deleted ${removed} connector${removed === 1 ? '' : 's'}. ${this.Connectors.Count} remain.`;
            this._markDirty();
        }
    }

    /** Wrap the top-level entries of `items` in a new Group.
     *  The new Group is inserted at the LOWEST index of any selected
     *  member so its bbox renders BEHIND its members in z-order. */
    public Group(items: readonly unknown[]): void
    {
        const selection = this._topLevel(items);
        if (selection.length < 2) return;
        const grp = new Group();
        let minIdx = this.Nodes.Count;
        for (const m of selection)
        {
            const idx = this.Nodes.IndexOf(m);
            if (idx >= 0 && idx < minIdx) minIdx = idx;
        }
        for (const m of selection)
        {
            if (m.Parent !== undefined) m.Parent._removeMember(m);
            m.Parent = grp;
            grp.Members.Add(m);
        }
        this.Nodes.Insert(minIdx, grp);
        grp.IsSelected = true;
        for (const leaf of grp.EnumerateLeaves())
        {
            if (leaf instanceof Figure) leaf.IsSelected = false;
        }
        for (const sub  of grp.EnumerateSubGroups()) sub.IsSelected = false;
        this.Status = `Grouped ${selection.length} items.`;
        this._markDirty();
    }

    /** Dissolve every Group-shaped entry in `items`. Members lift to
     *  the dissolved group's parent (or to no-parent if top-level). */
    public Ungroup(items: readonly unknown[]): void
    {
        const groups: Group[] = [];
        for (const item of this._topLevel(items))
        {
            if (item instanceof Group) groups.push(item);
        }
        if (groups.length === 0) return;
        for (const g of groups)
        {
            const parent = g.Parent;
            const members: (Figure | Group | NodeViewModel)[] = [];
            for (let i = 0; i < g.Members.Count; i++) members.push(g.Members.Get(i)!);
            for (const m of members)
            {
                g._removeMember(m);
                m.Parent = parent;
                if (parent !== undefined) parent.Members.Add(m);
            }
            if (parent !== undefined) parent._removeMember(g);
            const idx = this.Nodes.IndexOf(g);
            if (idx >= 0) this.Nodes.RemoveAt(idx);
        }
        this.Status = `Ungrouped ${groups.length} group${groups.length === 1 ? '' : 's'}.`;
        this._markDirty();
    }

    /** PowerPoint Merge-Shapes counterpart. Folds the geometric subset
     *  of `items` via `mergeShapes` and replaces the inputs with a single
     *  combined-source ShapeNodeVM. Figure-based Groups are not VM leaves
     *  yet (M4) — skip them. */
    public CombineSelection(items: readonly unknown[], mode: GeometryCombineMode): void
    {
        const leaves: ShapeNodeVM[] = [];
        for (const item of items)
        {
            if (item instanceof ShapeNodeVM) leaves.push(item);
            // Figure-based Groups are not VM leaves yet (M4) — skip them.
        }
        if (leaves.length < 2) return;
        const merged = mergeShapes(leaves, mode);
        if (merged === undefined)
        {
            this.Status = 'Combine produced an empty geometry.';
            return;
        }
        const template = leaves[0]!;
        const result = ShapeNodeVM.fromSource(merged.source, merged.x, merged.y, {
            width:  merged.w,
            height: merged.h,
        });
        result.Id   = 'n' + this._nextId++;
        result.Fill = template.Fill;
        if (template.Stroke !== undefined)
        {
            const PenCtor = template.Stroke.constructor as new (...args: unknown[]) => typeof template.Stroke;
            result.Stroke = new PenCtor(template.Stroke.Brush, template.Stroke.Thickness);
        }
        // ShapeNodeVM has no IsSelected property (it's on the Figure container,
        // not the VM) — the result.IsSelected = true line from the old Figure
        // body is intentionally omitted. Selection of the combined node is not
        // required for this task.
        for (const leaf of leaves)
        {
            const idx = this.Nodes.IndexOf(leaf);
            if (idx >= 0) this.Nodes.RemoveAt(idx);
        }
        this.Nodes.Add(result);
        this.Status = `Combined ${leaves.length} shapes (${combineModeName(mode)}).`;
        this._markDirty();
    }

    // ── Save / Load ──────────────────────────────────────────────────

    public Save(): void
    {
        const storage = this.Storage;
        if (storage === undefined) return;
        try
        {
            storage.SetItem(STORAGE_KEY, JSON.stringify(this._serialize()));
            this.set_property_value(DiagramDocument.IsDirtyKey, false);
            this.Status = `Saved ${this.Nodes.Count} nodes.`;
        }
        catch (e)
        {
            this.Status = `Save failed: ${e instanceof Error ? e.message : String(e)}`;
        }
    }

    public Load(): void
    {
        const storage = this.Storage;
        if (storage === undefined) return;
        try
        {
            const json = storage.GetItem(STORAGE_KEY);
            if (json === null)
            {
                this.Status = 'Nothing saved yet — try Save first.';
                return;
            }
            this._deserialize(JSON.parse(json) as SerializedDiagram);
            this.set_property_value(DiagramDocument.IsDirtyKey, false);
            this.Status = `Loaded ${this.Nodes.Count} nodes.`;
        }
        catch (e)
        {
            this.Status = `Load failed: ${e instanceof Error ? e.message : String(e)}`;
        }
    }

    private _serialize(): SerializedDiagram
    {
        const nodes: SerializedNode[] = [];
        for (let i = 0; i < this.Nodes.Count; i++)
        {
            const v = this.Nodes.Get(i)!;
            // Groups not persisted — skip them (and anything without a serializer).
            const s = serializerFor(v);
            if (s === undefined) continue;
            // Both Figure and NodeViewModel expose Id/Left/Top/Width/Height;
            // Group (which has no serializer) is already skipped above.
            const nvm = v as Figure | NodeViewModel;
            nodes.push({
                type: s.type,
                id:   nvm.Id ?? '',
                left: nvm.Left,
                top:  nvm.Top,
                w:    nvm.Width,
                h:    nvm.Height,
                data: s.serialize(v),
            });
        }
        const connectors: SerializedConnector[] = [];
        for (let i = 0; i < this.Connectors.Count; i++)
        {
            const c = this.Connectors.Get(i)!;
            const src = c.Source, tgt = c.Target;
            if (src === undefined || tgt === undefined) continue;   // half-set connectors are not persisted
            connectors.push({
                source:      serializeEndpoint(src),
                target:      serializeEndpoint(tgt),
                waypoints:   c.Waypoints !== undefined && c.Waypoints.length > 0
                    ? c.Waypoints.map(w => ({ x: w.point.X, y: w.point.Y, userAltered: w.userAltered }))
                    : undefined,
                routingMode: c.RoutingMode,
                text:        serializeShapeText(c.Text),
                labelPos:    c.LabelPosition !== 0.5 ? c.LabelPosition : undefined,
            });
        }
        return { nodes, connectors, nextId: this._nextId };
    }

    private _deserialize(payload: SerializedDiagram): void
    {
        this.Nodes.Clear();
        this.Connectors.Clear();

        // Round-trip nodes first so connectors can resolve their endpoint
        // nodeIds against the freshly-rehydrated Nodes set.
        // byId accepts Figure, ShapeNodeVM, TextNodeVM, or CalloutNodeVM;
        // ConnectorEndpoint.Node is typed Model so all are accepted.
        const byId = new Map<string, Figure | ShapeNodeVM | TextNodeVM | CalloutNodeVM>();
        // Callout leader targets resolve in a second pass (the target node may
        // be deserialized after the callout).
        const pendingLeaders: { callout: CalloutNodeVM; targetId: string }[] = [];

        // Ids already claimed by explicit records (or generated below) — the
        // fallback generator must skip these so an empty-id node never collides
        // with an inbound 'nN' and overwrites it in byId.
        const claimedIds = new Set<string>();
        for (const n of payload.nodes ?? [])
        {
            if (n.id !== '') claimedIds.add(n.id);
        }
        const nextFreeId = (): string => {
            let candidate = 'n' + this._nextId++;
            while (claimedIds.has(candidate)) candidate = 'n' + this._nextId++;
            claimedIds.add(candidate);
            return candidate;
        };

        for (const n of payload.nodes ?? [])
        {
            const id = n.id !== '' ? n.id : nextFreeId();
            const base: NodeBaseRecord = { id, left: n.left, top: n.top, w: n.w, h: n.h };

            let node: Figure | ShapeNodeVM | TextNodeVM | CalloutNodeVM | undefined;

            if (typeof n.type === 'string')
            {
                // V2 typed record — dispatch through the registry.
                const s = serializerByType(n.type);
                if (s !== undefined)
                {
                    node = s.deserialize(n.data ?? {}, base) as Figure | ShapeNodeVM | TextNodeVM | CalloutNodeVM;
                }
                // Unknown serializer type — skip.
            }
            else
            {
                // Legacy V1 flat record — infer type from the `kind` field and
                // synthesise a `data` bag matching each serializer's expectation.
                // The text/callout serializers now build VMs, so legacy scenes
                // also load as TextNodeVM / CalloutNodeVM automatically.
                const kind = typeof n.kind === 'string' ? n.kind : '';
                if (kind === 'text')
                {
                    const s = serializerByType('text')!;
                    node = s.deserialize({ text: n.text }, base) as TextNodeVM;
                }
                else if (kind === 'callout')
                {
                    const s = serializerByType('callout')!;
                    node = s.deserialize({ text: n.text, leaderTargetId: n.leaderTargetId }, base) as CalloutNodeVM;
                }
                else
                {
                    // geometry shape (catalog kind or freeform d-string)
                    const s = serializerByType('shape')!;
                    node = s.deserialize({ kind, d: n.d ?? '' }, base) as ShapeNodeVM;
                }
            }

            if (node === undefined) continue;

            // Register callout leaders for second pass.
            if (node instanceof CalloutNodeVM)
            {
                const targetId = typeof n.type === 'string'
                    ? (typeof n.data?.leaderTargetId === 'string' ? n.data.leaderTargetId : undefined)
                    : n.leaderTargetId;
                if (targetId !== undefined) pendingLeaders.push({ callout: node, targetId });
            }

            this.Nodes.Add(node);
            byId.set(id, node);
        }

        // Wire callout leaders now that every node id resolves.
        // The target may be any rehydrated node type (TextNodeVM, ShapeNodeVM,
        // Figure, or CalloutNodeVM) — all satisfy ILeaderTarget at runtime
        // (Left/Top/Width/Height + DPs).
        for (const { callout, targetId } of pendingLeaders)
        {
            const target = byId.get(targetId);
            if (target !== undefined)
            {
                // ILeaderTarget is satisfied by all node types (duck-typed).
                callout.LeaderTargetNode = target as import('./callout-node-vm.js').ILeaderTarget;
            }
        }
        for (const sc of payload.connectors ?? [])
        {
            const c = new Connector();
            if (typeof sc.routingMode === 'string') c.RoutingMode = sc.routingMode;
            c.Source = rehydrateEndpoint(sc.source, byId);
            c.Target = rehydrateEndpoint(sc.target, byId);
            if (sc.waypoints !== undefined && sc.waypoints.length > 0)
            {
                // Legacy entries (no userAltered) were all hand-routed intent → pin them.
                c.Waypoints = sc.waypoints.map(p => waypoint(new Point(p.x, p.y), p.userAltered ?? true));
            }
            if (sc.text !== undefined) applySerializedText(c.Text, sc.text);
            if (typeof sc.labelPos === 'number') c.LabelPosition = sc.labelPos;
            this.Connectors.Add(c);
        }
        if (typeof payload.nextId === 'number') this._nextId = Math.max(this._nextId, payload.nextId);
    }

    // Reduce items to the unique set of outermost ancestors (walks
    // Parent chains, dedupes). Match the framework's `selectedTopLevel`
    // semantics so Group / Ungroup respect Visio-style "selecting a
    // member ≡ selecting its outermost group" elevation.
    private _topLevel(items: readonly unknown[]): (Figure | Group | NodeViewModel)[]
    {
        const out = new Set<Figure | Group | NodeViewModel>();
        for (const item of items)
        {
            if (item instanceof Figure || item instanceof Group || item instanceof NodeViewModel)
            {
                let cur: Figure | Group | NodeViewModel = item;
                while (cur.Parent !== undefined) cur = cur.Parent;
                out.add(cur);
            }
        }
        return [...out];
    }
}

function serializeEndpoint(ep: ConnectorEndpoint): SerializedConnectorEndpoint
{
    const node = ep.Node;
    if ((node instanceof Figure || node instanceof NodeViewModel) && node.Id !== undefined && node.Id !== '')
    {
        const out: SerializedConnectorEndpoint = { nodeId: node.Id };
        if (ep.PortName !== undefined) return { ...out, portName: ep.PortName };
        return out;
    }
    const fp = ep.FreePoint;
    if (fp !== undefined) return { freeX: fp.X, freeY: fp.Y };
    // Endpoint without a usable anchor — serialize as empty; rehydrate
    // will produce a default endpoint with FreePoint(0,0).
    return {};
}

function rehydrateEndpoint(
    s: SerializedConnectorEndpoint,
    byId: ReadonlyMap<string, Figure | ShapeNodeVM | TextNodeVM | CalloutNodeVM>,
): ConnectorEndpoint
{
    if (s.nodeId !== undefined)
    {
        const node = byId.get(s.nodeId);
        if (node !== undefined)
        {
            return new ConnectorEndpoint({
                Node:     node,
                PortName: s.portName,
            });
        }
        // Dangling reference — fall through to FreePoint(0,0) so the
        // connector still materializes (without crashing) and the
        // consumer can observe the orphan.
    }
    if (typeof s.freeX === 'number' && typeof s.freeY === 'number')
    {
        return new ConnectorEndpoint({ FreePoint: new Point(s.freeX, s.freeY) });
    }
    return new ConnectorEndpoint({ FreePoint: new Point(0, 0) });
}

function combineModeName(mode: GeometryCombineMode): string
{
    switch (mode)
    {
        case GeometryCombineMode.Union:     return 'Union';
        case GeometryCombineMode.Intersect: return 'Intersect';
        case GeometryCombineMode.Xor:       return 'Exclude';
        case GeometryCombineMode.Exclude:   return 'Subtract';
        default: return String(mode);
    }
}
