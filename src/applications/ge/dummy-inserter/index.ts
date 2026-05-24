// Stage 5 — Dummy Insertion.
// Interface and concrete implementations for breaking multi-layer
// edges into chains of unit-length edges through dummy nodes.
// Required by Sugiyama-style crossing reduction so every edge is
// visible to the reorderer's adjacent-layer sweep.
export { type IDummyInserter, type DummyInsertionResult } from './dummy-inserter.js';
export { ChainDummyInserter }                              from './chain-dummy-inserter.js';
export { SparseDummyInserter }                             from './sparse-dummy-inserter.js';
