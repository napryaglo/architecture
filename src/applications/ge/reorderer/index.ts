// Stage 6 — Within-Layer Reordering.
// Interface and concrete implementations for the main crossing-
// reduction stage. Operates on the expanded (dummy-augmented) layer
// structure produced by stage 5.
export { type IReorderer }          from './reorderer.js';
export { BarycenterReorderer }      from './barycenter-reorderer.js';
export { MedianReorderer }          from './median-reorderer.js';
