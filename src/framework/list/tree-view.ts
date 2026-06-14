import {
    MetaData,
    Model,
    Rect,
    Size,
    Visual,
    type KeyEventArgs,
    type ModifierKeys,
    type PointerEventArgs,
    type PropertyDescriptor,
} from '../../runtime/index.js';
import { RectangleGeometry } from '../../visual-engine/index.js';
import { Border } from '../../basic/border.js';
import { HierarchicalDataTemplate } from '../../basic/templates/data-template.js';
import { ItemsControl } from '../items-control.js';
import { ScrollViewer } from '../scroll-viewer.js';
import { Selector, SelectionMode } from './selector.js';
import { StackPanel } from '../../basic/panels/stack-panel.js';
import { TextBlock } from '../../basic/text-block.js';



const CHEVRON_COLLAPSED = '▸';
const CHEVRON_EXPANDED  = '▾';

// Click-tracking Border that surfaces the click's modifier keys to its
// callback. Same press-here-release-here gate as ClickableBorder in
// ComboBox; differs only in the callback signature so a tree row can
// branch on Ctrl / Shift for multi-select.
//
// Exported for the compiled-`.mu` TreeViewItem template (not public API).
export class ClickableRow extends Border
{
    // Callback signature carries the full args so handlers can use
    // args.SetFocus to move keyboard focus to the templated parent
    // (TreeViewItem needs this for § 10.8 keyboard navigation continuity
    // after a pointer click). Plain `modifiers` retained as a second
    // arg for back-compat in callers that don't care about the args.
    public onClick: ((modifiers: ModifierKeys, args: PointerEventArgs) => void) | undefined;
    private _pressOriginatedHere = false;

    // IsPressed lifecycle (Button / ListBoxItem parity): Down sets
    // both `_pressOriginatedHere` (gate for the press-here-release-here
    // click contract) and IsPressed (M3 state-layer trigger source).
    // Leave clears the visual cue but keeps the gate armed so a
    // re-enter restores IsPressed; OnPointerEnter handles the
    // re-arm. Up always clears IsPressed BEFORE the click fires so
    // handlers reading IsPressed see the post-release state.
    protected override OnPointerDown(_args: PointerEventArgs): void
    {
        this._pressOriginatedHere = true;
        this.set_property_value(Visual.IsPressedKey, true);
    }

    protected override OnPointerUp(args: PointerEventArgs): void
    {
        const fire = this._pressOriginatedHere && this.IsMouseOver;
        this._pressOriginatedHere = false;
        this.set_property_value(Visual.IsPressedKey, false);
        if (fire) this.onClick?.(args.Modifiers, args);
    }

    protected override OnPointerLeave(_args: PointerEventArgs): void
    {
        this.set_property_value(Visual.IsPressedKey, false);
    }

    protected override OnPointerEnter(_args: PointerEventArgs): void
    {
        if (this._pressOriginatedHere)
        {
            this.set_property_value(Visual.IsPressedKey, true);
        }
    }
}

// Bare chevron / hit-target. Same press-here-release-here gate as the
// row above; signals through a plain `onClick` because expand/collapse
// has no modifier semantics. Marks the routed event as Handled so the
// click doesn't double-fire on the row underneath (which would change
// selection on every expand).
//
// Exported for the compiled-`.mu` TreeViewItem template (not public API).
export class ChevronTarget extends Border
{
    public onClick: (() => void) | undefined;
    private _pressOriginatedHere = false;

    protected override OnPointerDown(args: PointerEventArgs): void
    {
        this._pressOriginatedHere = true;
        args.Handled = true;
    }

    protected override OnPointerUp(args: PointerEventArgs): void
    {
        const fire = this._pressOriginatedHere && this.IsMouseOver;
        this._pressOriginatedHere = false;
        args.Handled = true;
        if (fire) this.onClick?.();
    }

    protected override OnPointerLeave(_args: PointerEventArgs): void
    {
        this._pressOriginatedHere = false;
    }
}

// Vertical StackPanel that collapses to zero size when its host says
// so — used as the items panel under each TreeViewItem. Children
// stay attached (logical + visual) but are measured at Size.Zero and
// arranged at (0,0,0,0) when collapsed, AND the panel itself clips
// to a 0×0 rect so the children's internal sub-layouts don't paint
// outside the (collapsed) parent's bounds.
//
// The clip is what makes collapse visible: rows inside have fixed
// Height (32 DIPs) and labels positioned by depth, so without a clip
// the descendant texts paint at their natural positions and bleed
// into the rows below. clip-path on the panel's outer <g> cuts both
// paint AND, via SVG's default `pointer-events: visiblePainted`,
// hit-testing — so the collapsed glyphs aren't clickable either.
// Exported so TreeViewItem.ItemsPanel can factory one.
export class CollapsibleStack extends StackPanel
{
    private _collapsed = false;
    // Cached zero-size geometry — same instance reused across toggles
    // so the renderer's clip-def cache stays warm. The RectangleGeometry
    // is harmless to share since it's never mutated.
    private static readonly ZERO_CLIP = new RectangleGeometry(new Rect(0, 0, 0, 0));

    public SetCollapsed(c: boolean): void
    {
        if (this._collapsed === c) return;
        this._collapsed = c;
        this.Clip = c ? CollapsibleStack.ZERO_CLIP : undefined;
        this.InvalidateMeasure();
        // Direct children's ArrangedRect.Y changes between collapsed
        // (all at 0) and expanded (stacked) states. Visual.InvalidateMeasure
        // doesn't populate the host's arrangeDirty Set for them, so the
        // SvgRenderer's incremental walk wouldn't re-apply each child's
        // outer-<g> transform and rows would stack at the wrong Y on
        // expand. Pushing each direct child onto arrangeDirty closes the gap.
        for (const child of this.visualChildren)
        {
            child.InvalidateArrange();
        }
    }

    public get IsCollapsed(): boolean { return this._collapsed; }

    protected override MeasureOverride(availableSize: Size): Size
    {
        if (this._collapsed)
        {
            for (const c of this.visualChildren) c.Measure(Size.Zero);
            return Size.Zero;
        }
        return super.MeasureOverride(availableSize);
    }

    protected override ArrangeOverride(finalSize: Size): Size
    {
        if (this._collapsed)
        {
            for (const c of this.visualChildren) c.Arrange(new Rect(0, 0, 0, 0));
            return Size.Zero;
        }
        return super.ArrangeOverride(finalSize);
    }
}

// WPF-style hierarchical list with chevron expand/collapse and
// multi-select via Ctrl (toggle) / Shift (extend from anchor) clicks.
// Built on ItemsControl — Items hosts the root TreeViewItem rows;
// each TreeViewItem is itself an ItemsControl for its sub-items.
//
// Composed markup stays the primary authoring path:
//
//   TreeView {
//       TreeViewItem[Header="Root"] {
//           TreeViewItem[Header="Branch"] {
//               TreeViewItem[Header="Leaf"]
//           }
//       }
//   }
//
// Compiler routes body items through AddChild → Items so declarative
// children join the same materialization pipeline as data-driven
// items (HierarchicalDataTemplate for the data-driven path). Selection
// state lives on the Selector base — TreeView routes through the same
// _selectedContainers / _selectedData / SelectionChanged surface, with
// SelectionMode pinned to Extended (Shift / Ctrl modifier semantics)
// because hierarchical-tree selection has no Single-mode WPF parity.
// Clicks bubble up via findTree() and call HandleContainerClick.
export class TreeView extends Selector
{
    public static readonly IndentKey = Model.RegisterProperty<number>(
        TreeView, 'Indent', 16, MetaData.Measure | MetaData.Arrange);
    // TwoWay by default — the standard binding pattern is a VM
    // round-trip: user clicks a row → DP updates → push to VM;
    // VM sets the property → DP updates → tree selects the matching
    // container. Cross-syncs with Selector.SelectedItem (the canonical
    // primary-row mirror) — writing either DP updates the other and
    // selects the matching row.
    public static readonly SelectedDataItemKey = Model.RegisterProperty<unknown>(
        TreeView, 'SelectedDataItem', undefined,
        MetaData.None | MetaData.BindsTwoWayByDefault);

    static {
        Model.OverrideMetadata(TreeView, Visual.DefaultStyleKeyKey, { default_value: TreeView });
    }

    // Guard for the SelectedDataItem ↔ SelectedItem feedback loop. Set
    // while mirroring across the two DPs; cleared when the mirror is
    // done. OnPropertyChanged checks the flag to avoid recursion.
    private _suppressSelectedDataSync = false;

    // Cached template-part reference. Resolved lazily on first access
    // because the template subtree only exists after the constructor's
    // Template assignment.
    private _scrollViewer: ScrollViewer | undefined;

    constructor()
    {
        super();
        // Template (the ScrollViewer + ItemsPresenter chrome) comes
        // from the default Style — applied here via applyDefaultStyle()
        // so the rest of the ctor / first measure sees a populated
        // template tree.
        this.ItemsPanel = () => new StackPanel();
        // Hierarchical trees use Extended-mode semantics by default
        // (Shift / Ctrl modifier handling). Override via the
        // SelectionMode DP if a consumer wants Single / Multiple.
        this.SelectionMode = SelectionMode.Extended;
        // Base ItemsControl constructor seeded Items = _declarativeItems.
        this.applyDefaultStyle();
    }

    public get Indent(): number { return this.get_property_value(TreeView.IndentKey); }
    public set Indent(v: number) { this.set_property_value(TreeView.IndentKey, v); }

    // The currently-selected data item — the value the generator maps
    // FROM the selected container, OR the container itself when no
    // mapping exists (composed-markup mode where the consumer added
    // TreeViewItems directly). Bindable both ways: writing the DP
    // (from a VM or by other code) selects the matching row.
    public get SelectedDataItem(): unknown { return this.get_property_value(TreeView.SelectedDataItemKey); }
    public set SelectedDataItem(v: unknown) { this.set_property_value(TreeView.SelectedDataItemKey, v); }

    // ── ItemsControl override seams ────────────────────────────────

    public override IsItemItsOwnContainerOverride(item: unknown): boolean
    {
        return item instanceof TreeViewItem;
    }

    // ── Keyboard navigation overrides (§ 10.8) ─────────────────────────
    //
    // TreeView adds Left / Right arrow handling on top of the base
    // Selector's arrow-driven row navigation. Left collapses an
    // expanded focused row OR walks focus to the parent TreeViewItem;
    // Right expands a collapsed focused row OR walks focus to the
    // first child. Up / Down / Home / End / PageUp / PageDown / Ctrl+A
    // / Space inherit from the Selector base.
    protected override OnKeyDown(args: KeyEventArgs): void
    {
        const focused = this.FocusedContainer;
        if (focused instanceof TreeViewItem)
        {
            if (args.Key === 'ArrowRight')
            {
                if (!focused.IsExpanded && this.hasTreeViewChildren(focused))
                {
                    focused.IsExpanded = true;
                    args.Handled = true;
                    return;
                }
                // Already expanded (or leaf) → consume the key without
                // falling through. ArrowDown is the canonical "move to
                // first child" gesture (Windows Explorer / VS Code
                // parity); pressing ArrowRight on an expanded node is
                // typically a no-op.
                args.Handled = true;
                return;
            }
            else if (args.Key === 'ArrowLeft')
            {
                if (focused.IsExpanded)
                {
                    focused.IsExpanded = false;
                    args.Handled = true;
                    return;
                }
                // Collapsed leaf or collapsed-already → walk to parent
                // TreeViewItem if one exists. The visual-tree walk
                // stops at this TreeView so a top-level row collapses
                // without trying to climb out of the control.
                const parent = this.findParentTreeViewItem(focused);
                if (parent !== undefined)
                {
                    this.HandleContainerClick(parent, args.Modifiers);
                    args.SetFocus(parent);
                    args.Handled = true;
                    return;
                }
            }
        }
        super.OnKeyDown(args);
    }

    private hasTreeViewChildren(item: TreeViewItem): boolean
    {
        const items = item.Items;
        if (items === undefined) return false;
        const c = items as unknown as { Count?: number; length?: number };
        if (typeof c.Count  === 'number') return c.Count  > 0;
        if (typeof c.length === 'number') return c.length > 0;
        return false;
    }

    private findParentTreeViewItem(child: Visual): TreeViewItem | undefined
    {
        let cursor: Visual | undefined = child.GetVisualParent();
        while (cursor !== undefined && cursor !== this)
        {
            if (cursor instanceof TreeViewItem) return cursor;
            cursor = cursor.GetVisualParent();
        }
        return undefined;
    }

    public override GetContainerForItemOverride(item: unknown): Visual
    {
        return wrapTreeItem(item, this.ItemTemplate);
    }

    public override RebindContainerForItemOverride(container: Visual, item: unknown): void
    {
        // Reused TreeViewItem — refresh Header from the new data.
        // Items/ItemTemplate stay carried by HierarchicalDataTemplate
        // logic in wrapTreeItem; on recycle the row's children stay,
        // only the header label flips.
        if (!(container instanceof TreeViewItem)) return;
        container.Header = displayTreeHeader(item);
    }

    public override ClearContainerForItemOverride(container: Visual, item: unknown): void
    {
        // Drop everything under the detached subtree from selection
        // BEFORE the base detaches the container. The base's Selector
        // override drops just `container` itself; the subtree purge
        // handles the rest.
        if (container instanceof TreeViewItem)
        {
            this.PurgeSubtreeFromSelection(container);
        }
        super.ClearContainerForItemOverride(container, item);
    }

    // ── Declarative AddChild → Items routing ──────────────────────

    // Base ItemsControl.AddChild handles the route-into-Items + promote
    // logic; we only gate on container type.
    protected override validateDeclarativeChild(child: Visual): void
    {
        if (!(child instanceof TreeViewItem))
        {
            throw new Error('TreeView only accepts TreeViewItem children');
        }
    }

    // The root items — live read-only view of the realized
    // TreeViewItem containers in items order. Mirrors WPF's
    // TreeView.Items but cast for TreeViewItem-specific consumers
    // (range-selection walks, indent depth queries).
    public get RootItems(): readonly TreeViewItem[]
    {
        return this.logicalChildren as readonly TreeViewItem[];
    }

    // Invoked from TreeViewItem.RemoveChild AND from
    // ClearContainerForItemOverride so a subtree being detached
    // anywhere in the tree drops its selection contribution. Without
    // this hook a deeply-nested detach would leave orphan TreeViewItems
    // in `_selectedContainers`, corrupting SelectedItems reads. Fires
    // SelectionChanged exactly once if at least one item was actually
    // dropped.
    public PurgeSubtreeFromSelection(item: TreeViewItem): void
    {
        let dropped = false;
        for (const node of TreeView.walkSubtree(item))
        {
            if (this._selectedContainers.has(node))
            {
                this._selectedContainers.delete(node);
                this._selectedData.delete(this.exposedValueOf(node));
                Selector.SetIsSelected(node, false);
                dropped = true;
            }
            if (this._anchor === node) this._anchor = undefined;
        }
        if (dropped)
        {
            this.refreshExposedSelection();
            this.fireSelectionChanged();
        }
    }

    // Backward-compatible alias for the routed click entry point.
    // Container code (ClickableRow.onClick) calls this; it forwards to
    // the Selector base's modifier-aware click handler.
    public HandleRowClick(item: TreeViewItem, modifiers: ModifierKeys): void
    {
        this.HandleContainerClick(item, modifiers);
    }

    // Walk past any intermediate TreeViewItems to the root TreeView when
    // resolving a clicked row — used by PurgeSubtreeFromSelection.
    private static *walkSubtree(item: TreeViewItem): Generator<TreeViewItem>
    {
        yield item;
        for (const c of item.SubItems)
        {
            yield* TreeView.walkSubtree(c);
        }
    }

    // ── Selector override seams ────────────────────────────────────

    // Hierarchical range selection follows the visible-items walk
    // (depth-first, skipping collapsed subtrees). Default
    // (logicalChildren) would only include direct children of the
    // root, which would make Shift+click meaningless.
    protected override containerOrderForRange(): readonly Visual[]
    {
        const out: TreeViewItem[] = [];
        const walk = (item: TreeViewItem): void =>
        {
            out.push(item);
            if (item.IsExpanded)
            {
                for (const c of item.SubItems) walk(c);
            }
        };
        for (const root of this.RootItems) walk(root);
        return out;
    }

    // Containers backing the selection identity. Composed markup —
    // the TreeViewItem IS the data; data-driven — the data item lives
    // in the container's `_itemsControlData` stamp from
    // PrepareContainerForItemOverride. Selector's default
    // exposedValueOf reads container.Tag (which TreeView doesn't
    // populate); override to read the stamp.
    protected override exposedValueOf(container: Visual): unknown
    {
        if (!(container instanceof TreeViewItem)) return container;
        const data = dataOf(container);
        return data !== undefined ? data : container;
    }

    // Find the container backing a data item via depth-first walk of
    // the realized tree. Selector's default uses Generator.ContainerFromItem
    // which only knows the direct generator — for hierarchical data the
    // item may live under a nested TreeViewItem's generator.
    protected override containerForItem(item: unknown): Visual | undefined
    {
        if (item === undefined) return undefined;
        if (item instanceof TreeViewItem) return item;
        return findContainerByData(this.RootItems, item);
    }

    protected override OnPropertyChanged(
        descriptor: PropertyDescriptor,
        oldValue: unknown,
        newValue: unknown,
    ): void
    {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        if (descriptor.Name === 'Indent')
        {
            // Indent participates in every row's MeasureOverride; the
            // bare Measure flag on the DP only invalidates the TreeView,
            // not its descendants. Force the cascade ourselves.
            for (const i of this.RootItems) TreeView.invalidateMeasureSubtree(i);
            return;
        }
        // SelectedDataItem ↔ SelectedItem cross-sync. Each writes the
        // other (and the apply* chain) once, guarded against re-entry.
        if (this._suppressSelectedDataSync) return;
        if (descriptor.Name === 'SelectedDataItem' && descriptor.Owner === TreeView)
        {
            this._suppressSelectedDataSync = true;
            try { this.SelectedItem = newValue; }
            finally { this._suppressSelectedDataSync = false; }
        }
        else if (descriptor.Name === 'SelectedItem' && descriptor.Owner === Selector)
        {
            const next = newValue ?? (this._selectedContainers.size === 0 ? undefined : newValue);
            this._suppressSelectedDataSync = true;
            try { this.set_property_value(TreeView.SelectedDataItemKey, next); }
            finally { this._suppressSelectedDataSync = false; }
        }
    }

    private static invalidateMeasureSubtree(item: TreeViewItem): void
    {
        item.InvalidateMeasure();
        for (const c of item.SubItems) TreeView.invalidateMeasureSubtree(c);
    }

    // Read-only handle to the default-template ScrollViewer.
    public get ScrollViewer(): ScrollViewer
    {
        if (this._scrollViewer !== undefined) return this._scrollViewer;
        const root = this.visualChildren[0];
        if (root === undefined)
        {
            throw new Error('TreeView: template root not attached yet.');
        }
        const sv = root.FindName('PART_Scroll');
        if (!(sv instanceof ScrollViewer))
        {
            throw new Error('TreeView: PART_Scroll missing from DefaultTreeView template.');
        }
        this._scrollViewer = sv;
        return sv;
    }
}

// One row in the tree. Built on ItemsControl — each TreeViewItem
// hosts its own sub-rows in a CollapsibleStack items panel slotted
// into the row's template via ItemsPresenter.
//
// Public DPs:
//   Header     — string label rendered in the row's text cell.
//   IsExpanded — true when sub-rows are visible. Toggled by clicking
//                the chevron; also settable programmatically.
//   IsSelected — true when this row participates in the TreeView's
//                current selection. Read-mostly: written by the
//                TreeView's click handler; settable by consumers for
//                initialising a default selection.
//   (Items, ItemTemplate, ItemContainerStyle, … inherited from
//    ItemsControl).
//
// Internal visual structure (per item):
//
//   templateRoot = StackPanel (vertical)
//     ├─ ClickableRow (hover / selection background)
//     │    └─ inner row: spacer + chevron + label
//     └─ ItemsPresenter → CollapsibleStack (items panel)
//          └─ child TreeViewItems
export class TreeViewItem extends ItemsControl
{
    public static readonly HeaderKey     = Model.RegisterProperty<string>( TreeViewItem, 'Header',     '',    MetaData.Measure | MetaData.Render);
    public static readonly IsExpandedKey = Model.RegisterProperty<boolean>(TreeViewItem, 'IsExpanded', false, MetaData.Measure | MetaData.Arrange);
    // Instance-level IsSelected mirror — kept for triggers /
    // refreshRowBackground listeners. Source of truth is
    // `Selector.IsSelected` (attached); the OnPropertyChanged mirror
    // (below) keeps the two in lock-step.
    public static readonly IsSelectedKey = Model.RegisterProperty<boolean>(TreeViewItem, 'IsSelected', false, MetaData.Render);

    // M3 list-row anatomy slots — same shape as ListBoxItem. Leading
    // hosts the 24dp icon BETWEEN the chevron and the label (the
    // chevron stays the leading-most element since the hierarchy
    // affordance can't move). SupportingText flows below the Header
    // string; empty stays 1-line, non-empty flips to 2-line, embedded
    // newline flips to 3-line. Trailing sits at the row's right edge.
    public static readonly LeadingKey = Model.RegisterProperty<Visual | undefined>(
        TreeViewItem, 'Leading', undefined, MetaData.Render);
    public static readonly SupportingTextKey = Model.RegisterProperty<string>(
        TreeViewItem, 'SupportingText', '', MetaData.Render);
    public static readonly TrailingKey = Model.RegisterProperty<Visual | undefined>(
        TreeViewItem, 'Trailing', undefined, MetaData.Render);

    // Derived state DPs the template observes — see ListBoxItem for the
    // why-this-shape rationale.
    private static readonly _HasSupportingTextPriv = Model.RegisterReadOnlyProperty<boolean>(
        TreeViewItem, 'HasSupportingText', false, MetaData.None);
    public static readonly HasSupportingTextKey = TreeViewItem._HasSupportingTextPriv;
    private static readonly _IsThreeLinePriv = Model.RegisterReadOnlyProperty<boolean>(
        TreeViewItem, 'IsThreeLine', false, MetaData.None);
    public static readonly IsThreeLineKey = TreeViewItem._IsThreeLinePriv;

    static {
        Model.OverrideMetadata(TreeViewItem, Visual.DefaultStyleKeyKey, { default_value: TreeViewItem });
    }

    // Guards the IsSelected attached↔instance mirror against recursion.
    private _syncingIsSelected = false;

    // Captured by the ItemsPanel factory on first invocation. The
    // IsExpanded handler reaches into it to drive collapse without
    // depending on a named PART_ lookup.
    private _childWrap: CollapsibleStack | undefined;

    // Template parts — resolved in the constructor.
    private readonly _row:         ClickableRow;
    private readonly _spacer:      Border;
    private readonly _chevronText: TextBlock;
    private readonly _label:       TextBlock;
    private readonly _leadingSlot:  Border;
    private readonly _trailingSlot: Border;
    private readonly _supportText:  TextBlock;

    constructor()
    {
        super();
        // Focusable so keyboard navigation (§ 10.8) can land focus on
        // a clicked or arrow-navigated TreeView row.
        this.Focusable = true;
        // Template flows from the default Style — applied here via
        // applyDefaultStyle() so the PART_ lookups below find their
        // targets in the freshly-applied template tree. The row /
        // chevron / label / spacer references are cached because the
        // imperative IsSelected / IsMouseOver swap (refreshRowBackground)
        // and chevron-text updates (refreshChevron) write to them
        // every state change. Moving those to declarative triggers
        // would require source-name support in `when()` (the row's
        // IsMouseOver is on a template part, not the templated parent),
        // which is a parser-level extension left for a follow-up.
        this.applyDefaultStyle();

        const root = this.visualChildren[0]!;
        this._row          = root.FindName('PART_Row')           as ClickableRow;
        this._spacer       = root.FindName('PART_Spacer')        as Border;
        const chevron      = root.FindName('PART_Chevron')       as ChevronTarget;
        this._chevronText  = root.FindName('PART_ChevronText')   as TextBlock;
        this._label        = root.FindName('PART_Label')         as TextBlock;
        this._leadingSlot  = root.FindName('PART_LeadingSlot')   as Border;
        this._trailingSlot = root.FindName('PART_TrailingSlot')  as Border;
        this._supportText  = root.FindName('PART_SupportingText') as TextBlock;

        chevron.onClick = (): void => { this.IsExpanded = !this.IsExpanded; };
        this._row.onClick = (modifiers, args): void => {
            // SetFocus moves keyboard focus to this row so subsequent
            // arrow keys navigate from here (§ 10.8 keyboard navigation).
            args.SetFocus(this);
            const tree = this.findTree();
            if (tree !== undefined) tree.HandleContainerClick(this, modifiers);
        };
        // Hover + selection chrome ride through the DefaultTreeViewItem
        // template's `when(PART_Row.IsMouseOver)` / `when(IsSelected)`
        // triggers — both write PART_Row.Background via DynamicResource
        // so theme switches re-tint live. No imperative refresh hook.

        // Items panel = CollapsibleStack. The factory caches the
        // single instance so IsExpanded toggles can flip its
        // collapsed state directly. Initialised collapsed because
        // IsExpanded defaults to false.
        this.ItemsPanel = (): CollapsibleStack => {
            const cs = new CollapsibleStack();
            this._childWrap = cs;
            cs.SetCollapsed(!this.IsExpanded);
            return cs;
        };
        // Base ItemsControl seeded Items = _declarativeItems.

        this.refreshChevron();
    }

    public get Header(): string { return this.get_property_value(TreeViewItem.HeaderKey); }
    public set Header(v: string) { this.set_property_value(TreeViewItem.HeaderKey, v); }

    public get IsExpanded(): boolean { return this.get_property_value(TreeViewItem.IsExpandedKey); }
    public set IsExpanded(v: boolean) { this.set_property_value(TreeViewItem.IsExpandedKey, v); }

    // IsSelected reads/writes go through the canonical attached
    // Selector.IsSelected; the instance DP is kept in lock-step via the
    // mirror in OnPropertyChanged so existing refreshRowBackground
    // listener and any `when (IsSelected)` triggers keep firing.
    public get IsSelected(): boolean { return Selector.GetIsSelected(this); }
    public set IsSelected(v: boolean) { Selector.SetIsSelected(this, v); }

    public get Leading(): Visual | undefined { return this.get_property_value(TreeViewItem.LeadingKey); }
    public set Leading(v: Visual | undefined) { this.set_property_value(TreeViewItem.LeadingKey, v); }

    public get SupportingText(): string { return this.get_property_value(TreeViewItem.SupportingTextKey); }
    public set SupportingText(v: string) { this.set_property_value(TreeViewItem.SupportingTextKey, v); }

    public get Trailing(): Visual | undefined { return this.get_property_value(TreeViewItem.TrailingKey); }
    public set Trailing(v: Visual | undefined) { this.set_property_value(TreeViewItem.TrailingKey, v); }

    public get HasSupportingText(): boolean { return this.get_property_value(TreeViewItem.HasSupportingTextKey); }
    public get IsThreeLine():       boolean { return this.get_property_value(TreeViewItem.IsThreeLineKey); }

    // ── ItemsControl override seams ────────────────────────────────

    public override IsItemItsOwnContainerOverride(item: unknown): boolean
    {
        return item instanceof TreeViewItem;
    }

    public override GetContainerForItemOverride(item: unknown): Visual
    {
        return wrapTreeItem(item, this.ItemTemplate);
    }

    public override ClearContainerForItemOverride(container: Visual, item: unknown): void
    {
        super.ClearContainerForItemOverride(container, item);
        if (!(container instanceof TreeViewItem)) return;
        // Drop the subtree's selection contribution through the
        // owning TreeView (if any). findTree walks logical parents
        // and works as long as ClearContainerForItemOverride runs
        // BEFORE the base ItemsControl detaches the container.
        this.findTree()?.PurgeSubtreeFromSelection(container);
        this.refreshChevron();
    }

    public override PrepareContainerForItemOverride(container: Visual, item: unknown, index: number): void
    {
        super.PrepareContainerForItemOverride(container, item, index);
        // Refresh after attach — the chevron's "leaf vs branch" state
        // is a function of whether we have any sub-rows.
        this.refreshChevron();
    }

    // Base ItemsControl.AddChild handles the route-into-Items + promote
    // logic; we only gate on container type.
    protected override validateDeclarativeChild(child: Visual): void
    {
        if (!(child instanceof TreeViewItem))
        {
            throw new Error('TreeViewItem only accepts TreeViewItem children');
        }
    }

    // Live view of the nested items in document order.
    public get SubItems(): readonly TreeViewItem[]
    {
        return this.logicalChildren as readonly TreeViewItem[];
    }

    // Backwards-compatible setter — preserved so older callers keep
    // working, but the canonical seam is now Selector.SetIsSelected.
    public SetIsSelectedInternal(v: boolean): void
    {
        Selector.SetIsSelected(this, v);
    }

    // Walk past any intermediate TreeViewItems to the root TreeView.
    // The predicate is what makes this skip past intermediate
    // TreeViewItems — a plain ItemsControl.FromContainer(this) would
    // stop at the parent TreeViewItem (which is also an ItemsControl).
    private findTree(): TreeView | undefined
    {
        return ItemsControl.FromContainer<TreeView>(
            this, (v): v is TreeView => v instanceof TreeView);
    }

    // Depth = number of TreeViewItem ancestors between this item and
    // the owning TreeView. Indent is applied as depth × TreeView.Indent.
    private findDepth(): number
    {
        let depth = 0;
        let cur: Visual | undefined = this.GetLogicalParent();
        while (cur !== undefined)
        {
            if (cur instanceof TreeView) return depth;
            if (cur instanceof TreeViewItem) depth++;
            cur = cur.GetLogicalParent();
        }
        return depth;       // detached: walked to root without hitting a TreeView
    }

    protected override OnPropertyChanged(
        descriptor: PropertyDescriptor,
        oldValue: unknown,
        newValue: unknown,
    ): void
    {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        switch (descriptor.Name)
        {
            case 'IsExpanded':
                this.refreshChevron();
                this._childWrap?.SetCollapsed(!(newValue as boolean));
                this.InvalidateMeasure();
                return;
            case 'Header':
                this._label.Text = String(newValue ?? '');
                return;
        }
        // M3 anatomy slot syncs — Leading / Trailing flow into the
        // PART_LeadingSlot / PART_TrailingSlot Borders via SetChild;
        // SupportingText drives the supporting-line TextBlock AND the
        // derived HasSupportingText / IsThreeLine DPs the template
        // observes for row-height variants. Mirrors the ListBoxItem
        // shape (see list-box.ts for the matching logic).
        if (descriptor.Owner === TreeViewItem)
        {
            if (descriptor.Name === 'Leading')
            {
                this._leadingSlot.SetChild(newValue as Visual | undefined);
                return;
            }
            if (descriptor.Name === 'Trailing')
            {
                this._trailingSlot.SetChild(newValue as Visual | undefined);
                return;
            }
            if (descriptor.Name === 'SupportingText')
            {
                const text = (newValue as string) ?? '';
                this._supportText.Text = text;
                const hasText     = text.length > 0;
                const isThreeLine = text.includes('\n');
                this.set_property_value_with_key(TreeViewItem._HasSupportingTextPriv, hasText);
                this.set_property_value_with_key(TreeViewItem._IsThreeLinePriv,       isThreeLine);
                return;
            }
        }
        // IsSelected mirror — attached `Selector.IsSelected` is the
        // canonical seam, instance `TreeViewItem.IsSelected` is the
        // trigger-observable mirror. Owner distinguishes them.
        if (this._syncingIsSelected || descriptor.Name !== 'IsSelected') return;
        const fromAttached = descriptor.Owner === Selector;
        const fromInstance = descriptor.Owner === TreeViewItem;
        if (!fromAttached && !fromInstance) return;
        this._syncingIsSelected = true;
        try
        {
            if (fromAttached)
            {
                this.set_property_value(TreeViewItem.IsSelectedKey, newValue as boolean);
            }
            else
            {
                Selector.SetIsSelected(this, newValue as boolean);
            }
        }
        finally
        {
            this._syncingIsSelected = false;
        }
        // Row chrome (hover + selected) rides through declarative
        // template triggers — no imperative refresh needed.
    }

    protected override MeasureOverride(availableSize: Size): Size
    {
        // Indent spacer width = depth × TreeView.Indent. Recomputed on
        // every measure so re-parenting (e.g. moving a subtree)
        // refreshes naturally.
        const tree   = this.findTree();
        const indent = tree?.Indent ?? 16;
        const depth  = this.findDepth();
        this._spacer.Width = depth * indent;

        // Delegate to ItemsControl.MeasureOverride which walks the
        // template root (and from there into the row + ItemsPresenter).
        return super.MeasureOverride(availableSize);
    }

    // Leaf items render a blank chevron cell so columns line up; non-
    // leaf items pick the glyph from IsExpanded.
    private refreshChevron(): void
    {
        const hasChildren = this.SubItems.length > 0;
        if (!hasChildren)
        {
            this._chevronText.Text = '';
        }
        else
        {
            this._chevronText.Text = this.IsExpanded ? CHEVRON_EXPANDED : CHEVRON_COLLAPSED;
        }
    }
}

// Shared container construction for TreeView and TreeViewItem. Routes
// the data item through a HierarchicalDataTemplate when one is in
// place so child-items propagate down the tree as their parent rows
// are realized. Behavior matrix:
//
//   * item IS already a TreeViewItem (composed-markup path) → return
//     it unchanged.
//   * template is a HierarchicalDataTemplate → wrap the data in a
//     fresh TreeViewItem with Header = `displayString(item)` (Label /
//     Name / Text convention), set the sub-Items to the children the
//     template's itemsSelector pulls off the data, and recur the
//     same template down the tree (or `template.itemTemplate` when
//     it's set, for "different template for children" scenarios).
//   * template is a plain DataTemplate or undefined → just stringify
//     the data into the Header. The user's ItemTemplate (if any) is
//     ignored at this level — TreeView doesn't currently host the
//     factory's Visual as a Header (the row template owns the
//     PART_Label slot).
function wrapTreeItem(item: unknown, template: unknown): Visual
{
    if (item instanceof TreeViewItem) return item;
    const tvi = new TreeViewItem();
    tvi.Header = displayTreeHeader(item);
    if (template instanceof HierarchicalDataTemplate)
    {
        const childTpl = template.itemTemplate ?? template;
        tvi.ItemTemplate = childTpl as never;
        tvi.Items = [...template.ItemsOf(item)];
    }
    return tvi;
}

// Read the data item stamped on a container by
// ItemsControl.PrepareContainerForItemOverride. Type-erased because
// ContainerWithData is an internal interface inside items-control.ts;
// the field is always `_itemsControlData` regardless.
function dataOf(container: TreeViewItem): unknown
{
    return (container as unknown as { _itemsControlData?: unknown })._itemsControlData;
}

// Depth-first search of the realized container tree for the
// TreeViewItem whose stamped data === `value`. Returns undefined when
// the data isn't realized yet (e.g., a VM set SelectedDataItem before
// the items pipeline finished).
function findContainerByData(
    roots: readonly TreeViewItem[],
    value: unknown,
): TreeViewItem | undefined
{
    for (const node of roots)
    {
        if (dataOf(node) === value) return node;
        const inSub = findContainerByData(node.SubItems, value);
        if (inSub !== undefined) return inSub;
    }
    return undefined;
}

// Header resolution — same convention as ListBox/ComboBox's
// displayString: strings pass through, objects use a conventional
// Label / Name / Text field, anything else stringifies.
function displayTreeHeader(item: unknown): string
{
    if (item === undefined || item === null) return '';
    if (typeof item === 'string') return item;
    if (typeof item === 'object')
    {
        const obj = item as Record<string, unknown>;
        if (typeof obj.Label === 'string') return obj.Label;
        if (typeof obj.Name  === 'string') return obj.Name;
        if (typeof obj.Text  === 'string') return obj.Text;
    }
    return String(item);
}
