// Crossing counters — diagnostic strategies for measuring how many
// edge crossings the current layout produces. The pipeline uses two:
//   * Geometric — measured on final positions; matches the SVG.
//   * Adjacent  — measured on adjacent-layer pairs in the expanded
//                 (dummy-augmented) ordering; matches what the
//                 reorderer/improver heuristics actually optimize.
export {
    type IGeometricCrossingCounter,
    type IAdjacentCrossingCounter,
} from './crossing-counter.js';
export { GeometricCrossingCounter } from './geometric-crossing-counter.js';
export { AdjacentCrossingCounter }  from './adjacent-crossing-counter.js';
