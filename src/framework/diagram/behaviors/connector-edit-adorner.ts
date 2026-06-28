import { Point } from '../../../visual-engine/index.js';
import type { Connector } from '../connector.js';
import { ConnectorEndpoint } from '../connector-endpoint.js';
import type { Figure } from '../figure.js';
import { type PortSide, type ResolvedPortSide } from '../port.js';
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
    | { readonly kind: 'waypoint'; readonly connector: Connector; readonly index: number; readonly snapshot: readonly Point[] }
    // Mid-segment drag: the segment between Waypoints[index] and
    // Waypoints[index+1] moves as a rigid bar PERPENDICULAR to itself.
    // `horizontal` is the segment's orientation (it lies along X), so a
    // horizontal segment moves vertically (cursor.Y drives both waypoints'
    // Y) and a vertical one moves horizontally (cursor.X drives both X).
    | { readonly kind: 'segment'; readonly connector: Connector; readonly index: number; readonly horizontal: boolean; readonly snapshot: readonly Point[] };

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

    /** Begin dragging the segment between Waypoints[index] and
     *  Waypoints[index+1]. The segment translates perpendicular to its
     *  own orientation — a horizontal segment up/down, a vertical one
     *  left/right — so the two waypoints move together and the segment
     *  stays axis-aligned. Orientation is locked at grab time (dominant
     *  axis of the segment vector) so a near-degenerate drag can't flip
     *  it mid-gesture. */
    public BeginSegmentDrag(connector: Connector, segmentIndex: number): void
    {
        if (this._state.kind !== 'idle') this.Abort();
        const wps = connector.Waypoints;
        if (wps === undefined || segmentIndex < 0 || segmentIndex + 1 >= wps.length) return;
        this._state = {
            kind: 'segment',
            connector,
            index: segmentIndex,
            horizontal: segmentIsHorizontal(wps[segmentIndex]!, wps[segmentIndex + 1]!),
            snapshot: wps.slice(),
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
            return;
        }
        if (this._state.kind === 'segment')
        {
            const { index, horizontal } = this._state;
            const wps = this._state.connector.Waypoints ?? [];
            if (index + 1 >= wps.length) return;
            const a = wps[index]!;
            const b = wps[index + 1]!;
            const next: Point[] = wps.slice();
            // Perpendicular translation: a horizontal segment keeps each
            // waypoint's X and snaps both Y to the cursor; a vertical one
            // keeps each Y and snaps both X. The constrained axis is read
            // from the live waypoints so the segment stays put on that
            // axis while the free axis tracks the cursor.
            if (horizontal)
            {
                next[index]     = new Point(a.X, cursor.Y);
                next[index + 1] = new Point(b.X, cursor.Y);
            }
            else
            {
                next[index]     = new Point(cursor.X, a.Y);
                next[index + 1] = new Point(cursor.X, b.Y);
            }
            this._state.connector.Waypoints = next;
        }
    }

    public EndDragOverTarget(targetFigure: Figure, targetSide: ResolvedPortSide): void
    {
        if (this._state.kind !== 'endpoint') return;
        const ep = endpointOf(this._state.connector, this._state.end);
        if (ep === undefined)
        {
            this._state = { kind: 'idle' };
            return;
        }
        ep.FreePoint = undefined;
        ep.PortName  = undefined;
        ep.PortIndex = undefined;
        ep.Node      = targetFigure;
        ep.PortSide  = targetSide;
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
        if (this._state.kind === 'waypoint' || this._state.kind === 'segment')
        {
            // Commit: the waypoint(s) stay at their last position.
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
        else if (this._state.kind === 'waypoint' || this._state.kind === 'segment')
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

// A segment counts as horizontal when it spans more along X than Y — for a
// clean orthogonal route that's exact (dy === 0), and the dominant-axis
// tie-break keeps a near-axis-aligned segment from picking the wrong drag
// direction. Equal spans (including a degenerate zero-length segment)
// resolve to horizontal. Shared with the adorner's handle placement +
// cursor so the visual and the gesture always agree on orientation.
export function segmentIsHorizontal(a: Point, b: Point): boolean
{
    return Math.abs(b.X - a.X) >= Math.abs(b.Y - a.Y);
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
