import {
    MetaData,
    Model,
    Point,
    Size,
    Visual,
    type DrawingContext,
} from '../../runtime/index.js';
import {
    LineSegment,
    PathFigure,
    PathGeometry,
    Pen,
} from '../../visual-engine/index.js';

// M3 PixelArt — rasterizes one of the named base silhouettes (currently
// Circle or Triangle) onto a `GridSize × GridSize` cell grid. Each
// filled cell becomes one rectangular PathFigure in the emitted
// PathGeometry; renderers walk the figures and treat them as a single
// multi-subpath drawing.
//
// `GridSize` controls the rasterisation resolution. Default 8 yields the
// classic 8-bit-sprite look. Higher values smooth out the silhouette,
// lower values exaggerate the pixelation. There's no anti-aliasing
// step — the criterion is "cell centre inside the source shape", same
// midpoint logic used by Bresenham / DDA.
//
// Source selects which base silhouette to rasterise. Add a new variant
// here when you want a new pixel-art base (Square, Heart, …) — each new
// case just provides the "is this (u, v) inside?" predicate.
export enum PixelSource
{
    Circle   = 'Circle',
    Triangle = 'Triangle',
}

export class PixelArt extends Visual
{
    public static readonly GridSizeKey        = Model.RegisterProperty<number>(           PixelArt, 'GridSize',        8,         MetaData.Render);
    public static readonly SourceKey          = Model.RegisterProperty<PixelSource>(      PixelArt, 'Source',          PixelSource.Circle, MetaData.Render);

    public get GridSize(): number { return this.get_property_value(PixelArt.GridSizeKey); }
    public set GridSize(v: number) { this.set_property_value(PixelArt.GridSizeKey, v); }

    public get Source(): PixelSource { return this.get_property_value(PixelArt.SourceKey); }
    public set Source(v: PixelSource) { this.set_property_value(PixelArt.SourceKey, v); }

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

        const N = Math.max(2, Math.floor(this.GridSize));
        const cellW = w / N;
        const cellH = h / N;

        const inside = pickInsidePredicate(this.Source);
        const figures: PathFigure[] = [];

        // (i, j) walks columns (0…N-1) × rows (0…N-1). Cell centre in
        // unit square coords is ((i + 0.5)/N, (j + 0.5)/N), translated
        // and scaled into the source-shape's domain by the predicate.
        for (let j = 0; j < N; j++)
        {
            for (let i = 0; i < N; i++)
            {
                const u = (i + 0.5) / N;
                const v = (j + 0.5) / N;
                if (!inside(u, v)) continue;

                const x0 = half + i * cellW;
                const y0 = half + j * cellH;
                const x1 = x0 + cellW;
                const y1 = y0 + cellH;
                figures.push(new PathFigure(new Point(x0, y0), [
                    new LineSegment(new Point(x1, y0)),
                    new LineSegment(new Point(x1, y1)),
                    new LineSegment(new Point(x0, y1)),
                ], true));
            }
        }

        const pen = this.Stroke !== undefined && t > 0
            ? new Pen(this.Stroke, t)
            : undefined;

        dc.DrawGeometry(this.Background, pen, new PathGeometry(figures));
    }
}

// PixelCircle — PixelArt with `Source = Circle` baked in.
export class PixelCircle extends PixelArt
{
    static {
        Model.OverrideMetadata(PixelCircle, PixelArt.SourceKey, { default_value: PixelSource.Circle });
    }
}

// PixelTriangle — PixelArt with `Source = Triangle` baked in.
export class PixelTriangle extends PixelArt
{
    static {
        Model.OverrideMetadata(PixelTriangle, PixelArt.SourceKey, { default_value: PixelSource.Triangle });
    }
}

function pickInsidePredicate(source: PixelSource): (u: number, v: number) => boolean
{
    switch (source)
    {
        case PixelSource.Circle:
            // Unit circle centred at (0.5, 0.5) with radius 0.5.
            return (u, v) => {
                const dx = u - 0.5;
                const dy = v - 0.5;
                return dx * dx + dy * dy <= 0.25;
            };
        case PixelSource.Triangle:
            // Point-up isoceles triangle: vertex top-centre (0.5, 0),
            // base corners (0, 1) and (1, 1). Inside the triangle iff
            // |u - 0.5| ≤ v / 2 (the slanted sides bound x at each y).
            return (u, v) => Math.abs(u - 0.5) <= v / 2;
    }
}
