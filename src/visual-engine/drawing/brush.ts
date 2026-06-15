import { MetaData, Model } from '../../runtime/index.js';
import { Color, Point } from '../primitives.js';
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

// Stretch enum lives in image-source.ts so the Image control and
// ImageBrush share the same values. Re-exported here for the historical
// import path.
export { Stretch } from './image-source.js';
import { Stretch } from './image-source.js';

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

// ImageSource (with its BitmapImage concrete subclass) lives in
// image-source.ts so both ImageBrush (paint source) and the Image
// control (Visual) can share the same type. Re-exported here for the
// historical import path.
export { BitmapImage, ImageSource } from './image-source.js';
import { ImageSource } from './image-source.js';

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
    public static readonly OpacityKey   = Model.RegisterProperty<number>(   Brush, 'Opacity',   1,                  MetaData.Render);
    public static readonly TransformKey = Model.RegisterProperty<Transform>(Brush, 'Transform', Transform.Identity, MetaData.Render);

    public get Opacity(): number { return this.get_property_value(Brush.OpacityKey); }
    public set Opacity(value: number) { this.set_property_value(Brush.OpacityKey, value); }

    public get Transform(): Transform { return this.get_property_value(Brush.TransformKey); }
    public set Transform(value: Transform) { this.set_property_value(Brush.TransformKey, value); }
}

// Single-color fill. The workhorse brush. Default Color is Transparent
// (parameterless `new SolidColorBrush()` produces an invisible brush —
// matches WPF, where the explicit constructor with a Color is the
// normal usage).
export class SolidColorBrush extends Brush
{
    public static readonly ColorKey = Model.RegisterProperty<Color>(
        SolidColorBrush, 'Color', Color.Transparent, MetaData.Render);

    constructor(color?: Color)
    {
        super();
        if (color !== undefined) this.Color = color;
    }

    public get Color(): Color { return this.get_property_value(SolidColorBrush.ColorKey); }
    public set Color(value: Color) { this.set_property_value(SolidColorBrush.ColorKey, value); }
}

// Smooth color interpolation along a straight axis. StartPoint and
// EndPoint are in the [0,1] × [0,1] bounding-box of whatever's being
// painted — (0,0) is top-left of the fill region, (1,1) is bottom-right.
// (Absolute / MappingMode='Absolute' is not yet supported.)
export class LinearGradientBrush extends Brush
{
    public static readonly GradientStopsKey = Model.RegisterProperty<readonly GradientStop[]>(
        LinearGradientBrush, 'GradientStops', [], MetaData.Render);
    public static readonly StartPointKey = Model.RegisterProperty<Point>(
        LinearGradientBrush, 'StartPoint', new Point(0, 0), MetaData.Render);
    public static readonly EndPointKey = Model.RegisterProperty<Point>(
        LinearGradientBrush, 'EndPoint', new Point(1, 1), MetaData.Render);
    public static readonly SpreadMethodKey = Model.RegisterProperty<GradientSpreadMethod>(
        LinearGradientBrush, 'SpreadMethod', GradientSpreadMethod.Pad, MetaData.Render);

    constructor(stops?: readonly GradientStop[])
    {
        super();
        if (stops !== undefined) this.GradientStops = stops;
    }

    public get GradientStops(): readonly GradientStop[] { return this.get_property_value(LinearGradientBrush.GradientStopsKey); }
    public set GradientStops(value: readonly GradientStop[]) { this.set_property_value(LinearGradientBrush.GradientStopsKey, value); }

    public get StartPoint(): Point { return this.get_property_value(LinearGradientBrush.StartPointKey); }
    public set StartPoint(value: Point) { this.set_property_value(LinearGradientBrush.StartPointKey, value); }

    public get EndPoint(): Point { return this.get_property_value(LinearGradientBrush.EndPointKey); }
    public set EndPoint(value: Point) { this.set_property_value(LinearGradientBrush.EndPointKey, value); }

    public get SpreadMethod(): GradientSpreadMethod { return this.get_property_value(LinearGradientBrush.SpreadMethodKey); }
    public set SpreadMethod(value: GradientSpreadMethod) { this.set_property_value(LinearGradientBrush.SpreadMethodKey, value); }
}

// Smooth color interpolation outward from Center to the RadiusX/RadiusY
// ellipse. Center and radii are in [0,1] bounding-box coordinates.
// GradientOrigin (off-center light source) is not yet supported —
// renderers can default it to Center.
export class RadialGradientBrush extends Brush
{
    public static readonly GradientStopsKey = Model.RegisterProperty<readonly GradientStop[]>(
        RadialGradientBrush, 'GradientStops', [], MetaData.Render);
    public static readonly CenterKey = Model.RegisterProperty<Point>(
        RadialGradientBrush, 'Center', new Point(0.5, 0.5), MetaData.Render);
    public static readonly RadiusXKey = Model.RegisterProperty<number>(
        RadialGradientBrush, 'RadiusX', 0.5, MetaData.Render);
    public static readonly RadiusYKey = Model.RegisterProperty<number>(
        RadialGradientBrush, 'RadiusY', 0.5, MetaData.Render);
    public static readonly SpreadMethodKey = Model.RegisterProperty<GradientSpreadMethod>(
        RadialGradientBrush, 'SpreadMethod', GradientSpreadMethod.Pad, MetaData.Render);

    constructor(stops?: readonly GradientStop[])
    {
        super();
        if (stops !== undefined) this.GradientStops = stops;
    }

    public get GradientStops(): readonly GradientStop[] { return this.get_property_value(RadialGradientBrush.GradientStopsKey); }
    public set GradientStops(value: readonly GradientStop[]) { this.set_property_value(RadialGradientBrush.GradientStopsKey, value); }

    public get Center(): Point { return this.get_property_value(RadialGradientBrush.CenterKey); }
    public set Center(value: Point) { this.set_property_value(RadialGradientBrush.CenterKey, value); }

    public get RadiusX(): number { return this.get_property_value(RadialGradientBrush.RadiusXKey); }
    public set RadiusX(value: number) { this.set_property_value(RadialGradientBrush.RadiusXKey, value); }

    public get RadiusY(): number { return this.get_property_value(RadialGradientBrush.RadiusYKey); }
    public set RadiusY(value: number) { this.set_property_value(RadialGradientBrush.RadiusYKey, value); }

    public get SpreadMethod(): GradientSpreadMethod { return this.get_property_value(RadialGradientBrush.SpreadMethodKey); }
    public set SpreadMethod(value: GradientSpreadMethod) { this.set_property_value(RadialGradientBrush.SpreadMethodKey, value); }
}

// Fills with a rastered image. ImageSource is the pixels (currently a
// URL string; will grow to accept HTMLImageElement / ImageBitmap). Stretch
// + AlignmentX + AlignmentY together determine how the source maps into
// the target rectangle — see WPF Stretch / AlignmentX docs, same semantics.
export class ImageBrush extends Brush
{
    public static readonly ImageSourceKey = Model.RegisterProperty<ImageSource | undefined>(
        ImageBrush, 'ImageSource', undefined, MetaData.Render);
    public static readonly StretchKey = Model.RegisterProperty<Stretch>(
        ImageBrush, 'Stretch', Stretch.Uniform, MetaData.Render);
    public static readonly AlignmentXKey = Model.RegisterProperty<AlignmentX>(
        ImageBrush, 'AlignmentX', AlignmentX.Center, MetaData.Render);
    public static readonly AlignmentYKey = Model.RegisterProperty<AlignmentY>(
        ImageBrush, 'AlignmentY', AlignmentY.Center, MetaData.Render);

    constructor(source?: ImageSource)
    {
        super();
        if (source !== undefined) this.ImageSource = source;
    }

    public get ImageSource(): ImageSource | undefined { return this.get_property_value(ImageBrush.ImageSourceKey); }
    public set ImageSource(value: ImageSource | undefined) { this.set_property_value(ImageBrush.ImageSourceKey, value); }

    public get Stretch(): Stretch { return this.get_property_value(ImageBrush.StretchKey); }
    public set Stretch(value: Stretch) { this.set_property_value(ImageBrush.StretchKey, value); }

    public get AlignmentX(): AlignmentX { return this.get_property_value(ImageBrush.AlignmentXKey); }
    public set AlignmentX(value: AlignmentX) { this.set_property_value(ImageBrush.AlignmentXKey, value); }

    public get AlignmentY(): AlignmentY { return this.get_property_value(ImageBrush.AlignmentYKey); }
    public set AlignmentY(value: AlignmentY) { this.set_property_value(ImageBrush.AlignmentYKey, value); }
}
