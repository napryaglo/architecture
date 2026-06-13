import {
    MetaData,
    Model,
    Point,
    Size,
    Visual,
    type DrawingContext,
} from '../../runtime/index.js';
import {
    Brush,
    LineSegment,
    PathFigure,
    PathGeometry,
    Pen,
} from '../../visual-engine/index.js';

// M3 RadialWave — convex N-lobed star / burst silhouette. The radius
// oscillates around the inscribing ellipse:
//
//   profile(θ)   = sign(cos(N·θ)) · |cos(N·θ)|^(1 + 5·Sharpness)
//   r(θ)         = r_outer · (1 − Amplitude/2 + Amplitude/2 · profile(θ))
//
// `Amplitude` (0…1, fraction of r_outer) sets peak-to-valley range:
// peaks reach r_outer; valleys sit at r_outer · (1 − Amplitude). Set
// Amplitude=0 for a perfect ellipse, Amplitude=1 for cusps at the centre
// (Clover territory).
//
// `Sharpness` (0…1) bends the cosine profile. 0 = pure sinusoid (smooth
// lobes); 1 = power-of-6 cosine (narrow, pointy peaks — the "burst"
// look). The blend keeps peak amplitude constant so dialing sharpness
// changes the lobe profile but not its envelope.
//
// Sampling: `Lobes × Samples` points connected with LineSegments. At
// Samples=24 the visible curvature is indistinguishable from continuous;
// dial higher for hero artwork at large sizes.
//
// Stroke insets by half-thickness.
export class RadialWave extends Visual
{
    public static readonly FillKey            = Model.RegisterProperty<Brush | undefined>(RadialWave, 'Fill',            undefined, MetaData.Render);
    public static readonly StrokeKey          = Model.RegisterProperty<Brush | undefined>(RadialWave, 'Stroke',          undefined, MetaData.Render);
    public static readonly StrokeThicknessKey = Model.RegisterProperty<number>(           RadialWave, 'StrokeThickness', 0,         MetaData.Render);
    public static readonly LobesKey           = Model.RegisterProperty<number>(           RadialWave, 'Lobes',           8,         MetaData.Render);
    public static readonly AmplitudeKey       = Model.RegisterProperty<number>(           RadialWave, 'Amplitude',       0.20,      MetaData.Render);
    public static readonly SharpnessKey       = Model.RegisterProperty<number>(           RadialWave, 'Sharpness',       0,         MetaData.Render);
    public static readonly RotationKey        = Model.RegisterProperty<number>(           RadialWave, 'Rotation',        -90,       MetaData.Render);
    public static readonly SamplesKey         = Model.RegisterProperty<number>(           RadialWave, 'Samples',         24,        MetaData.Render);

    public get Fill(): Brush | undefined { return this.get_property_value(RadialWave.FillKey); }
    public set Fill(v: Brush | undefined) { this.set_property_value(RadialWave.FillKey, v); }

    public get Stroke(): Brush | undefined { return this.get_property_value(RadialWave.StrokeKey); }
    public set Stroke(v: Brush | undefined) { this.set_property_value(RadialWave.StrokeKey, v); }

    public get StrokeThickness(): number { return this.get_property_value(RadialWave.StrokeThicknessKey); }
    public set StrokeThickness(v: number) { this.set_property_value(RadialWave.StrokeThicknessKey, v); }

    public get Lobes(): number { return this.get_property_value(RadialWave.LobesKey); }
    public set Lobes(v: number) { this.set_property_value(RadialWave.LobesKey, v); }

    public get Amplitude(): number { return this.get_property_value(RadialWave.AmplitudeKey); }
    public set Amplitude(v: number) { this.set_property_value(RadialWave.AmplitudeKey, v); }

    public get Sharpness(): number { return this.get_property_value(RadialWave.SharpnessKey); }
    public set Sharpness(v: number) { this.set_property_value(RadialWave.SharpnessKey, v); }

    public get Rotation(): number { return this.get_property_value(RadialWave.RotationKey); }
    public set Rotation(v: number) { this.set_property_value(RadialWave.RotationKey, v); }

    public get Samples(): number { return this.get_property_value(RadialWave.SamplesKey); }
    public set Samples(v: number) { this.set_property_value(RadialWave.SamplesKey, v); }

    protected override MeasureOverride(_availableSize: Size): Size { return Size.Zero; }
    protected override ArrangeOverride(finalSize: Size): Size { return finalSize; }

    protected override RenderOverride(dc: DrawingContext): void
    {
        const size = this.RenderSize;
        if (size.Width <= 0 || size.Height <= 0) return;

        const t    = this.StrokeThickness;
        const half = t / 2;
        const w    = Math.max(0, size.Width  - t);
        const h    = Math.max(0, size.Height - t);
        const rx   = w / 2;
        const ry   = h / 2;
        const cx   = half + rx;
        const cy   = half + ry;

        const N         = Math.max(1, Math.floor(this.Lobes));
        const amp       = Math.max(0, Math.min(1, this.Amplitude));
        const sharpness = Math.max(0, Math.min(1, this.Sharpness));
        const phi0      = this.Rotation * Math.PI / 180;
        const perLobe   = Math.max(4, Math.floor(this.Samples));
        const total     = N * perLobe;

        const baseScale = 1 - amp / 2;
        const ampHalf   = amp / 2;
        const exponent  = 1 + 5 * sharpness;

        const samples: Point[] = [];
        for (let i = 0; i < total; i++)
        {
            const t01 = i / total;
            const θ   = phi0 + 2 * Math.PI * t01;
            const c   = Math.cos(N * 2 * Math.PI * t01);
            // Power-with-sign so the cosine retains its alternating
            // sign through the exponent; exponent = 1 collapses to the
            // raw cosine for the smooth case.
            const profile = Math.sign(c) * Math.pow(Math.abs(c), exponent);
            const scale   = baseScale + ampHalf * profile;
            samples.push(new Point(
                cx + rx * scale * Math.cos(θ),
                cy + ry * scale * Math.sin(θ),
            ));
        }

        const segs: LineSegment[] = [];
        for (let i = 1; i < samples.length; i++) segs.push(new LineSegment(samples[i]!));
        const figure = new PathFigure(samples[0]!, segs, true);

        const pen = this.Stroke !== undefined && t > 0
            ? new Pen(this.Stroke, t)
            : undefined;

        dc.DrawGeometry(this.Fill, pen, new PathGeometry([figure]));
    }
}

// ────────────────────────────────────────────────────────────────────
// Named radial-wave variants — thin subclasses that override Lobes /
// Amplitude / Sharpness via metadata so markup can use the named shape
// directly. Sharpness mappings:
//   smooth → 0
//   sharp  → 0.6
// Amplitude mappings (fraction of r_outer):
//   low    → 0.15
//   medium → 0.20
//   high   → 0.30
// ────────────────────────────────────────────────────────────────────

// Sunny — 8 smooth lobes at low amplitude.
export class Sunny extends RadialWave
{
    static {
        Model.OverrideMetadata(Sunny, RadialWave.LobesKey,     { default_value: 8    });
        Model.OverrideMetadata(Sunny, RadialWave.AmplitudeKey, { default_value: 0.15 });
        Model.OverrideMetadata(Sunny, RadialWave.SharpnessKey, { default_value: 0    });
    }
}

// VerySunny — 8 smooth lobes at high amplitude.
export class VerySunny extends RadialWave
{
    static {
        Model.OverrideMetadata(VerySunny, RadialWave.LobesKey,     { default_value: 8    });
        Model.OverrideMetadata(VerySunny, RadialWave.AmplitudeKey, { default_value: 0.30 });
        Model.OverrideMetadata(VerySunny, RadialWave.SharpnessKey, { default_value: 0    });
    }
}

// Burst — 12 sharp lobes at medium amplitude.
export class Burst extends RadialWave
{
    static {
        Model.OverrideMetadata(Burst, RadialWave.LobesKey,     { default_value: 12   });
        Model.OverrideMetadata(Burst, RadialWave.AmplitudeKey, { default_value: 0.20 });
        Model.OverrideMetadata(Burst, RadialWave.SharpnessKey, { default_value: 0.6  });
    }
}

// SoftBurst — 12 smooth lobes at medium amplitude.
export class SoftBurst extends RadialWave
{
    static {
        Model.OverrideMetadata(SoftBurst, RadialWave.LobesKey,     { default_value: 12   });
        Model.OverrideMetadata(SoftBurst, RadialWave.AmplitudeKey, { default_value: 0.20 });
        Model.OverrideMetadata(SoftBurst, RadialWave.SharpnessKey, { default_value: 0    });
    }
}

// Boom — 14 sharp lobes at high amplitude.
export class Boom extends RadialWave
{
    static {
        Model.OverrideMetadata(Boom, RadialWave.LobesKey,     { default_value: 14   });
        Model.OverrideMetadata(Boom, RadialWave.AmplitudeKey, { default_value: 0.30 });
        Model.OverrideMetadata(Boom, RadialWave.SharpnessKey, { default_value: 0.6  });
    }
}

// SoftBoom — 14 smooth lobes at high amplitude.
export class SoftBoom extends RadialWave
{
    static {
        Model.OverrideMetadata(SoftBoom, RadialWave.LobesKey,     { default_value: 14   });
        Model.OverrideMetadata(SoftBoom, RadialWave.AmplitudeKey, { default_value: 0.30 });
        Model.OverrideMetadata(SoftBoom, RadialWave.SharpnessKey, { default_value: 0    });
    }
}

// Flower — 10 smooth lobes at medium amplitude.
export class Flower extends RadialWave
{
    static {
        Model.OverrideMetadata(Flower, RadialWave.LobesKey,     { default_value: 10   });
        Model.OverrideMetadata(Flower, RadialWave.AmplitudeKey, { default_value: 0.20 });
        Model.OverrideMetadata(Flower, RadialWave.SharpnessKey, { default_value: 0    });
    }
}
