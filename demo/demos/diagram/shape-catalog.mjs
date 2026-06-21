// Shape catalog for the diagrammer — one entry per shape kind. Each
// entry extracts a unit-1 PathGeometry ONCE on first request (lazy
// cache) by running the matching Shape subclass's RenderOverride
// against a capturing context, then bakes any `PushTransform` frames
// (Slanted's shear, PuffyDiamond's rotation) into the segment
// coordinates so the cached geometry has `Transform=Identity` and is
// pure path data.
//
// Runtime sizing (toolbox tile, canvas drop, resize) goes through
// `scaleGeometry(unit1, w, h)` which applies a point-by-point
// `Matrix.Scale(w, h)` transformation — no `<g transform="">` wraps
// the rendered `<path>`, so strokes render at their declared
// `Pen.Thickness` regardless of the node's pixel size.
//
// This design also accommodates COMBINED GEOMETRIES (boolean ops on
// PathGeometries — future). The combine output is itself a
// PathGeometry; consumers can stash it on a node directly and let the
// same scaleGeometry pipeline handle resize. The catalog is just one
// source of unit-1 PathGeometries among potentially many.
//
// Why we don't hand-write each unit-1 path: the Shape subclasses
// (src/basic/shapes/*) already encode every kind's path-construction
// logic in their `RenderOverride`. Reusing them keeps the diagrammer
// in lock-step with the shape library — any future tweak to a shape's
// silhouette flows automatically.

import {
    ArcSegment,
    CubicBezierSegment,
    EllipseGeometry,
    FillRule,
    LineSegment,
    Matrix,
    PathFigure,
    PathGeometry,
    Point,
    QuadraticBezierSegment,
    Rect,
    RectangleGeometry,
    Size,
    SweepDirection,
    Transform,
} from '@visualisation-sub/mural/visual-engine';

import {
    Arch, Arrow, Bun, Clamshell, Diamond, EightLeafClover, Ellipse, Fan,
    Flower, FourLeafClover, FourSidedCookie, Gem, Ghostish, Heart,
    NineSidedCookie, Pentagon, Pill, PixelCircle, PixelTriangle, Puffy,
    PuffyDiamond, Rectangle, Semicircle, SevenSidedCookie, SixSidedCookie,
    Slanted, SoftBurst, SoftBoom, Squircle, Sunny, Triangle,
    TwelveSidedCookie, VerySunny, Burst, Boom,
} from '@visualisation-sub/mural/basic';

// `combine` and its CombineMode enum live in
// `visual-engine/geometry/combine.js` and are deliberately NOT
// re-exported from the geometry barrel — importing the deep path
// keeps the cyclic-import guard the barrel notes about intact.
import {
    combine,
    GeometryCombineMode,
} from '@visualisation-sub/mural/visual-engine/geometry/combine.js';
export { GeometryCombineMode };

// ── Capturing DrawingContext ─────────────────────────────────────────
//
// DrawingContext-shaped object that records the geometry passed to
// DrawGeometry instead of painting. The first DrawGeometry call wins
// (every shape's RenderOverride emits exactly one). PushTransform /
// Pop frames are tracked as a stack of Matrices and composed into a
// single bake matrix at capture time.
class CapturingDrawingContext
{
    constructor()
    {
        this.transformStack = [];
        this.captured       = null;
    }
    PushTransform(t)       { this.transformStack.push(t.Matrix); }
    PushClip(_)            { /* unused for extraction */ }
    Pop()                  { this.transformStack.pop(); }
    DrawRectangle()        { /* unused for extraction */ }
    DrawRoundedRectangle() { /* unused for extraction */ }
    DrawText()             { /* unused for extraction */ }
    DrawImage()            { /* unused for extraction */ }
    DrawGeometry(_brush, _pen, geometry)
    {
        if (this.captured !== null) return;
        const figures = lowerToFigures(geometry);
        // Compose stack into one bake matrix. Innermost transform
        // applies first (closest to the path); stack[0] is outermost.
        // For row-vector composition: M = innermost.Multiply(next).Multiply(...).Multiply(outermost).
        const stack = [...this.transformStack];
        if (geometry.Transform !== Transform.Identity) stack.push(geometry.Transform.Matrix);
        let m = Matrix.Identity;
        for (let i = stack.length - 1; i >= 0; i--)
        {
            m = m.Multiply(stack[i]);
        }
        const baked = m.IsIdentity
            ? figures
            : figures.map(f => transformFigure(f, m));
        const out = new PathGeometry(baked);
        if (geometry instanceof PathGeometry && geometry.FillRule !== FillRule.EvenOdd)
        {
            out.FillRule = geometry.FillRule;
        }
        this.captured = out;
    }
}

// Lower RectangleGeometry / EllipseGeometry to equivalent PathFigures
// so the rest of the pipeline can treat every captured geometry as a
// PathGeometry. (PathGeometry passes through unchanged.)
function lowerToFigures(geometry)
{
    if (geometry instanceof PathGeometry)      return [...geometry.Figures];
    if (geometry instanceof RectangleGeometry) return [rectangleToFigure(geometry)];
    if (geometry instanceof EllipseGeometry)   return [ellipseToFigure(geometry)];
    throw new Error(`shape-catalog: cannot lower ${geometry?.constructor?.name ?? 'unknown'} to PathFigures`);
}

function rectangleToFigure(g)
{
    const r = g.Rect;
    return new PathFigure(
        new Point(r.X, r.Y),
        [
            new LineSegment(new Point(r.X + r.Width, r.Y)),
            new LineSegment(new Point(r.X + r.Width, r.Y + r.Height)),
            new LineSegment(new Point(r.X, r.Y + r.Height)),
        ],
        true,
    );
}

function ellipseToFigure(g)
{
    const cx = g.Center.X, cy = g.Center.Y;
    const rx = g.RadiusX,  ry = g.RadiusY;
    return new PathFigure(
        new Point(cx - rx, cy),
        [
            new ArcSegment(new Point(cx + rx, cy), new Size(rx, ry), 0, false, SweepDirection.Clockwise),
            new ArcSegment(new Point(cx - rx, cy), new Size(rx, ry), 0, false, SweepDirection.Clockwise),
        ],
        true,
    );
}

// ── Geometry baking + scaling ─────────────────────────────────────────
//
// Apply a Matrix to every coordinate in a PathFigure, returning a
// fresh figure. Used (a) during catalog extraction to bake captured
// PushTransform frames into segment coords, and (b) at runtime to
// scale unit-1 geometries to a node's current (Width, Height).
//
// Arc segments need special handling — the endpoint transforms like
// any other point, but Size (rx, ry) and RotationAngle update based
// on the matrix's scale and rotation parts. The math is exact for
// pure scale, pure rotation, and any combination thereof; shear is
// approximated (Slanted has shear but contains no arcs, so this isn't
// a real concern in our catalog).
function transformFigure(figure, m)
{
    return new PathFigure(
        m.Transform(figure.StartPoint),
        figure.Segments.map(s => transformSegment(s, m)),
        figure.IsClosed,
    );
}

function transformSegment(seg, m)
{
    if (seg instanceof LineSegment)
    {
        return new LineSegment(m.Transform(seg.Point));
    }
    if (seg instanceof CubicBezierSegment)
    {
        return new CubicBezierSegment(
            m.Transform(seg.Point1),
            m.Transform(seg.Point2),
            m.Transform(seg.Point3),
        );
    }
    if (seg instanceof QuadraticBezierSegment)
    {
        return new QuadraticBezierSegment(
            m.Transform(seg.Point1),
            m.Transform(seg.Point2),
        );
    }
    if (seg instanceof ArcSegment)
    {
        // Decompose into rotation + per-axis scale (Frobenius-style
        // row magnitudes). Exact for pure scale / pure rotation; for
        // uniform scale + rotation the rotation angle adds and the
        // radii scale uniformly. Non-uniform scale of a pre-rotated
        // arc distorts slightly — none of our catalog shapes hit
        // that combo, but resize aspect-changes might if a future
        // combined geometry contains arcs.
        const sx = Math.hypot(m.M11, m.M12);
        const sy = Math.hypot(m.M21, m.M22);
        const rotDeg = Math.atan2(m.M12, m.M11) * 180 / Math.PI;
        return new ArcSegment(
            m.Transform(seg.Point),
            new Size(seg.Size.Width * sx, seg.Size.Height * sy),
            seg.RotationAngle + rotDeg,
            seg.IsLargeArc,
            seg.SweepDirection,
        );
    }
    throw new Error(`shape-catalog: unknown segment type ${seg?.constructor?.name ?? 'unknown'}`);
}

// Pure-scale convenience for the common case (resize, toolbox
// preview). Avoids constructing a Matrix when the caller already
// thinks in width/height.
export function scaleGeometry(source, width, height)
{
    if (source === undefined) return undefined;
    const m = Matrix.Scale(width, height);
    const baked = source.Figures.map(f => transformFigure(f, m));
    const out = new PathGeometry(baked);
    if (source.FillRule !== FillRule.EvenOdd) out.FillRule = source.FillRule;
    return out;
}

// Pure-translation convenience for boolean ops — we need each node's
// geometry in DIAGRAM-space (offset by X, Y) before feeding them to
// `combine`, since the kernel operates on the figures as-is.
export function translateGeometry(geom, dx, dy)
{
    if (geom === undefined) return undefined;
    if (dx === 0 && dy === 0) return geom;
    const m = Matrix.Translate(dx, dy);
    const baked = geom.Figures.map(f => transformFigure(f, m));
    const out = new PathGeometry(baked);
    if (geom.FillRule !== FillRule.EvenOdd) out.FillRule = geom.FillRule;
    return out;
}

// Normalize an arbitrary PathGeometry to the unit-1 ShapeNodeVM
// source format. Returns `{ source, x, y, w, h }` where:
//
//   * source  — PathGeometry with figures in [0,1] × [0,1]
//   * (x, y)  — top-left of the original bounding box in the source's
//               coord space (the diagram-space position for a combine
//               result)
//   * (w, h)  — bbox dimensions, become the new node's Width / Height
//
// Returns undefined when the input is empty (zero-area boolean
// result) so the caller can show an empty-result message instead of
// inserting a degenerate node.
export function normalizeToUnit(geom)
{
    if (geom === undefined) return undefined;
    const bounds = geom.GetBounds();
    if (bounds.Width <= 0 || bounds.Height <= 0) return undefined;
    // Translate to origin, then scale to unit-1. Row-vector form so
    // the translate is applied first (point - origin), then the scale.
    const m = Matrix.Translate(-bounds.X, -bounds.Y)
        .Multiply(Matrix.Scale(1 / bounds.Width, 1 / bounds.Height));
    const baked = geom.Figures.map(f => transformFigure(f, m));
    const source = new PathGeometry(baked);
    if (geom.FillRule !== FillRule.EvenOdd) source.FillRule = geom.FillRule;
    return { source, x: bounds.X, y: bounds.Y, w: bounds.Width, h: bounds.Height };
}

// ── Catalog ──────────────────────────────────────────────────────────
//
// Each entry lazily extracts its unit-1 PathGeometry on first
// build() call and caches the result. The geometry is the SOURCE OF
// TRUTH — runtime sizing scales a fresh copy from this cached source
// via scaleGeometry; the source itself never mutates.

function extractUnit(ShapeClass)
{
    const inst = new ShapeClass();
    inst.Width  = 1;
    inst.Height = 1;
    inst.Measure(new Size(1, 1));
    inst.Arrange(new Rect(0, 0, 1, 1));
    const dc = new CapturingDrawingContext();
    // RenderOverride is `protected` in TS, but JS has no enforcement.
    inst.RenderOverride(dc);
    if (dc.captured === null)
    {
        throw new Error(`shape-catalog: ${ShapeClass.name} produced no geometry at unit-1`);
    }
    return dc.captured;
}

function makeEntry(kind, label, ShapeClass)
{
    let cached = null;
    return {
        kind,
        label,
        // Returns the cached unit-1 PathGeometry. Callers must use
        // scaleGeometry(result, w, h) to produce a node-sized copy.
        unit()
        {
            if (cached === null) cached = extractUnit(ShapeClass);
            return cached;
        },
    };
}

// Catalogue ordered the same way the toolbox rail used to enumerate the
// 35 kinds — base → architectural → cookies → clovers → radial waves →
// puffies → glyphs → pixel art. Order drives the toolbox UI.
export const SHAPE_CATALOG = [
    makeEntry('rectangle',      'Rectangle',     Rectangle),
    makeEntry('ellipse',        'Ellipse',       Ellipse),
    makeEntry('squircle',       'Squircle',      Squircle),
    makeEntry('slanted',        'Slanted',       Slanted),
    makeEntry('pill',           'Pill',          Pill),
    makeEntry('diamond',        'Diamond',       Diamond),
    makeEntry('pentagon',       'Pentagon',      Pentagon),
    makeEntry('gem',            'Gem',           Gem),
    makeEntry('arch',           'Arch',          Arch),
    makeEntry('semicircle',     'Semicircle',    Semicircle),
    makeEntry('triangle',       'Triangle',      Triangle),
    makeEntry('arrow',          'Arrow',         Arrow),
    makeEntry('fan',            'Fan',           Fan),
    makeEntry('clamshell',      'Clamshell',     Clamshell),
    makeEntry('4-cookie',       '4-Cookie',      FourSidedCookie),
    makeEntry('6-cookie',       '6-Cookie',      SixSidedCookie),
    makeEntry('7-cookie',       '7-Cookie',      SevenSidedCookie),
    makeEntry('9-cookie',       '9-Cookie',      NineSidedCookie),
    makeEntry('12-cookie',      '12-Cookie',     TwelveSidedCookie),
    makeEntry('4-leaf-clover',  '4-Leaf Clover', FourLeafClover),
    makeEntry('8-leaf-clover',  '8-Leaf Clover', EightLeafClover),
    makeEntry('sunny',          'Sunny',         Sunny),
    makeEntry('very-sunny',     'Very Sunny',    VerySunny),
    makeEntry('burst',          'Burst',         Burst),
    makeEntry('soft-burst',     'Soft Burst',    SoftBurst),
    makeEntry('boom',           'Boom',          Boom),
    makeEntry('soft-boom',      'Soft Boom',     SoftBoom),
    makeEntry('flower',         'Flower',        Flower),
    makeEntry('puffy',          'Puffy',         Puffy),
    makeEntry('puffy-diamond',  'Puffy Diamond', PuffyDiamond),
    makeEntry('ghostish',       'Ghost-ish',     Ghostish),
    makeEntry('bun',            'Bun',           Bun),
    makeEntry('heart',          'Heart',         Heart),
    makeEntry('pixel-circle',   'Pixel Circle',  PixelCircle),
    makeEntry('pixel-triangle', 'Pixel Triangle',PixelTriangle),
];

export const SHAPE_CATALOG_MAP = new Map(SHAPE_CATALOG.map(e => [e.kind, e]));

// Build a node-sized PathGeometry by scaling the catalog's cached
// unit-1 geometry to (width, height). The returned geometry has its
// segment coordinates in pixel space — strokes render at their
// declared Pen.Thickness without scale distortion.
export function buildNodeGeometry(kind, width, height)
{
    const entry = SHAPE_CATALOG_MAP.get(kind);
    if (entry === undefined) return undefined;
    return scaleGeometry(entry.unit(), width, height);
}

// ── Boolean ops ──────────────────────────────────────────────────────
//
// Combine N ShapeNodeVM-shaped inputs into a single unit-1 source +
// placement record. Each input must expose `Geometry` (its current
// pixel-coord PathGeometry) and `X` / `Y` (diagram-space top-left).
// The combine kernel is fed each input translated into diagram space,
// reduce-left across the rest, then the kernel output is normalized
// back to unit-1 + bbox.
//
// Mode is `GeometryCombineMode` (Union / Intersect / Xor / Exclude).
// For `Exclude` (= A − B − C − …), ordering matters; the caller
// chooses the order by selection sequence. Empty result → undefined
// (caller surfaces an empty-combine message; no degenerate node is
// inserted).
export function mergeShapes(nodes, mode)
{
    if (!Array.isArray(nodes) || nodes.length < 2) return undefined;
    // Project each input into diagram space — the kernel treats
    // figures as-is so the relative positions must be encoded in the
    // coords themselves.
    const projected = nodes.map(n => translateGeometry(n.Geometry, n.Left, n.Top));
    if (projected.some(g => g === undefined)) return undefined;
    let acc = projected[0];
    for (let i = 1; i < projected.length; i++)
    {
        acc = combine(acc, projected[i], mode);
    }
    return normalizeToUnit(acc);
}
