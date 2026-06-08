// Root barrel. Re-exports the foundational `runtime` surface (property
// system, observable collections, primitives, the marker DrawingContext
// interface, the Visual tree).
//
// `visual-engine` and `Basic` are accessible via subpath imports
// (`@visualisation-sub/mural/visual-engine`,
// `@visualisation-sub/mural/Basic`) — kept out of the root barrel so
// the `DrawingContext` re-export from `visual-engine` does not collide
// with the one from `runtime` (visual-engine augments the runtime
// interface via TS declaration merging).
export * from './runtime/index.js';
