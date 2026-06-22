import {
    Rect,
    Size,
    Visual,
    type DrawingContext,
    type PropertyDescriptor,
} from '../../runtime/index.js';
import { CollectionViewGroup } from '../../basic/collections/collection-view-group.js';
import { _registerGroupItemCtor } from '../base/items-control.js';
import { HeaderedItemsControl } from '../base/headered-items-control.js';
import { StackPanel } from '../../basic/panels/stack-panel.js';

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
export class GroupItem extends HeaderedItemsControl
{
    // Header DP comes from HeaderedItemsControl (typed `unknown` so it
    // accepts the Visual produced by the parent ItemsControl's
    // GroupStyle.HeaderTemplate, a raw string, or any other shape). When
    // undefined, no header row is rendered. The outer-stack management
    // below reacts in OnPropertyChanged so the visual list stays in sync
    // regardless of how the Header DP was written (direct set, binding
    // push, Style setter).

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

    protected override OnPropertyChanged(
        descriptor: PropertyDescriptor,
        oldValue: unknown,
        newValue: unknown,
    ): void
    {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        if (descriptor === HeaderedItemsControl.HeaderKey.descriptor)
        {
            // Detach the previous header visual (if any) before slotting
            // the new one. Non-Visual values (e.g. a string set via
            // markup before GroupStyle.HeaderTemplate has materialised a
            // Visual) are skipped silently — the slot stays empty until
            // the consumer supplies a Visual.
            if (oldValue instanceof Visual)
            {
                this._outerStack.RemoveChild(oldValue);
            }
            this._headerVisual = newValue instanceof Visual ? newValue : undefined;
            if (this._headerVisual !== undefined)
            {
                // Header sits ABOVE the inner items panel — insert at 0.
                this._outerStack.InsertChild(0, this._headerVisual);
            }
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

