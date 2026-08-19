import {
    Element, Model, MetaData, Point, Rect, Size,
    chooseTickInterval, ticksInRange,
} from '../../../runtime/index.js';
import { Orientation } from '../../../basic/index.js';
import type { DrawingContext } from '../../../visual-engine/index.js';
import { FormattedText } from '../../../visual-engine/index.js';
import { DiagramSettings } from '../diagram-settings.js';

// A measured ruler strip along one viewport edge. The Diagram owns it (grabs it
// via GetTemplateChild and pushes Zoom / Offset / Extent as the camera changes);
// the ruler paints tick marks + numeric labels in RenderOverride, projecting each
// content coordinate to host space as `c * Zoom - Offset`. Drag-out of a new guide
// is handled by the persistent-guides behavior at the Diagram level (it detects a
// pointer-down whose Source is inside a RulerBar), so this control is display-only.
//
// Extends Element (like Shape / TextBlock), not Control: it paints itself in
// RenderOverride and needs no template / default Style.
const LABEL_FONT = 'sans-serif';
const LABEL_SIZE = 9;

export class RulerBar extends Element
{
    public static readonly OrientationKey = Model.RegisterProperty<Orientation>(
        RulerBar, 'Orientation', Orientation.Horizontal, MetaData.Render);
    public static readonly ZoomKey = Model.RegisterProperty<number>(
        RulerBar, 'Zoom', 1, MetaData.Render);
    public static readonly OffsetKey = Model.RegisterProperty<number>(
        RulerBar, 'Offset', 0, MetaData.Render);
    public static readonly ExtentKey = Model.RegisterProperty<number>(
        RulerBar, 'Extent', 0, MetaData.Render);

    public get Orientation(): Orientation { return this.get_property_value(RulerBar.OrientationKey); }
    public set Orientation(v: Orientation) { this.set_property_value(RulerBar.OrientationKey, v); }
    public get Zoom(): number { return this.get_property_value(RulerBar.ZoomKey); }
    public set Zoom(v: number) { this.set_property_value(RulerBar.ZoomKey, v); }
    public get Offset(): number { return this.get_property_value(RulerBar.OffsetKey); }
    public set Offset(v: number) { this.set_property_value(RulerBar.OffsetKey, v); }
    public get Extent(): number { return this.get_property_value(RulerBar.ExtentKey); }
    public set Extent(v: number) { this.set_property_value(RulerBar.ExtentKey, v); }

    private get horizontal(): boolean { return this.Orientation === Orientation.Horizontal; }

    protected override MeasureOverride(_available: Size): Size
    {
        // Fixed cross-axis thickness; the Grid cell (a `*` track) stretches the
        // main axis, and the `Auto` cross-axis track sizes to this thickness.
        const t = DiagramSettings.RulerThickness();
        return this.horizontal ? new Size(0, t) : new Size(t, 0);
    }

    protected override ArrangeOverride(finalSize: Size): Size
    {
        return finalSize;
    }

    protected override RenderOverride(dc: DrawingContext): void
    {
        const s = this.RenderSize;
        if (s.Width <= 0 || s.Height <= 0) return;

        dc.DrawRectangle(DiagramSettings.RulerFill(), undefined, new Rect(0, 0, s.Width, s.Height));

        const zoom = this.Zoom || 1;
        const offset = this.Offset;
        const extent = this.horizontal ? s.Width : s.Height;
        const contentMin = offset / zoom;
        const contentMax = (offset + extent) / zoom;
        const interval = chooseTickInterval(zoom, DiagramSettings.RulerTickMinSpacing());
        const ticks = ticksInRange(interval, contentMin, contentMax);

        const tickBrush = DiagramSettings.RulerTickColor();
        for (const c of ticks)
        {
            const host = c * zoom - offset;
            const label = new FormattedText(String(Math.round(c)), LABEL_FONT, LABEL_SIZE, tickBrush);
            if (this.horizontal)
            {
                const len = Math.max(4, s.Height * 0.4);
                dc.DrawRectangle(tickBrush, undefined, new Rect(host, s.Height - len, 1, len));
                dc.DrawText(label, new Point(host + 2, 1));
            }
            else
            {
                const len = Math.max(4, s.Width * 0.4);
                dc.DrawRectangle(tickBrush, undefined, new Rect(s.Width - len, host, len, 1));
                dc.DrawText(label, new Point(1, host + 2));
            }
        }
    }
}
