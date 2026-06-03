import {
    MetaData,
    Model,
    Rect,
    Size,
    Visual,
    type DrawingContext,
} from '../runtime/index.js';
import { CollectionViewGroup } from './collection-view-group.js';
import { ItemsControl, _registerGroupItemCtor } from './items-control.js';
import { StackPanel } from './stack-panel.js';

// One row in a grouped ItemsControl — wraps a CollectionViewGroup and
// hosts its leaf items as the inner items panel. Mirrors WPF's
// GroupItem container.
//
// The default visual structure (when GroupStyle.HeaderTemplate is
// undefined) is a vertical StackPanel with two cells:
//
//   StackPanel (vertical)
//     ├─ Header           — null when HeaderTemplate is undefined
//     └─ inner items panel — Items = group.Items
//
// When HeaderTemplate is set, it's applied to the group data and the
// produced Visual is slotted in as the header. The inner items panel
// is the outer ItemsControl's ItemsPanel by default (so each group's
// items lay out the same way the ungrouped surface would have); the
// GroupStyle can override via its `Panel` field.
//
// GroupItem extends ItemsControl so the leaf items inside benefit from
// the same Items/ItemsSource/ItemTemplate/AlternationCount machinery
// as a top-level ItemsControl — including a nested generator session
// when leaves are realized.
export class GroupItem extends ItemsControl
{
    // Header content (typically a Visual produced by the parent
    // ItemsControl's GroupStyle.HeaderTemplate). When undefined, no
    // header row is rendered.
    public static readonly HeaderKey = Model.RegisterProperty<Visual | undefined>(
        GroupItem, 'Header', undefined, MetaData.Measure | MetaData.Render);

    private readonly _outerStack: StackPanel = new StackPanel();
    private _headerVisual: Visual | undefined;

    constructor()
    {
        super();
        // Default ItemsPanel for the GROUP's leaves — a vertical
        // StackPanel. Consumers override via GroupStyle.Panel.
        this.ItemsPanel = () => new StackPanel();

        this.AttachVisual(this._outerStack);
    }

    public get Header(): Visual | undefined { return this.get_property_value(GroupItem.HeaderKey); }
    public set Header(value: Visual | undefined)
    {
        const old = this.Header;
        if (old === value) return;
        this.set_property_value(GroupItem.HeaderKey, value);
        if (old !== undefined)
        {
            this._outerStack.RemoveChild(old);
        }
        this._headerVisual = value;
        if (value !== undefined)
        {
            // Header sits ABOVE the inner items panel — insert at 0.
            this._outerStack.InsertChild(0, value);
        }
    }

    // Public binding hook used by the parent ItemsControl during
    // PrepareContainerForItemOverride to thread the
    // CollectionViewGroup through to this GroupItem (Header text + the
    // group's leaf items).
    public BindGroup(group: CollectionViewGroup): void
    {
        // Set Items to the group's live leaf collection. Subsequent
        // mutations in group.Items flow through ItemsControl's
        // handleItemsChange — the GroupItem realizes / recycles
        // leaf containers like any other ItemsControl.
        this.Items = group.Items;
        this.DataContext = group;
    }

    public override get visualChildren(): readonly Visual[]
    {
        return [this._outerStack];
    }

    public override get logicalChildren(): readonly Visual[]
    {
        // Header is a logical child when present so DataContext flows
        // into it; leaf containers come through ItemsControl's
        // own logicalChildren impl (which returns _containers).
        const own  = super.logicalChildren;
        const head = this._headerVisual;
        return head === undefined ? own : [head, ...own];
    }

    protected override MeasureOverride(availableSize: Size): Size
    {
        // ItemsControl's default MeasureOverride doesn't know about
        // the outer StackPanel we wrap things in — measure through it
        // and report its size up.
        this._outerStack.Measure(availableSize);
        return this._outerStack.DesiredSize;
    }

    protected override ArrangeOverride(finalSize: Size): Size
    {
        this._outerStack.Arrange(new Rect(0, 0, finalSize.Width, finalSize.Height));
        return finalSize;
    }

    // GroupItem doesn't paint own primitives — the outer StackPanel
    // (header + inner panel) does all rendering.
    protected override RenderOverride(_dc: DrawingContext): void {}
}

// Register the GroupItem factory with ItemsControl on module-init so
// the grouped-rendering path in ItemsControl.GetContainerForItemOverride
// can construct GroupItems without a direct value-level import (which
// would create a circular dependency since GroupItem extends
// ItemsControl).
_registerGroupItemCtor(() => new GroupItem());

