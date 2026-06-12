import { MetaData, Model } from '../../runtime/index.js';
import { Point, Rect, Size } from '../../runtime/index.js';
import { Transform } from '../drawing/transform.js';

// SVG / Canvas fill-rule for shapes with self-intersecting or overlapping
// subpaths. String values match the SVG `fill-rule` attribute so the
// renderer passes them through unmodified. Note: WPF default is EvenOdd
// (which surprises people coming from SVG, where the default is Nonzero) —
// we match WPF.
export enum FillRule
{
    EvenOdd = 'evenodd',
    Nonzero = 'nonzero',
}

// Arc sweep direction — counterclockwise or clockwise. Maps to SVG arc's
// sweep-flag (0 / 1) at emit time.
export enum SweepDirection
{
    Counterclockwise = 'counterclockwise',
    Clockwise        = 'clockwise',
}

// One drawing instruction within a PathFigure. Plain value-type hierarchy
// (not Models) — mutate a path by constructing a fresh segment array and
// replacing PathGeometry.Figures. Class-based discrimination so the
// renderer can dispatch via `instanceof` cleanly.
export abstract class PathSegment { }

// Straight line from the current point to the given endpoint.
export class LineSegment extends PathSegment
{
    constructor(public readonly Point: Point) { super(); }
}

// Cubic Bézier: two control points and an endpoint.
export class CubicBezierSegment extends PathSegment
{
    constructor(
        public readonly Point1: Point,
        public readonly Point2: Point,
        public readonly Point3: Point,
    ) { super(); }
}

// Quadratic Bézier: one control point and an endpoint.
export class QuadraticBezierSegment extends PathSegment
{
    constructor(
        public readonly Point1: Point,
        public readonly Point2: Point,
    ) { super(); }
}

// Elliptical arc — fields match SVG's `A rx ry x-axis-rotation
// large-arc-flag sweep-flag x y` so renderer emit is a direct mapping.
// Size carries the X/Y radii (Width/Height). RotationAngle is in degrees.
export class ArcSegment extends PathSegment
{
    constructor(
        public readonly Point: Point,
        public readonly Size: Size,
        public readonly RotationAngle: number,
        public readonly IsLargeArc: boolean,
        public readonly SweepDirection: SweepDirection,
    ) { super(); }
}

// One continuous run of segments. StartPoint anchors the pen; Segments
// extend from there in order. IsClosed adds an implicit line back to
// StartPoint at the end (SVG `Z` command).
export class PathFigure
{
    constructor(
        public readonly StartPoint: Point,
        public readonly Segments: readonly PathSegment[],
        public readonly IsClosed: boolean = false,
    ) {}
}

// Renderer-agnostic shape description. Concrete subclasses lower to
// either a named SVG element (RectangleGeometry → <rect>, EllipseGeometry
// → <ellipse>, LineGeometry → <line>) or to a `<path d="…">` for
// PathGeometry / GeometryGroup. The escape hatch for DrawingContext —
// anything not expressible as a named draw primitive lowers to a
// Geometry.
//
// Transform applies to the geometry's local coordinate space; the
// renderer composes it with any DC.PushTransform frames above it.
export abstract class Geometry extends Model
{
    public static readonly TransformKey = Model.RegisterProperty<Transform>(
        Geometry, 'Transform', Transform.Identity, MetaData.Render);

    public get Transform(): Transform { return this.get_property_value(Geometry.TransformKey); }
    public set Transform(value: Transform) { this.set_property_value(Geometry.TransformKey, value); }
}

// Axis-aligned rectangle, optionally with rounded corners. When RadiusX
// or RadiusY is 0 the renderer should emit a plain <rect>; otherwise
// rounded corners are drawn (SVG rx/ry attributes, Canvas roundRect).
export class RectangleGeometry extends Geometry
{
    public static readonly RectKey    = Model.RegisterProperty<Rect>(  RectangleGeometry, 'Rect',    Rect.Zero, MetaData.Render);
    public static readonly RadiusXKey = Model.RegisterProperty<number>(RectangleGeometry, 'RadiusX', 0,         MetaData.Render);
    public static readonly RadiusYKey = Model.RegisterProperty<number>(RectangleGeometry, 'RadiusY', 0,         MetaData.Render);

    constructor(rect?: Rect, radiusX?: number, radiusY?: number)
    {
        super();
        if (rect !== undefined)    this.Rect = rect;
        if (radiusX !== undefined) this.RadiusX = radiusX;
        if (radiusY !== undefined) this.RadiusY = radiusY;
    }

    public get Rect(): Rect { return this.get_property_value(RectangleGeometry.RectKey); }
    public set Rect(value: Rect) { this.set_property_value(RectangleGeometry.RectKey, value); }

    public get RadiusX(): number { return this.get_property_value(RectangleGeometry.RadiusXKey); }
    public set RadiusX(value: number) { this.set_property_value(RectangleGeometry.RadiusXKey, value); }

    public get RadiusY(): number { return this.get_property_value(RectangleGeometry.RadiusYKey); }
    public set RadiusY(value: number) { this.set_property_value(RectangleGeometry.RadiusYKey, value); }
}

// Ellipse centered at Center with the given X/Y radii. Renderer emits
// <ellipse> for SVG, ctx.ellipse for Canvas. Use equal radii for a circle.
export class EllipseGeometry extends Geometry
{
    public static readonly CenterKey  = Model.RegisterProperty<Point>( EllipseGeometry, 'Center',  Point.Zero, MetaData.Render);
    public static readonly RadiusXKey = Model.RegisterProperty<number>(EllipseGeometry, 'RadiusX', 0,          MetaData.Render);
    public static readonly RadiusYKey = Model.RegisterProperty<number>(EllipseGeometry, 'RadiusY', 0,          MetaData.Render);

    constructor(center?: Point, radiusX?: number, radiusY?: number)
    {
        super();
        if (center !== undefined)  this.Center = center;
        if (radiusX !== undefined) this.RadiusX = radiusX;
        if (radiusY !== undefined) this.RadiusY = radiusY;
    }

    public get Center(): Point { return this.get_property_value(EllipseGeometry.CenterKey); }
    public set Center(value: Point) { this.set_property_value(EllipseGeometry.CenterKey, value); }

    public get RadiusX(): number { return this.get_property_value(EllipseGeometry.RadiusXKey); }
    public set RadiusX(value: number) { this.set_property_value(EllipseGeometry.RadiusXKey, value); }

    public get RadiusY(): number { return this.get_property_value(EllipseGeometry.RadiusYKey); }
    public set RadiusY(value: number) { this.set_property_value(EllipseGeometry.RadiusYKey, value); }
}

// Straight line segment from StartPoint to EndPoint. No fill — only the
// pen contributes. Renderer emits <line>.
export class LineGeometry extends Geometry
{
    public static readonly StartPointKey = Model.RegisterProperty<Point>(LineGeometry, 'StartPoint', Point.Zero, MetaData.Render);
    public static readonly EndPointKey   = Model.RegisterProperty<Point>(LineGeometry, 'EndPoint',   Point.Zero, MetaData.Render);

    constructor(startPoint?: Point, endPoint?: Point)
    {
        super();
        if (startPoint !== undefined) this.StartPoint = startPoint;
        if (endPoint !== undefined)   this.EndPoint = endPoint;
    }

    public get StartPoint(): Point { return this.get_property_value(LineGeometry.StartPointKey); }
    public set StartPoint(value: Point) { this.set_property_value(LineGeometry.StartPointKey, value); }

    public get EndPoint(): Point { return this.get_property_value(LineGeometry.EndPointKey); }
    public set EndPoint(value: Point) { this.set_property_value(LineGeometry.EndPointKey, value); }
}

// Arbitrary geometry built from one or more PathFigures. Each figure is
// an independent run of segments — multi-figure paths are how you draw
// shapes with holes (an outer figure plus inner figures with opposite
// winding under FillRule.Nonzero, or any combination under EvenOdd).
//
// Renderer emits <path d="…"> by walking figures → segments and
// concatenating SVG path commands.
export class PathGeometry extends Geometry
{
    public static readonly FiguresKey  = Model.RegisterProperty<readonly PathFigure[]>(PathGeometry, 'Figures',  [], MetaData.Render);
    public static readonly FillRuleKey = Model.RegisterProperty<FillRule>(             PathGeometry, 'FillRule', FillRule.EvenOdd, MetaData.Render);

    constructor(figures?: readonly PathFigure[])
    {
        super();
        if (figures !== undefined) this.Figures = figures;
    }

    public get Figures(): readonly PathFigure[] { return this.get_property_value(PathGeometry.FiguresKey); }
    public set Figures(value: readonly PathFigure[]) { this.set_property_value(PathGeometry.FiguresKey, value); }

    public get FillRule(): FillRule { return this.get_property_value(PathGeometry.FillRuleKey); }
    public set FillRule(value: FillRule) { this.set_property_value(PathGeometry.FillRuleKey, value); }
}

// Composite geometry — multiple child geometries combined under a
// single FillRule. Renderer typically lowers to a single <path> by
// concatenating each child's path data (geometries with their own
// Transform are pre-applied during the lowering walk).
//
// Boolean operations between geometries (Union / Intersect / Xor /
// Exclude — WPF's CombinedGeometry) are not yet supported. SVG has no
// direct equivalent; they'd need to be CSG'd into a single path at the
// model layer.
export class GeometryGroup extends Geometry
{
    public static readonly ChildrenKey = Model.RegisterProperty<readonly Geometry[]>(GeometryGroup, 'Children', [], MetaData.Render);
    public static readonly FillRuleKey = Model.RegisterProperty<FillRule>(           GeometryGroup, 'FillRule', FillRule.EvenOdd, MetaData.Render);

    constructor(children?: readonly Geometry[])
    {
        super();
        if (children !== undefined) this.Children = children;
    }

    public get Children(): readonly Geometry[] { return this.get_property_value(GeometryGroup.ChildrenKey); }
    public set Children(value: readonly Geometry[]) { this.set_property_value(GeometryGroup.ChildrenKey, value); }

    public get FillRule(): FillRule { return this.get_property_value(GeometryGroup.FillRuleKey); }
    public set FillRule(value: FillRule) { this.set_property_value(GeometryGroup.FillRuleKey, value); }
}
