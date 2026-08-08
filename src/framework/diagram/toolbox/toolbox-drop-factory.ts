import type { Point } from '../../../runtime/index.js';
import type { ToolboxVisualDescriptor } from './toolbox-visual-descriptor.js';
import type { ToolboxItem } from './toolbox-item.js';
import type { Diagram } from '../diagram.js';
import type { DiagramMutator } from '../behaviors/attach-standard-mutations.js';

// Everything a factory needs to turn a dropped item into a canvas node.
export interface ToolboxDropContext
{
    readonly Item:       ToolboxItem;
    readonly Descriptor: ToolboxVisualDescriptor;
    readonly Position:   Point;   // canvas-local top-left (offset already applied)
    readonly Diagram:    Diagram;
    readonly Mutator:    DiagramMutator;
}

// Creates the selectable/movable node, mutating the document through the
// Mutator, and returns the created node (for selection) or null. May
// delegate the node's picture to the descriptor's resolver, or build
// intrinsic geometry directly (shapes).
export interface IToolboxDropFactory
{
    CreateDropped(context: ToolboxDropContext): unknown | null;
}
