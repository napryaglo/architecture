import {
    MetaData,
    Model,
    Point,
    type DrawingContext,
} from '../../runtime/index.js';
import { PathGeometry } from '../../visual-engine/index.js';
import { Shape } from './shape.js';
import { buildRoundedPolygon, maxCornerRadius } from './polygon-helpers.js';

// M3 Cookie — N-sided regular polygon with rounded corners. The polygon
// inscribes the layout rect: vertices sit on the ellipse with semi-axes
// (W/2, H/2), so a non-square rect stretches the polygon to fit.
//
// Parameters:
//   * Sides       — vertex count (3+). Default 6 (hexagon — the M3
//                   "Gem" silhouette).
//   * Rotation    — degrees of CCW rotation applied after vertex layout.
//                   Default -90 so the first vertex lands at the top
//                   centre (matches the conventional "point up" reading).
//   * CornerRadius — round-corner radius shared across all vertices.
//                   Clamps to half the shortest edge to prevent corner
//                   overlap.
//
// Stroke insets by half-thickness.
export class Cookie extends Shape
{
    public static readonly SidesKey           = Model.RegisterProperty<number>(           Cookie, 'Sides',           6,         MetaData.Render);
    public static readonly RotationKey        = Model.RegisterProperty<number>(           Cookie, 'Rotation',        -90,       MetaData.Render);
    public static readonly CornerRadiusKey    = Model.RegisterProperty<number>(           Cookie, 'CornerRadius',    0,         MetaData.Render);

    public get Sides(): number { return this.get_property_value(Cookie.SidesKey); }
    public set Sides(v: number) { this.set_property_value(Cookie.SidesKey, v); }

    public get Rotation(): number { return this.get_property_value(Cookie.RotationKey); }
    public set Rotation(v: number) { this.set_property_value(Cookie.RotationKey, v); }

    public get CornerRadius(): number { return this.get_property_value(Cookie.CornerRadiusKey); }
    public set CornerRadius(v: number) { this.set_property_value(Cookie.CornerRadiusKey, v); }

    protected override RenderOverride(dc: DrawingContext): void
    {
        const size = this.RenderSize;
        if (size.Width <= 0 || size.Height <= 0) return;

        const stroke = this.Stroke;
        const t      = stroke?.Thickness ?? 0;
        const half = t / 2;
        const w    = Math.max(0, size.Width  - t);
        const h    = Math.max(0, size.Height - t);
        const rx   = w / 2;
        const ry   = h / 2;
        const cx   = half + rx;
        const cy   = half + ry;

        const sides = Math.max(3, Math.floor(this.Sides));
        const phi0  = this.Rotation * Math.PI / 180;

        const verts: Point[] = [];
        for (let i = 0; i < sides; i++)
        {
            const phi = phi0 + 2 * Math.PI * i / sides;
            verts.push(new Point(cx + rx * Math.cos(phi), cy + ry * Math.sin(phi)));
        }

        const r = Math.max(0, Math.min(this.CornerRadius, maxCornerRadius(verts)));

        dc.DrawGeometry(this.Fill, stroke, new PathGeometry([buildRoundedPolygon(verts, r)]));
    }
}

// ────────────────────────────────────────────────────────────────────
// Named cookie variants — thin subclasses that override the `Sides` /
// `Rotation` defaults via metadata. Consumers write `<FourSidedCookie />`
// instead of `<Cookie Sides=4 />` for clarity in static catalogues.
// ────────────────────────────────────────────────────────────────────

export class FourSidedCookie extends Cookie
{
    static {
        Model.OverrideMetadata(FourSidedCookie, Cookie.SidesKey, { default_value: 4 });
    }
}

export class SixSidedCookie extends Cookie
{
    static {
        Model.OverrideMetadata(SixSidedCookie, Cookie.SidesKey, { default_value: 6 });
    }
}

export class SevenSidedCookie extends Cookie
{
    static {
        Model.OverrideMetadata(SevenSidedCookie, Cookie.SidesKey, { default_value: 7 });
    }
}

export class NineSidedCookie extends Cookie
{
    static {
        Model.OverrideMetadata(NineSidedCookie, Cookie.SidesKey, { default_value: 9 });
    }
}

export class TwelveSidedCookie extends Cookie
{
    static {
        Model.OverrideMetadata(TwelveSidedCookie, Cookie.SidesKey, { default_value: 12 });
    }
}

// Diamond — 4-sided cookie rotated 45° from the cardinal so the points
// sit on the cardinal axes (top / right / bottom / left).
export class Diamond extends Cookie
{
    static {
        Model.OverrideMetadata(Diamond, Cookie.SidesKey,    { default_value: 4 });
        Model.OverrideMetadata(Diamond, Cookie.RotationKey, { default_value: -90 });
    }
}

// Pentagon — 5-sided cookie, point-up.
export class Pentagon extends Cookie
{
    static {
        Model.OverrideMetadata(Pentagon, Cookie.SidesKey, { default_value: 5 });
    }
}

// Gem — flat-top hexagonal cookie. Same sides as SixSidedCookie but
// rotated so the top edge is flat instead of pointing up.
export class Gem extends Cookie
{
    static {
        Model.OverrideMetadata(Gem, Cookie.SidesKey,    { default_value: 6 });
        Model.OverrideMetadata(Gem, Cookie.RotationKey, { default_value: 0 });
    }
}
