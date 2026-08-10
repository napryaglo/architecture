import { type Point } from '../../visual-engine/index.js';
import { type Rect } from '../../runtime/index.js';
import { PortSide, type Port, type ResolvedPortSide } from './port.js';
import type { ConnectorEndpoint } from './connector-endpoint.js';
import type { ISideAnchoredConnector } from './figure.js';

// Duck-typed contract for a node that exposes Figure's side-endpoint
// surface. Both Figure and ShapeNodeVM implement this after B1.
// The connector reads it duck-typed (via asSideSlotHost in B2) so the
// two classes need not share a common base.
//
// Parameter order for _registerSideEndpoint matches the calling convention
// in connector.ts: (side, ep, onRebalance, owner?) — rebalance before owner.
export interface ISideEndpointHost
{
    readonly Ports: readonly Port[];
    GetSideSlot(ep: ConnectorEndpoint, side: ResolvedPortSide): { index: number; count: number } | undefined;
    GetSideEndpointCount(side: ResolvedPortSide): number;
    SlotIndexForPosition(side: ResolvedPortSide, cursor: Point): number | undefined;
    _registerSideEndpoint(side: ResolvedPortSide, ep: ConnectorEndpoint, onRebalance: () => void, owner?: unknown): void;
    _unregisterSideEndpoint(side: ResolvedPortSide, ep: ConnectorEndpoint): void;
}

// Reusable implementation of Figure's per-side endpoint registry.
// Holds NO Figure-specific state; bounds are supplied via a `bounds`
// callback so both Figure (ArrangedRect) and ShapeNodeVM (Left/Top/Width/Height
// built on the fly) can supply their coordinate frame without coupling
// this class to either host type.
export class SideEndpointRegistry
{
    private readonly _sideEndpoints: Map<ResolvedPortSide, ConnectorEndpoint[]> = new Map();
    private readonly _sideRebalanceCallbacks: Map<ConnectorEndpoint, () => void> = new Map();
    // Endpoint → owning Connector (duck-typed). The side-intersection
    // optimizer reads the owner's Geometry to detect crossings between
    // pairs of connectors on the same side; storing the back-reference
    // here avoids a quadratic scan through diagram.Connectors at every
    // optimize pass.
    private readonly _sideEndpointOwners: Map<ConnectorEndpoint, ISideAnchoredConnector> = new Map();

    constructor(private readonly bounds: () => Rect) {}

    /** @internal — called by Connector when an endpoint settles on this node + side.
     *  Parameter order mirrors Figure's public API: (side, ep, onRebalance, owner?). */
    public _registerSideEndpoint(
        side: ResolvedPortSide,
        endpoint: ConnectorEndpoint,
        onRebalance: () => void,
        owner?: unknown,
    ): void
    {
        let list = this._sideEndpoints.get(side);
        if (list === undefined) { list = []; this._sideEndpoints.set(side, list); }
        if (list.includes(endpoint)) return;
        list.push(endpoint);
        this._sideRebalanceCallbacks.set(endpoint, onRebalance);
        if (owner !== undefined) this._sideEndpointOwners.set(endpoint, owner as ISideAnchoredConnector);
        this._fireSideRebalance(side);
    }

    /** @internal — called by Connector when an endpoint moves off / clears. */
    public _unregisterSideEndpoint(side: ResolvedPortSide, endpoint: ConnectorEndpoint): void
    {
        const list = this._sideEndpoints.get(side);
        if (list === undefined) return;
        const idx = list.indexOf(endpoint);
        if (idx < 0) return;
        list.splice(idx, 1);
        this._sideRebalanceCallbacks.delete(endpoint);
        this._sideEndpointOwners.delete(endpoint);
        this._fireSideRebalance(side);
    }

    /** Slot index + total count for `endpoint` on `side`, or undefined
     *  if the endpoint isn't registered on that side. The slot index is
     *  insertion-order based, which keeps positions stable across
     *  unrelated additions to OTHER sides. */
    public GetSideSlot(
        endpoint: ConnectorEndpoint,
        side: ResolvedPortSide,
    ): { index: number; count: number } | undefined
    {
        const list = this._sideEndpoints.get(side);
        if (list === undefined) return undefined;
        const idx = list.indexOf(endpoint);
        if (idx < 0) return undefined;
        return { index: idx, count: list.length };
    }

    /** Number of side-anchored endpoints currently registered on `side`. */
    public GetSideEndpointCount(side: ResolvedPortSide): number
    {
        return this._sideEndpoints.get(side)?.length ?? 0;
    }

    /** Slot index whose dynamic position is nearest `cursor` along the
     *  side's distribution axis (Y for E/W, X for N/S), inverting the
     *  same Left/Top/Width/Height slot layout the resolver lays out in
     *  connector.ts's tryResolveSideSlot. Returns undefined when the
     *  side is empty or the host is unsized. */
    public SlotIndexForPosition(side: ResolvedPortSide, cursor: Point): number | undefined
    {
        const list = this._sideEndpoints.get(side);
        if (list === undefined || list.length === 0) return undefined;
        const count = list.length;
        const r = this.bounds();
        const vertical = side === PortSide.E || side === PortSide.W;   // distributes along Y
        const start = vertical ? r.Y    : r.X;
        const len   = vertical ? r.Height : r.Width;
        if (len <= 0) return undefined;
        const pos = vertical ? cursor.Y : cursor.X;
        // slotCenter(i) = start + (i + 1) / (count + 1) * len  →  invert for i.
        let idx = Math.round((pos - start) / len * (count + 1) - 1);
        if (idx < 0) idx = 0;
        if (idx > count - 1) idx = count - 1;
        return idx;
    }

    public _fireSideRebalance(side: ResolvedPortSide): void
    {
        const list = this._sideEndpoints.get(side);
        if (list === undefined) return;
        // Snapshot — listener may unregister mid-fire (a rebalance can
        // cascade through a Connector that detaches its previous side).
        for (const ep of [...list])
        {
            this._sideRebalanceCallbacks.get(ep)?.();
        }
    }

    /** Read-only view of the endpoint list for a side — used by the
     *  side optimizer in Figure._optimizeSideIntersections after the
     *  registry moved here. Returns an empty array if the side is absent. */
    public getSideList(side: ResolvedPortSide): ConnectorEndpoint[]
    {
        return this._sideEndpoints.get(side) ?? [];
    }

    /** Owner map accessor for the side optimizer. */
    public getOwner(ep: ConnectorEndpoint): ISideAnchoredConnector | undefined
    {
        return this._sideEndpointOwners.get(ep);
    }
}
