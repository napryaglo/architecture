import {
    ArcSegment,
    CubicBezierSegment,
    LineSegment,
    PathGeometry,
    QuadraticBezierSegment,
    SweepDirection,
    type PathSegment,
} from './geometry.js';

// Local helper — the SVG DCs each carry their own copy too; consolidating
// would touch a wider area than this fix needs. Default JS toString is
// fine for SVG path-data numbers (no special precision required at this
// scale).
function formatNumber(n: number): string { return n.toString(); }

// Lower a PathGeometry to an SVG `d=…` path-data string. Walks each
// figure in order, emitting:
//   * `M sx sy`             — move to the figure's StartPoint
//   * one of L / A / C / Q  — per segment (LineSegment, ArcSegment,
//                              CubicBezierSegment, QuadraticBezierSegment)
//   * `Z`                   — when the figure's IsClosed flag is true
//
// Both SvgDrawingContext (string-builder) and SvgDomDrawingContext
// (DOM-mode) call this to produce the `d` attribute on the emitted
// `<path>` element — keeping the lowering logic in one place so the
// two renderers stay in sync.
//
// SweepDirection maps to SVG's sweep-flag: 1 for Clockwise (the
// canonical "rounded-rectangle corner" direction), 0 otherwise.
export function pathGeometryToSvgD(path: PathGeometry): string
{
    const parts: string[] = [];
    for (const figure of path.Figures)
    {
        parts.push(`M ${formatNumber(figure.StartPoint.X)} ${formatNumber(figure.StartPoint.Y)}`);
        for (const seg of figure.Segments)
        {
            parts.push(segmentToSvg(seg));
        }
        if (figure.IsClosed) parts.push('Z');
    }
    return parts.join(' ');
}

function segmentToSvg(seg: PathSegment): string
{
    if (seg instanceof LineSegment)
    {
        return `L ${formatNumber(seg.Point.X)} ${formatNumber(seg.Point.Y)}`;
    }
    if (seg instanceof ArcSegment)
    {
        const largeArc = seg.IsLargeArc ? 1 : 0;
        const sweep    = seg.SweepDirection === SweepDirection.Clockwise ? 1 : 0;
        return `A ${formatNumber(seg.Size.Width)} ${formatNumber(seg.Size.Height)} `
             + `${formatNumber(seg.RotationAngle)} ${largeArc} ${sweep} `
             + `${formatNumber(seg.Point.X)} ${formatNumber(seg.Point.Y)}`;
    }
    if (seg instanceof CubicBezierSegment)
    {
        return `C ${formatNumber(seg.Point1.X)} ${formatNumber(seg.Point1.Y)} `
             + `${formatNumber(seg.Point2.X)} ${formatNumber(seg.Point2.Y)} `
             + `${formatNumber(seg.Point3.X)} ${formatNumber(seg.Point3.Y)}`;
    }
    if (seg instanceof QuadraticBezierSegment)
    {
        return `Q ${formatNumber(seg.Point1.X)} ${formatNumber(seg.Point1.Y)} `
             + `${formatNumber(seg.Point2.X)} ${formatNumber(seg.Point2.Y)}`;
    }
    throw new Error(`pathGeometryToSvgD: unknown PathSegment ${seg.constructor.name}`);
}
