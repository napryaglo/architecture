import {
    Application,
    MetaData,
    Model,
    Rect,
    Size,
    Visual,
    type ModifierKeys,
    type PointerEventArgs,
    type PropertyDescriptor,
} from '../runtime/index.js';
import { RectangleGeometry, type Brush } from '../visual-engine/index.js';
import { Border } from './border.js';
import { HierarchicalDataTemplate } from './data-template.js';
import { ItemsControl } from './items-control.js';
import { ScrollViewer } from './scroll-viewer.js';
import { StackPanel } from './stack-panel.js';
import { TextBlock } from './text-block.js';
import { Theme } from './theme.js';
import type { ControlTemplate } from './control-template.js';
import { ensureControlsTheme } from './default-resources.js';

const KEY_TREEVIEW      = 'DefaultTreeView';
const KEY_TREEVIEW_ITEM = 'DefaultTreeViewItem';

function resolveTemplate(key: string): ControlTemplate
{
    const tpl = Application.ResolveDefaultResource<ControlTemplate>(key);
    if (tpl === undefined)
    {
        throw new Error(`TreeView: default template '${key}' is not registered.`);
    }
    return tpl;
}

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
    public onClick: ((modifiers: ModifierKeys) => void) | undefined;
    private _pressOriginatedHere = false;

    protected override OnPointerDown(_args: PointerEventArgs): void
    {
        this._pressOriginatedHere = true;
    }

    protected override OnPointerUp(args: PointerEventArgs): void
    {
        const fire = this._pressOriginatedHere && this.IsMouseOver;
        this._pressOriginatedHere = false;
        if (fire) this.onClick?.(args.Modifiers);
    }

    protected override OnPointerLeave(_args: PointerEventArgs): void
    {
        this._pressOriginatedHere = false;
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
// items (future: HierarchicalDataTemplate). Selection state lives
// here on the root TreeView; clicks bubble up via findTree().
export class TreeView extends ItemsControl
{
    public static readonly IndentKey = Model.RegisterProperty<number>(
        TreeView, 'Indent', 16, MetaData.Measure | MetaData.Arrange);
    // TwoWay by default — the standard binding pattern is a VM
    // round-trip: user clicks a row → DP updates → push to VM;
    // VM sets the property → DP updates → tree selects the matching
    // container. Mirrors WPF's SelectedValue + selection-binding idiom,
    // except we always carry the DATA item (via
    // ItemContainerGenerator's reverse map) rather than a value pulled
    // by SelectedValuePath.
    public static readonly SelectedDataItemKey = Model.RegisterProperty<unknown>(
        TreeView, 'SelectedDataItem', undefined,
        MetaData.None | MetaData.BindsTwoWayByDefault);

    static {
        ensureControlsTheme();
    }

    // Guard for the SelectedDataItem ↔ internal-selection feedback
    // loop. Set when an internal selection-change is mirroring out to
    // the DP; cleared when the mirror is done. OnPropertyChanged
    // checks the flag and skips the inbound-write path while it's
    // set.
    private _suppressSelectedDataSync = false;

    private readonly _selectedItems: Set<TreeViewItem> = new Set();
    private _anchor: TreeViewItem | undefined;
    private readonly _selectionListeners: Set<() => void> = new Set();

    // Cached template-part reference. Resolved lazily on first access
    // because the template subtree only exists after the constructor's
    // Template assignment.
    private _scrollViewer: ScrollViewer | undefined;

    constructor()
    {
        super();
        this.Template = resolveTemplate(KEY_TREEVIEW);
        this.ItemsPanel = () => new StackPanel();
        // Base ItemsControl constructor seeded Items = _declarativeItems.
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
        super.ClearContainerForItemOverride(container, item);
        if (!(container instanceof TreeViewItem)) return;
        // Drop everything under the detached subtree from selection.
        this.PurgeSubtreeFromSelection(container);
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

    public get SelectedItem(): TreeViewItem | undefined
    {
        for (const v of this._selectedItems) return v;       // first
        return undefined;
    }

    public get SelectedItems(): readonly TreeViewItem[]
    {
        return [...this._selectedItems];
    }

    public AddSelectionChangedListener(listener: () => void): void
    {
        this._selectionListeners.add(listener);
    }

    public RemoveSelectionChangedListener(listener: () => void): void
    {
        this._selectionListeners.delete(listener);
    }

    // Programmatically clear selection.
    public ClearSelection(): void
    {
        if (this._selectedItems.size === 0) return;
        for (const i of this._selectedItems) i.SetIsSelectedInternal(false);
        this._selectedItems.clear();
        this._anchor = undefined;
        this.fireSelectionChanged();
    }

    // Invoked from TreeViewItem.RemoveChild AND from
    // ClearContainerForItemOverride so a subtree being detached
    // anywhere in the tree drops its selection contribution. Without
    // this hook a deeply-nested detach would leave orphan
    // TreeViewItems in `_selectedItems`, corrupting SelectedItem
    // reads. Fires SelectionChanged exactly once if at least one
    // item was actually dropped.
    public PurgeSubtreeFromSelection(item: TreeViewItem): void
    {
        let dropped = false;
        for (const node of TreeView.walkSubtree(item))
        {
            if (this._selectedItems.has(node))
            {
                this._selectedItems.delete(node);
                node.SetIsSelectedInternal(false);
                dropped = true;
            }
            if (this._anchor === node) this._anchor = undefined;
        }
        if (dropped) this.fireSelectionChanged();
    }

    // Entry point for row clicks.
    public HandleRowClick(item: TreeViewItem, modifiers: ModifierKeys): void
    {
        const shiftActive = modifiers.Shift && this._anchor !== undefined;
        if (shiftActive)
        {
            this.selectRange(this._anchor!, item);
        }
        else if (modifiers.Control)
        {
            this.toggleSelected(item);
            this._anchor = item;
        }
        else
        {
            this.setSelected([item]);
            this._anchor = item;
        }
        this.fireSelectionChanged();
    }

    private setSelected(items: readonly TreeViewItem[]): void
    {
        const next = new Set(items);
        for (const i of this._selectedItems)
        {
            if (!next.has(i)) i.SetIsSelectedInternal(false);
        }
        for (const i of next)
        {
            if (!this._selectedItems.has(i)) i.SetIsSelectedInternal(true);
        }
        this._selectedItems.clear();
        for (const i of items) this._selectedItems.add(i);
    }

    private toggleSelected(item: TreeViewItem): void
    {
        if (this._selectedItems.has(item))
        {
            this._selectedItems.delete(item);
            item.SetIsSelectedInternal(false);
        }
        else
        {
            this._selectedItems.add(item);
            item.SetIsSelectedInternal(true);
        }
    }

    private selectRange(from: TreeViewItem, to: TreeViewItem): void
    {
        const visible = this.visibleItems();
        const fromIdx = visible.indexOf(from);
        const toIdx   = visible.indexOf(to);
        if (fromIdx < 0 || toIdx < 0) return;
        const lo = Math.min(fromIdx, toIdx);
        const hi = Math.max(fromIdx, toIdx);
        this.setSelected(visible.slice(lo, hi + 1));
    }

    // Visible-items walk: depth-first in document order, skipping
    // the subtree of any collapsed item.
    private visibleItems(): TreeViewItem[]
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

    // Depth-first walk including collapsed subtrees.
    private static *walkSubtree(item: TreeViewItem): Generator<TreeViewItem>
    {
        yield item;
        for (const c of item.SubItems)
        {
            yield* TreeView.walkSubtree(c);
        }
    }

    private fireSelectionChanged(): void
    {
        this.syncSelectedDataItem();
        for (const l of this._selectionListeners) l();
    }

    // Push the first-selected container's data item out to the
    // SelectedDataItem DP. Guarded so the resulting OnPropertyChanged
    // doesn't loop back into the selection-from-DP path.
    //
    // In a hierarchical tree, the selected container's data lives in
    // the generator of its DIRECT parent ItemsControl — typically a
    // nested TreeViewItem, not the root TreeView. Rather than walking
    // generators by ancestry, we read `_itemsControlData` straight off
    // the container — every container realized through
    // PrepareContainerForItemOverride is stamped with the data item
    // there. Falls back to the container itself in composed-markup
    // mode where there is no data.
    private syncSelectedDataItem(): void
    {
        const first: TreeViewItem | undefined =
            this._selectedItems.values().next().value;
        const data = first === undefined
            ? undefined
            : (dataOf(first) ?? first);
        if (this.SelectedDataItem === data) return;
        this._suppressSelectedDataSync = true;
        this.set_property_value(TreeView.SelectedDataItemKey, data);
        this._suppressSelectedDataSync = false;
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
        if (descriptor.Name === 'SelectedDataItem')
        {
            if (this._suppressSelectedDataSync) return;
            this.applySelectedDataItem(newValue);
        }
    }

    // External write to SelectedDataItem (typically from a TwoWay VM
    // binding). Find the container backing this data item and select
    // it. Undefined clears the selection. When the data has no
    // realized container yet (e.g., a VM set this property before
    // ItemsSource finished realizing), we leave the selection alone —
    // the next realization will catch up when the container is
    // generated. Composed-markup mode: the data item IS its container.
    private applySelectedDataItem(value: unknown): void
    {
        if (value === undefined)
        {
            this.ClearSelection();
            return;
        }
        // The data may belong to any nested ItemsControl in this
        // TreeView, so we walk the realized container tree depth-first
        // and match on `_itemsControlData`. Composed-markup mode: the
        // value IS its container.
        const container = value instanceof TreeViewItem
            ? value
            : findContainerByData(this.RootItems, value);
        if (container === undefined) return;
        this.setSelected([container]);
        this._anchor = container;
        for (const l of this._selectionListeners) l();
        this.syncSelectedDataItem();
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
    public static readonly IsSelectedKey = Model.RegisterProperty<boolean>(TreeViewItem, 'IsSelected', false, MetaData.Render);

    static {
        ensureControlsTheme();
    }

    // Captured by the ItemsPanel factory on first invocation. The
    // IsExpanded handler reaches into it to drive collapse without
    // depending on a named PART_ lookup.
    private _childWrap: CollapsibleStack | undefined;

    // Template parts — resolved in the constructor.
    private readonly _row:         ClickableRow;
    private readonly _spacer:      Border;
    private readonly _chevronText: TextBlock;
    private readonly _label:       TextBlock;

    constructor()
    {
        super();
        this.Template = resolveTemplate(KEY_TREEVIEW_ITEM);

        const root = this.visualChildren[0]!;
        this._row         = root.FindName('PART_Row')         as ClickableRow;
        this._spacer      = root.FindName('PART_Spacer')      as Border;
        const chevron     = root.FindName('PART_Chevron')     as ChevronTarget;
        this._chevronText = root.FindName('PART_ChevronText') as TextBlock;
        this._label       = root.FindName('PART_Label')       as TextBlock;

        chevron.onClick = (): void => { this.IsExpanded = !this.IsExpanded; };
        this._row.onClick = (modifiers): void => {
            const tree = this.findTree();
            if (tree !== undefined) tree.HandleRowClick(this, modifiers);
        };
        this._row.AddPropertyChangedListener(Visual.IsMouseOverKey, () => this.refreshRowBackground());

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
        this.refreshRowBackground();
    }

    public get Header(): string { return this.get_property_value(TreeViewItem.HeaderKey); }
    public set Header(v: string) { this.set_property_value(TreeViewItem.HeaderKey, v); }

    public get IsExpanded(): boolean { return this.get_property_value(TreeViewItem.IsExpandedKey); }
    public set IsExpanded(v: boolean) { this.set_property_value(TreeViewItem.IsExpandedKey, v); }

    public get IsSelected(): boolean { return this.get_property_value(TreeViewItem.IsSelectedKey); }
    public set IsSelected(v: boolean) { this.set_property_value(TreeViewItem.IsSelectedKey, v); }

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

    // Setter exposed for TreeView's internal selection bookkeeping.
    public SetIsSelectedInternal(v: boolean): void
    {
        this.set_property_value(TreeViewItem.IsSelectedKey, v);
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
                break;
            case 'IsSelected':
                this.refreshRowBackground();
                break;
            case 'Header':
                this._label.Text = String(newValue ?? '');
                break;
        }
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

    // Row background priority: selected wins over hover. Transparent
    // (undefined Background) is the default.
    private refreshRowBackground(): void
    {
        let bg: Brush | undefined;
        if (this.IsSelected)            bg = Theme.itemSelectedBg;
        else if (this._row.IsMouseOver) bg = Theme.itemHoverBg;
        else                             bg = undefined;
        this._row.Background = bg;
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
