// Step 10 / § 9 of [src/document/connectors.md](../../../document/connectors.md):
// pins the ConnectorCreateBehavior state machine + Diagram.ConnectorCreated
// event surface. Pointer wiring (PointerDown trigger on Figure, cursor
// coordinate translation) is the consumer's responsibility; the state
// machine here is what they call into.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { Application } from '../../../runtime/index.js';
import { Point } from '../../../visual-engine/index.js';
import {
    type ConnectorCreatedArgs,
    ConnectorCreateBehavior,
    attachConnectorCreate,
} from '../behaviors/connector-create-behavior.js';
import { Connector } from '../connector.js';
import { ConnectorEndpoint } from '../connector-endpoint.js';
import { Diagram } from '../diagram.js';
import { Figure } from '../figure.js';
import { Port, PortSide } from '../port.js';
import { RoutingMode } from '../routing/router.js';
// Side-effect imports — registers the routers used by the transient
// Connector's recompute.
import '../routing/straight-router.js';
import '../routing/orthogonal-router.js';

function newDiagram(): Diagram
{
    Application.current = null;
    new Application();
    return new Diagram();
}

function fig(left: number, top: number): Figure
{
    const f = new Figure();
    f.Left = left;
    f.Top  = top;
    f.Width  = 80;
    f.Height = 80;
    f.ExplicitPorts = [];      // skip default-provider ports for predictable resolution
    return f;
}

// ── Begin → transient state ──────────────────────────────────────────

describe('ConnectorCreateBehavior — BeginCreate', () => {
    test('materializes a transient Connector with Source.Node = sourceFigure', () => {
        const d = newDiagram();
        const behavior = new ConnectorCreateBehavior(d);
        const f = fig(100, 100);
        assert.equal(behavior.IsActive, false);
        behavior.BeginCreate(f, undefined, new Point(300, 200));

        assert.equal(behavior.IsActive, true);
        const t = behavior.TransientConnector!;
        assert.ok(t instanceof Connector);
        assert.equal(t.Source!.Node, f);
        assert.equal(t.Source!.PortName, undefined);    // no port hit
        assert.equal(t.Target!.Node, undefined);
        assert.equal(t.Target!.FreePoint!.X, 300);
        assert.equal(t.Target!.FreePoint!.Y, 200);
        assert.equal(t.RoutingMode, RoutingMode.Orthogonal);
    });

    test('named-port hit on source records PortName on the transient endpoint', () => {
        const d = newDiagram();
        const behavior = new ConnectorCreateBehavior(d);
        const f = fig(100, 100);
        const namedPort = new Port({ Name: 'out', Side: PortSide.E, X: 1, Y: 0.5 });
        behavior.BeginCreate(f, namedPort, new Point(300, 200));
        assert.equal(behavior.TransientConnector!.Source!.PortName, 'out');
    });

    test('anonymous-port hit (Name = "") falls back to a bare Node endpoint', () => {
        // Per § 4.1 / V1: positional addressing (Side, Index) on
        // anonymous ports is deferred; the endpoint stays a plain Node
        // ref and the connector's path-4 auto-pick at resolution time
        // lands on the closest port.
        const d = newDiagram();
        const behavior = new ConnectorCreateBehavior(d);
        const f = fig(100, 100);
        const anon = new Port({ Side: PortSide.N, X: 0.5, Y: 0 });
        behavior.BeginCreate(f, anon, new Point(300, 200));
        assert.equal(behavior.TransientConnector!.Source!.PortName, undefined);
        assert.equal(behavior.TransientConnector!.Source!.Node, f);
    });

    test('a second BeginCreate preempts an unreleased gesture', () => {
        const d = newDiagram();
        const behavior = new ConnectorCreateBehavior(d);
        const a = fig(100, 100);
        const b = fig(300, 100);
        behavior.BeginCreate(a, undefined, new Point(200, 200));
        const firstTransient = behavior.TransientConnector!;

        behavior.BeginCreate(b, undefined, new Point(400, 200));
        const secondTransient = behavior.TransientConnector!;
        assert.notEqual(firstTransient, secondTransient);
        assert.equal(secondTransient.Source!.Node, b);
    });
});

// ── UpdateCursor flows into Target.FreePoint ─────────────────────────

describe('ConnectorCreateBehavior — UpdateCursor', () => {
    test('cursor update writes through to the transient Target.FreePoint', () => {
        const d = newDiagram();
        const behavior = new ConnectorCreateBehavior(d);
        const f = fig(100, 100);
        behavior.BeginCreate(f, undefined, new Point(300, 200));
        behavior.UpdateCursor(new Point(400, 250));
        const fp = behavior.TransientConnector!.Target!.FreePoint!;
        assert.equal(fp.X, 400);
        assert.equal(fp.Y, 250);
    });

    test('UpdateCursor while inactive is a silent no-op', () => {
        const d = newDiagram();
        const behavior = new ConnectorCreateBehavior(d);
        behavior.UpdateCursor(new Point(0, 0));   // does not throw
        assert.equal(behavior.IsActive, false);
    });
});

// ── EndCreate fires Diagram.ConnectorCreated ─────────────────────────

describe('ConnectorCreateBehavior — EndCreate', () => {
    test('fires Diagram.ConnectorCreated with Source / Target endpoints + tears down transient', () => {
        const d = newDiagram();
        const behavior = new ConnectorCreateBehavior(d);
        const src = fig(100, 100);
        const tgt = fig(400, 100);

        const captured: ConnectorCreatedArgs[] = [];
        d.AddConnectorCreatedListener(args => captured.push(args));

        behavior.BeginCreate(src, undefined, new Point(200, 200));
        behavior.EndCreate(tgt, undefined);

        assert.equal(captured.length, 1);
        assert.equal(captured[0]!.Source.Node, src);
        assert.equal(captured[0]!.Target.Node, tgt);
        assert.equal(behavior.IsActive, false);
        assert.equal(behavior.TransientConnector, undefined);
    });

    test('port-ref shape carries through on EndCreate (named ports on both ends)', () => {
        const d = newDiagram();
        const behavior = new ConnectorCreateBehavior(d);
        const src = fig(100, 100);
        const tgt = fig(400, 100);
        const srcPort = new Port({ Name: 'out', Side: PortSide.E, X: 1, Y: 0.5 });
        const tgtPort = new Port({ Name: 'in',  Side: PortSide.W, X: 0, Y: 0.5 });

        let captured: ConnectorCreatedArgs | undefined;
        d.AddConnectorCreatedListener(args => { captured = args; });

        behavior.BeginCreate(src, srcPort, new Point(200, 200));
        behavior.EndCreate(tgt, tgtPort);

        assert.ok(captured !== undefined);
        assert.equal(captured!.Source.PortName, 'out');
        assert.equal(captured!.Target.PortName, 'in');
    });

    test('the event-bag Source/Target ARE freshly-constructed endpoints, not the transient', () => {
        // The transient connector's endpoints are dropped at EndCreate.
        // The event args carry independent ConnectorEndpoint instances
        // so the consumer's listener can hold references without
        // affecting the framework's gesture state.
        const d = newDiagram();
        const behavior = new ConnectorCreateBehavior(d);
        const src = fig(100, 100);
        const tgt = fig(400, 100);

        let transientSource: ConnectorEndpoint | undefined;
        behavior.BeginCreate(src, undefined, new Point(200, 200));
        transientSource = behavior.TransientConnector!.Source;

        let captured: ConnectorCreatedArgs | undefined;
        d.AddConnectorCreatedListener(args => { captured = args; });
        behavior.EndCreate(tgt, undefined);

        assert.ok(captured !== undefined);
        assert.notEqual(captured!.Source, transientSource);
        assert.ok(captured!.Source instanceof ConnectorEndpoint);
    });

    test('EndCreate without an active gesture is a silent no-op', () => {
        const d = newDiagram();
        const behavior = new ConnectorCreateBehavior(d);
        const f = fig(100, 100);

        let fired = false;
        d.AddConnectorCreatedListener(() => { fired = true; });
        behavior.EndCreate(f, undefined);
        assert.equal(fired, false);
    });
});

// ── Abort ────────────────────────────────────────────────────────────

describe('ConnectorCreateBehavior — Abort', () => {
    test('drops the transient without firing ConnectorCreated', () => {
        const d = newDiagram();
        const behavior = new ConnectorCreateBehavior(d);
        const f = fig(100, 100);

        let fired = false;
        d.AddConnectorCreatedListener(() => { fired = true; });
        behavior.BeginCreate(f, undefined, new Point(200, 200));
        behavior.Abort();
        assert.equal(behavior.IsActive, false);
        assert.equal(behavior.TransientConnector, undefined);
        assert.equal(fired, false);
    });

    test('Abort while inactive is a silent no-op', () => {
        const d = newDiagram();
        const behavior = new ConnectorCreateBehavior(d);
        behavior.Abort();
        assert.equal(behavior.IsActive, false);
    });
});

// ── attachConnectorCreate convenience ────────────────────────────────

describe('attachConnectorCreate', () => {
    test('returns { behavior, detach } and detach aborts in-flight gestures', () => {
        const d = newDiagram();
        const { behavior, detach } = attachConnectorCreate(d);
        const f = fig(100, 100);
        behavior.BeginCreate(f, undefined, new Point(200, 200));
        assert.equal(behavior.IsActive, true);
        detach();
        assert.equal(behavior.IsActive, false);
    });
});
