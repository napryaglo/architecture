import { MetaData, Model } from '../runtime/index.js';
import { Color, Point } from '../runtime/index.js';
import { Transform } from './transform.js';

// A single color stop within a gradient. Plain value type — mutate by
// constructing a new array and assigning to the brush's GradientStops.
// Offset is 0..1 along the gradient axis (StartPoint→EndPoint for linear,
// inside-to-outside radius for radial).
export class GradientStop
{
    constructor(
        public readonly Color: Color,
        public readonly Offset: number,
    ) {}

    public Equals(other: GradientStop): boolean
    {
        return this.Offset === other.Offset && this.Color.Equals(other.Color);
    }
}

// How the gradient behaves outside the [StartPoint, EndPoint] range
// (linear) or beyond the outer radius (radial). String values match the
// SVG `spreadMethod` attribute so the renderer passes them through.
export enum GradientSpreadMethod
{
    Pad     = 'pad',
    Reflect = 'reflect',
    Repeat  = 'repeat',
}

// How an ImageBrush fits its source image into the target rectangle.
// Same semantics as WPF Stretch.
export enum Stretch
{
    None           = 'none',
    Fill           = 'fill',
    Uniform        = 'uniform',
    UniformToFill  = 'uniformToFill',
}

// Horizontal placement of an ImageBrush image inside its target rect
// when Stretch is None or Uniform (and so doesn't fill horizontally).
export enum AlignmentX
{
    Left   = 'left',
    Center = 'center',
    Right  = 'right',
}

// Vertical placement counterpart of AlignmentX.
export enum AlignmentY
{
    Top    = 'top',
    Center = 'center',
    Bottom = 'bottom',
}

// Placeholder image-source wrapper. Holds whatever the renderer needs to
// resolve the actual pixels — currently just a URL string; future
// renderers will accept HTMLImageElement / ImageBitmap / a fetch
// callback. Kept as its own type so ImageBrush.ImageSource has a stable
// declared type even as the underlying payload grows.
export class ImageSource
{
    constructor(public readonly Source: string) {}
}

// Paint source for fill operations on a DrawingContext. Abstract — concrete
// subclasses are SolidColorBrush, LinearGradientBrush, RadialGradientBrush,
// ImageBrush. Renderers dispatch on the concrete type (no virtual
// "RenderInto" method on Brush itself — keeps Brush renderer-agnostic and
// matches how WPF's Direct2D backend pattern-matches on brush type).
//
// Opacity multiplies whatever opacity is already in the paint (e.g.,
// SolidColorBrush.Color.A or per-stop alpha in gradients). Transform is
// applied to the brush's coordinate space — typical use is to rotate or
// skew a gradient without changing the brush's logical stops.
export abstract class Brush extends Model
{
    static {
        Model.RegisterProperty(Brush, 'Opacity',   1,                  MetaData.Render);
        Model.RegisterProperty(Brush, 'Transform', Transform.Identity, MetaData.Render);
    }

    public get Opacity(): number { return this.get_property_value('Opacity'); }
    public set Opacity(value: number) { this.set_property_value('Opacity', value); }

    public get Transform(): Transform { return this.get_property_value('Transform'); }
    public set Transform(value: Transform) { this.set_property_value('Transform', value); }
}

// Single-color fill. The workhorse brush. Default Color is Transparent
// (parameterless `new SolidColorBrush()` produces an invisible brush —
// matches WPF, where the explicit constructor with a Color is the
// normal usage).
export class SolidColorBrush extends Brush
{
    static {
        Model.RegisterProperty(SolidColorBrush, 'Color', Color.Transparent, MetaData.Render);
    }

    constructor(color?: Color)
    {
        super();
        if (color !== undefined) this.Color = color;
    }

    public get Color(): Color { return this.get_property_value('Color'); }
    public set Color(value: Color) { this.set_property_value('Color', value); }
}

// Smooth color interpolation along a straight axis. StartPoint and
// EndPoint are in the [0,1] × [0,1] bounding-box of whatever's being
// painted — (0,0) is top-left of the fill region, (1,1) is bottom-right.
// (Absolute / MappingMode='Absolute' is not yet supported.)
export class LinearGradientBrush extends Brush
{
    static {
        Model.RegisterProperty(LinearGradientBrush, 'GradientStops', [] as readonly GradientStop[],     MetaData.Render);
        Model.RegisterProperty(LinearGradientBrush, 'StartPoint',    new Point(0, 0),                   MetaData.Render);
        Model.RegisterProperty(LinearGradientBrush, 'EndPoint',      new Point(1, 1),                   MetaData.Render);
        Model.RegisterProperty(LinearGradientBrush, 'SpreadMethod',  GradientSpreadMethod.Pad,          MetaData.Render);
    }

    constructor(stops?: readonly GradientStop[])
    {
        super();
        if (stops !== undefined) this.GradientStops = stops;
    }

    public get GradientStops(): readonly GradientStop[] { return this.get_property_value('GradientStops'); }
    public set GradientStops(value: readonly GradientStop[]) { this.set_property_value('GradientStops', value); }

    public get StartPoint(): Point { return this.get_property_value('StartPoint'); }
    public set StartPoint(value: Point) { this.set_property_value('StartPoint', value); }

    public get EndPoint(): Point { return this.get_property_value('EndPoint'); }
    public set EndPoint(value: Point) { this.set_property_value('EndPoint', value); }

    public get SpreadMethod(): GradientSpreadMethod { return this.get_property_value('SpreadMethod'); }
    public set SpreadMethod(value: GradientSpreadMethod) { this.set_property_value('SpreadMethod', value); }
}

// Smooth color interpolation outward from Center to the RadiusX/RadiusY
// ellipse. Center and radii are in [0,1] bounding-box coordinates.
// GradientOrigin (off-center light source) is not yet supported —
// renderers can default it to Center.
export class RadialGradientBrush extends Brush
{
    static {
        Model.RegisterProperty(RadialGradientBrush, 'GradientStops', [] as readonly GradientStop[],     MetaData.Render);
        Model.RegisterProperty(RadialGradientBrush, 'Center',        new Point(0.5, 0.5),               MetaData.Render);
        Model.RegisterProperty(RadialGradientBrush, 'RadiusX',       0.5,                               MetaData.Render);
        Model.RegisterProperty(RadialGradientBrush, 'RadiusY',       0.5,                               MetaData.Render);
        Model.RegisterProperty(RadialGradientBrush, 'SpreadMethod',  GradientSpreadMethod.Pad,          MetaData.Render);
    }

    constructor(stops?: readonly GradientStop[])
    {
        super();
        if (stops !== undefined) this.GradientStops = stops;
    }

    public get GradientStops(): readonly GradientStop[] { return this.get_property_value('GradientStops'); }
    public set GradientStops(value: readonly GradientStop[]) { this.set_property_value('GradientStops', value); }

    public get Center(): Point { return this.get_property_value('Center'); }
    public set Center(value: Point) { this.set_property_value('Center', value); }

    public get RadiusX(): number { return this.get_property_value('RadiusX'); }
    public set RadiusX(value: number) { this.set_property_value('RadiusX', value); }

    public get RadiusY(): number { return this.get_property_value('RadiusY'); }
    public set RadiusY(value: number) { this.set_property_value('RadiusY', value); }

    public get SpreadMethod(): GradientSpreadMethod { return this.get_property_value('SpreadMethod'); }
    public set SpreadMethod(value: GradientSpreadMethod) { this.set_property_value('SpreadMethod', value); }
}

// Fills with a rastered image. ImageSource is the pixels (currently a
// URL string; will grow to accept HTMLImageElement / ImageBitmap). Stretch
// + AlignmentX + AlignmentY together determine how the source maps into
// the target rectangle — see WPF Stretch / AlignmentX docs, same semantics.
export class ImageBrush extends Brush
{
    static {
        Model.RegisterProperty(ImageBrush, 'ImageSource', undefined,         MetaData.Render);
        Model.RegisterProperty(ImageBrush, 'Stretch',     Stretch.Uniform,   MetaData.Render);
        Model.RegisterProperty(ImageBrush, 'AlignmentX',  AlignmentX.Center, MetaData.Render);
        Model.RegisterProperty(ImageBrush, 'AlignmentY',  AlignmentY.Center, MetaData.Render);
    }

    constructor(source?: ImageSource)
    {
        super();
        if (source !== undefined) this.ImageSource = source;
    }

    public get ImageSource(): ImageSource | undefined { return this.get_property_value('ImageSource'); }
    public set ImageSource(value: ImageSource | undefined) { this.set_property_value('ImageSource', value); }

    public get Stretch(): Stretch { return this.get_property_value('Stretch'); }
    public set Stretch(value: Stretch) { this.set_property_value('Stretch', value); }

    public get AlignmentX(): AlignmentX { return this.get_property_value('AlignmentX'); }
    public set AlignmentX(value: AlignmentX) { this.set_property_value('AlignmentX', value); }

    public get AlignmentY(): AlignmentY { return this.get_property_value('AlignmentY'); }
    public set AlignmentY(value: AlignmentY) { this.set_property_value('AlignmentY', value); }
}
