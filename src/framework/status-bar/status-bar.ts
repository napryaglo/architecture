import {
    Element,
    MetaData,
    MuralBase,
    Rect,
    Size,
    Visual,
    type DrawingContext,
} from '../../runtime/index.js';
import { Brush } from '../../visual-engine/index.js';
import { ContentControl } from '../base/content-control.js';
import { ItemsControl } from '../base/items-control.js';

// StatusBar — bottom-of-window strip of status cells. ItemsControl
// whose containers are StatusBarItems and whose default ItemsPanel is a
// DockPanel. Authors dock cells via DockPanel.Dock on each item — a
// left-pinned label, a right-pinned clock, and a stretchy middle work
// out of the box because the default Style sets LastChildFill=true on
// the DockPanel.
//
// Mirrors WPF's StatusBar: an ItemsControl that wraps non-container
// items in StatusBarItem, with composed-markup pass-through for
// pre-built StatusBarItems.
export class StatusBar extends ItemsControl
{
    static
    {
        // Theme lookup uses StatusBar as the key — the default Style
        // `Style [TargetType=StatusBar]` in framework.resources.mu wires
        // the chrome Template plus the DockPanel ItemsPanel.
        MuralBase.OverrideMetadata(StatusBar, Element.DefaultStyleKeyKey, { default_value: StatusBar });
    }

    // Accept StatusBarItem + StatusBarSeparator directly as
    // declarative-markup children. Anything else has to come in via
    // `Items` so the data-driven path can wrap it. Matches ListBox's
    // ListBoxItem-only contract.
    protected override validateDeclarativeChild(child: Visual): void
    {
        if (!(child instanceof StatusBarItem) && !(child instanceof StatusBarSeparator))
        {
            throw new Error(
                'StatusBar only accepts StatusBarItem / StatusBarSeparator children'
                + ' as composed markup. Set non-container items via Items / ItemsSource.',
            );
        }
    }

    // Composed-markup pass-through. A pre-built StatusBarItem in
    // `Items` is its own container — don't re-wrap. The Separator is
    // also self-container so authors can mix `StatusBarItem` and
    // `StatusBarSeparator` directly in the items collection.
    public override IsItemItsOwnContainerOverride(item: unknown): boolean
    {
        return item instanceof StatusBarItem || item instanceof StatusBarSeparator;
    }

    // Data-driven path: wrap each non-container item in a StatusBarItem.
    // A Visual goes in directly via Content; a MuralBase goes through
    // ContentControl's DataTemplate resolution; anything else falls
    // back to the ContentPresenter's stringify path.
    public override GetContainerForItemOverride(item: unknown): Visual
    {
        const sbi = new StatusBarItem();
        this.bindContainerData(sbi, item);
        return sbi;
    }

    public override RebindContainerForItemOverride(container: Visual, item: unknown): void
    {
        if (container instanceof StatusBarItem)
        {
            this.bindContainerData(container, item);
        }
        super.RebindContainerForItemOverride(container, item);
    }

    private bindContainerData(sbi: StatusBarItem, item: unknown): void
    {
        sbi.DataContext = item;
        sbi.Content     = item as Visual | undefined;
    }
}

// StatusBarItem — single cell inside a StatusBar. ContentControl with a
// theme-supplied chrome Template (padded label box). Authors usually
// wrap content directly in markup; the data-driven path uses
// ContentPresenter via the inherited Template.
export class StatusBarItem extends ContentControl
{
    static
    {
        // Type-keyed default Style lookup — registered in
        // framework.resources.mu under `Style [TargetType=StatusBarItem]`.
        MuralBase.OverrideMetadata(StatusBarItem, Element.DefaultStyleKeyKey, { default_value: StatusBarItem });
    }
}

// StatusBarSeparator — vertical 1px divider between cells. Same
// imperative-paint shape as MenuSeparator: an Element leaf so the
// StatusBar's DockPanel can host it without ItemsControl's
// container-wrap pass.
export class StatusBarSeparator extends Element
{
    public static readonly LineBrushKey = MuralBase.RegisterProperty<Brush | undefined>(
        StatusBarSeparator, 'LineBrush', undefined, MetaData.Render,
    );

    static
    {
        // Type-keyed default Style — supplies Width / MinHeight /
        // LineBrush via DynamicResource so the line tints follow the
        // active theme palette.
        MuralBase.OverrideMetadata(StatusBarSeparator, Element.DefaultStyleKeyKey, { default_value: StatusBarSeparator });
    }

    constructor()
    {
        super();
        this.applyDefaultStyle();
    }

    public get LineBrush():  Brush | undefined { return this.get_property_value(StatusBarSeparator.LineBrushKey); }
    public set LineBrush(v: Brush | undefined) { this.set_property_value(StatusBarSeparator.LineBrushKey, v); }

    protected override MeasureOverride(_availableSize: Size): Size
    {
        // Report only MinHeight on the cross axis — NOT the available
        // height. Reporting availableSize.Height back would inflate the
        // hosting StatusBar's DesiredHeight to whatever slot the outer
        // panel passed in, and the outer DockPanel would then stretch
        // the StatusBar across that whole slot at arrange time. The
        // Arrange phase of the StatusBar's DockPanel gives the
        // Separator the cross-axis Height of the strip via the standard
        // VerticalAlignment=Stretch path, so the line still paints full
        // strip-height — mirrors MenuSeparator's measure shape.
        return new Size(this.Width, this.MinHeight);
    }

    protected override ArrangeOverride(finalSize: Size): Size { return finalSize; }

    protected override RenderOverride(dc: DrawingContext): void
    {
        const rect = this.ArrangedRect;
        const brush = this.LineBrush;
        if (brush === undefined) return;
        const x = Math.floor(rect.Width / 2);
        const yTop = 2;
        const yBot = Math.max(2, rect.Height - 2);
        dc.DrawRectangle(brush, undefined, new Rect(x, yTop, 1, yBot - yTop));
    }
}
