import {
    Rect,
    type DrawingContext,
} from '../../runtime/index.js';
import { RectangleGeometry } from '../../visual-engine/index.js';
import { Shape } from './shape.js';

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
export class Pill extends Shape
{
    protected override RenderOverride(dc: DrawingContext): void
    {
        const size = this.RenderSize;
        if (size.Width <= 0 || size.Height <= 0) return;

        const stroke = this.Stroke;
        const t      = stroke?.Thickness ?? 0;
        const half = t / 2;
        const w    = Math.max(0, size.Width  - t);
        const h    = Math.max(0, size.Height - t);
        // The radius is half the short axis after the half-stroke inset
        // so the capped ends always close cleanly inside the layout rect.
        const r    = Math.min(w, h) / 2;

        dc.DrawGeometry(
            this.Fill,
            stroke,
            new RectangleGeometry(new Rect(half, half, w, h), r, r));
    }
}
