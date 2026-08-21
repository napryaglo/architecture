import { MetaData } from '../../runtime/metadata.js';
import { MuralBase } from '../../runtime/model.js';
import { Freezable } from '../../runtime/freezable.js';
import { Point, Rect, Size } from '../primitives.js';
import { Transform } from '../drawing/transform.js';
import { Cubic } from './pathops/cubic.js';
import { Quad } from './pathops/quad.js';
import { Point as DPoint } from './pathops/point.js';
import { arcToCubics } from './pathops/arc-to-cubic.js';

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
//
// Phase 2 (§19.2) virtual surface — shape queries:
//
//   * GetBounds()      — tight AABB enclosing the painted shape after
//                        Transform. Subclasses override `getLocalBounds`;
//                        the base method transforms the 4 corners.
//   * Contains(point)  — point-in-shape under the geometry's fill rule.
//                        Subclasses override `localContains`; the base
//                        method inverse-transforms `point` first.
//   * Intersects(g)    — bbox-only in v1. Phase 7 (§19.7) upgrades this
//                        to call `combine(this, g, Intersect)` and check
//                        the result for non-emptiness.
export abstract class Geometry extends Freezable
{
    public static readonly TransformKey = MuralBase.RegisterProperty<Transform>(
        Geometry, 'Transform', Transform.Identity, MetaData.Render);

    public get Transform(): Transform { return this.get_property_value(Geometry.TransformKey); }
    public set Transform(value: Transform) { this.set_property_value(Geometry.TransformKey, value); }

    public GetBounds(): Rect
    {
        const local = this.getLocalBounds();
        const m = this.Transform.Matrix;
        if (m.IsIdentity) return local;
        // AABB of the transformed 4-corner box.
        const corners = [
            m.Transform(new Point(local.Left,  local.Top)),
            m.Transform(new Point(local.Right, local.Top)),
            m.Transform(new Point(local.Right, local.Bottom)),
            m.Transform(new Point(local.Left,  local.Bottom)),
        ];
        let minX = corners[0]!.X, maxX = corners[0]!.X;
        let minY = corners[0]!.Y, maxY = corners[0]!.Y;
        for (let i = 1; i < 4; ++i)
        {
            const c = corners[i]!;
            if (c.X < minX) minX = c.X; else if (c.X > maxX) maxX = c.X;
            if (c.Y < minY) minY = c.Y; else if (c.Y > maxY) maxY = c.Y;
        }
        return new Rect(minX, minY, maxX - minX, maxY - minY);
    }

    public Contains(point: Point): boolean
    {
        const m = this.Transform.Matrix;
        if (m.IsIdentity) return this.localContains(point);
        const inv = m.Invert();
        // Singular transform (zero-scale collapse) — nothing inside.
        if (inv === undefined) return false;
        return this.localContains(inv.Transform(point));
    }

    // 19.7 makes this exact via combine(this, other, Intersect).
    public Intersects(other: Geometry): boolean
    {
        const a = this.GetBounds();
        const b = other.GetBounds();
        return a.Intersect(b) !== undefined;
    }

    protected abstract getLocalBounds(): Rect;
    protected abstract localContains(point: Point): boolean;
}

// Axis-aligned rectangle, optionally with rounded corners. When RadiusX
// or RadiusY is 0 the renderer should emit a plain <rect>; otherwise
// rounded corners are drawn (SVG rx/ry attributes, Canvas roundRect).
export class RectangleGeometry extends Geometry
{
    public static readonly RectKey    = MuralBase.RegisterProperty<Rect>(  RectangleGeometry, 'Rect',    Rect.Zero, MetaData.Render);
    public static readonly RadiusXKey = MuralBase.RegisterProperty<number>(RectangleGeometry, 'RadiusX', 0,         MetaData.Render);
    public static readonly RadiusYKey = MuralBase.RegisterProperty<number>(RectangleGeometry, 'RadiusY', 0,         MetaData.Render);

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

    protected override getLocalBounds(): Rect { return this.Rect; }

    // Rounded-corner test: outside the AABB → false. Inside the
    // un-cornered interior (Rect deflated by RadiusX/Y) → true. Otherwise
    // the point lies in one of the four corner quadrants — compare against
    // that quadrant's ellipse.
    protected override localContains(point: Point): boolean
    {
        const r = this.Rect;
        if (!r.Contains(point)) return false;
        const rx = this.RadiusX;
        const ry = this.RadiusY;
        if (rx <= 0 || ry <= 0) return true;
        // Inner rect (no corner clipping zone) — quick accept.
        const ix1 = r.Left   + rx;
        const ix2 = r.Right  - rx;
        const iy1 = r.Top    + ry;
        const iy2 = r.Bottom - ry;
        if (point.X >= ix1 && point.X <= ix2) return true;
        if (point.Y >= iy1 && point.Y <= iy2) return true;
        // Map to the nearest corner-ellipse center.
        const cx = point.X < ix1 ? ix1 : ix2;
        const cy = point.Y < iy1 ? iy1 : iy2;
        const dx = (point.X - cx) / rx;
        const dy = (point.Y - cy) / ry;
        return dx * dx + dy * dy <= 1;
    }
}

// Ellipse centered at Center with the given X/Y radii. Renderer emits
// <ellipse> for SVG, ctx.ellipse for Canvas. Use equal radii for a circle.
export class EllipseGeometry extends Geometry
{
    public static readonly CenterKey  = MuralBase.RegisterProperty<Point>( EllipseGeometry, 'Center',  Point.Zero, MetaData.Render);
    public static readonly RadiusXKey = MuralBase.RegisterProperty<number>(EllipseGeometry, 'RadiusX', 0,          MetaData.Render);
    public static readonly RadiusYKey = MuralBase.RegisterProperty<number>(EllipseGeometry, 'RadiusY', 0,          MetaData.Render);

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

    protected override getLocalBounds(): Rect
    {
        const c  = this.Center;
        const rx = this.RadiusX;
        const ry = this.RadiusY;
        return new Rect(c.X - rx, c.Y - ry, rx * 2, ry * 2);
    }

    // Standard ellipse equation. Degenerate radii (≤ 0) never contain.
    protected override localContains(point: Point): boolean
    {
        const rx = this.RadiusX;
        const ry = this.RadiusY;
        if (rx <= 0 || ry <= 0) return false;
        const dx = (point.X - this.Center.X) / rx;
        const dy = (point.Y - this.Center.Y) / ry;
        return dx * dx + dy * dy <= 1;
    }
}

// Straight line segment from StartPoint to EndPoint. No fill — only the
// pen contributes. Renderer emits <line>.
export class LineGeometry extends Geometry
{
    public static readonly StartPointKey = MuralBase.RegisterProperty<Point>(LineGeometry, 'StartPoint', Point.Zero, MetaData.Render);
    public static readonly EndPointKey   = MuralBase.RegisterProperty<Point>(LineGeometry, 'EndPoint',   Point.Zero, MetaData.Render);

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

    protected override getLocalBounds(): Rect
    {
        return Rect.FromCorners(this.StartPoint, this.EndPoint);
    }

    // No fill — a line has zero area.
    protected override localContains(_point: Point): boolean { return false; }
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
    public static readonly FiguresKey  = MuralBase.RegisterProperty<readonly PathFigure[]>(PathGeometry, 'Figures',  [], MetaData.Render);
    public static readonly FillRuleKey = MuralBase.RegisterProperty<FillRule>(             PathGeometry, 'FillRule', FillRule.EvenOdd, MetaData.Render);

    constructor(figures?: readonly PathFigure[])
    {
        super();
        if (figures !== undefined) this.Figures = figures;
    }

    public get Figures(): readonly PathFigure[] { return this.get_property_value(PathGeometry.FiguresKey); }
    public set Figures(value: readonly PathFigure[]) { this.set_property_value(PathGeometry.FiguresKey, value); }

    public get FillRule(): FillRule { return this.get_property_value(PathGeometry.FillRuleKey); }
    public set FillRule(value: FillRule) { this.set_property_value(PathGeometry.FillRuleKey, value); }

    protected override getLocalBounds(): Rect
    {
        let bounds: Rect | undefined = undefined;
        const union = (r: Rect): void => {
            bounds = bounds === undefined ? r : bounds.Union(r);
        };
        for (const figure of this.Figures)
        {
            let pen = figure.StartPoint;
            // Anchor the running bounds at the start point (a 0×0 rect).
            union(new Rect(pen.X, pen.Y, 0, 0));
            for (const seg of figure.Segments)
            {
                if (seg instanceof LineSegment)
                {
                    union(Rect.FromCorners(pen, seg.Point));
                    pen = seg.Point;
                }
                else if (seg instanceof QuadraticBezierSegment)
                {
                    const q = new Quad(toD(pen), toD(seg.Point1), toD(seg.Point2));
                    union(rectFromPathops(q.boundingRect()));
                    pen = seg.Point2;
                }
                else if (seg instanceof CubicBezierSegment)
                {
                    const c = new Cubic(toD(pen), toD(seg.Point1), toD(seg.Point2), toD(seg.Point3));
                    union(rectFromPathops(c.boundingRect()));
                    pen = seg.Point3;
                }
                else if (seg instanceof ArcSegment)
                {
                    const cubics = arcToCubics(
                        pen.X, pen.Y, seg.Point.X, seg.Point.Y,
                        seg.Size.Width, seg.Size.Height,
                        seg.RotationAngle, seg.IsLargeArc,
                        seg.SweepDirection === SweepDirection.Clockwise);
                    if (cubics.length === 0)
                    {
                        union(Rect.FromCorners(pen, seg.Point));
                    }
                    else
                    {
                        for (const c of cubics) union(rectFromPathops(c.boundingRect()));
                    }
                    pen = seg.Point;
                }
            }
        }
        return bounds ?? Rect.Zero;
    }

    // Winding-number ray cast against +X ray from `point`. Walks the
    // same segment tree the bounds walker uses; for each cubic / quad
    // segment, solves y(t) = point.Y via Phase 1 root-finders and
    // counts the t-values whose x(t) > point.X.
    //
    // FillRule.Nonzero: signed-winding nonzero → inside.
    // FillRule.EvenOdd: total crossings odd → inside.
    protected override localContains(point: Point): boolean
    {
        const acc = { winding: 0, crossings: 0 };
        for (const figure of this.Figures)
        {
            let pen = figure.StartPoint;
            for (const seg of figure.Segments)
            {
                if (seg instanceof LineSegment)
                {
                    rayCastLine(pen.X, pen.Y, seg.Point.X, seg.Point.Y, point.X, point.Y, acc);
                    pen = seg.Point;
                }
                else if (seg instanceof QuadraticBezierSegment)
                {
                    rayCastQuad(pen, seg.Point1, seg.Point2, point.X, point.Y, acc);
                    pen = seg.Point2;
                }
                else if (seg instanceof CubicBezierSegment)
                {
                    rayCastCubic(pen, seg.Point1, seg.Point2, seg.Point3, point.X, point.Y, acc);
                    pen = seg.Point3;
                }
                else if (seg instanceof ArcSegment)
                {
                    const cubics = arcToCubics(
                        pen.X, pen.Y, seg.Point.X, seg.Point.Y,
                        seg.Size.Width, seg.Size.Height,
                        seg.RotationAngle, seg.IsLargeArc,
                        seg.SweepDirection === SweepDirection.Clockwise);
                    if (cubics.length === 0)
                    {
                        rayCastLine(pen.X, pen.Y, seg.Point.X, seg.Point.Y, point.X, point.Y, acc);
                    }
                    else
                    {
                        for (const c of cubics)
                        {
                            const p0 = new Point(c.fPts[0]!.fX, c.fPts[0]!.fY);
                            const p1 = new Point(c.fPts[1]!.fX, c.fPts[1]!.fY);
                            const p2 = new Point(c.fPts[2]!.fX, c.fPts[2]!.fY);
                            const p3 = new Point(c.fPts[3]!.fX, c.fPts[3]!.fY);
                            rayCastCubic(p0, p1, p2, p3, point.X, point.Y, acc);
                        }
                    }
                    pen = seg.Point;
                }
            }
            // IsClosed → implicit line back to figure StartPoint.
            if (figure.IsClosed && !pen.Equals(figure.StartPoint))
            {
                rayCastLine(pen.X, pen.Y, figure.StartPoint.X, figure.StartPoint.Y,
                            point.X, point.Y, acc);
            }
        }
        if (this.FillRule === FillRule.Nonzero) return acc.winding !== 0;
        return (acc.crossings & 1) === 1;
    }
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
    public static readonly ChildrenKey = MuralBase.RegisterProperty<readonly Geometry[]>(GeometryGroup, 'Children', [], MetaData.Render);
    public static readonly FillRuleKey = MuralBase.RegisterProperty<FillRule>(           GeometryGroup, 'FillRule', FillRule.EvenOdd, MetaData.Render);

    constructor(children?: readonly Geometry[])
    {
        super();
        if (children !== undefined) this.Children = children;
    }

    public get Children(): readonly Geometry[] { return this.get_property_value(GeometryGroup.ChildrenKey); }
    public set Children(value: readonly Geometry[]) { this.set_property_value(GeometryGroup.ChildrenKey, value); }

    public get FillRule(): FillRule { return this.get_property_value(GeometryGroup.FillRuleKey); }
    public set FillRule(value: FillRule) { this.set_property_value(GeometryGroup.FillRuleKey, value); }

    protected override getLocalBounds(): Rect
    {
        let bounds: Rect | undefined = undefined;
        for (const child of this.Children)
        {
            const cb = child.GetBounds();
            bounds = bounds === undefined ? cb : bounds.Union(cb);
        }
        return bounds ?? Rect.Zero;
    }

    // FillRule.EvenOdd → XOR of child Contains() (each child layer flips).
    // FillRule.Nonzero → OR. V1 weakness for Nonzero composites is
    // documented; exact resolution lands when 19.7 ships combine().
    protected override localContains(point: Point): boolean
    {
        if (this.FillRule === FillRule.EvenOdd)
        {
            let inside = false;
            for (const child of this.Children)
            {
                if (child.Contains(point)) inside = !inside;
            }
            return inside;
        }
        for (const child of this.Children)
        {
            if (child.Contains(point)) return true;
        }
        return false;
    }
}

// ── ray-cast + bounds helpers used by PathGeometry overrides ─────────

const toD = (p: Point): DPoint => new DPoint(p.X, p.Y);

const rectFromPathops = (r: { fLeft: number; fTop: number; fRight: number; fBottom: number }): Rect =>
    new Rect(r.fLeft, r.fTop, r.fRight - r.fLeft, r.fBottom - r.fTop);

interface RayAcc { winding: number; crossings: number; }

// Updates `acc` for a line segment A→B crossed by the +X ray from (px, py).
// Half-open convention (t ∈ [0, 1)) keeps shared endpoints from double-counting.
function rayCastLine(ax: number, ay: number, bx: number, by: number,
                     px: number, py: number, acc: RayAcc): void
{
    if (ay === by) return;
    const t = (py - ay) / (by - ay);
    if (t < 0 || t >= 1) return;
    const x = ax + t * (bx - ax);
    if (x <= px) return;
    acc.winding   += by > ay ? 1 : -1;
    acc.crossings += 1;
}

// Quadratic Bezier crossing test. Solves y(t) = py via Quad.RootsValidT
// (Phase 1) and counts t-values whose x(t) > px. Sign of crossing comes
// from y'(t).
function rayCastQuad(a: Point, b: Point, c: Point,
                     px: number, py: number, acc: RayAcc): void
{
    // y(t) = A + 2(B-A)t + (A-2B+C)t²
    const A = a.Y - 2 * b.Y + c.Y;
    const B = 2 * (b.Y - a.Y);
    const C = a.Y - py;
    const roots: number[] = [];
    const n = Quad.RootsValidT(A, B, C, roots);
    for (let i = 0; i < n; ++i)
    {
        const t = roots[i]!;
        if (t < 0 || t >= 1) continue;
        const mt = 1 - t;
        const x = mt * mt * a.X + 2 * mt * t * b.X + t * t * c.X;
        if (x <= px) continue;
        // y'(t) = 2(1-t)(B-A) + 2t(C-B)
        const yp = 2 * mt * (b.Y - a.Y) + 2 * t * (c.Y - b.Y);
        if (yp === 0) continue;          // tangent grazing — skip
        acc.winding   += yp > 0 ? 1 : -1;
        acc.crossings += 1;
    }
}

function rayCastCubic(a: Point, b: Point, c: Point, d: Point,
                      px: number, py: number, acc: RayAcc): void
{
    // y(t) = (-y0 + 3y1 - 3y2 + y3) t³ + (3y0 - 6y1 + 3y2) t²
    //      + (-3y0 + 3y1) t + (y0 - py)
    const A = -a.Y + 3 * b.Y - 3 * c.Y + d.Y;
    const B =  3 * a.Y - 6 * b.Y + 3 * c.Y;
    const C = -3 * a.Y + 3 * b.Y;
    const D =  a.Y - py;
    const roots: number[] = [];
    const n = Cubic.RootsValidT(A, B, C, D, roots);
    for (let i = 0; i < n; ++i)
    {
        const t = roots[i]!;
        if (t < 0 || t >= 1) continue;
        const mt = 1 - t;
        const x = mt * mt * mt * a.X
                + 3 * mt * mt * t  * b.X
                + 3 * mt * t  * t  * c.X
                + t  * t  * t  * d.X;
        if (x <= px) continue;
        // y'(t) = 3(1-t)²(y1-y0) + 6(1-t)t(y2-y1) + 3t²(y3-y2)
        const yp = 3 * mt * mt * (b.Y - a.Y)
                 + 6 * mt * t  * (c.Y - b.Y)
                 + 3 * t  * t  * (d.Y - c.Y);
        if (yp === 0) continue;
        acc.winding   += yp > 0 ? 1 : -1;
        acc.crossings += 1;
    }
}
