// Geometry — vector shape primitives used by both the renderer
// (DrawingContext.DrawGeometry) and the shape controls (RectangleGeometry,
// EllipseGeometry, LineGeometry, PathGeometry, GeometryGroup).
export {
    Geometry,
    RectangleGeometry,
    EllipseGeometry,
    LineGeometry,
    PathGeometry,
    GeometryGroup,
    PathFigure,
    PathSegment,
    LineSegment,
    CubicBezierSegment,
    QuadraticBezierSegment,
    ArcSegment,
    FillRule,
    SweepDirection,
} from './geometry.js';
export { pathGeometryToSvgD } from './path-to-svg.js';
// Note: combine.js is deliberately NOT re-exported from this barrel.
// Cycle path that the re-export would create:
//   geometry.ts → runtime/index.ts → visual-engine/index.ts
//     → geometry/index.ts → combine.ts → geometry.ts (partial)
// Consumers of CombinedGeometry / combine / intersectsExact import the
// path directly: `from '@visualisation-sub/mural/visual-engine/geometry/combine.js'`.
