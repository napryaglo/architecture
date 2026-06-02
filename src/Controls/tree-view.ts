import {
    Application,
    MetaData,
    Model,
    Rect,
    Size,
    Visual,
    type DrawingContext,
    type ModifierKeys,
    type PointerEventArgs,
    type PropertyDescriptor,
} from '../runtime/index.js';
import { RectangleGeometry, type Brush } from '../visual-engine/index.js';
import { Border } from './border.js';
import { ScrollViewer } from './scroll-viewer.js';
import { StackPanel } from './stack-panel.js';
import { TextBlock } from './text-block.js';
import { Theme } from './theme.js';
import type { ControlTemplate } from './control-template.js';
import { create as createTreeViewResources     } from '../../build/Controls/tree-view.template.mu.js';
import { create as createTreeViewItemResources } from '../../build/Controls/tree-view-item.template.mu.js';

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
// so — used as the children-rows container under each TreeViewItem.
// Children stay attached (logical + visual) but are measured at
// Size.Zero and arranged at (0,0,0,0) when collapsed, AND the panel
// itself clips to a 0×0 rect so the children's internal sub-layouts
// don't paint outside the (collapsed) parent's bounds.
//
// The clip is what makes collapse visible: rows inside have fixed
// Height (32 DIPs) and labels positioned by depth, so without a clip
// the descendant texts paint at their natural positions and bleed
// into the rows below. clip-path on the panel's outer <g> cuts both
// paint AND, via SVG's default `pointer-events: visiblePainted`,
// hit-testing — so the collapsed glyphs aren't clickable either.
// Exported for the compiled-`.mu` TreeViewItem template (not public API).
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
// Composed-markup primary: consumers nest TreeViewItems by hand:
//
//   TreeView {
//       TreeViewItem[Header="Root"] {
//           TreeViewItem[Header="Branch"] {
//               TreeViewItem[Header="Leaf"] { }
//           }
//       }
//   }
//
// Plain click on a row sets the selection to that one item AND moves
// the selection anchor to it. Ctrl+click toggles membership AND moves
// the anchor. Shift+click extends the selection from the anchor to the
// clicked row (inclusive), traversing visible-items order — skips
// collapsed subtrees, matching what users see on screen.
//
// SelectedItem is a convenience getter returning the first item in
// SelectedItems (insertion order via Set semantics). A consumer that
// only cares about single-select can ignore Ctrl/Shift and treat
// SelectedItem like the WPF default.
export class TreeView extends Visual
{
    static {
        Model.RegisterProperty(TreeView, 'Indent', 16, MetaData.Measure | MetaData.Arrange);
        Application.DefaultResourceFactories.push(createTreeViewResources);
    }

    private readonly _stack: StackPanel;
    // The scroll viewport wrapping `_stack`. Default-template part —
    // every TreeView gets it so consumers don't have to compose a
    // ScrollViewer themselves to make a tall tree usable. Wheel events
    // bubble up to it from any row, so mouse-wheel + Shift-wheel scrolling
    // work without extra wiring.
    private readonly _scrollViewer: ScrollViewer;
    private readonly _rootItems: TreeViewItem[] = [];
    private readonly _selectedItems: Set<TreeViewItem> = new Set();
    private _anchor: TreeViewItem | undefined;
    private readonly _selectionListeners: Set<() => void> = new Set();

    constructor()
    {
        super();
        // Markup-defined ScrollViewer wrapping a vertical StackPanel,
        // resolved from DefaultTreeView in the controls theme. The
        // ScrollViewer (PART_Scroll) is the visual child the TreeView
        // attaches into its own subtree; the StackPanel (PART_Stack) is
        // where AddChild appends each root row.
        const inst = resolveTemplate(KEY_TREEVIEW).Apply(this);
        this._scrollViewer = inst.root as ScrollViewer;
        this._stack        = inst.root.FindName('PART_Stack') as StackPanel;
        this.AttachVisual(this._scrollViewer);
    }

    public get Indent(): number { return this.get_property_value('Indent'); }
    public set Indent(v: number) { this.set_property_value('Indent', v); }

    // The compiler emits `parent.AddChild(child)` for every body element
    // when the host's default slot is `list`. TreeView routes each call
    // through the two-tree split so the new TreeViewItem's logical
    // parent is `this` (DataContext + ancestor walks see the consumer-
    // authored tree shape) while its visual parent is `_stack` (the
    // renderer sees a flat vertical stack of root rows).
    public AddChild(child: Visual): void
    {
        if (!(child instanceof TreeViewItem))
        {
            throw new Error('TreeView only accepts TreeViewItem children');
        }
        this.AttachLogical(child);
        this._stack.AddVisualChild(child);
        this._rootItems.push(child);
        this._stack.InvalidateMeasure();
        this.InvalidateMeasure();
    }

    public RemoveChild(child: Visual): void
    {
        if (!(child instanceof TreeViewItem)) return;
        const idx = this._rootItems.indexOf(child);
        if (idx < 0) return;
        // Selection cleanup — drop any references the removed subtree
        // contributes to the selection set so SelectedItem stays valid.
        for (const item of TreeView.walkSubtree(child))
        {
            if (this._selectedItems.has(item))
            {
                this._selectedItems.delete(item);
                item.SetIsSelectedInternal(false);
            }
            if (this._anchor === item) this._anchor = undefined;
        }
        this._stack.RemoveVisualChild(child);
        this.DetachLogical(child);
        this._rootItems.splice(idx, 1);
        this._stack.InvalidateMeasure();
        this.InvalidateMeasure();
    }

    public override get visualChildren(): readonly Visual[]  { return [this._scrollViewer]; }
    public override get logicalChildren(): readonly Visual[] { return this._rootItems; }

    // The root items collected from the consumer markup. Exposed
    // read-only so callers (and TreeViewItem's range walk) can
    // iterate without mutating the internal array.
    public get RootItems(): readonly TreeViewItem[] { return this._rootItems; }

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

    // Programmatically clear selection — useful from consumer code
    // that wants to drop selection on a "back" navigation or similar.
    public ClearSelection(): void
    {
        if (this._selectedItems.size === 0) return;
        for (const i of this._selectedItems) i.SetIsSelectedInternal(false);
        this._selectedItems.clear();
        this._anchor = undefined;
        this.fireSelectionChanged();
    }

    // Internal: invoked from TreeViewItem.RemoveChild so a subtree
    // being detached anywhere in the tree drops its selection
    // contribution. Without this hook a deeply-nested RemoveChild
    // would leave orphan TreeViewItems in `_selectedItems`, which
    // would corrupt SelectedItem / SelectedItems reads after the
    // detach. Fires SelectionChanged exactly once when at least one
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

    // Entry point for row clicks. Modifier-aware: Shift extends from
    // the anchor in visible-items order; Ctrl toggles a single item;
    // plain click clears the existing selection and sets one item.
    //
    // Anchor management: plain / Ctrl click MOVE the anchor to the
    // clicked item; Shift-click LEAVES the anchor put so successive
    // Shift+clicks pivot the range against the same origin.
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
        // Diff against the current set so IsSelected only changes on the
        // items whose membership actually flipped — saves a render-dirty
        // refresh on visible rows that stay selected (the dominant case
        // for a Shift+click that overlaps the existing range).
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

    // Visible-items walk: depth-first in document order, skipping the
    // subtree of any collapsed item — matches what the user sees on
    // screen, which is what Shift+click range selection should follow.
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
        for (const root of this._rootItems) walk(root);
        return out;
    }

    // Depth-first walk including collapsed subtrees — used during
    // RemoveChild so the selection set drops every reference under the
    // detached subtree, not just the visible ones.
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

    protected override propagate_target_to_visual_children(): void
    {
        this._scrollViewer['SetTarget'](this['target']);
    }

    protected override propagate_inheritance_to_logical_children(): void
    {
        for (const i of this._rootItems) i['refresh_inheritance_subtree']();
    }

    protected override propagate_inheritance_for_logical_children(d: PropertyDescriptor): void
    {
        for (const i of this._rootItems) i['refresh_inherited'](d);
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
            for (const i of this._rootItems) TreeView.invalidateMeasureSubtree(i);
        }
    }

    private static invalidateMeasureSubtree(item: TreeViewItem): void
    {
        item.InvalidateMeasure();
        for (const c of item.SubItems) TreeView.invalidateMeasureSubtree(c);
    }

    // Read-only handle to the default-template ScrollViewer. Consumers
    // that want to drive the scroll position from code (jump-to-selected,
    // restore-on-load) can read offsets / call ScrollToTop here.
    public get ScrollViewer(): ScrollViewer { return this._scrollViewer; }

    protected override MeasureOverride(availableSize: Size): Size
    {
        this._scrollViewer.Measure(availableSize);
        return this._scrollViewer.DesiredSize;
    }

    protected override ArrangeOverride(finalSize: Size): Size
    {
        this._scrollViewer.Arrange(new Rect(0, 0, finalSize.Width, finalSize.Height));
        return finalSize;
    }

    protected override RenderOverride(_dc: DrawingContext): void { }
}

// One row in the tree. Authored in markup, instantiated once per
// position; nested TreeViewItems form the subtree.
//
// Public DPs:
//   Header     — string label rendered in the row's text cell.
//   IsExpanded — true when children are visible. Toggled by clicking
//                the chevron; also settable programmatically.
//   IsSelected — true when this row participates in the TreeView's
//                current selection. Read-mostly: written by the
//                TreeView's click handler; settable by consumers for
//                initialising a default selection.
//
// Internal visual structure (per item):
//
//   _outerStack (vertical)
//     ├─ _row (ClickableRow — hover / selection background)
//     │    └─ _rowInner (horizontal):
//     │         ├─ _spacer  (width = depth × Indent)
//     │         ├─ _chevron (fixed CHEVRON_WIDTH cell, ▸ / ▾ / blank)
//     │         └─ _label   (Header text)
//     └─ _childWrap (CollapsibleStack — sub-rows; size-zero when closed)
export class TreeViewItem extends Visual
{
    static {
        Model.RegisterProperty(TreeViewItem, 'Header',     '',    MetaData.Measure | MetaData.Render);
        Model.RegisterProperty(TreeViewItem, 'IsExpanded', false, MetaData.Measure | MetaData.Arrange);
        Model.RegisterProperty(TreeViewItem, 'IsSelected', false, MetaData.Render);
        Application.DefaultResourceFactories.push(createTreeViewItemResources);
    }

    // Template parts — all built in the constructor so the row is paint-
    // ready before any layout pass even if it spends time unattached.
    private readonly _outerStack:  StackPanel;
    private readonly _row:         ClickableRow;
    private readonly _spacer:      Border;
    private readonly _chevron:     ChevronTarget;
    private readonly _chevronText: TextBlock;
    private readonly _label:       TextBlock;
    private readonly _childWrap:   CollapsibleStack;

    private readonly _children:    TreeViewItem[] = [];

    constructor()
    {
        super();

        // Markup-defined row + sub-stack resolved from
        // DefaultTreeViewItem in the controls theme. All cosmetic
        // constants (32-DIP row height, 20-DIP chevron cell, 8 H / 6 V
        // row padding, ink/chevron text colours) live in the template;
        // this constructor only resolves the named parts and wires
        // behaviour to them.
        const inst = resolveTemplate(KEY_TREEVIEW_ITEM).Apply(this);
        this._outerStack  = inst.root.FindName('PART_OuterStack') as StackPanel;
        this._row         = inst.root.FindName('PART_Row')         as ClickableRow;
        this._spacer      = inst.root.FindName('PART_Spacer')      as Border;
        this._chevron     = inst.root.FindName('PART_Chevron')     as ChevronTarget;
        this._chevronText = inst.root.FindName('PART_ChevronText') as TextBlock;
        this._label       = inst.root.FindName('PART_Label')       as TextBlock;
        this._childWrap   = inst.root.FindName('PART_ChildWrap')   as CollapsibleStack;

        this._chevron.onClick = (): void => { this.IsExpanded = !this.IsExpanded; };
        this._row.onClick = (modifiers): void => {
            const tree = this.findTree();
            if (tree !== undefined) tree.HandleRowClick(this, modifiers);
        };
        this._row.AddPropertyChangedListener('IsMouseOver', () => this.refreshRowBackground());

        this._childWrap.SetCollapsed(true);

        this.AttachVisual(this._outerStack);

        this.refreshChevron();
        this.refreshRowBackground();
    }

    public get Header(): string { return this.get_property_value('Header'); }
    public set Header(v: string) { this.set_property_value('Header', v); }

    public get IsExpanded(): boolean { return this.get_property_value('IsExpanded'); }
    public set IsExpanded(v: boolean) { this.set_property_value('IsExpanded', v); }

    public get IsSelected(): boolean { return this.get_property_value('IsSelected'); }
    public set IsSelected(v: boolean) { this.set_property_value('IsSelected', v); }

    // Same two-tree split as TreeView's AddChild — logical parent is
    // this TreeViewItem so DataContext flows naturally; visual parent
    // is the child-wrap so the row stack renders the subtree.
    public AddChild(child: Visual): void
    {
        if (!(child instanceof TreeViewItem))
        {
            throw new Error('TreeViewItem only accepts TreeViewItem children');
        }
        this.AttachLogical(child);
        this._childWrap.AddVisualChild(child);
        this._children.push(child);
        this._childWrap.InvalidateMeasure();
        this.refreshChevron();
        this.InvalidateMeasure();
    }

    public RemoveChild(child: Visual): void
    {
        if (!(child instanceof TreeViewItem)) return;
        const idx = this._children.indexOf(child);
        if (idx < 0) return;
        // Drop the detached subtree's contribution to the owning
        // TreeView's selection BEFORE breaking the logical chain —
        // findTree walks logical parents, so doing this post-detach
        // would return undefined and silently leak.
        this.findTree()?.PurgeSubtreeFromSelection(child);
        this._childWrap.RemoveVisualChild(child);
        this.DetachLogical(child);
        this._children.splice(idx, 1);
        this._childWrap.InvalidateMeasure();
        this.refreshChevron();
        this.InvalidateMeasure();
    }

    public override get visualChildren(): readonly Visual[]  { return [this._outerStack]; }
    public override get logicalChildren(): readonly Visual[] { return this._children; }

    // Live view of the nested items. Consumers of TreeView (selection
    // walks, count badges) iterate this without paying the cost of a
    // defensive copy.
    public get SubItems(): readonly TreeViewItem[] { return this._children; }

    // Setter exposed for TreeView's internal selection bookkeeping —
    // bypasses HandleRowClick so writing the DP doesn't loop back
    // through the click pipeline. Consumers should set `IsSelected`
    // directly via the public setter when they want to initialise
    // selection from code.
    public SetIsSelectedInternal(v: boolean): void
    {
        this.set_property_value('IsSelected', v);
    }

    // Walk the logical-parent chain to find the owning TreeView.
    // Returns undefined when this item hasn't been added to a tree
    // yet (constructor stage) or when it's been removed.
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
    // the owning TreeView. Indent is applied as depth × TreeView.Indent
    // in MeasureOverride.
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
        return depth;       // detached: walk hit the root without finding TreeView
    }

    protected override propagate_target_to_visual_children(): void
    {
        this._outerStack['SetTarget'](this['target']);
    }

    protected override propagate_inheritance_to_logical_children(): void
    {
        for (const c of this._children) c['refresh_inheritance_subtree']();
    }

    protected override propagate_inheritance_for_logical_children(d: PropertyDescriptor): void
    {
        for (const c of this._children) c['refresh_inherited'](d);
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
                // CollapsibleStack toggle is also driven here so
                // child-row visibility flips on the same write.
                this._childWrap.SetCollapsed(!(newValue as boolean));
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
        // Indent comes from the owning TreeView; default to 16 if this
        // item is somehow being measured detached.
        const tree   = this.findTree();
        const indent = tree?.Indent ?? 16;
        const depth  = this.findDepth();
        this._spacer.Width = depth * indent;

        this._outerStack.Measure(availableSize);
        return this._outerStack.DesiredSize;
    }

    protected override ArrangeOverride(finalSize: Size): Size
    {
        this._outerStack.Arrange(new Rect(0, 0, finalSize.Width, finalSize.Height));
        return finalSize;
    }

    protected override RenderOverride(_dc: DrawingContext): void { }

    // Row background priority: selected wins over hover. Transparent
    // (undefined Background) is the default — the TreeView's host
    // surface shows through, which matches MUI's flat list style.
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
        if (this._children.length === 0)
        {
            this._chevronText.Text = '';
        }
        else
        {
            this._chevronText.Text = this.IsExpanded ? CHEVRON_EXPANDED : CHEVRON_COLLAPSED;
        }
    }
}
