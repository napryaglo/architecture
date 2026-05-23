import type { Point } from '../../../runtime/index.js';
import type { Graph } from '../graph.js';

// A Layout converts graph topology into per-node 2D positions.
// Returns a map keyed by Node.Id — the scene builder reads positions
// from this map when constructing NodeVisuals and EdgeVisuals.
//
// Layouts are pure: same Graph in, same positions out. Stateful
// algorithms (force-directed simulation, layered DAG flow) can still
// implement this by running the simulation in Apply and returning the
// final positions.
export interface ILayout
{
    Apply(graph: Graph): Map<string, Point>;
}
