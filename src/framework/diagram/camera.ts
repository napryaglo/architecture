import { Matrix, Point, Rect, Size } from '../../visual-engine/primitives.js';

// The diagram camera: content maps to screen as `screen = content * zoom + pan`.
// Pan is in screen pixels (post-scale). Pure value + math — no mural-visual deps,
// so it is fully unit-testable under node:test.
export interface Camera { readonly zoom: number; readonly panX: number; readonly panY: number; }

export const CAMERA_MIN = 0.1;         // interactive zoom-out floor (10%)
export const CAMERA_MAX = 4.0;         // interactive zoom-in ceiling (400%)
export const CAMERA_FIT_FLOOR = 0.02;  // Fit may go this low to frame huge diagrams

// Clamp an interactive zoom to [CAMERA_MIN, CAMERA_MAX].
export function clampZoom(z: number): number { return Math.max(CAMERA_MIN, Math.min(CAMERA_MAX, z)); }

// Content -> screen affine. Scale applies first, then translate (the leftmost
// Multiply factor applies first to a row-vector point), so screen = c*zoom + pan.
export function cameraMatrix(c: Camera): Matrix {
    return Matrix.Scale(c.zoom, c.zoom).Multiply(Matrix.Translate(c.panX, c.panY));
}

// Zoom by `factor` about `pivot` (a screen point), keeping the content point that
// currently sits under the pivot fixed on screen. Zoom is clamped to the
// interactive range.
export function zoomAtPoint(c: Camera, pivot: Point, factor: number): Camera {
    const zoom = clampZoom(c.zoom * factor);
    // content point currently under the pivot: (pivot - pan) / zoom
    const cx = (pivot.X - c.panX) / c.zoom;
    const cy = (pivot.Y - c.panY) / c.zoom;
    // choose pan so the same content point maps back to the pivot at the new zoom
    return { zoom, panX: pivot.X - cx * zoom, panY: pivot.Y - cy * zoom };
}

// Frame `content` (a content-space rect) centered in `viewport` with `padding`
// pixels of inset. Zoom is clamped to [CAMERA_FIT_FLOOR, CAMERA_MAX] so Fit can
// go below the interactive floor to frame very large diagrams.
export function fitBounds(content: Rect, viewport: Size, padding: number): Camera {
    const availW = Math.max(1, viewport.Width - padding * 2);
    const availH = Math.max(1, viewport.Height - padding * 2);
    const w = Math.max(1, content.Width);
    const h = Math.max(1, content.Height);
    const zoom = Math.max(CAMERA_FIT_FLOOR, Math.min(CAMERA_MAX, Math.min(availW / w, availH / h)));
    const contentCx = content.X + content.Width / 2;
    const contentCy = content.Y + content.Height / 2;
    return {
        zoom,
        panX: viewport.Width / 2 - contentCx * zoom,
        panY: viewport.Height / 2 - contentCy * zoom,
    };
}
