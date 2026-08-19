import { Rect } from '../../runtime/index.js';
import { type Point } from '../../visual-engine/index.js';
import { NodeViewModel } from './node-view-model.js';
import { type Port, type ResolvedPortSide } from './port.js';
import { resolveDefaultPortProvider } from './port-providers/default-port-providers.js';
import { SideEndpointRegistry, type ISideEndpointHost } from './side-endpoint-host.js';
import type { ConnectorEndpoint } from './connector-endpoint.js';

// A NodeViewModel that participates in the connector side-endpoint registry:
// endpoints anchored to one of its sides distribute into slots, rebalance as
// the count changes, and surface per-slot port markers — the behavior a
// connector's asSideSlotHost() duck-type gates on (connector.ts).
//
// Composes a shared SideEndpointRegistry keyed off the VM's Left/Top/Width/
// Height (the nodeRect() convention connector.ts uses for VM-backed
// endpoints). Subclasses that want side-connectable behavior extend this
// instead of NodeViewModel directly: ShapeNodeVM (geometry shapes), ArchNodeVM
// (architecture items).
//
// Kind drives the default port provider. A plain box VM leaves Kind='' →
// FALLBACK bbox ports (one per cardinal side); a geometry-bearing subclass
// (ShapeNodeVM) overrides Kind with its catalog kind so ellipse/triangle/etc.
// pick their specialized provider.
export class SideConnectableNodeVM extends NodeViewModel implements ISideEndpointHost
{
    private readonly _sideHost = new SideEndpointRegistry(
        () => new Rect(this.Left, this.Top, this.Width, this.Height),
    );

    /** Default port-provider key. '' → bbox ports; subclasses override. */
    public get Kind(): string { return ''; }

    public get Ports(): readonly Port[]
    {
        return resolveDefaultPortProvider().GetPorts(this);
    }

    // IPortHost surface — bbox port resolution reads ArrangedRect; also the
    // nodeRect() convention connector.ts uses for VM-backed endpoints.
    public get ArrangedRect(): Rect { return new Rect(this.Left, this.Top, this.Width, this.Height); }

    public GetSideSlot(
        endpoint: ConnectorEndpoint,
        side: ResolvedPortSide,
    ): { index: number; count: number } | undefined
    {
        return this._sideHost.GetSideSlot(endpoint, side);
    }

    public GetSideEndpointCount(side: ResolvedPortSide): number
    {
        return this._sideHost.GetSideEndpointCount(side);
    }

    public SlotIndexForPosition(side: ResolvedPortSide, cursor: Point): number | undefined
    {
        return this._sideHost.SlotIndexForPosition(side, cursor);
    }

    public _registerSideEndpoint(
        side: ResolvedPortSide,
        endpoint: ConnectorEndpoint,
        onRebalance: () => void,
        owner?: unknown,
    ): void
    {
        this._sideHost._registerSideEndpoint(side, endpoint, onRebalance, owner);
    }

    public _unregisterSideEndpoint(side: ResolvedPortSide, endpoint: ConnectorEndpoint): void
    {
        this._sideHost._unregisterSideEndpoint(side, endpoint);
    }

    // Delegates to the shared registry's optimizer so a box/arch/shape VM
    // fans its side connectors out to minimise crossings on attach and on
    // move — the same behaviour Figure gets. Previously only Figure carried
    // this method, so connectors on VM-backed nodes were never optimised.
    public _optimizeSideIntersections(side: ResolvedPortSide): void
    {
        this._sideHost.optimizeIntersections(side);
    }
}
