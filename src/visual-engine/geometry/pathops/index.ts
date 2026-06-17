// Pathops barrel — re-exports the Skia pathops port.
//
// Phase 1 (shipped): curve-math primitives — points, rects, line/quad/
// cubic classes, epsilon comparators.
//
// Phase 5 (shipped): intersection core — LineParameters + the
// Intersections result-holder class, per-pair line × curve and
// curve × curve engines (BinarySearch in t-sect.ts).
//
// Phase 6 (in progress): operation-time span tree. Foundation laid:
// OpGlobalState, OpPtT, OpSpanBase, OpSpan, OpAngle skeleton. The
// cross-class methods (release, mergeMatches, computeWindSum, the
// OpAngle sort kernel) are stubbed with "Phase 6 follow-up" errors
// pending OpSegment / OpContour / OpCoincidence.

export * from './types.js';
export * from './point.js';
export * from './rect.js';
export * from './line.js';
export * from './quad.js';
export * from './cubic.js';
export * from './line-parameters.js';
export * from './intersections.js';
// Importing for side-effects (prototype augmentation) — installs the
// per-pair intersection methods on the Intersections class.
import './quad-line-intersection.js';
import './cubic-line-intersection.js';
export { HorizontalInterceptQuad, VerticalInterceptQuad } from './quad-line-intersection.js';
export { HorizontalInterceptCubic, VerticalInterceptCubic } from './cubic-line-intersection.js';
export * from './t-sect.js';

// Phase 6 foundation.
export * from './op-fwd.js';
export * from './op-global-state.js';
export * from './op-span.js';
export * from './op-angle.js';
export * from './op-segment.js';
export * from './op-contour.js';
export * from './op-coincidence.js';
export * from './op-winding.js';
// Side-effect import: install module-augmented prototype methods.
import './op-winding.js';
export * from './op-path.js';
export * from './op-path-writer.js';
export * from './op-edge-builder.js';
export * from './op-add-intersections.js';
export * from './op-path-ops-common.js';
export * from './op-path-ops-op.js';
export * from './arc-to-cubic.js';
