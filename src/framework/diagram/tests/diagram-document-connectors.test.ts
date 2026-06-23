// Step 13 / § 9 of [src/document/connectors.md](../../../document/connectors.md):
// pins DiagramDocument's Connectors collection + CreateConnector /
// DeleteConnectors / cascade-on-Figure-delete + Save/Load round-trip,
// plus the attach-standard-mutations wiring of the ConnectorCreated
// event through to DiagramMutator.CreateConnector.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { Application, ObservableCollection } from '../../../runtime/index.js';
import { Point } from '../../../visual-engine/index.js';
import { Connector } from '../connector.js';
import { ConnectorEndpoint } from '../connector-endpoint.js';
import { Diagram } from '../diagram.js';
import { DiagramDocument, type DiagramStorage } from '../diagram-document.js';
import { Figure } from '../figure.js';
import { RoutingMode } from '../routing/router.js';
import { attachStandardDiagramMutations } from '../behaviors/attach-standard-mutations.js';
import '../routing/straight-router.js';
import '../routing/orthogonal-router.js';

// ── In-memory DiagramStorage for the Save / Load round-trip ──────────

class MemoryStorage implements DiagramStorage
{
    private readonly _map = new Map<string, string>();
    public GetItem(key: string): string | null { return this._map.get(key) ?? null; }
    public SetItem(key: string, value: string): void { this._map.set(key, value); }
}

function newDoc(storage?: DiagramStorage): DiagramDocument
{
    Application.current = null;
    new Application();
    return new DiagramDocument(storage);
}

// ── Collection initialisation ────────────────────────────────────────

describe('DiagramDocument — Connectors collection', () => {
    test('initializes Connectors as an empty ObservableCollection', () => {
        const doc = newDoc();
        assert.ok(doc.Connectors instanceof ObservableCollection);
        assert.equal(doc.Connectors.Count, 0);
    });
});

// ── CreateConnector / DeleteConnectors ───────────────────────────────

describe('DiagramDocument — CreateConnector / DeleteConnectors', () => {
    test('CreateConnector adds a Connector with the supplied Source/Target endpoints', () => {
        const doc = newDoc();
        const src = new ConnectorEndpoint({ FreePoint: new Point(10, 10) });
        const tgt = new ConnectorEndpoint({ FreePoint: new Point(50, 50) });
        const c = doc.CreateConnector(src, tgt);
        assert.ok(c !== null);
        assert.equal(doc.Connectors.Count, 1);
        assert.equal(doc.Connectors.Get(0), c);
        assert.equal(c!.Source, src);
        assert.equal(c!.Target, tgt);
    });

    test('DeleteConnectors removes the named entries; orthogonal entries stay', () => {
        const doc = newDoc();
        const a = doc.CreateConnector(
            new ConnectorEndpoint({ FreePoint: new Point(0, 0) }),
            new ConnectorEndpoint({ FreePoint: new Point(10, 10) }))!;
        const b = doc.CreateConnector(
            new ConnectorEndpoint({ FreePoint: new Point(20, 20) }),
            new ConnectorEndpoint({ FreePoint: new Point(30, 30) }))!;
        doc.DeleteConnectors([a]);
        assert.equal(doc.Connectors.Count, 1);
        assert.equal(doc.Connectors.Get(0), b);
    });
});

// ── Cascade: deleting a Figure drops connectors referencing it ───────

describe('DiagramDocument — Figure delete cascades to dependent connectors', () => {
    test('a connector whose Source.Node is a deleted Figure is auto-removed', () => {
        const doc = newDoc();
        const fig = doc.CreateNode('rectangle', 100, 100)!;
        const other = doc.CreateNode('rectangle', 300, 100)!;
        doc.CreateConnector(
            new ConnectorEndpoint({ Node: fig }),
            new ConnectorEndpoint({ Node: other }));
        doc.CreateConnector(
            new ConnectorEndpoint({ FreePoint: new Point(0, 0) }),    // unrelated
            new ConnectorEndpoint({ FreePoint: new Point(50, 50) }));
        assert.equal(doc.Connectors.Count, 2);

        doc.DeleteNodes([fig]);
        // The connector touching `fig` is dropped; the unrelated one survives.
        assert.equal(doc.Connectors.Count, 1);
    });
});

// ── Save / Load round-trip ───────────────────────────────────────────

describe('DiagramDocument — Save / Load round-trips connectors', () => {
    test('node-anchored endpoints rehydrate by Figure.Id', () => {
        const storage = new MemoryStorage();
        const doc = newDoc(storage);

        const a = doc.CreateNode('rectangle', 100, 100)!;
        const b = doc.CreateNode('ellipse',   300, 100)!;
        const c = doc.CreateConnector(
            new ConnectorEndpoint({ Node: a, PortName: 'out' }),
            new ConnectorEndpoint({ Node: b }))!;
        c.RoutingMode = RoutingMode.Straight;
        c.Waypoints = [new Point(200, 50)];

        doc.Save();

        // Tear down + start fresh.
        const restored = newDoc(storage);
        restored.Storage = storage;
        restored.Load();

        assert.equal(restored.Nodes.Count, 2);
        assert.equal(restored.Connectors.Count, 1);
        const rA = restored.Nodes.Get(0)! as Figure;
        const rB = restored.Nodes.Get(1)! as Figure;
        const rC = restored.Connectors.Get(0)!;
        assert.equal(rC.Source!.Node, rA);
        assert.equal(rC.Source!.PortName, 'out');
        assert.equal(rC.Target!.Node, rB);
        assert.equal(rC.RoutingMode, RoutingMode.Straight);
        assert.equal(rC.Waypoints!.length, 1);
        assert.equal(rC.Waypoints![0]!.X, 200);
        assert.equal(rC.Waypoints![0]!.Y, 50);
    });

    test('free-floating endpoints round-trip through FreePoint', () => {
        const storage = new MemoryStorage();
        const doc = newDoc(storage);
        doc.CreateConnector(
            new ConnectorEndpoint({ FreePoint: new Point(7, 11) }),
            new ConnectorEndpoint({ FreePoint: new Point(42, 17) }));

        doc.Save();
        const restored = newDoc(storage);
        restored.Storage = storage;
        restored.Load();
        const rC = restored.Connectors.Get(0)!;
        assert.equal(rC.Source!.FreePoint!.X, 7);
        assert.equal(rC.Source!.FreePoint!.Y, 11);
        assert.equal(rC.Target!.FreePoint!.X, 42);
        assert.equal(rC.Target!.FreePoint!.Y, 17);
    });

    test('Load with a payload missing the connectors field leaves Connectors empty', () => {
        const storage = new MemoryStorage();
        // Hand-craft a legacy node-only payload.
        storage.SetItem('mural-diagram-state-v1', JSON.stringify({
            nodes: [{ id: 'n1', kind: 'rectangle', left: 0, top: 0, w: 80, h: 80, d: '' }],
            nextId: 2,
        }));
        const doc = newDoc(storage);
        doc.Load();
        assert.equal(doc.Nodes.Count, 1);
        assert.equal(doc.Connectors.Count, 0);
    });
});

// ── attach-standard-mutations wires ConnectorCreated → CreateConnector ─

describe('attachStandardDiagramMutations — connector flow', () => {
    test('ConnectorCreated event forwards to mutator.CreateConnector', () => {
        const doc  = newDoc();
        const diag = new Diagram();
        const detach = attachStandardDiagramMutations(diag, doc);

        const src = new ConnectorEndpoint({ FreePoint: new Point(0, 0) });
        const tgt = new ConnectorEndpoint({ FreePoint: new Point(100, 0) });
        diag._fireConnectorCreated({ Source: src, Target: tgt });

        assert.equal(doc.Connectors.Count, 1);
        const c = doc.Connectors.Get(0)!;
        assert.equal(c.Source, src);
        assert.equal(c.Target, tgt);

        detach();
    });

    test('DeleteRequested with non-empty Connectors forwards to mutator.DeleteConnectors', () => {
        const doc  = newDoc();
        const diag = new Diagram();
        const detach = attachStandardDiagramMutations(diag, doc);

        const a = doc.CreateConnector(
            new ConnectorEndpoint({ FreePoint: new Point(0, 0) }),
            new ConnectorEndpoint({ FreePoint: new Point(1, 1) }))!;
        const b = doc.CreateConnector(
            new ConnectorEndpoint({ FreePoint: new Point(2, 2) }),
            new ConnectorEndpoint({ FreePoint: new Point(3, 3) }))!;

        diag._fireDeleteRequested({ Items: [], Connectors: [a] });
        assert.equal(doc.Connectors.Count, 1);
        assert.equal(doc.Connectors.Get(0), b);

        detach();
    });

    test('DeleteRequested with empty Connectors skips the connector branch', () => {
        const doc  = newDoc();
        const diag = new Diagram();
        attachStandardDiagramMutations(diag, doc);

        const a = doc.CreateConnector(
            new ConnectorEndpoint({ FreePoint: new Point(0, 0) }),
            new ConnectorEndpoint({ FreePoint: new Point(1, 1) }))!;
        diag._fireDeleteRequested({ Items: [], Connectors: [] });
        assert.equal(doc.Connectors.Count, 1);
        assert.equal(doc.Connectors.Get(0), a);
    });
});

// ── Materializer respects items-are-Connectors ──────────────────────

describe('DiagramConnectorsMaterializer — items-are-Connectors', () => {
    test('a Connector entry IS the visual the materializer hands out', () => {
        Application.current = null;
        new Application();
        const diagram = new Diagram();
        const c = new Connector();
        c.RoutingMode = RoutingMode.Straight;
        c.Source = new ConnectorEndpoint({ FreePoint: new Point(0, 0) });
        c.Target = new ConnectorEndpoint({ FreePoint: new Point(10, 0) });
        diagram.Connectors = new ObservableCollection<Connector>([c]);
        const v = diagram._getConnectorsMaterializerForTesting().MaterializedVisuals.get(c);
        // SAME identity — no wrap.
        assert.equal(v, c);
    });
});
