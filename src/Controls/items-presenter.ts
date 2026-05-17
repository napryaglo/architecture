import { Panel, Rect, Size, Visual, type DrawingContext } from '../runtime/index.js';

// The slot inside an ItemsControl's ControlTemplate where the items
// panel lives. Counterpart to ContentPresenter (which slots a single
// Content Visual). After the template is applied, ItemsControl finds
// the first ItemsPresenter in the template subtree and routes the
// items panel into it via SetItemsPanel.
//
// Like ContentPresenter, this Visual is template-internal: its
// visualChild is the items panel; its logicalChildren is empty
// (logical ownership of the panel and containers stays on the
// ItemsControl, where DataContext / inheritance flow from).
//
// The items panel's visual parent is the ItemsPresenter; its
// containers' visual parents are the panel; their logical parents
// are the ItemsControl. Three-level visual / two-level logical
// divergence — same two-tree machinery as ContentControl + content.
export class ItemsPresenter extends Visual
{
    private _itemsPanel: Panel | undefined;

    public override get visualChildren(): readonly Visual[]
    {
        return this._itemsPanel !== undefined ? [this._itemsPanel] : [];
    }

    public override get logicalChildren(): readonly Visual[]
    {
        return [];
    }

    // Slot the items panel into this presenter. Visual-only attach —
    // the panel's logical parent stays on the ItemsControl above.
    // Passing undefined detaches.
    public SetItemsPanel(panel: Panel | undefined): void
    {
        if (panel === this._itemsPanel) return;
        if (this._itemsPanel !== undefined)
        {
            this.DetachVisual(this._itemsPanel);
        }
        this._itemsPanel = panel;
        if (panel !== undefined)
        {
            this.AttachVisual(panel);
        }
        this.InvalidateMeasure();
    }

    protected override MeasureOverride(availableSize: Size): Size
    {
        if (this._itemsPanel === undefined) return Size.Zero;
        this._itemsPanel.Measure(availableSize);
        return this._itemsPanel.DesiredSize;
    }

    protected override ArrangeOverride(finalSize: Size): Size
    {
        this._itemsPanel?.Arrange(new Rect(0, 0, finalSize.Width, finalSize.Height));
        return finalSize;
    }

    // Renders nothing of its own — the items panel paints itself when
    // the tree walk reaches it through visualChildren.
    protected override RenderOverride(_dc: DrawingContext): void { }
}
