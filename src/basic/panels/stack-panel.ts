import {
    MetaData,
    Model,
    Panel,
    Rect,
    Size,
} from '../../runtime/index.js';

// Stack direction. Vertical (the default) lays children top-down;
// horizontal lays them left-to-right. Matches WPF's Orientation enum.
export enum Orientation
{
    Vertical   = 'Vertical',
    Horizontal = 'Horizontal',
}

// Lightweight vertical / horizontal stack layout. Children measure with
// infinite space along the stack axis and the available cross-axis
// width / height; arrange places them end-to-end starting at the
// origin. No spacing DP for v0 — consumers add Margin to children
// when they need it.
//
// MeasureOverride returns the sum of child desired sizes along the
// stack axis and the maximum of cross-axis desired sizes — exactly
// the WPF StackPanel.MeasureOverride shape. Children that report
// zero in the cross-axis still get the panel's cross-axis size
// during Arrange so their backgrounds don't paint a sliver narrower
// than the layout slot.
export class StackPanel extends Panel
{
    public static readonly OrientationKey = Model.RegisterProperty<Orientation>(
        StackPanel, 'Orientation', Orientation.Vertical,
        MetaData.Measure | MetaData.Arrange);

    public get Orientation(): Orientation { return this.get_property_value(StackPanel.OrientationKey); }
    public set Orientation(v: Orientation) { this.set_property_value(StackPanel.OrientationKey, v); }

    protected override MeasureOverride(availableSize: Size): Size
    {
        const vertical = this.Orientation === Orientation.Vertical;
        let stack = 0;
        let cross = 0;
        const childAvail = vertical
            ? new Size(availableSize.Width,  Number.POSITIVE_INFINITY)
            : new Size(Number.POSITIVE_INFINITY, availableSize.Height);
        for (const child of this.visualChildren)
        {
            child.Measure(childAvail);
            const sz = child.DesiredSize;
            if (vertical)
            {
                stack += sz.Height;
                cross = Math.max(cross, sz.Width);
            }
            else
            {
                stack += sz.Width;
                cross = Math.max(cross, sz.Height);
            }
        }
        return vertical
            ? new Size(cross, stack)
            : new Size(stack, cross);
    }

    protected override ArrangeOverride(finalSize: Size): Size
    {
        const vertical = this.Orientation === Orientation.Vertical;
        let offset = 0;
        for (const child of this.visualChildren)
        {
            const sz = child.DesiredSize;
            if (vertical)
            {
                child.Arrange(new Rect(0, offset, finalSize.Width, sz.Height));
                offset += sz.Height;
            }
            else
            {
                child.Arrange(new Rect(offset, 0, sz.Width, finalSize.Height));
                offset += sz.Width;
            }
        }
        return finalSize;
    }
}
