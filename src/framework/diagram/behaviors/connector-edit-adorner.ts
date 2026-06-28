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
    // Mid-segment drag: a segment of the RENDERED route (including the
    // L/Z corners an Orthogonal route computes from zero user waypoints)
    // moves as a rigid bar PERPENDICULAR to itself — a horizontal segment
    // up/down, a vertical one left/right. BeginSegmentDrag materializes
    // the route into Waypoints and (for a port-adjacent segment) inserts a
    // fixed jog anchor, leaving exactly two MOVING waypoints that bound the
    // grabbed segment. `moveA`/`moveB` are their indices in Waypoints;
    // `keepA`/`keepB` are their constrained-axis coordinate (X for a
    // horizontal segment, Y for a vertical one) held constant while the
    // free axis tracks the cursor.
    | {
          readonly kind: 'segment';
          readonly connector: Connector;
          readonly horizontal: boolean;
          readonly moveA: number;
          readonly moveB: number;
          readonly keepA: number;
          readonly keepB: number;
          readonly snapshot: readonly Point[];
      };

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

    /** The connector the in-flight gesture targets, or undefined when
     *  idle. Lets the owner abort a drag whose connector was deleted
     *  out from under it. */
    public get ActiveConnector(): Connector | undefined
    {
        return this._state.kind === 'idle' ? undefined : this._state.connector;
    }

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

    /** Begin dragging segment `segmentIndex` of the connector's RENDERED
     *  route (`CurrentRoutePoints`: source → bends → target). The segment
     *  translates perpendicular to its own orientation — horizontal
     *  up/down, vertical left/right — staying axis-aligned. Orientation is
     *  locked at grab time so a near-degenerate drag can't flip it.
     *
     *  The route's bends usually aren't user Waypoints (an Orthogonal
     *  route computes its L/Z corners internally from zero waypoints), so
     *  the gesture first MATERIALIZES the route's interior corners into
     *  Waypoints — shape-preserving, because the router reproduces corners
     *  that sit on the port outward rays. A segment touching a pinned port
     *  (source / target) can't translate rigidly on its own, so a fixed
     *  jog anchor plus a coincident moving waypoint are inserted a stub in
     *  from that port: the anchor keeps the port's outward leg while the
     *  moving end and the jog between them follow the cursor. The result
     *  is always two moving waypoints bounding the grabbed segment. */
    public BeginSegmentDrag(connector: Connector, segmentIndex: number): void
    {
        if (this._state.kind !== 'idle') this.Abort();
        const route = connector.CurrentRoutePoints;
        if (route === undefined || segmentIndex < 0 || segmentIndex + 1 >= route.length) return;

        const i = segmentIndex;
        const n = route.length - 1;          // route[n] === target anchor
        const near = route[i]!;
        const far  = route[i + 1]!;
        const horizontal = segmentIsHorizontal(near, far);
        const snapshot = (connector.Waypoints ?? []).slice();

        const sourcePinned = i === 0;
        const targetPinned = i + 1 === n;

        // Jog anchor offset from a pinned port. Kept past the router's own
        // port stub so the port→anchor leg collapses to a straight run
        // instead of provoking an extra router bend; clamped to half the
        // segment so the anchor stays inside it (short segments get a
        // proportionally smaller, still-valid jog).
        const segLen = horizontal ? Math.abs(far.X - near.X) : Math.abs(far.Y - near.Y);
        const jog = segLen > 2 * SEG_JOG_STUB ? SEG_JOG_STUB + JOG_MARGIN : segLen / 2;

        // Interior corners strictly outside the grabbed segment carry over
        // unchanged (route[1..i-1] on the left, route[i+2..n-1] on the right).
        const next: Point[] = route.slice(1, i);

        let moveA: number;
        let moveB: number;

        if (sourcePinned)
        {
            const anchor = pointAlong(near, far, jog, horizontal);
            next.push(anchor);                 // fixed jog anchor
            next.push(anchor);                 // moving near end (coincident at start)
            moveA = next.length - 1;
        }
        else
        {
            next.push(near);                   // real corner → moves directly
            moveA = next.length - 1;
        }

        if (targetPinned)
        {
            const anchor = pointAlong(far, near, jog, horizontal);
            next.push(anchor);                 // moving far end (coincident at start)
            moveB = next.length - 1;
            next.push(anchor);                 // fixed jog anchor
        }
        else
        {
            next.push(far);                    // real corner → moves directly
            moveB = next.length - 1;
        }

        next.push(...route.slice(i + 2, n));

        const keepA = horizontal ? next[moveA]!.X : next[moveA]!.Y;
        const keepB = horizontal ? next[moveB]!.X : next[moveB]!.Y;

        connector.Waypoints = next;
        this._state = { kind: 'segment', connector, horizontal, moveA, moveB, keepA, keepB, snapshot };
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
            const { connector, horizontal, moveA, moveB, keepA, keepB } = this._state;
            const next: Point[] = (connector.Waypoints ?? []).slice();
            if (moveA >= next.length || moveB >= next.length) return;
            // Perpendicular translation: the two moving waypoints hold
            // their constrained-axis coordinate (keepA / keepB) and snap
            // their free axis to the cursor. Any fixed jog anchor inserted
            // at a pinned port is left untouched, so it keeps the port's
            // outward leg while the grabbed segment slides.
            if (horizontal)
            {
                next[moveA] = new Point(keepA, cursor.Y);
                next[moveB] = new Point(keepB, cursor.Y);
            }
            else
            {
                next[moveA] = new Point(cursor.X, keepA);
                next[moveB] = new Point(cursor.X, keepB);
            }
            connector.Waypoints = next;
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
        if (this._state.kind === 'waypoint')
        {
            // Commit: the waypoint stays at its last position.
            this._state = { kind: 'idle' };
            return;
        }
        if (this._state.kind === 'segment')
        {
            // Commit. Drop any coincident waypoints — a grab released with
            // no (or a degenerate) move leaves the jog anchor and its
            // moving twin on the same point; collapsing them keeps the
            // Waypoints list minimal (and undoes a no-op materialize).
            const wps = this._state.connector.Waypoints;
            if (wps !== undefined) this._state.connector.Waypoints = dedupeAdjacent(wps);
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

// Mirrors the Orthogonal router's port stub (20). A jog anchor inserted
// at a pinned port must sit at least this far out so the port→anchor leg
// stays collinear with the router's own stub and collapses cleanly
// instead of provoking an extra bend.
const SEG_JOG_STUB = 20;
// Small margin past the router stub for the same reason.
const JOG_MARGIN = 6;

// A point `dist` from `from` toward `to` along their shared axis. The
// segment is axis-aligned, so only the dominant (segment) axis advances;
// the other coordinate is taken from `from`.
function pointAlong(from: Point, to: Point, dist: number, horizontal: boolean): Point
{
    if (horizontal) return new Point(from.X + Math.sign(to.X - from.X) * dist, from.Y);
    return new Point(from.X, from.Y + Math.sign(to.Y - from.Y) * dist);
}

// Collapse runs of identical adjacent points to a single point. Used on
// segment-drag commit to shed the coincident jog anchor + moving twin a
// no-op drag would otherwise leave behind.
function dedupeAdjacent(pts: readonly Point[]): Point[]
{
    const out: Point[] = [];
    for (const p of pts)
    {
        const prev = out[out.length - 1];
        if (prev !== undefined && prev.X === p.X && prev.Y === p.Y) continue;
        out.push(p);
    }
    return out;
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
