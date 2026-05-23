// Stage 3 — Layer Improver.
// Interface and concrete implementations for the optional layer-
// assignment refinement step. Runs between initial layering and
// within-layer reordering.
export { type ILayerImprover }           from './layer-improver.js';
export { AdjacentLayerMoveImprover }    from './adjacent-layer-move-improver.js';
