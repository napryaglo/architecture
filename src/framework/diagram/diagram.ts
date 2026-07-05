import {
    Element,
    MetaData,
    Model,
    type ObservableCollection,
    Rect,
    type KeyEventArgs,
    Key,
    type PointerEventArgs,
    type PropertyDescriptor,
    type RelayCommand,
    type Visual,
    hasModifier,
    ModifierKeys,
} from '../../runtime/index.js';
import type { DataTemplate } from '../../basic/templates/data-template.js';
import { AdornerLayer } from '../../visual-engine/index.js';
import { Figure } from './figure.js';
import { Group } from './group.js';
import { connectorCapOptions } from './caps/connector-cap-options.js';
import type { CapOption } from '../formatting/cap-option.js';
import { Selector } from '../list/selector.js';
import { DiagramCommands } from './collaborators/diagram-commands.js';
import { DiagramConnectorsMaterializer } from './collaborators/diagram-connectors-materializer.js';
import { SelectionBoundsTracker } from './collaborators/selection-bounds-tracker.js';
import { SelectionReflector } from './collaborators/selection-reflector.js';
import {
    type GroupRequestedArgs,
    type UngroupRequestedArgs,
    type GroupRequestedListener,
    type UngroupRequestedListener,
} from './commands/group-ops.js';
import {
    type CombineRequestedArgs,
    type CombineRequestedListener,
} from './commands/combine.js';
import {
    type DeleteRequestedArgs,
    type DeleteRequestedListener,
} from './commands/delete-ops.js';
import {
    attachStandardDiagramMutations,
    type DiagramMutator,
} from './behaviors/attach-standard-mutations.js';
import {
    attachAlignmentGuides,
    type AlignmentGuide,
} from './behaviors/alignment-guides-behavior.js';
import { AlignmentGuidesAdorner } from './behaviors/alignment-guides-adorner.js';
import { SelectionBoundsAdorner } from '../../basic/index.js';
import { DiagramSelectionSource } from './behaviors/diagram-selection-source.js';
import { Brush, Pen, Point } from '../../visual-engine/index.js';
import { FormatMirror } from './collaborators/format-mirror.js';
import {
    attachCanvasDropBehavior,
    type ItemDroppedArgs,
    type ItemDroppedListener,
} from './behaviors/canvas-drop-behavior.js';
export { attachCanvasDropBehavior, TOOLBOX_NODE_KIND_FORMAT } from './behaviors/canvas-drop-behavior.js';
export type { ItemDroppedArgs, ItemDroppedListener } from './behaviors/canvas-drop-behavior.js';
import type {
    ConnectorCreatedArgs,
    ConnectorCreatedListener,
} from './behaviors/connector-create-behavior.js';
import {
    attachConnectorInteractions,
    type ConnectorInteractionsHandlers,
} from './behaviors/connector-interactions-behavior.js';
import { Connector } from './connector.js';
import type { RigidConnectorDragHost, RigidConnectorDragSession } from './rigid-connector-drag.js';

// §19.3 follow-up — position snap callback. Consumers (e.g., the
// diagram demo's align-edges behavior) set this DP to a pure function
// that returns the snapped rect for a given cursor-derived candidate
// rect. Figure.OnPointerMove consults the parent Diagram and
// applies the snap before writing X / Y, so alignment guides
// translate into real snap-on-drag behavior without behaviors having
// to fight the framework's drag positioning.
export type DiagramPositionSnap = (rect: Rect) => Rect;

// A DataContext that wants a back-reference to the Diagram view presenting it.
// When a Diagram's DataContext structurally exposes a writable `ActiveView`,
// the control publishes itself there when the DataContext is set — so shell
// regions OUTSIDE the content template (toolbars, format pane) can bind the
// active document's editing commands + selection-format state THROUGH the VM:
//   `$service(ContentHostService).ActiveDocument.ActiveView.AlignLeftCommand`.
//
// This is the seam that lets the Diagram materialize inside a
// `DataTemplate[DataType=DiagramDocument]` (attached in-tree, adorners live)
// while sibling regions still reach it — replacing the older
// "service holds one code-built control" workaround. Duck-typed like
// DiagramMutator, so the control depends on no concrete document type.
export interface IDiagramViewHost { ActiveView: Diagram | undefined; }

// Selector flavour that materializes each item into a Figure
// container instead of the default ContentPresenter wrap. The Selector
// base supplies the SelectedItem / SelectedIndex / SelectedValue surface
// out of the box, so a Diagram consumer can data-bind selection the
// same way ListBox / ComboBox do; per-container highlight rides on the
// matching DataTemplate trigger (`when($IsSelected)`).
//
// The override below is the entire point of the subclass — a Visio-/
// drawio-style surface needs its containers to own position + drag-to-
// move, and Figure bakes both into a single ContentControl.
// Everything else (ItemsPanel, ItemTemplate, ItemContainerStyle, item
// binding, selection) is inherited unchanged.
//
// Pair with `ItemsPanel = ItemsPanelTemplate { Canvas }` so the
// Figure containers are placed on a Canvas that honours their
// Canvas.Left / Canvas.Top — Figure mirrors its own Left / Top onto
// those attached properties so a parent Canvas places it.
const EMPTY_CAP_OPTIONS: readonly CapOption[] = Object.freeze([]) as readonly CapOption[];

export class Diagram extends Selector implements RigidConnectorDragHost
{
    static {
        Model.OverrideMetadata(Diagram, Element.DefaultStyleKeyKey, { default_value: Diagram });
    }

    // §19.3 — `PositionSnap` callback. Default `undefined` = no snap,
    // identity behavior. When set, Figure.OnPointerMove calls it
    // with the cursor-derived candidate rect and uses the returned
    // rect's X / Y for its position write.
    public static readonly PositionSnapKey = Model.RegisterProperty<DiagramPositionSnap | undefined>(
        Diagram, 'PositionSnap', undefined, MetaData.None);

    // Selection-bounds DPs — read-only, derived from the union bbox of
    // every IFigure-shaped item in SelectedItems by SelectionBoundsTracker
    // (see collaborators/selection-bounds-tracker.ts). Consumers can bind
    // their resize-adorner / status-bar / inspector chrome to these DPs
    // without subscribing to per-item geometry themselves.
    public static readonly SelectionLeftKey   = Model.RegisterReadOnlyProperty<number>(
        Diagram, 'SelectionLeft',   0, MetaData.None);
    public static readonly SelectionTopKey    = Model.RegisterReadOnlyProperty<number>(
        Diagram, 'SelectionTop',    0, MetaData.None);
    public static readonly SelectionWidthKey  = Model.RegisterReadOnlyProperty<number>(
        Diagram, 'SelectionWidth',  0, MetaData.None);
    public static readonly SelectionHeightKey = Model.RegisterReadOnlyProperty<number>(
        Diagram, 'SelectionHeight', 0, MetaData.None);
    public static readonly SelectionCountKey  = Model.RegisterReadOnlyProperty<number>(
        Diagram, 'SelectionCount',  0, MetaData.None);

    // Align commands — RelayCommand-typed DPs. DiagramCommands installs
    // default impls at construction; consumers override by writing their
    // own RelayCommand to the DP. Each command's CanExecute returns
    // false for selections < 2 IFigure-shaped items. RaiseCanExecuteChanged
    // is fanned out on every SelectionChanged by DiagramCommands.
    public static readonly AlignLeftCommandKey   = Model.RegisterProperty<RelayCommand | undefined>(
        Diagram, 'AlignLeftCommand',   undefined, MetaData.None);
    public static readonly AlignRightCommandKey  = Model.RegisterProperty<RelayCommand | undefined>(
        Diagram, 'AlignRightCommand',  undefined, MetaData.None);
    public static readonly AlignTopCommandKey    = Model.RegisterProperty<RelayCommand | undefined>(
        Diagram, 'AlignTopCommand',    undefined, MetaData.None);
    public static readonly AlignMiddleCommandKey = Model.RegisterProperty<RelayCommand | undefined>(
        Diagram, 'AlignMiddleCommand', undefined, MetaData.None);
    public static readonly AlignCenterCommandKey = Model.RegisterProperty<RelayCommand | undefined>(
        Diagram, 'AlignCenterCommand', undefined, MetaData.None);

    // Distribute commands — same shape as the align surface. CanExecute
    // requires ≥ 3 IFigure-shaped selected items (alignment-only fits 2).
    public static readonly DistributeHorizontalCommandKey = Model.RegisterProperty<RelayCommand | undefined>(
        Diagram, 'DistributeHorizontalCommand', undefined, MetaData.None);
    public static readonly DistributeVerticalCommandKey   = Model.RegisterProperty<RelayCommand | undefined>(
        Diagram, 'DistributeVerticalCommand',   undefined, MetaData.None);

    // Group / Ungroup commands — events-based mutation contract. The
    // command itself does not touch the consumer's data collection.
    // Execute fires the corresponding event on Diagram; the consumer's
    // subscriber wraps / dissolves and updates its own VM tree.
    //
    // CanExecute gates:
    //   * GroupCommand   — ≥ 2 top-level entries in SelectedItems
    //   * UngroupCommand — ≥ 1 group-shaped (duck-typed on `Members`)
    //                      top-level entry in SelectedItems
    public static readonly GroupCommandKey   = Model.RegisterProperty<RelayCommand | undefined>(
        Diagram, 'GroupCommand',   undefined, MetaData.None);
    public static readonly UngroupCommandKey = Model.RegisterProperty<RelayCommand | undefined>(
        Diagram, 'UngroupCommand', undefined, MetaData.None);

    // Combine commands — one per GeometryCombineMode. Same event-based
    // mutation contract as Group / Ungroup: Execute fires CombineRequested
    // with the corresponding Mode, consumer wraps the merge result + does
    // the collection mutation. The framework's `combine()` helper (from
    // src/visual-engine/geometry/combine.ts) is what consumers typically
    // invoke to fold-merge the input geometries.
    public static readonly CombineUnionCommandKey     = Model.RegisterProperty<RelayCommand | undefined>(
        Diagram, 'CombineUnionCommand',     undefined, MetaData.None);
    public static readonly CombineIntersectCommandKey = Model.RegisterProperty<RelayCommand | undefined>(
        Diagram, 'CombineIntersectCommand', undefined, MetaData.None);
    public static readonly CombineSubtractCommandKey  = Model.RegisterProperty<RelayCommand | undefined>(
        Diagram, 'CombineSubtractCommand',  undefined, MetaData.None);
    public static readonly CombineExcludeCommandKey   = Model.RegisterProperty<RelayCommand | undefined>(
        Diagram, 'CombineExcludeCommand',   undefined, MetaData.None);

    // ── Connectors collection + template ──────────────────────────
    //
    // `Connectors` is a parallel collection to ItemsSource. Items in
    // Connectors aren't list items — they're a second selectable
    // population on the same canvas. The DiagramConnectorsMaterializer
    // collaborator (constructed below) listens to collection events
    // and materializes one Visual per entry via ConnectorTemplate (or
    // the built-in default = `new Connector()`), parenting each into
    // the DiagramLayersPanel's connectors layer when the ItemsPanel
    // is layered. See § 3.5 of
    // [src/document/connectors.md](../../document/connectors.md).
    public static readonly ConnectorsKey = Model.RegisterProperty<ObservableCollection<Model> | undefined>(
        Diagram, 'Connectors', undefined, MetaData.None);
    public static readonly ConnectorTemplateKey = Model.RegisterProperty<DataTemplate | undefined>(
        Diagram, 'ConnectorTemplate', undefined, MetaData.None);

    // Alignment-guides opt-in. Default off; consumers flip true to
    // enable both the behavior (snap-on-drag + guide-list computation)
    // and the adorner (paints dashed guide lines).
    public static readonly AlignmentGuidesEnabledKey = Model.RegisterProperty<boolean>(
        Diagram, 'AlignmentGuidesEnabled', false, MetaData.None);
    // Read-only — driven by AlignmentGuidesBehavior. Adorner subscribes
    // here; consumers can also bind for custom guide visualization.
    public static readonly AlignmentGuidesKey = Model.RegisterReadOnlyProperty<readonly AlignmentGuide[]>(
        Diagram, 'AlignmentGuides', Object.freeze([]) as readonly AlignmentGuide[], MetaData.None);

    // Selection-resize opt-in. Default off. When flipped true, a
    // SelectionBoundsAdorner mounts in the ItemsPanel's AdornerLayer
    // and drives resize gestures through DiagramSelectionSource (which
    // duck-types Width / Height writes through resolveKey).
    public static readonly SelectionResizeEnabledKey = Model.RegisterProperty<boolean>(
        Diagram, 'SelectionResizeEnabled', false, MetaData.None);

    // Connector-interactions opt-in. Default off. When flipped true, the
    // framework mounts a PortHandlesAdorner (port dots on Figure hover)
    // and an EditHandlesAdorner (endpoint + waypoint dots on selected
    // connectors), and wires Diagram-level pointer events into
    // ConnectorCreateBehavior + ConnectorEditAdorner state machines.
    // The DP is the consumer-facing toggle; the framework owns every
    // line of plumbing inside.
    public static readonly ConnectorInteractionsEnabledKey = Model.RegisterProperty<boolean>(
        Diagram, 'ConnectorInteractionsEnabled', false, MetaData.None);

    // Drop receiver — when set, Diagram attaches its canvas-drop
    // behavior to this Visual (typically the surrounding Border or
    // ScrollViewer). Bound declaratively from markup so the consumer
    // doesn't have to call attachCanvasDropBehavior from a view-mount
    // callback. Setting to undefined detaches.
    //
    // The receiver MUST be on the bubble path of every legitimate drop
    // location — a naive Diagram receiver misses drops on the
    // scrollbar (which lives outside Diagram's visual subtree), so the
    // typical wiring is `DropReceiver = $surface` against an enclosing
    // Border / ScrollViewer.
    public static readonly DropReceiverKey = Model.RegisterProperty<Visual | undefined>(
        Diagram, 'DropReceiver', undefined, MetaData.None);

    // Mutation adapter — when set, Diagram subscribes its gesture
    // events (GroupRequested / UngroupRequested / CombineRequested /
    // DeleteRequested / ItemDropped) to the corresponding methods on
    // the adapter. Internalises the wiring that consumers used to do
    // by hand in their bootstrap. See attach-standard-mutations.ts.
    public static readonly MutatorKey = Model.RegisterProperty<DiagramMutator | undefined>(
        Diagram, 'Mutator', undefined, MetaData.None);

    // Selection-reflection opt-in. When true, SelectionReflector mirrors
    // SelectedItems onto each item's `IsSelected` DP (duck-typed via
    // findDescriptor — items without IsSelected are skipped). Off by
    // default so plain Selector consumers without an IsSelected
    // convention pay nothing.
    public static readonly ReflectSelectionToItemsKey = Model.RegisterProperty<boolean>(
        Diagram, 'ReflectSelectionToItems', false, MetaData.None);

    // Multi-target format mirror DPs — driven by FormatMirror. Seeded
    // from the first leaf in SelectedItems on every SelectionChanged;
    // edits to these DPs broadcast to every leaf in the flattened
    // selection. Duck-types on Fill / Stroke properties; items without
    // those (Groups, text-only labels) skip the broadcast.
    public static readonly SelectionFormatFillKey   = Model.RegisterProperty<Brush | undefined>(
        Diagram, 'SelectionFormatFill',   undefined, MetaData.None);
    public static readonly SelectionFormatStrokeKey = Model.RegisterProperty<Pen   | undefined>(
        Diagram, 'SelectionFormatStroke', undefined, MetaData.None);

    // Connector end-cap format channel. FormatMirror seeds these from the
    // first selected connector and broadcasts edits onto every selected
    // connector's Source/TargetCapTemplate. SelectionIsConnector is the
    // editor's "show the cap section" signal — true when the selection is
    // (entirely) connectors. The VALUE is the cap DataTemplate (undefined
    // = no cap at that end).
    public static readonly SelectionFormatSourceCapKey = Model.RegisterProperty<DataTemplate | undefined>(
        Diagram, 'SelectionFormatSourceCap', undefined, MetaData.None);
    public static readonly SelectionFormatTargetCapKey = Model.RegisterProperty<DataTemplate | undefined>(
        Diagram, 'SelectionFormatTargetCap', undefined, MetaData.None);
    public static readonly SelectionIsConnectorKey = Model.RegisterProperty<boolean>(
        Diagram, 'SelectionIsConnector', false, MetaData.None);
    // Per-end cap size multipliers. FormatMirror seeds these from the first
    // selected connector's Source/TargetCapScale and broadcasts edits onto
    // every selected connector. 1 = the cap template's authored size.
    public static readonly SelectionFormatSourceCapScaleKey = Model.RegisterProperty<number>(
        Diagram, 'SelectionFormatSourceCapScale', 1, MetaData.None);
    public static readonly SelectionFormatTargetCapScaleKey = Model.RegisterProperty<number>(
        Diagram, 'SelectionFormatTargetCapScale', 1, MetaData.None);

    public get PositionSnap():  DiagramPositionSnap | undefined { return this.get_property_value(Diagram.PositionSnapKey); }
    public set PositionSnap(v: DiagramPositionSnap | undefined) { this.set_property_value(Diagram.PositionSnapKey, v); }

    public get SelectionLeft():   number { return this.get_property_value(Diagram.SelectionLeftKey); }
    public get SelectionTop():    number { return this.get_property_value(Diagram.SelectionTopKey); }
    public get SelectionWidth():  number { return this.get_property_value(Diagram.SelectionWidthKey); }
    public get SelectionHeight(): number { return this.get_property_value(Diagram.SelectionHeightKey); }
    public get SelectionCount():  number { return this.get_property_value(Diagram.SelectionCountKey); }

    public get AlignLeftCommand():   RelayCommand | undefined { return this.get_property_value(Diagram.AlignLeftCommandKey); }
    public get AlignRightCommand():  RelayCommand | undefined { return this.get_property_value(Diagram.AlignRightCommandKey); }
    public get AlignTopCommand():    RelayCommand | undefined { return this.get_property_value(Diagram.AlignTopCommandKey); }
    public get AlignMiddleCommand(): RelayCommand | undefined { return this.get_property_value(Diagram.AlignMiddleCommandKey); }
    public get AlignCenterCommand(): RelayCommand | undefined { return this.get_property_value(Diagram.AlignCenterCommandKey); }

    public get DistributeHorizontalCommand(): RelayCommand | undefined { return this.get_property_value(Diagram.DistributeHorizontalCommandKey); }
    public get DistributeVerticalCommand():   RelayCommand | undefined { return this.get_property_value(Diagram.DistributeVerticalCommandKey); }

    public get GroupCommand():   RelayCommand | undefined { return this.get_property_value(Diagram.GroupCommandKey); }
    public get UngroupCommand(): RelayCommand | undefined { return this.get_property_value(Diagram.UngroupCommandKey); }

    public get CombineUnionCommand():     RelayCommand | undefined { return this.get_property_value(Diagram.CombineUnionCommandKey); }
    public get CombineIntersectCommand(): RelayCommand | undefined { return this.get_property_value(Diagram.CombineIntersectCommandKey); }
    public get CombineSubtractCommand():  RelayCommand | undefined { return this.get_property_value(Diagram.CombineSubtractCommandKey); }
    public get CombineExcludeCommand():   RelayCommand | undefined { return this.get_property_value(Diagram.CombineExcludeCommandKey); }

    public get Connectors(): ObservableCollection<Model> | undefined { return this.get_property_value(Diagram.ConnectorsKey); }
    public set Connectors(v: ObservableCollection<Model> | undefined) { this.set_property_value(Diagram.ConnectorsKey, v); }

    /** @see RigidConnectorDragHost — drives the internal-connector rigid
     *  translate for a multi-selection drag. Snapshots every connector
     *  whose BOTH endpoint nodes are in `movingSet` AND that carries user
     *  waypoints; a boundary connector (one end in the set) is left to its
     *  normal per-figure reroute, and a pure auto-routed internal one
     *  already translation-invariantly recomputes, so neither is tracked. */
    public BeginRigidConnectorDrag(movingSet: ReadonlySet<Model>): RigidConnectorDragSession | undefined
    {
        const connectors = this.Connectors;
        if (connectors === undefined) return undefined;
        const tracked: { connector: Connector; snapshot: readonly Point[] }[] = [];
        for (let i = 0; i < connectors.Count; i++)
        {
            const c = connectors.Get(i);
            if (!(c instanceof Connector)) continue;
            const wps = c.Waypoints;
            if (wps === undefined || wps.length === 0) continue;   // nothing to preserve
            const sn = c.Source?.Node;
            const tn = c.Target?.Node;
            if (sn === undefined || tn === undefined) continue;
            if (!movingSet.has(sn) || !movingSet.has(tn)) continue; // internal only
            tracked.push({ connector: c, snapshot: wps.slice() });
        }
        if (tracked.length === 0) return undefined;

        let totalDx = 0;
        let totalDy = 0;
        return {
            Translate: (dx: number, dy: number): void => {
                totalDx += dx;
                totalDy += dy;
                for (const t of tracked)
                {
                    t.connector.Waypoints = t.snapshot.map(p => new Point(p.X + totalDx, p.Y + totalDy));
                }
            },
            End: (): void => { tracked.length = 0; },
        };
    }
    public get ConnectorTemplate(): DataTemplate | undefined { return this.get_property_value(Diagram.ConnectorTemplateKey); }
    public set ConnectorTemplate(v: DataTemplate | undefined) { this.set_property_value(Diagram.ConnectorTemplateKey, v); }

    public get AlignmentGuidesEnabled():  boolean { return this.get_property_value(Diagram.AlignmentGuidesEnabledKey); }
    public set AlignmentGuidesEnabled(v: boolean) { this.set_property_value(Diagram.AlignmentGuidesEnabledKey, v); }
    public get SelectionResizeEnabled():  boolean { return this.get_property_value(Diagram.SelectionResizeEnabledKey); }
    public set SelectionResizeEnabled(v: boolean) { this.set_property_value(Diagram.SelectionResizeEnabledKey, v); }
    public get ConnectorInteractionsEnabled():  boolean { return this.get_property_value(Diagram.ConnectorInteractionsEnabledKey); }
    public set ConnectorInteractionsEnabled(v: boolean) { this.set_property_value(Diagram.ConnectorInteractionsEnabledKey, v); }
    public get ReflectSelectionToItems():  boolean { return this.get_property_value(Diagram.ReflectSelectionToItemsKey); }
    public set ReflectSelectionToItems(v: boolean) { this.set_property_value(Diagram.ReflectSelectionToItemsKey, v); }
    public get DropReceiver():  Visual | undefined { return this.get_property_value(Diagram.DropReceiverKey); }
    public set DropReceiver(v: Visual | undefined) { this.set_property_value(Diagram.DropReceiverKey, v); }
    public get Mutator():  DiagramMutator | undefined { return this.get_property_value(Diagram.MutatorKey); }
    public set Mutator(v: DiagramMutator | undefined) { this.set_property_value(Diagram.MutatorKey, v); }
    public get SelectionFormatFill():    Brush | undefined { return this.get_property_value(Diagram.SelectionFormatFillKey); }
    public set SelectionFormatFill(v:    Brush | undefined) { this.set_property_value(Diagram.SelectionFormatFillKey, v); }
    public get SelectionFormatStroke():  Pen   | undefined { return this.get_property_value(Diagram.SelectionFormatStrokeKey); }
    public set SelectionFormatStroke(v:  Pen   | undefined) { this.set_property_value(Diagram.SelectionFormatStrokeKey, v); }
    public get SelectionFormatSourceCap(): DataTemplate | undefined { return this.get_property_value(Diagram.SelectionFormatSourceCapKey); }
    public set SelectionFormatSourceCap(v: DataTemplate | undefined) { this.set_property_value(Diagram.SelectionFormatSourceCapKey, v); }
    public get SelectionFormatTargetCap(): DataTemplate | undefined { return this.get_property_value(Diagram.SelectionFormatTargetCapKey); }
    public set SelectionFormatTargetCap(v: DataTemplate | undefined) { this.set_property_value(Diagram.SelectionFormatTargetCapKey, v); }
    public get SelectionIsConnector():   boolean { return this.get_property_value(Diagram.SelectionIsConnectorKey); }
    public set SelectionIsConnector(v:   boolean) { this.set_property_value(Diagram.SelectionIsConnectorKey, v); }
    public get SelectionFormatSourceCapScale(): number { return this.get_property_value(Diagram.SelectionFormatSourceCapScaleKey); }
    public set SelectionFormatSourceCapScale(v: number) { this.set_property_value(Diagram.SelectionFormatSourceCapScaleKey, v); }
    public get SelectionFormatTargetCapScale(): number { return this.get_property_value(Diagram.SelectionFormatTargetCapScaleKey); }
    public set SelectionFormatTargetCapScale(v: number) { this.set_property_value(Diagram.SelectionFormatTargetCapScaleKey, v); }

    // Standard connector-cap dropdown list for a ShapeFormatControl's
    // CapOptions DP. A real DP (not a plain getter) so a markup binding
    // `CapOptions=$diagram.ConnectorCapOptions` resolves — ElementName /
    // DataContext bindings only walk registered properties. Populated in
    // the ctor; each option resolves its cap template lazily, so building
    // the list before the cap catalog is registered is fine. Convenience
    // only — the editor itself is cap-agnostic.
    public static readonly ConnectorCapOptionsKey = Model.RegisterProperty<readonly CapOption[]>(
        Diagram, 'ConnectorCapOptions', EMPTY_CAP_OPTIONS, MetaData.None);
    public get ConnectorCapOptions(): readonly CapOption[] { return this.get_property_value(Diagram.ConnectorCapOptionsKey); }
    public get AlignmentGuides(): readonly AlignmentGuide[] { return this.get_property_value(Diagram.AlignmentGuidesKey); }
    /** @internal — used by AlignmentGuidesBehavior to drive the read-only DP. */
    public _setAlignmentGuides(guides: readonly AlignmentGuide[]): void
    {
        this.set_property_value_with_key(Diagram.AlignmentGuidesKey, guides);
    }

    // Subscriber-pattern event API for Group / Ungroup requests. Same
    // shape as Selector.AddSelectionChangedListener. The framework's
    // KNOWN_ROUTED_EVENTS Set is reserved for input events that bubble;
    // these are control-specific domain events that don't need the
    // routing pipeline.
    private readonly _groupRequestedListeners:   Set<GroupRequestedListener>   = new Set();
    private readonly _ungroupRequestedListeners: Set<UngroupRequestedListener> = new Set();

    public AddGroupRequestedListener   (listener: GroupRequestedListener):   void { this._groupRequestedListeners.add(listener); }
    public RemoveGroupRequestedListener(listener: GroupRequestedListener):   void { this._groupRequestedListeners.delete(listener); }
    public AddUngroupRequestedListener   (listener: UngroupRequestedListener): void { this._ungroupRequestedListeners.add(listener); }
    public RemoveUngroupRequestedListener(listener: UngroupRequestedListener): void { this._ungroupRequestedListeners.delete(listener); }

    private readonly _combineRequestedListeners: Set<CombineRequestedListener> = new Set();
    public AddCombineRequestedListener   (listener: CombineRequestedListener): void { this._combineRequestedListeners.add(listener); }
    public RemoveCombineRequestedListener(listener: CombineRequestedListener): void { this._combineRequestedListeners.delete(listener); }

    private readonly _itemDroppedListeners: Set<ItemDroppedListener> = new Set();
    public AddItemDroppedListener   (listener: ItemDroppedListener): void { this._itemDroppedListeners.add(listener); }
    public RemoveItemDroppedListener(listener: ItemDroppedListener): void { this._itemDroppedListeners.delete(listener); }

    private readonly _deleteRequestedListeners: Set<DeleteRequestedListener> = new Set();
    public AddDeleteRequestedListener   (listener: DeleteRequestedListener): void { this._deleteRequestedListeners.add(listener); }
    public RemoveDeleteRequestedListener(listener: DeleteRequestedListener): void { this._deleteRequestedListeners.delete(listener); }

    private readonly _connectorCreatedListeners: Set<ConnectorCreatedListener> = new Set();
    public AddConnectorCreatedListener   (listener: ConnectorCreatedListener): void { this._connectorCreatedListeners.add(listener); }
    public RemoveConnectorCreatedListener(listener: ConnectorCreatedListener): void { this._connectorCreatedListeners.delete(listener); }

    // Internal fire helpers — invoked by DiagramCommands when the
    // corresponding RelayCommand's Execute runs. Snapshot-then-iterate
    // so a listener that registers / unregisters mid-fire doesn't
    // mutate the Set under iteration.
    /** @internal */
    public _fireGroupRequested(args: GroupRequestedArgs): void
    {
        for (const l of [...this._groupRequestedListeners]) l(args);
    }

    /** @internal */
    public _fireUngroupRequested(args: UngroupRequestedArgs): void
    {
        for (const l of [...this._ungroupRequestedListeners]) l(args);
    }

    /** @internal */
    public _fireCombineRequested(args: CombineRequestedArgs): void
    {
        for (const l of [...this._combineRequestedListeners]) l(args);
    }

    /** @internal */
    public _fireItemDropped(args: ItemDroppedArgs): void
    {
        for (const l of [...this._itemDroppedListeners]) l(args);
    }

    /** @internal */
    public _fireDeleteRequested(args: DeleteRequestedArgs): void
    {
        for (const l of [...this._deleteRequestedListeners]) l(args);
    }

    /** @internal */
    public _fireConnectorCreated(args: ConnectorCreatedArgs): void
    {
        for (const l of [...this._connectorCreatedListeners]) l(args);
    }

    // Alignment-guides attach state. `_alignmentGuidesDetach` holds the
    // behavior's detach thunk when active; undefined when disabled.
    // `_alignmentGuidesAdorner` is the mounted adorner instance when
    // present; undefined when disabled OR when the ItemsPanel doesn't
    // have an AdornerLayer yet (the adorner mount is deferred via
    // queueMicrotask to handle the common case of consumers setting
    // the DP before the layout pass has materialized the ItemsPanel).
    private _alignmentGuidesDetach:  (() => void) | undefined = undefined;
    private _alignmentGuidesAdorner: AlignmentGuidesAdorner | undefined = undefined;

    // Selection-resize state — adorner instance + the source that
    // drives its resize semantics. undefined when SelectionResizeEnabled
    // is false; queueMicrotask-deferred mount handles the case where
    // the DP flips before ItemsPanel materializes.
    private _selectionResizeAdorner: SelectionBoundsAdorner | undefined = undefined;
    private _selectionResizeSource:  DiagramSelectionSource | undefined = undefined;

    // Connector-interactions detach thunk — set when the behavior is
    // attached, called + cleared on detach. The behavior owns its own
    // adorner mount / unmount internally; one slot here is enough.
    private _connectorInteractionsDetach: (() => void) | undefined = undefined;

    // Connector-interactions preview-pointer interceptor. Figure's
    // OnPointerDown / Move / Up all set args.Handled = true, which
    // short-circuits the bubble route walk before any Diagram-level
    // routed listener fires. The connector-interactions behavior
    // installs here so its handler runs in the TUNNEL phase (root →
    // target, before the descendant Figure consumes the event). The
    // four methods mirror the framework's pointer virtual conventions.
    private _connectorInteractionsHandlers: ConnectorInteractionsHandlers | undefined = undefined;
    /** @internal — used by attachConnectorInteractions in the framework's
     *  connector-interactions behavior. Not exposed publicly. */
    public _setConnectorInteractionsHandlers(h: ConnectorInteractionsHandlers | undefined): void
    {
        this._connectorInteractionsHandlers = h;
    }

    // Drop-receiver / Mutator attach state — detach thunks for whichever
    // receiver / mutator is currently wired. Swapped out on DP change so
    // the previous wiring releases its listeners.
    private _dropReceiverDetach:  (() => void) | undefined = undefined;
    private _mutatorDetach:       (() => void) | undefined = undefined;

    // Tracks a Mutator value that THIS Diagram installed via
    // DataContext-auto-wire (see _autoWireMutator). When the consumer
    // overrides Mutator explicitly, this clears so the override stays
    // sticky across DataContext swaps.
    private _autoWiredMutator:    DiagramMutator | undefined = undefined;

    // The DataContext we published ourselves onto (its ActiveView === this).
    // Tracked so a DataContext swap clears the stale back-reference rather than
    // leaving a dead control pinned on a document nobody presents.
    private _publishedViewHost:   IDiagramViewHost | undefined = undefined;

    // Connectors materializer collaborator. Held as a field so the
    // OnPropertyChanged handler for the Connectors / ConnectorTemplate
    // DPs can forward the change.
    private readonly _connectorsMaterializer: DiagramConnectorsMaterializer;

    /** @internal — testing hook for the materialized item → Visual map. */
    public _getConnectorsMaterializerForTesting(): DiagramConnectorsMaterializer { return this._connectorsMaterializer; }

    // Connector-selection track (§ 12 of
    // [src/document/connectors.md](../../document/connectors.md), per
    // the § 7.3 recommendation). Kept separate from the inherited
    // Selector._selectedContainers (which holds Figure containers) so
    // SelectedItem / SelectedItems stay typed as the ItemsSource
    // population — mixed-kind selections instead go through
    // SelectedConnectors + the existing SelectedItems channel.
    private readonly _selectedConnectors: Set<Connector> = new Set();

    // Subscriber list for ConnectorSelectionChanged. Mirrors the figure-
    // side SelectionChanged channel inherited from Selector, but kept as
    // a separate event because Selector's API is typed against the
    // ItemsSource population (figures) and the connector track lives in
    // its own Set above. FormatMirror subscribes here so editing a Pen
    // in the shared editor reaches selected connectors the same way it
    // reaches selected figures.
    private readonly _connectorSelectionChangedListeners: Set<() => void> = new Set();

    public AddConnectorSelectionChangedListener   (listener: () => void): void { this._connectorSelectionChangedListeners.add(listener); }
    public RemoveConnectorSelectionChangedListener(listener: () => void): void { this._connectorSelectionChangedListeners.delete(listener); }

    private _fireConnectorSelectionChanged(): void
    {
        for (const l of [...this._connectorSelectionChangedListeners]) l();
    }

    public SelectConnector(c: Connector): void
    {
        if (this._selectedConnectors.has(c)) return;
        this._selectedConnectors.add(c);
        this._fireConnectorSelectionChanged();
    }
    public DeselectConnector(c: Connector): void
    {
        if (!this._selectedConnectors.delete(c)) return;
        this._fireConnectorSelectionChanged();
    }
    public ClearConnectorSelection(): void
    {
        if (this._selectedConnectors.size === 0) return;
        this._selectedConnectors.clear();
        this._fireConnectorSelectionChanged();
    }
    public IsConnectorSelected(c: Connector):  boolean { return this._selectedConnectors.has(c); }
    public get SelectedConnectors():           readonly Connector[] { return [...this._selectedConnectors]; }

    // Live subscription to the Connectors collection that keeps the
    // connector selection honest: a connector removed from Connectors
    // (the consumer's DeleteRequested listener mutating the collection)
    // must not linger in _selectedConnectors, or FormatMirror would keep
    // pushing Pen edits to a dead connector and the edit adorner would
    // keep painting its handles. Re-armed whenever the Connectors DP is
    // swapped (see OnPropertyChanged).
    private _connectorsPruneUnsub: (() => void) | undefined = undefined;

    private _resubscribeConnectorsForSelectionPrune(): void
    {
        this._connectorsPruneUnsub?.();
        this._connectorsPruneUnsub = undefined;
        const collection = this.Connectors;
        // Any change (item removed, collection cleared, or the whole DP
        // swapped) reconciles selection against what's currently present.
        this._pruneSelectionToCurrentConnectors();
        if (collection !== undefined)
        {
            this._connectorsPruneUnsub = collection.Subscribe(() => this._pruneSelectionToCurrentConnectors());
        }
    }

    private _pruneSelectionToCurrentConnectors(): void
    {
        if (this._selectedConnectors.size === 0) return;
        const collection = this.Connectors;
        const present = new Set<Model>();
        if (collection !== undefined)
        {
            for (let i = 0; i < collection.Count; i++) present.add(collection.Get(i)!);
        }
        let changed = false;
        for (const c of [...this._selectedConnectors])
        {
            if (!present.has(c as unknown as Model))
            {
                this._selectedConnectors.delete(c);
                changed = true;
            }
        }
        if (changed) this._fireConnectorSelectionChanged();
    }

    // Range-select the inclusive slice of Connectors between `from` and
    // `to` in Diagram.Connectors index order. Diff-applied so unchanged
    // entries don't churn the ConnectorSelectionChanged event. Mirrors
    // Selector.selectContainerRange (used by Shift+click on figures);
    // shared editor wiring (FormatMirror) reacts to the resulting
    // ConnectorSelectionChanged exactly once at the end of the apply,
    // not per-entry. Either endpoint missing from Connectors → no-op
    // (same forgiving contract as Selector — a stale anchor doesn't
    // throw).
    public SelectConnectorRange(from: Connector, to: Connector): void
    {
        const live = this.Connectors;
        if (live === undefined) return;
        let fromIdx = -1, toIdx = -1;
        const arr: Connector[] = [];
        for (let i = 0; i < live.Count; i++)
        {
            const c = live.Get(i) as Connector | undefined;
            if (c === undefined) continue;
            arr.push(c);
            if (c === from) fromIdx = arr.length - 1;
            if (c === to)   toIdx   = arr.length - 1;
        }
        if (fromIdx < 0 || toIdx < 0) return;
        const lo = Math.min(fromIdx, toIdx);
        const hi = Math.max(fromIdx, toIdx);
        const next = new Set<Connector>();
        for (let i = lo; i <= hi; i++) next.add(arr[i]!);
        let changed = false;
        for (const existing of [...this._selectedConnectors])
        {
            if (!next.has(existing))
            {
                this._selectedConnectors.delete(existing);
                changed = true;
            }
        }
        for (const c of next)
        {
            if (!this._selectedConnectors.has(c))
            {
                this._selectedConnectors.add(c);
                changed = true;
            }
        }
        if (changed) this._fireConnectorSelectionChanged();
    }

    constructor()
    {
        super();
        // Default Template flows from the bundled diagram theme entry
        // under TargetType=Diagram (see diagram.template.mu): a
        // ScrollViewer wrapping an ItemsPresenter. Folding the scroll
        // shell into the template means the Diagram itself is on the
        // bubble path of canvas drops — `DropReceiver = $Self`
        // (relative-source-self, i.e. the Diagram instance) works
        // without an enclosing Border.
        this.applyDefaultStyle();
        // Collaborators — internal, no public surface. Eagerly
        // constructed so the Diagram is fully-equipped from the moment
        // the constructor returns.
        new DiagramCommands(this);
        new SelectionBoundsTracker(this);
        new FormatMirror(this);
        new SelectionReflector(this);
        this._connectorsMaterializer = new DiagramConnectorsMaterializer(this);
        // Seed the cap dropdown catalog. Safe here despite the cap
        // resources not being registered yet — each option resolves its
        // template lazily on read (see connectorCapOptions / CapOption).
        this.set_property_value(Diagram.ConnectorCapOptionsKey, connectorCapOptions());
    }

    // PointerDown anywhere on the Diagram surface takes keyboard focus
    // so subsequent Delete / Ctrl+G / arrow-key shortcuts route to this
    // Diagram. No-op when Focusable=false (the Visual.Focus contract).
    protected override OnPointerDown(args: PointerEventArgs): void
    {
        super.OnPointerDown(args);
        this.Focus();
    }

    // Preview-phase pointer overrides delegate to the connector-
    // interactions interceptor when one is installed. Fire BEFORE
    // descendant Figures consume the event by setting args.Handled,
    // which is the only reliable point to intercept gestures that
    // start on a Figure's bounding rect (port-handle clicks that ride
    // above the figure visual; figure-body clicks that pre-handle
    // before a Diagram-level bubble listener could ever run).
    protected override OnPreviewPointerDown(args: PointerEventArgs): void
    {
        super.OnPreviewPointerDown(args);
        this._connectorInteractionsHandlers?.OnPreviewPointerDown(args);
    }
    protected override OnPreviewPointerMove(args: PointerEventArgs): void
    {
        super.OnPreviewPointerMove(args);
        this._connectorInteractionsHandlers?.OnPreviewPointerMove(args);
    }
    protected override OnPreviewPointerUp(args: PointerEventArgs): void
    {
        super.OnPreviewPointerUp(args);
        this._connectorInteractionsHandlers?.OnPreviewPointerUp(args);
    }
    protected override OnPointerLeave(args: PointerEventArgs): void
    {
        super.OnPointerLeave(args);
        this._connectorInteractionsHandlers?.OnPointerLeave(args);
    }

    protected override OnPropertyChanged(
        descriptor: PropertyDescriptor,
        oldValue:   unknown,
        newValue:   unknown,
    ): void
    {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        if (descriptor.Name === 'AlignmentGuidesEnabled')
        {
            if (newValue === true) this._attachAlignmentGuides();
            else                   this._detachAlignmentGuides();
        }
        else if (descriptor.Name === 'SelectionResizeEnabled')
        {
            if (newValue === true) this._attachSelectionResize();
            else                   this._detachSelectionResize();
        }
        else if (descriptor.Name === 'ConnectorInteractionsEnabled')
        {
            if (newValue === true) this._attachConnectorInteractions();
            else                   this._detachConnectorInteractions();
        }
        else if (descriptor.Name === 'DropReceiver')
        {
            this._reattachDropReceiver(newValue as Visual | undefined);
        }
        else if (descriptor.Name === 'Mutator')
        {
            // Consumer-driven Mutator write — if it doesn't match the
            // value we auto-wired, the consumer has taken over and our
            // tracking slot needs to release so a later DataContext swap
            // doesn't clear their explicit pick.
            if (this._autoWiredMutator !== undefined
                && newValue !== this._autoWiredMutator)
            {
                this._autoWiredMutator = undefined;
            }
            this._reattachMutator(newValue as DiagramMutator | undefined);
        }
        else if (descriptor.Name === 'DataContext')
        {
            this._autoWireMutatorFromDataContext(newValue);
            this._publishViewToDataContext(newValue);
        }
        else if (descriptor === Diagram.ConnectorsKey.descriptor)
        {
            this._connectorsMaterializer._onConnectorsCollectionChanged();
            this._resubscribeConnectorsForSelectionPrune();
        }
        else if (descriptor === Diagram.ConnectorTemplateKey.descriptor)
        {
            this._connectorsMaterializer._onTemplateChanged();
        }
    }

    // Auto-wire convenience: when a Diagram receives a DataContext that
    // structurally implements DiagramMutator AND no explicit Mutator
    // has been written, install the DataContext itself as the Mutator.
    // Lets a DiagramDocument-shaped VM serve as both the data root and
    // the mutator without an extra binding in markup. WPF parity with
    // ItemsControl's "Source defaults to DataContext" idiom.
    //
    // Edge cases:
    //   * Consumer set Mutator explicitly → respected (we never clobber
    //     a value we didn't install).
    //   * DataContext swaps to a non-mutator value → withdraw the
    //     auto-wire so the stale instance doesn't keep handling events.
    //   * Both old and new DC are mutators → fresh wire to the new one.
    private _autoWireMutatorFromDataContext(dc: unknown): void
    {
        // Withdraw the previous auto-wire before considering the new
        // DC. If the consumer set Mutator manually in the meantime,
        // _autoWiredMutator was already cleared in the Mutator-DP
        // branch above, so this guard's `=== Mutator` check stays
        // accurate.
        if (this._autoWiredMutator !== undefined
            && this.Mutator === this._autoWiredMutator)
        {
            this._autoWiredMutator = undefined;
            this.Mutator           = undefined;
        }
        if (this.Mutator !== undefined) return;
        if (Diagram._isDiagramMutator(dc))
        {
            this._autoWiredMutator = dc;
            this.Mutator           = dc;
        }
    }

    // Publish this control as the DataContext's ActiveView (see IDiagramViewHost)
    // so sibling regions reach our commands / selection-format through the VM.
    // Clears the previously-published host's back-reference on a DataContext
    // swap — but only if it still points at us, so a view that re-materialized
    // and already re-claimed the slot isn't clobbered.
    private _publishViewToDataContext(dc: unknown): void
    {
        if (this._publishedViewHost !== undefined
            && this._publishedViewHost.ActiveView === this)
        {
            this._publishedViewHost.ActiveView = undefined;
        }
        this._publishedViewHost = undefined;
        if (Diagram._isDiagramViewHost(dc))
        {
            dc.ActiveView = this;
            this._publishedViewHost = dc;
        }
    }

    private static _isDiagramViewHost(value: unknown): value is IDiagramViewHost
    {
        return typeof value === 'object' && value !== null && 'ActiveView' in value;
    }

    private static _isDiagramMutator(value: unknown): value is DiagramMutator
    {
        if (typeof value !== 'object' || value === null) return false;
        const v = value as Record<string, unknown>;
        return typeof v.Group            === 'function'
            && typeof v.Ungroup          === 'function'
            && typeof v.CombineSelection === 'function'
            && typeof v.DeleteNodes      === 'function'
            && typeof v.CreateNode       === 'function';
    }

    private _reattachDropReceiver(receiver: Visual | undefined): void
    {
        if (this._dropReceiverDetach !== undefined)
        {
            this._dropReceiverDetach();
            this._dropReceiverDetach = undefined;
        }
        if (receiver !== undefined)
        {
            this._dropReceiverDetach = attachCanvasDropBehavior(receiver, this);
        }
    }

    private _reattachMutator(mutator: DiagramMutator | undefined): void
    {
        if (this._mutatorDetach !== undefined)
        {
            this._mutatorDetach();
            this._mutatorDetach = undefined;
        }
        if (mutator !== undefined)
        {
            this._mutatorDetach = attachStandardDiagramMutations(this, mutator);
        }
    }

    private _attachAlignmentGuides(): void
    {
        if (this._alignmentGuidesDetach !== undefined) return;
        this._alignmentGuidesDetach = attachAlignmentGuides(this);
        // Adorner mount needs the ItemsPanel's AdornerLayer, which only
        // exists after first layout. Defer to next microtask; if the
        // layer still isn't reachable then, no-op (consumer can re-flip
        // the DP after mount, or set it AFTER initial layout).
        queueMicrotask(() => this._mountAlignmentGuidesAdorner());
    }

    private _detachAlignmentGuides(): void
    {
        if (this._alignmentGuidesDetach !== undefined)
        {
            this._alignmentGuidesDetach();
            this._alignmentGuidesDetach = undefined;
        }
        if (this._alignmentGuidesAdorner !== undefined)
        {
            const layer = AdornerLayer.GetAdornerLayer(this._alignmentGuidesAdorner.AdornedElement);
            layer?.Remove(this._alignmentGuidesAdorner);
            this._alignmentGuidesAdorner.Dispose();
            this._alignmentGuidesAdorner = undefined;
        }
    }

    private _mountAlignmentGuidesAdorner(): void
    {
        if (this._alignmentGuidesAdorner !== undefined) return;
        const panel = this.ItemsPanelInstance;
        if (panel === undefined) return;   // layout hasn't materialized yet
        const layer = AdornerLayer.GetAdornerLayer(panel);
        if (layer === undefined) return;   // no AdornerLayer in scope
        const adorner = new AlignmentGuidesAdorner(panel, this);
        layer.Add(adorner);
        this._alignmentGuidesAdorner = adorner;
    }

    private _attachSelectionResize(): void
    {
        if (this._selectionResizeSource !== undefined) return;
        this._selectionResizeSource = new DiagramSelectionSource(this);
        queueMicrotask(() => this._mountSelectionResizeAdorner());
    }

    private _detachSelectionResize(): void
    {
        if (this._selectionResizeAdorner !== undefined)
        {
            const layer = AdornerLayer.GetAdornerLayer(this._selectionResizeAdorner.AdornedElement);
            layer?.Remove(this._selectionResizeAdorner);
            this._selectionResizeAdorner = undefined;
        }
        this._selectionResizeSource = undefined;
    }

    private _attachConnectorInteractions(): void
    {
        if (this._connectorInteractionsDetach !== undefined) return;
        this._connectorInteractionsDetach = attachConnectorInteractions(this);
    }

    private _detachConnectorInteractions(): void
    {
        if (this._connectorInteractionsDetach !== undefined)
        {
            this._connectorInteractionsDetach();
            this._connectorInteractionsDetach = undefined;
        }
    }

    private _mountSelectionResizeAdorner(): void
    {
        if (this._selectionResizeAdorner !== undefined) return;
        if (this._selectionResizeSource  === undefined) return;
        const panel = this.ItemsPanelInstance;
        if (panel === undefined) return;
        const layer = AdornerLayer.GetAdornerLayer(panel);
        if (layer === undefined) return;
        const adorner = new SelectionBoundsAdorner(panel, this._selectionResizeSource);
        layer.Add(adorner);
        this._selectionResizeAdorner = adorner;
    }

    public override GetContainerForItemOverride(item: unknown): Visual
    {
        // Items in the framework Diagram ARE Figures / Groups — the data
        // and the visual are the same Visual instance. So the item is
        // its own container; no wrapping needed.
        if (item instanceof Figure || item instanceof Group) return item;
        // Fallback for non-Figure/Group items — wrap in a fresh Figure
        // (preserves the old WPF-style data-container split for consumers
        // that bind a VM collection to ItemsSource).
        const node = new Figure();
        this.bindContainer(node, item);
        return node;
    }

    // Arrow keys nudge selected nodes' position rather than navigate
    // selection (Visio / drawio / Figma convention). The Selector base
    // treats ArrowDown / ArrowUp as ListBox-style "move focus to next
    // row" — wrong shape for a free-positioned canvas surface, so the
    // override intercepts arrows BEFORE super.OnKeyDown runs.
    //
    // Step size: 1 dp plain, 10 dp with Shift (matches the canonical
    // "snap-to-grid"-ish increment in every drawing tool). Each
    // selected Figure's Left / Top bumps directly; the BindsTwoWayByDefault
    // contract on Figure.Left / Top back-propagates the new position to
    // the bound item VM through ItemContainerStyle, so the data layer
    // sees the move without the Diagram reaching into item shape.
    //
    // No-op (and falls through to Selector base) when nothing is
    // selected — so arrow keys on an empty selection still drive
    // selection navigation should the consumer rely on it.
    protected override OnKeyDown(args: KeyEventArgs): void
    {
        const key = args.Key;
        const isArrow = key === Key.Left || key === Key.Right
                     || key === Key.Up   || key === Key.Down;
        if (isArrow && this._selectedContainers.size > 0)
        {
            const step = hasModifier(args.Modifiers, ModifierKeys.Shift) ? 10 : 1;
            const dx = key === Key.Left ? -step : key === Key.Right ? step : 0;
            const dy = key === Key.Up   ? -step : key === Key.Down  ? step : 0;
            for (const container of this._selectedContainers)
            {
                if (container instanceof Figure)
                {
                    container.Left = container.Left + dx;
                    container.Top  = container.Top  + dy;
                }
            }
            args.Handled = true;
            return;
        }
        // Delete / Backspace — fire DeleteRequested with a snapshot
        // of both the items selection AND the connectors selection.
        // Same event-based mutation contract as Group / Ungroup /
        // Combine: framework knows what the user asked to remove,
        // consumer's listener owns the collection mutation (both
        // ItemsSource and Connectors). Fires when either channel has
        // entries — mixed-kind selections deliver both snapshots.
        if ((key === Key.Delete || key === Key.Back)
            && (this.SelectedItems.length > 0 || this._selectedConnectors.size > 0))
        {
            this._fireDeleteRequested({
                Items:      [...this.SelectedItems],
                Connectors: [...this._selectedConnectors],
            });
            args.Handled = true;
            return;
        }
        // Ctrl+G / Ctrl+Shift+G — fire the framework's Group / Ungroup
        // commands. CanExecute gating naturally guards (the command
        // returns false for empty / under-shaped selections), so a
        // gate-failed press is a silent no-op.
        if (key === Key.G && (hasModifier(args.Modifiers, ModifierKeys.Control) || hasModifier(args.Modifiers, ModifierKeys.Windows)))
        {
            const cmd = hasModifier(args.Modifiers, ModifierKeys.Shift) ? this.UngroupCommand : this.GroupCommand;
            if (cmd !== undefined && cmd.CanExecute(undefined)) cmd.Execute(undefined);
            args.Handled = true;
            return;
        }
        super.OnKeyDown(args);
    }

    public override RebindContainerForItemOverride(container: Visual, item: unknown): void
    {
        // Symmetric with GetContainerForItemOverride: a recycled
        // Figure re-binds to the new item — DataContext flips so
        // ItemContainerStyle bindings retarget, and Content flips so
        // the DataTemplate dispatch resolves against the new constructor.
        if (container instanceof Figure)
        {
            this.bindContainer(container, item);
            return;
        }
        super.RebindContainerForItemOverride(container, item);
    }

    // Wire a freshly-created OR recycled Figure to its data row.
    // Mirrors ListBox.bindContainer: the container subclass owns the
    // DataContext setup so ItemContainerStyle bindings on the container
    // (`Left = $Left`, `Top = $Top`, …) resolve against the per-item Model
    // rather than against whatever the surrounding inheritance chain exposes.
    // ContentControl's own DataContext is NOT set by Content assignment —
    // that's a WPF parity decision (a ContentControl's outer bindings see
    // the outer scope). For container-shaped subclasses like Figure
    // we want the item exposed; that's this method's job.
    //
    // Tag is set so Selector.exposedValueOf returns the bound item — so
    // SelectedItem / SelectedItems / SelectionChanged surface the
    // NodeVM, not the Figure container. Same pattern as ListBox.
    private bindContainer(node: Figure, item: unknown): void
    {
        if (item instanceof Model)
        {
            node.Tag         = item;
            node.DataContext = item;
            node.Content     = item;
        }
        else
        {
            node.Tag         = undefined;
            node.DataContext = undefined;
            node.Content     = undefined;
        }
    }
}
