import {
    MetaData,
    Model,
    Panel,
    Rect,
    Size,
    Visual,
} from '../../runtime/index.js';
import { Orientation } from './stack-panel.js';

// Flowing layout — children pack along the primary axis until adding
// another would exceed the available primary extent, at which point the
// next child starts a new line. Matches WPF WrapPanel.
//
// `Orientation=Horizontal` (default in WPF — kept here for parity)
// flows left-to-right with line breaks top-to-bottom. `Vertical` flows
// top-to-bottom with line breaks left-to-right. Cross-axis line height
// (Horizontal) or width (Vertical) is the max of the line's children's
// DesiredSize on that axis — same line-height-by-tallest-child rule as
// CSS flexbox / inline layout.
//
// MeasureOverride: each child is measured with the panel's available
// primary extent and infinite cross extent. The wrap pass tracks the
// running line; the panel's own DesiredSize is the max line primary
// extent and the sum of line cross extents.
//
// ArrangeOverride: re-groups children into lines (their DesiredSize is
// stable by this point) and positions each child at the running
// primary offset within its line. Each child is given the line's full
// cross extent so backgrounds paint to the line height rather than
// just the child's measured cross size.
//
// Single child wider/taller than `availableSize` along the primary
// axis still gets placed on its own line — the wrap policy doesn't
// clip; consumers add Margin / Width constraints on children when
// they need a hard cap.
//
// v0 scope: no `ItemWidth` / `ItemHeight` DPs (the uniform-cell mode
// in WPF). Adds cleanly later if a demo wants palette grids with
// fixed-size cells; everything else carries over.
export class WrapPanel extends Panel
{
    public static readonly OrientationKey = Model.RegisterProperty<Orientation>(
        WrapPanel, 'Orientation', Orientation.Horizontal,
        MetaData.Measure | MetaData.Arrange);

    public get Orientation(): Orientation { return this.get_property_value(WrapPanel.OrientationKey); }
    public set Orientation(v: Orientation) { this.set_property_value(WrapPanel.OrientationKey, v); }

    protected override MeasureOverride(availableSize: Size): Size
    {
        const horizontal = this.Orientation === Orientation.Horizontal;
        const primaryAvail = horizontal ? availableSize.Width : availableSize.Height;
        const childAvail = horizontal
            ? new Size(primaryAvail, Number.POSITIVE_INFINITY)
            : new Size(Number.POSITIVE_INFINITY, primaryAvail);

        let linePrimary = 0;
        let lineCross   = 0;
        let totalPrimary = 0;
        let totalCross   = 0;

        for (const child of this.visualChildren)
        {
            child.Measure(childAvail);
            const sz = child.DesiredSize;
            const childPrimary = horizontal ? sz.Width  : sz.Height;
            const childCross   = horizontal ? sz.Height : sz.Width;

            // Wrap when adding this child would exceed the available
            // primary extent — but only if the current line isn't empty
            // (a single child that's wider than `primaryAvail` still
            // gets its own line rather than zero-sized clipping).
            if (linePrimary + childPrimary > primaryAvail && linePrimary > 0)
            {
                totalPrimary = Math.max(totalPrimary, linePrimary);
                totalCross  += lineCross;
                linePrimary = childPrimary;
                lineCross   = childCross;
            }
            else
            {
                linePrimary += childPrimary;
                lineCross    = Math.max(lineCross, childCross);
            }
        }
        // Flush the final line.
        totalPrimary = Math.max(totalPrimary, linePrimary);
        totalCross  += lineCross;

        return horizontal
            ? new Size(totalPrimary, totalCross)
            : new Size(totalCross,   totalPrimary);
    }

    protected override ArrangeOverride(finalSize: Size): Size
    {
        const horizontal = this.Orientation === Orientation.Horizontal;
        const primaryFinal = horizontal ? finalSize.Width : finalSize.Height;

        // Group children into lines, mirroring the Measure pass — but
        // against `finalSize` rather than the (possibly infinite) input
        // availableSize. Keeps the per-line cross extent handy for the
        // arrange loop that follows.
        const lines: { children: Visual[]; cross: number }[] = [];
        let current: Visual[] = [];
        let linePrimary = 0;
        let lineCross   = 0;

        for (const child of this.visualChildren)
        {
            const sz = child.DesiredSize;
            const childPrimary = horizontal ? sz.Width  : sz.Height;
            const childCross   = horizontal ? sz.Height : sz.Width;

            if (linePrimary + childPrimary > primaryFinal && linePrimary > 0)
            {
                lines.push({ children: current, cross: lineCross });
                current = [child];
                linePrimary = childPrimary;
                lineCross   = childCross;
            }
            else
            {
                current.push(child);
                linePrimary += childPrimary;
                lineCross    = Math.max(lineCross, childCross);
            }
        }
        if (current.length > 0)
        {
            lines.push({ children: current, cross: lineCross });
        }

        // Position each line, then position each child within its line.
        let crossOffset = 0;
        for (const line of lines)
        {
            let primaryOffset = 0;
            for (const child of line.children)
            {
                const sz = child.DesiredSize;
                const childPrimary = horizontal ? sz.Width : sz.Height;
                child.Arrange(horizontal
                    ? new Rect(primaryOffset, crossOffset, childPrimary, line.cross)
                    : new Rect(crossOffset, primaryOffset, line.cross, childPrimary),
                );
                primaryOffset += childPrimary;
            }
            crossOffset += line.cross;
        }
        return finalSize;
    }
}
