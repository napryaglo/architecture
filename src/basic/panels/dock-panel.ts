import { MetaData, MuralBase, Panel, Rect, Size, Visual } from '../../runtime/index.js';

// Dock edge for a DockPanel child. Matches WPF's System.Windows.Controls.Dock
// enum verbatim — Left / Top / Right / Bottom — and is the value carried by
// the `DockPanel.Dock` attached property.
export enum Dock
{
    Left   = 'Left',
    Top    = 'Top',
    Right  = 'Right',
    Bottom = 'Bottom',
}

// WPF DockPanel parity. Children are docked one edge at a time in document
// order, each one peeling a slice from its declared edge; the last child
// optionally stretches into whatever rectangle is left over.
//
// Two surface APIs:
//   * Attached `DockPanel.Dock` on each child (default Left).
//   * Instance `LastChildFill` (default true) — when true the final child
//     ignores its own Dock value and fills the remaining slot.
//
// Algorithm follows the reference WPF implementation exactly:
//   * Measure walks children once, shrinking the remaining available size
//     after each one and tracking the rolling max along the cross axis;
//     the panel's DesiredSize is max(accumulated, rolling cross) per axis.
//   * Arrange walks children again, peeling Left/Top/Right/Bottom slices
//     off the final rect by accumulating per-edge offsets; the LastChildFill
//     case skips the peel and hands the child whatever rectangle remains.
//
// MetaData.None on Dock — same trade-off as Canvas's Left/Top: changing
// a child's Dock at runtime does NOT invalidate the panel automatically.
// HeadlessTarget re-runs full layout on every Render so this works for the
// existing flow; incremental layout (SvgRenderer) would need DockPanel to
// subscribe to Dock changes on its children. See [[mu-mural-scope-extensions-vs-attached-properties]].
export class DockPanel extends Panel
{
    public static readonly DockKey          = MuralBase.RegisterAttachedProperty<Dock>(DockPanel, 'Dock', Dock.Left, MetaData.None);
    public static readonly LastChildFillKey = MuralBase.RegisterProperty<boolean>(     DockPanel, 'LastChildFill', true,
        MetaData.Measure | MetaData.Arrange);

    // Static accessors mirror WPF's DockPanel.SetDock / DockPanel.GetDock.
    public static SetDock(v: Visual, value: Dock): void
    {
        v.set_property_value(DockPanel.DockKey, value);
    }

    public static GetDock(v: Visual): Dock
    {
        return v.get_property_value(DockPanel.DockKey);
    }

    public get LastChildFill(): boolean  { return this.get_property_value(DockPanel.LastChildFillKey); }
    public set LastChildFill(v: boolean) { this.set_property_value(DockPanel.LastChildFillKey, v); }

    protected override MeasureOverride(availableSize: Size): Size
    {
        let parentWidth      = 0;
        let parentHeight     = 0;
        let accumulatedWidth  = 0;
        let accumulatedHeight = 0;

        for (const child of this.visualChildren)
        {
            const childAvail = new Size(
                Math.max(0, availableSize.Width  - accumulatedWidth),
                Math.max(0, availableSize.Height - accumulatedHeight),
            );
            child.Measure(childAvail);
            const desired = child.DesiredSize;

            switch (DockPanel.GetDock(child))
            {
                case Dock.Left:
                case Dock.Right:
                    parentHeight     = Math.max(parentHeight, accumulatedHeight + desired.Height);
                    accumulatedWidth += desired.Width;
                    break;
                case Dock.Top:
                case Dock.Bottom:
                    parentWidth       = Math.max(parentWidth, accumulatedWidth + desired.Width);
                    accumulatedHeight += desired.Height;
                    break;
            }
        }

        parentWidth  = Math.max(parentWidth,  accumulatedWidth);
        parentHeight = Math.max(parentHeight, accumulatedHeight);
        return new Size(parentWidth, parentHeight);
    }

    protected override ArrangeOverride(finalSize: Size): Size
    {
        const children = this.visualChildren;
        const lastFill = this.LastChildFill;
        const fillIndex = lastFill ? children.length - 1 : -1;

        let accLeft   = 0;
        let accTop    = 0;
        let accRight  = 0;
        let accBottom = 0;

        for (let i = 0; i < children.length; i++)
        {
            const child = children[i]!;
            const desired = child.DesiredSize;
            const remainingW = Math.max(0, finalSize.Width  - (accLeft + accRight));
            const remainingH = Math.max(0, finalSize.Height - (accTop  + accBottom));

            if (i === fillIndex)
            {
                child.Arrange(new Rect(accLeft, accTop, remainingW, remainingH));
                continue;
            }

            switch (DockPanel.GetDock(child))
            {
                case Dock.Left:
                {
                    const w = Math.min(desired.Width, remainingW);
                    child.Arrange(new Rect(accLeft, accTop, w, remainingH));
                    accLeft += w;
                    break;
                }
                case Dock.Right:
                {
                    const w = Math.min(desired.Width, remainingW);
                    child.Arrange(new Rect(finalSize.Width - accRight - w, accTop, w, remainingH));
                    accRight += w;
                    break;
                }
                case Dock.Top:
                {
                    const h = Math.min(desired.Height, remainingH);
                    child.Arrange(new Rect(accLeft, accTop, remainingW, h));
                    accTop += h;
                    break;
                }
                case Dock.Bottom:
                {
                    const h = Math.min(desired.Height, remainingH);
                    child.Arrange(new Rect(accLeft, finalSize.Height - accBottom - h, remainingW, h));
                    accBottom += h;
                    break;
                }
            }
        }
        return finalSize;
    }
}
