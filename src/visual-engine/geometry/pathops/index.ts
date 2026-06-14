// Phase 1 barrel — re-exports the curve-math primitives ported from
// Skia's src/pathops/. The boolean engine + intersection routines
// land in later phases (see current-backlog.md § 19.5–19.8).

export * from './types.js';
export * from './point.js';
export * from './rect.js';
export * from './line.js';
export * from './quad.js';
export * from './cubic.js';
