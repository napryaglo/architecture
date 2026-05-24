// Stage 8 — Position Computation.
// Interface and concrete implementations for turning a final layer
// ordering into (x, y) coordinates for each node. This is the last
// stage of the pipeline; downstream is rendering.
export { type IPositionComputer }        from './position-computer.js';
export { CenteredGridPositionComputer }  from './centered-grid-position-computer.js';
export { BrandesKopfPositionComputer }   from './brandes-kopf-position-computer.js';
