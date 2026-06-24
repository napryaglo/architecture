// Step 11 / § 9 of [src/document/connectors.md](../../../document/connectors.md):
// pins the ConnectorEditAdorner state machine — endpoint re-anchor
// (§ 4.2) + waypoint add/move/remove (§ 4.3). Visual rendering of the
// drag handles lives in a follow-up step; the state machine drives
// the actual endpoint / waypoint mutations.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { Application } from '../../../runtime/index.js';
import { Point } from '../../../visual-engine/index.js';
import {
    attachConnectorEditAdorner,
    ConnectorEditAdorner,
} from '../behaviors/connector-edit-adorner.js';
import { Connector } from '../connector.js';
import { ConnectorEndpoint } from '../connector-endpoint.js';
import { Figure } from '../figure.js';
import { PortSide } from '../port.js';
import { ConnectorEnd, RoutingMode } from '../routing/router.js';
import '../routing/straight-router.js';
import '../routing/orthogonal-router.js';

function newApplication(): void
{
    Application.current = null;
    new Application();
}

function fig(left: number, top: number): Figure
{
    const f = new Figure();
    f.Left = left;
    f.Top  = top;
    f.Width  = 80;
    f.Height = 80;
    f.ExplicitPorts = [];
    return f;
}

function makeConnector(): Connector
{
    const c = new Connector();
    c.RoutingMode = RoutingMode.Straight;
    c.Source = new ConnectorEndpoint({ FreePoint: new Point(0,   0) });
    c.Target = new ConnectorEndpoint({ FreePoint: new Point(100, 0) });
    return c;
}

// ── Endpoint drag — Begin → Update → End (target / empty / abort) ────

describe('ConnectorEditAdorner — endpoint drag (re-anchor)', () => {
    test('BeginEndpointDrag(source, cursor) snapshots + sets Source to FreePoint mode', () => {
        newApplication();
        const c = makeConnector();
        // Initial Source has FreePoint at (0, 0), no Node.
        const adorner = new ConnectorEditAdorner();
        adorner.BeginEndpointDrag(c, ConnectorEnd.Source, new Point(50, 50));
        assert.equal(adorner.IsActive, true);
        assert.equal(c.Source!.FreePoint!.X, 50);
        assert.equal(c.Source!.FreePoint!.Y, 50);
        assert.equal(c.Source!.Node, undefined);
    });

    test('BeginEndpointDrag on a Node-bound endpoint clears the Node + port-ref + sets FreePoint', () => {
        newApplication();
        const f = fig(100, 100);
        const c = makeConnector();
        c.Source = new ConnectorEndpoint({ Node: f, PortName: 'out' });
        const adorner = new ConnectorEditAdorner();
        adorner.BeginEndpointDrag(c, ConnectorEnd.Source, new Point(50, 50));
        assert.equal(c.Source!.Node, undefined);
        assert.equal(c.Source!.PortName, undefined);
        assert.equal(c.Source!.FreePoint!.X, 50);
    });

    test('UpdateCursor flows into the dragged endpoint FreePoint', () => {
        newApplication();
        const c = makeConnector();
        const adorner = new ConnectorEditAdorner();
        adorner.BeginEndpointDrag(c, ConnectorEnd.Target, new Point(150, 0));
        adorner.UpdateCursor(new Point(200, 25));
        assert.equal(c.Target!.FreePoint!.X, 200);
        assert.equal(c.Target!.FreePoint!.Y, 25);
    });

    test('EndDragOverTarget anchors to (target, side) + clears FreePoint / clears stale port refs', () => {
        newApplication();
        const target = fig(200, 100);
        const c = makeConnector();
        // Pre-existing PortName / PortIndex on the endpoint must clear
        // when re-anchored via side drag — otherwise the resolver's
        // path-2 / path-3 would beat the new side-slot resolution.
        c.Target = new ConnectorEndpoint({ Node: target, PortName: 'stale', PortIndex: 5 });
        const adorner = new ConnectorEditAdorner();
        adorner.BeginEndpointDrag(c, ConnectorEnd.Target, new Point(150, 0));
        adorner.EndDragOverTarget(target, PortSide.W);
        assert.equal(c.Target!.Node, target);
        assert.equal(c.Target!.PortSide, PortSide.W);
        assert.equal(c.Target!.PortName, undefined);
        assert.equal(c.Target!.PortIndex, undefined);
        assert.equal(c.Target!.FreePoint, undefined);
        assert.equal(adorner.IsActive, false);
    });

    test('EndDragOverTarget records each cardinal side correctly', () => {
        newApplication();
        for (const side of [PortSide.N, PortSide.S, PortSide.E, PortSide.W])
        {
            const target = fig(200, 100);
            const c = makeConnector();
            const adorner = new ConnectorEditAdorner();
            adorner.BeginEndpointDrag(c, ConnectorEnd.Target, new Point(150, 0));
            adorner.EndDragOverTarget(target, side);
            assert.equal(c.Target!.PortSide, side);
        }
    });

    test('EndDragOverEmpty restores the endpoint from snapshot', () => {
        newApplication();
        const original = fig(50, 50);
        const c = makeConnector();
        c.Source = new ConnectorEndpoint({ Node: original, PortName: 'out' });
        const adorner = new ConnectorEditAdorner();
        adorner.BeginEndpointDrag(c, ConnectorEnd.Source, new Point(0, 0));
        // mid-drag: endpoint is now FreePoint-mode.
        adorner.UpdateCursor(new Point(10, 10));
        // Drop over empty → restore.
        adorner.EndDragOverEmpty();
        assert.equal(c.Source!.Node, original);
        assert.equal(c.Source!.PortName, 'out');
        assert.equal(c.Source!.FreePoint, undefined);
        assert.equal(adorner.IsActive, false);
    });

    test('Abort restores the endpoint from snapshot', () => {
        newApplication();
        const original = fig(50, 50);
        const c = makeConnector();
        c.Source = new ConnectorEndpoint({ Node: original });
        const adorner = new ConnectorEditAdorner();
        adorner.BeginEndpointDrag(c, ConnectorEnd.Source, new Point(0, 0));
        adorner.Abort();
        assert.equal(c.Source!.Node, original);
    });
});

// ── Waypoint drag (existing waypoint) ────────────────────────────────

describe('ConnectorEditAdorner — waypoint drag', () => {
    test('BeginWaypointDrag → UpdateCursor → EndDragOverEmpty commits new position', () => {
        newApplication();
        const c = makeConnector();
        c.Waypoints = [new Point(50, 50), new Point(75, 25)];
        const adorner = new ConnectorEditAdorner();
        adorner.BeginWaypointDrag(c, 0);
        adorner.UpdateCursor(new Point(60, 60));
        adorner.EndDragOverEmpty();
        assert.equal(c.Waypoints![0]!.X, 60);
        assert.equal(c.Waypoints![0]!.Y, 60);
        // Untouched waypoint preserved.
        assert.equal(c.Waypoints![1]!.X, 75);
        assert.equal(c.Waypoints![1]!.Y, 25);
        assert.equal(adorner.IsActive, false);
    });

    test('Abort during a waypoint drag restores the snapshotted Waypoints array', () => {
        newApplication();
        const c = makeConnector();
        const initial = [new Point(50, 50), new Point(75, 25)];
        c.Waypoints = initial;
        const adorner = new ConnectorEditAdorner();
        adorner.BeginWaypointDrag(c, 0);
        adorner.UpdateCursor(new Point(99, 99));
        adorner.Abort();
        assert.equal(c.Waypoints![0]!.X, 50);
        assert.equal(c.Waypoints![0]!.Y, 50);
    });

    test('BeginWaypointDrag with out-of-range index is a silent no-op', () => {
        newApplication();
        const c = makeConnector();
        c.Waypoints = [new Point(50, 50)];
        const adorner = new ConnectorEditAdorner();
        adorner.BeginWaypointDrag(c, 99);
        assert.equal(adorner.IsActive, false);
    });
});

// ── Insert-and-drag (mid-segment ghost handle) ───────────────────────

describe('ConnectorEditAdorner — InsertWaypointAndDrag', () => {
    test('inserts the new waypoint at the requested index + immediately enters drag', () => {
        newApplication();
        const c = makeConnector();
        c.Waypoints = [new Point(50, 50)];
        const adorner = new ConnectorEditAdorner();
        adorner.InsertWaypointAndDrag(c, 0, new Point(25, 25));
        assert.equal(c.Waypoints!.length, 2);
        assert.equal(c.Waypoints![0]!.X, 25);
        assert.equal(c.Waypoints![1]!.X, 50);
        assert.equal(adorner.IsActive, true);

        adorner.UpdateCursor(new Point(30, 30));
        assert.equal(c.Waypoints![0]!.X, 30);
        assert.equal(c.Waypoints![0]!.Y, 30);
    });

    test('Abort after Insert removes the just-inserted waypoint', () => {
        newApplication();
        const c = makeConnector();
        c.Waypoints = [new Point(50, 50)];
        const adorner = new ConnectorEditAdorner();
        adorner.InsertWaypointAndDrag(c, 0, new Point(25, 25));
        adorner.Abort();
        assert.equal(c.Waypoints!.length, 1);
        assert.equal(c.Waypoints![0]!.X, 50);
    });

    test('EndDragOverEmpty after Insert keeps the new waypoint at its current position', () => {
        newApplication();
        const c = makeConnector();
        c.Waypoints = [];
        const adorner = new ConnectorEditAdorner();
        adorner.InsertWaypointAndDrag(c, 0, new Point(40, 40));
        adorner.UpdateCursor(new Point(45, 50));
        adorner.EndDragOverEmpty();
        assert.equal(c.Waypoints!.length, 1);
        assert.equal(c.Waypoints![0]!.X, 45);
        assert.equal(c.Waypoints![0]!.Y, 50);
    });
});

// ── RemoveWaypoint imperative API ────────────────────────────────────

describe('ConnectorEditAdorner — RemoveWaypoint', () => {
    test('removes the entry at the given index', () => {
        newApplication();
        const c = makeConnector();
        c.Waypoints = [new Point(50, 50), new Point(75, 25), new Point(90, 10)];
        const adorner = new ConnectorEditAdorner();
        adorner.RemoveWaypoint(c, 1);
        assert.equal(c.Waypoints!.length, 2);
        assert.equal(c.Waypoints![0]!.X, 50);
        assert.equal(c.Waypoints![1]!.X, 90);
    });

    test('out-of-range index is a silent no-op', () => {
        newApplication();
        const c = makeConnector();
        c.Waypoints = [new Point(50, 50)];
        const adorner = new ConnectorEditAdorner();
        adorner.RemoveWaypoint(c, 99);
        assert.equal(c.Waypoints!.length, 1);
    });
});

// ── Preemption + idle no-ops ─────────────────────────────────────────

describe('ConnectorEditAdorner — gesture preemption + idle no-ops', () => {
    test('Beginning a second drag while active aborts the previous', () => {
        newApplication();
        const original = fig(50, 50);
        const c = makeConnector();
        c.Source = new ConnectorEndpoint({ Node: original });
        c.Waypoints = [new Point(50, 50)];
        const adorner = new ConnectorEditAdorner();
        adorner.BeginEndpointDrag(c, ConnectorEnd.Source, new Point(0, 0));
        adorner.BeginWaypointDrag(c, 0);
        // The endpoint mutation from the first Begin should be rolled
        // back by the implicit Abort.
        assert.equal(c.Source!.Node, original);
        assert.equal(adorner.IsActive, true);
    });

    test('UpdateCursor / End* / Abort while idle are silent no-ops', () => {
        newApplication();
        const c = makeConnector();
        const adorner = new ConnectorEditAdorner();
        adorner.UpdateCursor(new Point(0, 0));      // no-op
        adorner.EndDragOverEmpty();                 // no-op
        adorner.Abort();                            // no-op
        adorner.EndDragOverTarget(fig(0, 0), undefined); // waypoint drags don't have targets either
        assert.equal(adorner.IsActive, false);
    });
});

// ── attachConnectorEditAdorner convenience ───────────────────────────

describe('attachConnectorEditAdorner', () => {
    test('detach aborts an in-flight drag', () => {
        newApplication();
        const original = fig(50, 50);
        const c = makeConnector();
        c.Source = new ConnectorEndpoint({ Node: original });
        const { adorner, detach } = attachConnectorEditAdorner();
        adorner.BeginEndpointDrag(c, ConnectorEnd.Source, new Point(0, 0));
        detach();
        assert.equal(c.Source!.Node, original);
        assert.equal(adorner.IsActive, false);
    });
});
