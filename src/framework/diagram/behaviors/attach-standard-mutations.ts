import type { Diagram } from '../diagram.js';
import type { CombineRequestedArgs } from '../commands/combine.js';
import type { DeleteRequestedArgs } from '../commands/delete-ops.js';
import type { ItemDroppedArgs } from './canvas-drop-behavior.js';
import { TOOLBOX_NODE_KIND_FORMAT } from './canvas-drop-behavior.js';
import type { GeometryCombineMode } from '../commands/combine.js';

// Standard wiring between a Diagram's gesture events and a consumer VM
// that owns the data collection. The framework's command surface is
// deliberately event-based — Diagram doesn't know where the items live,
// nor how to wrap or dissolve a group — so consumers normally subscribe
// to GroupRequested / UngroupRequested / CombineRequested / DeleteRequested
// / ItemDropped and translate each into a method on their VM. That
// wiring is identical across almost every Diagram-shaped demo, so this
// helper ships it once and the bootstrap shrinks to one call.
//
// The `mutator` interface duck-types onto the VM directly — pass the
// VM itself when its method names match. The helper makes no field /
// method calls outside this interface, so a VM that uses different
// names plugs in through a thin adapter.
//
// `Position` from ItemDropped is the cursor's CANVAS-LOCAL coordinate.
// CreateNode takes a TOP-LEFT coordinate, so the helper subtracts a
// half-default-size offset (matches the user's expectation that a
// dropped tile lands centered on the cursor). Override via
// `NodeDropOffset` when the consumer's default node size differs.

export interface DiagramMutator
{
    /** Called from the framework's GroupRequested listener. */
    Group(): void;

    /** Called from the framework's UngroupRequested listener. */
    Ungroup(): void;

    /** Called with the merge mode the user picked (Union / Intersect / Subtract / Exclude). */
    CombineSelection(mode: GeometryCombineMode): void;

    /** Called with the SelectedItems snapshot at the moment the user pressed Delete. */
    DeleteNodes(items: readonly unknown[]): void;

    /**
     * Called from the framework's ItemDropped listener with the canvas-
     * local TOP-LEFT coordinate after the cursor-centering offset.
     * Returns the created entity (or null / undefined when the kind is
     * unrecognized); the helper sets it as the Diagram's SelectedItem
     * when present so a fresh drop lands already-selected.
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

    const onGroup    = (): void => mutator.Group();
    const onUngroup  = (): void => mutator.Ungroup();
    const onCombine  = (args: CombineRequestedArgs): void => mutator.CombineSelection(args.Mode);
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
