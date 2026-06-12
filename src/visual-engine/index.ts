// Barrel re-exports for the visual engine. Consumers import from here
// rather than the individual subfolders. Geometric primitives (Point,
// Size, Rect, Color, Matrix) live in `runtime` — import them from
// there.
export * from './geometry/index.js';
export * from './drawing/index.js';
export * from './text/index.js';
export * from './targets/index.js';
