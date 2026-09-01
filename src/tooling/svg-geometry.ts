// SVG → geometry-resource JS, for the `.mu` compiler's `include` keyword.
//
// Parses an SVG with the icon-subset parser and serializes its shapes'
// geometries into a JS expression that constructs ONE Geometry (a
// GeometryGroup when the file has more than one shape). Paint is
// intentionally DROPPED — the consuming `Shape [Geometry=@x, Fill=…]`
// supplies the brush, per the shared-geometry icon model. This is the
// geometry-serialization formerly in build-icons.ts, lifted out so the
// build script's include resolver can reuse it.
//
// Alongside the expression it reports the EXACT set of visual-engine type
// names the expression references, so the caller (the compiler, via its
// include resolver) emits a single named import with only those names —
// no unused-import noise.

import {
    ArcSegment,
    CubicBezierSegment,
    EllipseGeometry,
    LineGeometry,
    LineSegment,
    PathFigure,
    PathGeometry,
    QuadraticBezierSegment,
    RectangleGeometry,
    SweepDirection,
    type Geometry,
    type PathSegment,
} from '../visual-engine/index.js';
import { parseSvgIcon } from '../basic/svg-icon-parser.js';
import { CURRENT_COLOR, type IconPaint } from '../basic/icon.js';

const BASIC         = '@pragmatic-tech-ai/mural/basic';
const VISUAL_ENGINE = '@pragmatic-tech-ai/mural/visual-engine';

export interface GeometryResourceJs
{
    /** JS expression constructing the Geometry (bare type names). */
    valueJs: string;
    /** visual-engine type names the expression references. */
    names:   readonly string[];
}

export interface DrawingResourceJs
{
    /** JS expression constructing the IconDefinition (bare type names). */
    valueJs: string;
    /** Named imports the expression references, grouped by module. */
    imports: ReadonlyArray<{ module: string; names: readonly string[] }>;
}

// Serialize an SVG document to a geometry-construction expression plus the
// visual-engine names it uses.
export function svgToGeometryJs(svgText: string): GeometryResourceJs
{
    const used  = new Set<string>();
    const def   = parseSvgIcon(svgText);
    const geoms = def.Shapes.map(s => emitGeometry(s.Geometry, used));
    // One shape → the geometry directly; many → a GeometryGroup so a single
    // Shape paints the whole icon. Zero shapes → an empty group (renders
    // nothing, but keeps the key resolvable).
    let valueJs: string;
    if (geoms.length === 1)
    {
        valueJs = geoms[0]!;
    }
    else
    {
        used.add('GeometryGroup');
        valueJs = `new GeometryGroup([${geoms.join(', ')}])`;
    }
    return { valueJs, names: [...used].sort() };
}

// Serialize a single already-built Geometry to a construction expression
// plus the visual-engine names it references. Shared with the font-glyph
// resolver, which hands in a PathGeometry from glyphOutlineToGeometry.
export function geometryToJs(g: Geometry): GeometryResourceJs
{
    const used = new Set<string>();
    const valueJs = emitGeometry(g, used);
    return { valueJs, names: [...used].sort() };
}

// Serialize an SVG to an IconDefinition-construction expression that KEEPS
// each shape's concrete paint (the colored counterpart of svgToGeometryJs).
// currentColor / unspecified fills resolve to black — the SVG default —
// so the art paints without any theme wiring.
export function svgToIconJs(svgText: string): DrawingResourceJs
{
    const ve  = new Set<string>();   // visual-engine names (geometry + Color)
    const def = parseSvgIcon(svgText);
    const shapes = def.Shapes.map(s =>
    {
        const geom   = emitGeometry(s.Geometry, ve);
        const fill   = emitPaint(s.Fill,   ve);
        const stroke = emitPaint(s.Stroke, ve);
        return `{ Geometry: ${geom}, Fill: ${fill}, Stroke: ${stroke}, StrokeWidth: ${n(s.StrokeWidth)} }`;
    });
    const valueJs = `new IconDefinition(${n(def.ViewBoxWidth)}, ${n(def.ViewBoxHeight)}, [${shapes.join(', ')}])`;

    const imports: Array<{ module: string; names: readonly string[] }> = [
        { module: BASIC, names: ['IconDefinition'] },
    ];
    if (ve.size > 0) imports.push({ module: VISUAL_ENGINE, names: [...ve].sort() });
    return { valueJs, imports };
}

// IconPaint → JS expression. Color → literal new Color(...); the
// currentColor sentinel → black; none / undefined → the literal `undefined`.
function emitPaint(p: IconPaint, used: Set<string>): string
{
    if (p === undefined)      return 'undefined';
    used.add('Color');
    if (p === CURRENT_COLOR)  return 'new Color(0, 0, 0, 255)';
    return `new Color(${p.R}, ${p.G}, ${p.B}, ${p.A})`;
}

function emitGeometry(g: Geometry, used: Set<string>): string
{
    if (g instanceof PathGeometry)
    {
        used.add('PathGeometry');
        const figures = g.Figures.map(f => emitFigure(f, used)).join(', ');
        return `new PathGeometry([${figures}])`;
    }
    if (g instanceof RectangleGeometry)
    {
        used.add('RectangleGeometry'); used.add('Rect');
        return `new RectangleGeometry(new Rect(${n(g.Rect.X)}, ${n(g.Rect.Y)}, ${n(g.Rect.Width)}, ${n(g.Rect.Height)}), ${n(g.RadiusX)}, ${n(g.RadiusY)})`;
    }
    if (g instanceof EllipseGeometry)
    {
        used.add('EllipseGeometry'); used.add('Point');
        return `new EllipseGeometry(new Point(${n(g.Center.X)}, ${n(g.Center.Y)}), ${n(g.RadiusX)}, ${n(g.RadiusY)})`;
    }
    if (g instanceof LineGeometry)
    {
        used.add('LineGeometry'); used.add('Point');
        return `new LineGeometry(new Point(${n(g.StartPoint.X)}, ${n(g.StartPoint.Y)}), new Point(${n(g.EndPoint.X)}, ${n(g.EndPoint.Y)}))`;
    }
    throw new Error(`svg-geometry: unsupported geometry type ${g.constructor.name}`);
}

function emitFigure(f: PathFigure, used: Set<string>): string
{
    used.add('PathFigure'); used.add('Point');
    const segs = f.Segments.map(s => emitSegment(s, used)).join(', ');
    return `new PathFigure(new Point(${n(f.StartPoint.X)}, ${n(f.StartPoint.Y)}), [${segs}], ${f.IsClosed})`;
}

function emitSegment(s: PathSegment, used: Set<string>): string
{
    used.add('Point');
    if (s instanceof LineSegment)
    {
        used.add('LineSegment');
        return `new LineSegment(new Point(${n(s.Point.X)}, ${n(s.Point.Y)}))`;
    }
    if (s instanceof CubicBezierSegment)
    {
        used.add('CubicBezierSegment');
        return `new CubicBezierSegment(new Point(${n(s.Point1.X)}, ${n(s.Point1.Y)}), new Point(${n(s.Point2.X)}, ${n(s.Point2.Y)}), new Point(${n(s.Point3.X)}, ${n(s.Point3.Y)}))`;
    }
    if (s instanceof QuadraticBezierSegment)
    {
        used.add('QuadraticBezierSegment');
        return `new QuadraticBezierSegment(new Point(${n(s.Point1.X)}, ${n(s.Point1.Y)}), new Point(${n(s.Point2.X)}, ${n(s.Point2.Y)}))`;
    }
    if (s instanceof ArcSegment)
    {
        used.add('ArcSegment'); used.add('Size'); used.add('SweepDirection');
        const dir = s.SweepDirection === SweepDirection.Clockwise
            ? 'SweepDirection.Clockwise'
            : 'SweepDirection.Counterclockwise';
        return `new ArcSegment(new Point(${n(s.Point.X)}, ${n(s.Point.Y)}), new Size(${n(s.Size.Width)}, ${n(s.Size.Height)}), ${n(s.RotationAngle)}, ${s.IsLargeArc}, ${dir})`;
    }
    throw new Error(`svg-geometry: unsupported segment type ${s.constructor.name}`);
}

// Compact numbers: integers stay integers; floats keep 4 decimals (avoids
// "1.0000000000000002" artefacts from naive String()).
function n(x: number): string
{
    if (Number.isInteger(x)) return String(x);
    return Number(x.toFixed(4)).toString();
}
