// Stage 11 — Port Assignment.
// Interface and concrete implementations for choosing where on each
// node's boundary the incoming / outgoing edges connect. Runs after
// the vertical aligner; the edge router substitutes ports for
// chain endpoints when drawing.
export { type IPortAssigner, type EdgePorts } from './port-assigner.js';
export { CardinalPortAssigner }               from './cardinal-port-assigner.js';
export { DistributedPortAssigner }            from './distributed-port-assigner.js';
