import type { Point, Rect } from '../runtime/index.js';
import type { Brush } from './brush.js';
import type { Pen } from './pen.js';
import type { Geometry } from './geometry.js';
import type { Transform } from './transform.js';
import type { FormattedText } from './formatted-text.js';
import type { ImageSource, Stretch } from './image-source.js';

// Augments the runtime DrawingContext marker interface with the actual
// renderer-supplied draw methods. Visual.Render (in runtime) takes a
// DrawingContext parameter typed against the marker; subclass
// RenderOverride implementations in visual-engine see the augmented
// interface and call DrawRectangle / DrawText / … normally.
//
// TypeScript merges interface declarations across modules under the
// same import path, so any module that imports either this file or
// '../runtime/drawing-context.js' sees the full method surface.
//
// Concrete implementations (SvgDrawingContext, CanvasDrawingContext, …)
// translate these calls into renderer-native artifacts (SVG elements, a
// canvas command list, a vertex stream).
//
// Surface starts deliberately small (DrawRectangle / DrawText /
// DrawGeometry / PushTransform / Pop) per build-order step 12.5 of the
// visual-engine design. Convenience primitives (DrawEllipse, DrawLine,
// DrawImage, PushOpacity) get added when a concrete Visual first needs
// one. DrawRoundedRectangle and PushClip are already in the surface
// because Border (corner-radii) and ScrollViewer / hardware clipping
// need them.
declare module '../runtime/drawing-context.js'
{
    interface DrawingContext
    {
        // ----- Primitives -----
        // `brush` is the fill paint (undefined => no fill).
        // `pen`   is the stroke (undefined => no stroke). Both undefined is
        // a valid no-op (matches WPF DrawingContext.DrawRectangle semantics).

        DrawRectangle(brush: Brush | undefined, pen: Pen | undefined, rect: Rect): void;

        // Rounded variant. `radiusX` / `radiusY` are the horizontal /
        // vertical corner radii (uniform across all four corners — WPF's
        // per-corner CornerRadius isn't surfaced yet). Implementations
        // fall back to DrawRectangle semantics when both radii are 0.
        DrawRoundedRectangle(
            brush: Brush | undefined,
            pen: Pen | undefined,
            rect: Rect,
            radiusX: number,
            radiusY: number,
        ): void;

        DrawGeometry(brush: Brush | undefined, pen: Pen | undefined, geometry: Geometry): void;

        DrawText(text: FormattedText, origin: Point): void;

        // Paints `source` into the given rect using the supplied stretch
        // policy. The image is identified by its host-supplied URI
        // (HTTP/HTTPS / data / blob); decoding and rasterization are the
        // renderer's responsibility. Stretch maps to the renderer's
        // native aspect-ratio control (SVG `preserveAspectRatio`,
        // canvas drawImage source-rect math, etc.).
        DrawImage(source: ImageSource, rect: Rect, stretch: Stretch): void;

        // ----- Stack frames -----
        // Each Push opens a frame; Pop closes the most recent open frame.
        // Frames affect every subsequent draw call until Pop. Imbalanced
        // Push/Pop is a programmer error and behavior is renderer-defined
        // (concrete DCs may throw or silently leak the frame).

        PushTransform(transform: Transform): void;

        // Clips subsequent draw calls to the area covered by `geometry`
        // until the matching Pop. Frames stack with PushTransform —
        // a clip pushed inside a transform is in the transform's
        // coordinate space. RectangleGeometry / EllipseGeometry are
        // the supported shapes today; other geometries throw (clip
        // shapes are a subset of paintable geometries).
        PushClip(geometry: Geometry): void;

        Pop(): void;
    }
}

// Re-export the augmented interface so callers can import directly
// from visual-engine instead of reaching into the runtime path.
export type { DrawingContext } from '../runtime/drawing-context.js';
