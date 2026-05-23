import type { Point } from '../../../runtime/index.js';
import type { Edge } from '../graph.js';

// Counts edge crossings in the final RENDERED layout, treating each
// edge as a straight line segment between its endpoints' positions.
// "Geometric" here means we measure crossings as they appear in the
// drawn SVG — multi-layer edges contribute their full slant, not
// just adjacent-layer transitions.
export interface IGeometricCrossingCounter
{
    Count(positions: Map<string, Point>, edges: Edge[]): number;
}

// Counts edge crossings restricted to ADJACENT-LAYER edges using the
// classical sweep-style metric: for every pair of edges (u_a → v_a)
// and (u_b → v_b) that both span layer L → L+1, they cross iff
// (u_a, u_b)'s relative order on L is opposite to (v_a, v_b)'s on
// L+1. Multi-layer edges are silently skipped because the notion of
// "crossing" between two layers isn't well-defined without an
// expanded (dummy-node) representation.
//
// Used by the reorderer/improver stages as their internal cost
// metric; what those algorithms optimize directly.
export interface IAdjacentCrossingCounter
{
    Count(layers: string[][], edges: Edge[]): number;
}
