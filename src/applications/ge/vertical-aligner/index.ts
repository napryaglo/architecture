// Stage 9 — Vertical Alignment.
// Interface and concrete implementations for the final post-position
// alignment pass. Refines x-coordinates so connected chains render
// as clean vertical lines, without disturbing the within-layer
// left-to-right ordering produced by upstream stages.
export { type IVerticalAligner }       from './vertical-aligner.js';
export { BarycenterVerticalAligner }   from './barycenter-vertical-aligner.js';
