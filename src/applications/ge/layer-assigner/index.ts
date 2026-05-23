// Stage 2 — Layer Assignment.
// Interface and concrete implementations for assigning each node to
// a layer (depth). Runs first in the pipeline; downstream stages
// (LayerImprover, Reorderer, ...) operate on this assignment.
export { type ILayerAssigner }      from './layer-assigner.js';
export { LongestPathLayerAssigner } from './longest-path-layer-assigner.js';
