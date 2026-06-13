import {
    MetaData,
    Model,
    Rect,
    Size,
    Visual,
    type DrawingContext,
} from '../../runtime/index.js';
import { Brush, Pen, RectangleGeometry } from '../../visual-engine/index.js';

// M3 Pill — capsule rectangle. The corner radius is always
// `min(W, H) / 2`, so the short axis becomes two full half-circles.
// Provided as a named primitive because the auto-radius computation is
// a recurring pattern across M3 chips, buttons, and search bars: dialling
// a Pill in by hand requires the consumer to mirror the W×H math on
// every resize, which is brittle under dynamic content widths.
//
// A consumer who wants explicit radii uses Rectangle directly; this
// class doesn't expose a RadiusX / RadiusY override — that would defeat
// the named contract.
//
// Stroke insets by half-thickness (Border / Ellipse convention).
export class Pill extends Visual
{
    public static readonly FillKey            = Model.RegisterProperty<Brush | undefined>(Pill, 'Fill',            undefined, MetaData.Render);
    public static readonly StrokeKey          = Model.RegisterProperty<Brush | undefined>(Pill, 'Stroke',          undefined, MetaData.Render);
    public static readonly StrokeThicknessKey = Model.RegisterProperty<number>(           Pill, 'StrokeThickness', 0,         MetaData.Render);

    public get Fill(): Brush | undefined { return this.get_property_value(Pill.FillKey); }
    public set Fill(v: Brush | undefined) { this.set_property_value(Pill.FillKey, v); }

    public get Stroke(): Brush | undefined { return this.get_property_value(Pill.StrokeKey); }
    public set Stroke(v: Brush | undefined) { this.set_property_value(Pill.StrokeKey, v); }

    public get StrokeThickness(): number { return this.get_property_value(Pill.StrokeThicknessKey); }
    public set StrokeThickness(v: number) { this.set_property_value(Pill.StrokeThicknessKey, v); }

    protected override MeasureOverride(_availableSize: Size): Size
    {
        return Size.Zero;
    }

    protected override ArrangeOverride(finalSize: Size): Size
    {
        return finalSize;
    }

    protected override RenderOverride(dc: DrawingContext): void
    {
        const size = this.RenderSize;
        if (size.Width <= 0 || size.Height <= 0) return;

        const t    = this.StrokeThickness;
        const half = t / 2;
        const w    = Math.max(0, size.Width  - t);
        const h    = Math.max(0, size.Height - t);
        // The radius is half the short axis after the half-stroke inset
        // so the capped ends always close cleanly inside the layout rect.
        const r    = Math.min(w, h) / 2;

        const pen = this.Stroke !== undefined && t > 0
            ? new Pen(this.Stroke, t)
            : undefined;

        dc.DrawGeometry(
            this.Fill,
            pen,
            new RectangleGeometry(new Rect(half, half, w, h), r, r));
    }
}
