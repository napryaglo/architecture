import type { Diagram } from '../diagram.js';
import type { CombineRequestedArgs } from '../commands/combine.js';
import type { DeleteRequestedArgs } from '../commands/delete-ops.js';
import type { GroupRequestedArgs, UngroupRequestedArgs } from '../commands/group-ops.js';
import type { ItemDroppedArgs } from './canvas-drop-behavior.js';
import { TOOLBOX_NODE_KIND_FORMAT } from './canvas-drop-behavior.js';
import type { GeometryCombineMode } from '../commands/combine.js';

// Standard wiring between a Diagram's gesture events and a mutator that
// owns the data collection. Subscribes to Group / Ungroup / Combine /
// Delete / ItemDropped and forwards each to the matching method on
// `mutator`, passing the args' Items / Groups / Mode through so the
// mutator doesn't need to read selection state off the Diagram.
//
// The `mutator` interface duck-types onto framework's DiagramDocument
// directly — pass a DiagramDocument instance and everything wires up.
// Consumers with a custom data shape implement the same surface.

export interface DiagramMutator
{
    /** Wrap `items` in a new group. `items` is the top-level selection
     *  snapshot as captured by GroupRequestedArgs.Items. */
    Group(items: readonly unknown[]): void;

    /** Dissolve every group-shaped entry in `items`. */
    Ungroup(items: readonly unknown[]): void;

    /** Combine `items` via the selected mode. */
    CombineSelection(items: readonly unknown[], mode: GeometryCombineMode): void;

    /** Remove every entry in `items` from the data collection. */
    DeleteNodes(items: readonly unknown[]): void;

    /**
     * Materialize a new node of the named catalog kind at the given
     * canvas-local top-left coordinate. Return the created entity
     * (or null / undefined when the kind is unrecognized); the helper
     * sets it as the Diagram's SelectedItem when present so a fresh
     * drop lands already-selected.
     */
    CreateNode(kind: string, x: number, y: number): unknown | null | undefined;

    /**
     * Half-default-size, subtracted from cursor.x / y to map the cursor
     * onto the new node's TOP-LEFT. Defaults to (40, 40) — half of the
     * conventional 80 dp default node size.
     */
    readonly NodeDropOffset?: { readonly dx: number; readonly dy: number };
}

const DEFAULT_OFFSET = { dx: 40, dy: 40 };

export function attachStandardDiagramMutations(diagram: Diagram, mutator: DiagramMutator): () => void
{
    const offset = mutator.NodeDropOffset ?? DEFAULT_OFFSET;

    const onGroup    = (args: GroupRequestedArgs):   void => mutator.Group(args.Items);
    const onUngroup  = (args: UngroupRequestedArgs): void => mutator.Ungroup(args.Groups);
    const onCombine  = (args: CombineRequestedArgs): void => mutator.CombineSelection(args.Items, args.Mode);
    const onDelete   = (args: DeleteRequestedArgs):  void => mutator.DeleteNodes(args.Items);
    const onDropped  = (args: ItemDroppedArgs):      void => {
        const kind = args.Data.Get(TOOLBOX_NODE_KIND_FORMAT);
        if (typeof kind !== 'string') return;
        const node = mutator.CreateNode(kind, args.Position.X - offset.dx, args.Position.Y - offset.dy);
        if (node !== null && node !== undefined)
        {
            diagram.SelectedItem = node;
        }
    };

    diagram.AddGroupRequestedListener(onGroup);
    diagram.AddUngroupRequestedListener(onUngroup);
    diagram.AddCombineRequestedListener(onCombine);
    diagram.AddDeleteRequestedListener(onDelete);
    diagram.AddItemDroppedListener(onDropped);

    return (): void => {
        diagram.RemoveGroupRequestedListener(onGroup);
        diagram.RemoveUngroupRequestedListener(onUngroup);
        diagram.RemoveCombineRequestedListener(onCombine);
        diagram.RemoveDeleteRequestedListener(onDelete);
        diagram.RemoveItemDroppedListener(onDropped);
    };
}
