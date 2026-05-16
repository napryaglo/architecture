// Marker interface for the renderer-supplied drawing surface that
// Visual.Render hands to RenderOverride. Empty here — visual-engine
// augments this interface (via TypeScript declaration merging) with
// the actual draw methods (DrawRectangle, DrawText, …) so Visual can
// reference the type without importing Brush, Pen, Geometry, etc.
//
// Runtime-only code never calls methods on a DrawingContext; it just
// passes one through Render → RenderOverride. Concrete Visual
// subclasses living in visual-engine see the augmented interface and
// call the draw methods normally.
export interface DrawingContext { }
