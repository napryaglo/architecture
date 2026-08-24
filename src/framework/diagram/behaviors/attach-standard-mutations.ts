import type { Diagram } from '../diagram.js';
import type { CombineRequestedArgs } from '../commands/combine.js';
import type { DeleteRequestedArgs } from '../commands/delete-ops.js';
import type { GroupRequestedArgs, UngroupRequestedArgs } from '../commands/group-ops.js';
import type { WrapRequestedArgs, UnwrapRequestedArgs } from '../commands/container-ops.js';
import { Application, Point } from '../../../runtime/index.js';
import type { ItemDroppedArgs } from './canvas-drop-behavior.js';
import { TOOLBOX_ITEM_FORMAT } from './canvas-drop-behavior.js';
import { ToolboxRepository } from '../toolbox/toolbox-repository.js';
import { Figure } from '../figure.js';
import { ContentContainerFigure } from '../content-container-figure.js';
import type { GeometryCombineMode } from '../commands/combine.js';
import type { Connector } from '../connector.js';
import type { ConnectorEndpoint } from '../connector-endpoint.js';
import type { ConnectorCreatedArgs } from './connector-create-behavior.js';
import type { NodeViewModel } from '../node-view-model.js';

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

    /** Wrap the top-level Figures in `items` in a new container node. */
    WrapInContainer(items: readonly unknown[]): void;

    /** Dissolve every ContainerFigure in `items`, keeping its children. */
    UnwrapContainer(items: readonly unknown[]): void;

    /** Combine `items` via the selected mode. */
    CombineSelection(items: readonly unknown[], mode: GeometryCombineMode): void;

    /** Remove every entry in `items` from the data collection. */
    DeleteNodes(items: readonly unknown[]): void;

    /** Remove every entry in `connectors` from the data collection.
     *  Optional: mutators that don't carry a connectors collection
     *  (the legacy node-only diagram) simply omit this method, and
     *  the attach helper skips the connector branch of DeleteRequested
     *  when it's missing. */
    DeleteConnectors?(connectors: readonly Connector[]): void;

    /**
     * Materialize a new node of the named catalog kind at the given
     * canvas-local top-left coordinate. Return the created entity
     * (or null / undefined when the kind is unrecognized); the helper
     * sets it as the Diagram's SelectedItem when present so a fresh
     * drop lands already-selected.
     */
    CreateNode(kind: string, x: number, y: number): unknown | null | undefined;

    /**
     * Add a pre-built node view-model to the diagram's data collection.
     * Used by downstream consumers to insert already-constructed VMs
     * without going through the CreateNode factory path.
     */
    AddNode(node: NodeViewModel): void;

    /** Materialize a new Connector with the proposed Source / Target
     *  endpoints from a drag-create gesture. Optional, same reasoning
     *  as DeleteConnectors. */
    CreateConnector?(source: ConnectorEndpoint, target: ConnectorEndpoint): Connector | null | undefined;

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
    const onWrap     = (args: WrapRequestedArgs):    void => mutator.WrapInContainer(args.Items);
    const onUnwrap   = (args: UnwrapRequestedArgs):  void => mutator.UnwrapContainer(args.Containers);
    const onCombine  = (args: CombineRequestedArgs): void => mutator.CombineSelection(args.Items, args.Mode);
    const onDelete   = (args: DeleteRequestedArgs):  void => {
        mutator.DeleteNodes(args.Items);
        if (mutator.DeleteConnectors !== undefined && args.Connectors.length > 0)
        {
            mutator.DeleteConnectors(args.Connectors);
        }
    };
    const onDropped  = (args: ItemDroppedArgs):      void => {
        // The payload carries the dropped item's id. Look it up in the
        // repository, resolve its factory, and let the factory materialize
        // the node (shapes → mutator.CreateNode; picture-backed kinds →
        // their own figure). The NodeDropOffset maps the cursor onto the
        // new node's top-left.
        const id = args.Data.Get(TOOLBOX_ITEM_FORMAT);
        if (typeof id !== 'string') return;
        const services = Application.current?.Services;
        const item = services?.get(ToolboxRepository.Key)?.ItemById(id);
        if (item === undefined || item.Descriptor === undefined) return;
        const factory = services?.get(item.FactoryKey);
        if (factory === undefined) return;
        const node = factory.CreateDropped({
            Item:       item,
            Descriptor: item.Descriptor,
            Position:   new Point(args.Position.X - offset.dx, args.Position.Y - offset.dy),
            Diagram:    diagram,
            Mutator:    mutator,
            TargetContainer: args.TargetContainer,
        });
        if (node !== null && node !== undefined)
        {
            // Generic-container adoption (Case 3): a node dropped inside a plain
            // ContainerFigure is nested into it, visual-only. A model-backed
            // container (ContentContainerFigure) is NOT adopted here — its host
            // factory owns validation + the model containment ref.
            const target = args.TargetContainer;
            if (node instanceof Figure && target !== undefined
                && !(target instanceof ContentContainerFigure))
            {
                diagram.ContainerPlacement.reparent(node, target.Id);
            }
            diagram.SelectedItem = node;
        }
    };
    const onConnectorCreated = (args: ConnectorCreatedArgs): void => {
        if (mutator.CreateConnector !== undefined)
        {
            mutator.CreateConnector(args.Source, args.Target);
        }
    };

    diagram.AddGroupRequestedListener(onGroup);
    diagram.AddUngroupRequestedListener(onUngroup);
    diagram.AddWrapRequestedListener(onWrap);
    diagram.AddUnwrapRequestedListener(onUnwrap);
    diagram.AddCombineRequestedListener(onCombine);
    diagram.AddDeleteRequestedListener(onDelete);
    diagram.AddItemDroppedListener(onDropped);
    diagram.AddConnectorCreatedListener(onConnectorCreated);

    return (): void => {
        diagram.RemoveGroupRequestedListener(onGroup);
        diagram.RemoveUngroupRequestedListener(onUngroup);
        diagram.RemoveWrapRequestedListener(onWrap);
        diagram.RemoveUnwrapRequestedListener(onUnwrap);
        diagram.RemoveCombineRequestedListener(onCombine);
        diagram.RemoveDeleteRequestedListener(onDelete);
        diagram.RemoveItemDroppedListener(onDropped);
        diagram.RemoveConnectorCreatedListener(onConnectorCreated);
    };
}
