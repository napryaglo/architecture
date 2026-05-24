// Stage 10 — Edge Routing.
// Interface and concrete implementations for turning each original
// edge into a polyline of waypoints. Runs after position computation
// + vertical alignment; bends long edges through their dummy chain
// instead of drawing direct diagonals.
export { type IEdgeRouter }      from './edge-router.js';
export { PolylineEdgeRouter }     from './polyline-edge-router.js';
export { OrthogonalEdgeRouter }   from './orthogonal-edge-router.js';
export { StraightLineEdgeRouter } from './straight-line-edge-router.js';
