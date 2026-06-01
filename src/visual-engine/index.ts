// Barrel re-exports for the visual engine. Consumers import from here
// rather than the individual files. Geometric primitives (Point, Size,
// Rect, Color, Matrix) live in `runtime` — import them from there.
export { Transform, TranslateTransform, MatrixTransform } from './transform.js';
export {
    Brush,
    SolidColorBrush,
    LinearGradientBrush,
    RadialGradientBrush,
    ImageBrush,
    GradientStop,
    GradientSpreadMethod,
    Stretch,
    AlignmentX,
    AlignmentY,
    ImageSource,
} from './brush.js';
export { Pen, DashStyle, LineCap, LineJoin } from './pen.js';
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
export { FormattedText, FontWeight, FontStyle } from './formatted-text.js';
export { type DrawingContext } from './drawing-context.js';
export { SvgDrawingContext } from './svg-drawing-context.js';
export {
    SvgDomDrawingContext,
    type SvgDomDrawingContextOptions,
} from './svg-dom-drawing-context.js';
export { SvgRenderer, VISUAL_BACKREF, type SvgRendererOptions } from './svg-renderer.js';
export { FontMetricsMeasurer } from './font-metrics-measurer.js';
export {
    loadGoogleFont,
    loadGoogleFontInto,
    type GoogleFontOptions,
    type LoadedGoogleFont,
} from './google-font-loader.js';
export { PresentationTarget } from './presentation-target.js';
export { HtmlTarget, type HtmlTargetOptions } from './targets/html-target.js';
export { FileTarget, type FileTargetOptions, type FileTargetFormat } from './targets/file-target.js';
export { HeadlessTarget } from './targets/headless-target.js';
