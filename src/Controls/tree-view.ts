import {
    Application,
    MetaData,
    Model,
    ObservableCollection,
    Rect,
    Size,
    Visual,
    type ModifierKeys,
    type PointerEventArgs,
    type PropertyDescriptor,
} from '../runtime/index.js';
import { RectangleGeometry, type Brush } from '../visual-engine/index.js';
import { Border } from './border.js';
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
    static {
        Model.RegisterProperty(TreeView, 'Indent', 16, MetaData.Measure | MetaData.Arrange);
        ensureControlsTheme();
    }

    // Backing for AddChild — declarative children land here when no
    // caller-supplied Items collection is in place. Same pattern as
    // ListBox.
    private readonly _declarativeItems: ObservableCollection<unknown>
        = new ObservableCollection<unknown>();

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
        this.Items = this._declarativeItems;
    }

    public get Indent(): number { return this.get_property_value('Indent'); }
    public set Indent(v: number) { this.set_property_value('Indent', v); }

    // ── ItemsControl override seams ────────────────────────────────

    public override GetContainerForItemOverride(item: unknown): Visual
    {
        // Composed-markup items are TreeViewItem instances and pass
        // through unchanged. Data-driven items (a future
        // HierarchicalDataTemplate path) would wrap here.
        if (item instanceof TreeViewItem) return item;
        const tvi = new TreeViewItem();
        tvi.Header = String(item ?? '');
        return tvi;
    }

    public override ClearContainerForItemOverride(container: Visual, item: unknown): void
    {
        super.ClearContainerForItemOverride(container, item);
        if (!(container instanceof TreeViewItem)) return;
        // Drop everything under the detached subtree from selection.
        this.PurgeSubtreeFromSelection(container);
    }

    // ── Declarative AddChild → Items routing ──────────────────────

    public AddChild(child: Visual): void
    {
        if (!(child instanceof TreeViewItem))
        {
            throw new Error('TreeView only accepts TreeViewItem children');
        }
        const items = this.Items;
        if (items instanceof ObservableCollection)
        {
            items.Add(child);
        }
        else
        {
            this.promoteToObservable();
            this._declarativeItems.Add(child);
        }
    }

    public RemoveChild(child: Visual): void
    {
        if (!(child instanceof TreeViewItem)) return;
        const items = this.Items;
        if (items instanceof ObservableCollection)
        {
            items.Remove(child);
        }
    }

    private promoteToObservable(): void
    {
        const current = this.Items;
        this._declarativeItems.Clear();
        if (Array.isArray(current))
        {
            for (const v of current) this._declarativeItems.Add(v);
        }
        this.Items = this._declarativeItems;
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
        for (const l of this._selectionListeners) l();
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
    static {
        Model.RegisterProperty(TreeViewItem, 'Header',     '',    MetaData.Measure | MetaData.Render);
        Model.RegisterProperty(TreeViewItem, 'IsExpanded', false, MetaData.Measure | MetaData.Arrange);
        Model.RegisterProperty(TreeViewItem, 'IsSelected', false, MetaData.Render);
        ensureControlsTheme();
    }

    // Backing for AddChild — declarative children land here.
    private readonly _declarativeItems: ObservableCollection<unknown>
        = new ObservableCollection<unknown>();

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
        this._row.AddPropertyChangedListener('IsMouseOver', () => this.refreshRowBackground());

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
        this.Items = this._declarativeItems;

        this.refreshChevron();
        this.refreshRowBackground();
    }

    public get Header(): string { return this.get_property_value('Header'); }
    public set Header(v: string) { this.set_property_value('Header', v); }

    public get IsExpanded(): boolean { return this.get_property_value('IsExpanded'); }
    public set IsExpanded(v: boolean) { this.set_property_value('IsExpanded', v); }

    public get IsSelected(): boolean { return this.get_property_value('IsSelected'); }
    public set IsSelected(v: boolean) { this.set_property_value('IsSelected', v); }

    // ── ItemsControl override seams ────────────────────────────────

    public override GetContainerForItemOverride(item: unknown): Visual
    {
        if (item instanceof TreeViewItem) return item;
        const tvi = new TreeViewItem();
        tvi.Header = String(item ?? '');
        return tvi;
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

    // Declarative AddChild → Items routing (same as TreeView).
    public AddChild(child: Visual): void
    {
        if (!(child instanceof TreeViewItem))
        {
            throw new Error('TreeViewItem only accepts TreeViewItem children');
        }
        const items = this.Items;
        if (items instanceof ObservableCollection)
        {
            items.Add(child);
        }
        else
        {
            this.promoteToObservable();
            this._declarativeItems.Add(child);
        }
    }

    public RemoveChild(child: Visual): void
    {
        if (!(child instanceof TreeViewItem)) return;
        const items = this.Items;
        if (items instanceof ObservableCollection)
        {
            items.Remove(child);
        }
    }

    private promoteToObservable(): void
    {
        const current = this.Items;
        this._declarativeItems.Clear();
        if (Array.isArray(current))
        {
            for (const v of current) this._declarativeItems.Add(v);
        }
        this.Items = this._declarativeItems;
    }

    // Live view of the nested items in document order.
    public get SubItems(): readonly TreeViewItem[]
    {
        return this.logicalChildren as readonly TreeViewItem[];
    }

    // Setter exposed for TreeView's internal selection bookkeeping.
    public SetIsSelectedInternal(v: boolean): void
    {
        this.set_property_value('IsSelected', v);
    }

    // Walk the logical-parent chain to find the owning TreeView.
    private findTree(): TreeView | undefined
    {
        let cur: Visual | undefined = this.GetLogicalParent();
        while (cur !== undefined)
        {
            if (cur instanceof TreeView) return cur;
            cur = cur.GetLogicalParent();
        }
        return undefined;
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
