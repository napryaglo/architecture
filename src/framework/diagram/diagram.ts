import {
    Element,
    MetaData,
    Model,
    Rect,
    type KeyEventArgs,
    type PointerEventArgs,
    type PropertyDescriptor,
    type RelayCommand,
    type Visual,
} from '../../runtime/index.js';
import { AdornerLayer } from '../../visual-engine/index.js';
import { Figure } from './figure.js';
import { Group } from './group.js';
import { Selector } from '../list/selector.js';
import { DiagramCommands } from './collaborators/diagram-commands.js';
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
import { Brush, Pen } from '../../visual-engine/index.js';
import { FormatMirror } from './collaborators/format-mirror.js';
import {
    attachCanvasDropBehavior,
    type ItemDroppedArgs,
    type ItemDroppedListener,
} from './behaviors/canvas-drop-behavior.js';
export { attachCanvasDropBehavior, TOOLBOX_NODE_KIND_FORMAT } from './behaviors/canvas-drop-behavior.js';
export type { ItemDroppedArgs, ItemDroppedListener } from './behaviors/canvas-drop-behavior.js';

// §19.3 follow-up — position snap callback. Consumers (e.g., the
// diagram demo's align-edges behavior) set this DP to a pure function
// that returns the snapped rect for a given cursor-derived candidate
// rect. Figure.OnPointerMove consults the parent Diagram and
// applies the snap before writing X / Y, so alignment guides
// translate into real snap-on-drag behavior without behaviors having
// to fight the framework's drag positioning.
export type DiagramPositionSnap = (rect: Rect) => Rect;

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
export class Diagram extends Selector
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

    public get AlignmentGuidesEnabled():  boolean { return this.get_property_value(Diagram.AlignmentGuidesEnabledKey); }
    public set AlignmentGuidesEnabled(v: boolean) { this.set_property_value(Diagram.AlignmentGuidesEnabledKey, v); }
    public get SelectionResizeEnabled():  boolean { return this.get_property_value(Diagram.SelectionResizeEnabledKey); }
    public set SelectionResizeEnabled(v: boolean) { this.set_property_value(Diagram.SelectionResizeEnabledKey, v); }
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
    }

    // PointerDown anywhere on the Diagram surface takes keyboard focus
    // so subsequent Delete / Ctrl+G / arrow-key shortcuts route to this
    // Diagram. No-op when Focusable=false (the Visual.Focus contract).
    protected override OnPointerDown(args: PointerEventArgs): void
    {
        super.OnPointerDown(args);
        this.Focus();
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
        const isArrow = key === 'ArrowLeft' || key === 'ArrowRight'
                     || key === 'ArrowUp'   || key === 'ArrowDown';
        if (isArrow && this._selectedContainers.size > 0)
        {
            const step = args.Modifiers.Shift ? 10 : 1;
            const dx = key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0;
            const dy = key === 'ArrowUp'   ? -step : key === 'ArrowDown'  ? step : 0;
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
        // Delete / Backspace — fire DeleteRequested with a SelectedItems
        // snapshot. Same event-based mutation contract as Group /
        // Ungroup / Combine: framework knows what the user asked to
        // remove, consumer's listener owns the collection mutation.
        if ((key === 'Delete' || key === 'Backspace') && this.SelectedItems.length > 0)
        {
            this._fireDeleteRequested({ Items: [...this.SelectedItems] });
            args.Handled = true;
            return;
        }
        // Ctrl+G / Ctrl+Shift+G — fire the framework's Group / Ungroup
        // commands. CanExecute gating naturally guards (the command
        // returns false for empty / under-shaped selections), so a
        // gate-failed press is a silent no-op.
        if ((key === 'g' || key === 'G') && (args.Modifiers.Control || args.Modifiers.Meta))
        {
            const cmd = args.Modifiers.Shift ? this.UngroupCommand : this.GroupCommand;
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
