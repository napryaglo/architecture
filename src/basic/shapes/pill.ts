import {
    Rect,
    Size,
    type DrawingContext,
} from '../../runtime/index.js';
import { RectangleGeometry, type Geometry } from '../../visual-engine/index.js';
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
    // Hit / clip outline = the OUTER silhouette (inset 0), so the whole
    // shape including its stroke band is grabbable.
    protected override buildGeometry(size: Size): Geometry | undefined
    {
        return this.buildOutline(size, 0);
    }

    // The capsule outline inset uniformly by `inset` px on every edge.
    // buildGeometry uses inset 0 (outer, for hit); RenderOverride paints at
    // inset = t/2 so a centred stroke lands fully inside the outline.
    private buildOutline(size: Size, inset: number): Geometry | undefined
    {
        if (size.Width <= 0 || size.Height <= 0) return undefined;

        const w    = Math.max(0, size.Width  - 2 * inset);
        const h    = Math.max(0, size.Height - 2 * inset);
        // The radius is half the short axis after the inset so the capped
        // ends always close cleanly inside the layout rect.
        const r    = Math.min(w, h) / 2;

        return new RectangleGeometry(new Rect(inset, inset, w, h), r, r);
    }

    protected override RenderOverride(dc: DrawingContext): void
    {
        // Paint the outline inset by half the pen so a centred stroke stays
        // inside the outer (hit) silhouette. Render is unchanged from when
        // buildGeometry itself insetted.
        const geom = this.buildOutline(this.RenderSize, (this.Stroke?.Thickness ?? 0) / 2);
        if (geom === undefined) return;
        dc.DrawGeometry(this.Fill, this.Stroke, geom);
    }
}
