// Root barrel. Re-exports the foundational `runtime` surface (property
// system, observable collections, primitives, the marker DrawingContext
// interface, the Visual tree).
//
// `visual-engine` and `basic` are accessible via subpath imports
// (`mural/visual-engine`,
// `mural/basic`) — kept out of the root barrel so
// the `DrawingContext` re-export from `visual-engine` does not collide
// with the one from `runtime` (visual-engine augments the runtime
// interface via TS declaration merging).
export * from './runtime/index.js';
