import { Point } from '../../../visual-engine/index.js';
import type { Connector } from '../connector.js';
import { ConnectorEndpoint } from '../connector-endpoint.js';
import type { Figure } from '../figure.js';
import { type Port, type PortSide } from '../port.js';
import { ConnectorEnd } from '../routing/router.js';

// Snapshot of a ConnectorEndpoint's 5 DPs taken at the start of a
// drag, so an aborted gesture (PointerUp over empty space) can
// restore the endpoint exactly as it was before the drag began.
interface EndpointSnapshot
{
    Node:      Model | undefined;
    PortName:  string | undefined;
    PortSide:  PortSide | undefined;
    PortIndex: number | undefined;
    FreePoint: Point | undefined;
}

// Forwards into the runtime's Model type without dragging an import
// (this file's only contact with Model is through the endpoint).
type Model = ConnectorEndpoint['Node'];

type DragState =
    | { readonly kind: 'idle' }
    | { readonly kind: 'endpoint'; readonly connector: Connector; readonly end: ConnectorEnd; readonly snapshot: EndpointSnapshot }
    | { readonly kind: 'waypoint'; readonly connector: Connector; readonly index: number; readonly snapshot: readonly Point[] };

// State machine for edit-mode connector gestures per § 4.2 + § 4.3 of
// [src/document/connectors.md](../../../document/connectors.md).
// Visual rendering of the handles (endpoint dots + waypoint dots +
// mid-segment ghosts) lives in a follow-up; the state machine here is
// what the visual layer's pointer handlers call into.
//
// Endpoint re-anchor (§ 4.2):
//   BeginEndpointDrag(c, end, cursor) — snapshots the endpoint, clears
//     its port-ref fields, sets FreePoint = cursor. The connector
//     immediately re-routes to follow the cursor at that end.
//   UpdateCursor(cursor) — flows into FreePoint.
//   EndDragOverTarget(figure, port) — sets Node = figure, clears
//     FreePoint, writes PortName when port has a Name (anonymous /
//     no-port-hit fall through to path-4 auto-pick).
//   EndDragOverEmpty()   — restores the endpoint from snapshot.
//
// Waypoint editing (§ 4.3):
//   BeginWaypointDrag(c, index) — snapshots the Waypoints array.
//   InsertWaypointAndDrag(c, index, point) — inserts at index then
//     enters waypoint drag at that index (the dragged waypoint is the
//     just-inserted one; abort removes it).
//   UpdateCursor(cursor)   — moves the dragged waypoint.
//   EndDragOverEmpty()     — commits the current position (waypoint
//     drags have no "target" notion; PointerUp anywhere ends the drag
//     at the last cursor).
//   RemoveWaypoint(c, index) — imperative removal (the right-click
//     handler + Backspace path both call into this).
//
// Abort() is shared by both modes: restore from snapshot.
export class ConnectorEditAdorner
{
    private _state: DragState = { kind: 'idle' };

    public get IsActive(): boolean { return this._state.kind !== 'idle'; }

    public BeginEndpointDrag(connector: Connector, end: ConnectorEnd, cursor: Point): void
    {
        if (this._state.kind !== 'idle') this.Abort();
        const ep = endpointOf(connector, end);
        if (ep === undefined) return;
        const snapshot: EndpointSnapshot = {
            Node:      ep.Node,
            PortName:  ep.PortName,
            PortSide:  ep.PortSide,
            PortIndex: ep.PortIndex,
            FreePoint: ep.FreePoint,
        };
        // § 4.2: PointerDown immediately clears port-ref + sets
        // FreePoint. The connector re-routes the affected end to the
        // cursor on the next OnPropertyChanged flush.
        ep.Node      = undefined;
        ep.PortName  = undefined;
        ep.PortSide  = undefined;
        ep.PortIndex = undefined;
        ep.FreePoint = cursor;
        this._state = { kind: 'endpoint', connector, end, snapshot };
    }

    public BeginWaypointDrag(connector: Connector, waypointIndex: number): void
    {
        if (this._state.kind !== 'idle') this.Abort();
        const wps = connector.Waypoints;
        if (wps === undefined || waypointIndex < 0 || waypointIndex >= wps.length) return;
        this._state = {
            kind: 'waypoint', connector, index: waypointIndex, snapshot: wps.slice(),
        };
    }

    public InsertWaypointAndDrag(connector: Connector, insertIndex: number, point: Point): void
    {
        if (this._state.kind !== 'idle') this.Abort();
        const wps = connector.Waypoints ?? [];
        // Snapshot first — the array BEFORE the insertion. Abort
        // restores by overwriting with the snapshot, which doesn't
        // contain the new waypoint.
        const snapshot = wps.slice();
        const next: Point[] = [...wps.slice(0, insertIndex), point, ...wps.slice(insertIndex)];
        connector.Waypoints = next;
        this._state = { kind: 'waypoint', connector, index: insertIndex, snapshot };
    }

    public UpdateCursor(cursor: Point): void
    {
        if (this._state.kind === 'endpoint')
        {
            const ep = endpointOf(this._state.connector, this._state.end);
            if (ep !== undefined) ep.FreePoint = cursor;
            return;
        }
        if (this._state.kind === 'waypoint')
        {
            const wps = this._state.connector.Waypoints ?? [];
            const next: Point[] = wps.slice();
            next[this._state.index] = cursor;
            this._state.connector.Waypoints = next;
        }
    }

    public EndDragOverTarget(targetFigure: Figure, targetPort: Port | undefined): void
    {
        if (this._state.kind !== 'endpoint') return;
        const ep = endpointOf(this._state.connector, this._state.end);
        if (ep === undefined)
        {
            this._state = { kind: 'idle' };
            return;
        }
        ep.FreePoint = undefined;
        ep.Node      = targetFigure;
        if (targetPort !== undefined && targetPort.Name !== '')
        {
            ep.PortName = targetPort.Name;
        }
        // Anonymous ports + no-port-hit leave the endpoint with just
        // Node set; path-4 auto-pick handles the rest.
        this._state = { kind: 'idle' };
    }

    public EndDragOverEmpty(): void
    {
        if (this._state.kind === 'endpoint')
        {
            // Restore snapshot.
            const ep = endpointOf(this._state.connector, this._state.end);
            if (ep !== undefined) applyEndpointSnapshot(ep, this._state.snapshot);
            this._state = { kind: 'idle' };
            return;
        }
        if (this._state.kind === 'waypoint')
        {
            // Commit: waypoint stays at last cursor position.
            this._state = { kind: 'idle' };
        }
    }

    public Abort(): void
    {
        if (this._state.kind === 'endpoint')
        {
            const ep = endpointOf(this._state.connector, this._state.end);
            if (ep !== undefined) applyEndpointSnapshot(ep, this._state.snapshot);
        }
        else if (this._state.kind === 'waypoint')
        {
            this._state.connector.Waypoints = this._state.snapshot;
        }
        this._state = { kind: 'idle' };
    }

    public RemoveWaypoint(connector: Connector, waypointIndex: number): void
    {
        const wps = connector.Waypoints;
        if (wps === undefined || waypointIndex < 0 || waypointIndex >= wps.length) return;
        const next: Point[] = wps.filter((_, i) => i !== waypointIndex);
        connector.Waypoints = next;
    }
}

function endpointOf(c: Connector, end: ConnectorEnd): ConnectorEndpoint | undefined
{
    return end === ConnectorEnd.Source ? c.Source : c.Target;
}

function applyEndpointSnapshot(ep: ConnectorEndpoint, s: EndpointSnapshot): void
{
    ep.Node      = s.Node;
    ep.PortName  = s.PortName;
    ep.PortSide  = s.PortSide;
    ep.PortIndex = s.PortIndex;
    ep.FreePoint = s.FreePoint;
}

export function attachConnectorEditAdorner(): { adorner: ConnectorEditAdorner; detach: () => void }
{
    const adorner = new ConnectorEditAdorner();
    return {
        adorner,
        detach: (): void => adorner.Abort(),
    };
}
