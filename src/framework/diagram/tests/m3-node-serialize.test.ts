// Generic per-VM node serialization registry (M3).
// Tests:
//   1. Typed round-trip: ShapeNodeVM + TextShape + connector → save (type field
//      present on each node record) → load into a fresh doc → correct types,
//      positions, text, connector endpoints.
//   2. Legacy load: hand-crafted legacy payload (flat {kind,left,top,w,h,d},
//      no `type` field) → load → one ShapeNodeVM at the correct position.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { Application } from '../../../runtime/index.js';
import { Point } from '../../../visual-engine/index.js';
import { DiagramDocument, type DiagramStorage } from '../diagram-document.js';
import { ShapeNodeVM } from '../shape-node-vm.js';
import { TextShape } from '../text-shape.js';
import { Connector } from '../connector.js';
import { ConnectorEndpoint } from '../connector-endpoint.js';

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

// ── 1. Typed round-trip ──────────────────────────────────────────────

describe('M3 node serialization registry — typed round-trip', () => {
    test('each node record carries a type field after Save', () => {
        const storage = new MemoryStorage();
        const doc = newDoc(storage);

        const shape = doc.CreateNode('rectangle', 12, 34)!;
        assert.ok(shape instanceof ShapeNodeVM);

        const txt = new TextShape();
        txt.Id = 'tx1'; txt.LabelText = 'hello'; txt.Left = 200; txt.Top = 100;
        doc.Nodes.Add(txt);

        doc.Save();

        const raw = JSON.parse(storage.GetItem('mural-diagram-state-v1')!) as {
            nodes: Array<{ type?: string; kind?: string }>;
        };
        assert.ok(Array.isArray(raw.nodes), 'nodes array present');
        assert.equal(raw.nodes.length, 2, 'two node records');

        const shapeRec = raw.nodes[0]!;
        const textRec  = raw.nodes[1]!;
        assert.equal(shapeRec.type, 'shape', 'shape record has type=shape');
        assert.equal(textRec.type,  'text',  'text record has type=text');
    });

    test('Save → Load restores ShapeNodeVM kind/position', () => {
        const storage = new MemoryStorage();
        const doc = newDoc(storage);

        const shape = doc.CreateNode('rectangle', 12, 34)!;
        assert.ok(shape instanceof ShapeNodeVM);

        doc.Save();

        const doc2 = newDoc(storage);
        doc2.Storage = storage;
        doc2.Load();

        assert.equal(doc2.Nodes.Count, 1);
        const restored = doc2.Nodes.Get(0)!;
        assert.ok(restored instanceof ShapeNodeVM, 'restored as ShapeNodeVM');
        const vm = restored as ShapeNodeVM;
        assert.equal(vm.Kind, 'rectangle');
        assert.equal(vm.Left, 12);
        assert.equal(vm.Top,  34);
    });

    test('Save → Load restores TextShape with its label', () => {
        const storage = new MemoryStorage();
        const doc = newDoc(storage);

        const txt = new TextShape();
        txt.Id = 'tx1'; txt.LabelText = 'annotated'; txt.Left = 5; txt.Top = 10;
        doc.Nodes.Add(txt);

        doc.Save();

        const doc2 = newDoc(storage);
        doc2.Storage = storage;
        doc2.Load();

        assert.equal(doc2.Nodes.Count, 1);
        const restored = doc2.Nodes.Get(0)!;
        assert.ok(restored instanceof TextShape, 'restored as TextShape');
        assert.equal((restored as TextShape).LabelText, 'annotated');
    });

    test('connector endpoints resolve by id after typed round-trip', () => {
        const storage = new MemoryStorage();
        const doc = newDoc(storage);

        const a = doc.CreateNode('rectangle', 0, 0)!;
        const b = doc.CreateNode('rectangle', 200, 0)!;

        const src = new ConnectorEndpoint({ Node: a });
        const tgt = new ConnectorEndpoint({ Node: b });
        const conn = doc.CreateConnector(src, tgt)!;
        assert.ok(conn instanceof Connector);

        doc.Save();

        const doc2 = newDoc(storage);
        doc2.Storage = storage;
        doc2.Load();

        assert.equal(doc2.Nodes.Count, 2);
        assert.equal(doc2.Connectors.Count, 1);

        const c = doc2.Connectors.Get(0)!;
        assert.ok(c.Source?.Node !== undefined, 'source node rehydrated');
        assert.ok(c.Target?.Node !== undefined, 'target node rehydrated');
        // The source/target ids in the restored doc must be distinct.
        assert.notEqual(c.Source!.Node!.Id, c.Target!.Node!.Id, 'endpoints point to different nodes');
    });
});

// ── 2. Legacy load ───────────────────────────────────────────────────

describe('M3 node serialization registry — legacy load', () => {
    test('flat legacy node record (no type field) loads as ShapeNodeVM', () => {
        const storage = new MemoryStorage();
        // Hand-write a legacy payload: kind + flat fields, no `type`.
        const legacy = JSON.stringify({
            nodes: [
                { id: 'n1', kind: 'rectangle', left: 5, top: 6, w: 80, h: 80, d: '' },
            ],
            connectors: [],
            nextId: 2,
        });
        storage.SetItem('mural-diagram-state-v1', legacy);

        const doc = newDoc(storage);
        doc.Storage = storage;
        doc.Load();

        assert.equal(doc.Nodes.Count, 1, 'one node loaded from legacy payload');
        const node = doc.Nodes.Get(0)!;
        assert.ok(node instanceof ShapeNodeVM, 'legacy rectangle reloads as ShapeNodeVM');
        const vm = node as ShapeNodeVM;
        assert.equal(vm.Kind, 'rectangle');
        assert.equal(vm.Left, 5);
        assert.equal(vm.Top,  6);
    });

    test('legacy text node (kind=text, no type) loads as TextShape', () => {
        const storage = new MemoryStorage();
        const legacy = JSON.stringify({
            nodes: [
                {
                    id: 'n1', kind: 'text', left: 10, top: 20, w: 120, h: 44, d: '',
                    text: { content: 'legacy note' },
                },
            ],
            connectors: [],
            nextId: 2,
        });
        storage.SetItem('mural-diagram-state-v1', legacy);

        const doc = newDoc(storage);
        doc.Storage = storage;
        doc.Load();

        assert.equal(doc.Nodes.Count, 1);
        const node = doc.Nodes.Get(0)!;
        assert.ok(node instanceof TextShape, 'legacy text reloads as TextShape');
        assert.equal((node as TextShape).LabelText, 'legacy note');
    });
});
