// Task C4 — text/callout serializer swap + round-trip tests.
//
// Verifies:
//   1. Typed round-trip: TextNodeVM + Callout → Save → Load → VMs with
//      label + leader restored.
//   2. Legacy load: hand-written {kind:'text'/'callout'} payload (no `type`)
//      → loads as TextNodeVM / Callout.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { Application } from '../../../runtime/index.js';
import { DiagramDocument, type DiagramStorage } from '../diagram-document.js';
import { TextNodeVM } from '../text-node-vm.js';
import { Callout } from '../callout.js';

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

// ── 1. Typed round-trip ──────────────────────────────────────────────────────

describe('C4 text/callout serializer — typed round-trip', () => {
    test('TextNodeVM round-trips: reloads as TextNodeVM with label restored', () => {
        const storage = new MemoryStorage();
        const doc = newDoc(storage);

        const txt = new TextNodeVM();
        txt.Id = 'tx1';
        txt.LabelText = 'annotated';
        txt.Left = 5; txt.Top = 10;
        doc.Nodes.Add(txt);

        doc.Save();

        const doc2 = newDoc(storage);
        doc2.Storage = storage;
        doc2.Load();

        assert.equal(doc2.Nodes.Count, 1, 'one node loaded');
        const restored = doc2.Nodes.Get(0)!;
        assert.ok(restored instanceof TextNodeVM, 'restored as TextNodeVM');
        assert.equal((restored as TextNodeVM).LabelText, 'annotated', 'label restored');
        assert.equal((restored as TextNodeVM).Left, 5, 'Left restored');
        assert.equal((restored as TextNodeVM).Top, 10, 'Top restored');
    });

    test('Callout + TextNodeVM target: reloads as VMs with leader resolved', () => {
        const storage = new MemoryStorage();
        const doc = newDoc(storage);

        const target = new TextNodeVM();
        target.Id = 'tgt1';
        target.LabelText = 'target node';
        target.Left = 300; target.Top = 200; target.Width = 80; target.Height = 60;
        doc.Nodes.Add(target);

        const callout = new Callout();
        callout.Id = 'cl1';
        callout.LabelText = 'callout label';
        callout.Left = 0; callout.Top = 0;
        callout.LeaderTargetNode = target;
        doc.Nodes.Add(callout);

        doc.Save();

        const doc2 = newDoc(storage);
        doc2.Storage = storage;
        doc2.Load();

        assert.equal(doc2.Nodes.Count, 2, 'both nodes loaded');
        const rt = doc2.Nodes.Get(0)!;
        const rc = doc2.Nodes.Get(1)!;

        assert.ok(rt instanceof TextNodeVM, 'target reloaded as TextNodeVM');
        assert.ok(rc instanceof Callout, 'callout reloaded as Callout');
        assert.equal((rc as Callout).LabelText, 'callout label', 'callout label restored');
        // Leader target must be re-wired to the reloaded node (by id).
        assert.equal(
            (rc as Callout).LeaderTargetNode,
            rt,
            'leader re-wired to the reloaded target node',
        );
    });

    test('Save emits type=text for TextNodeVM and type=callout for Callout', () => {
        const storage = new MemoryStorage();
        const doc = newDoc(storage);

        const txt = new TextNodeVM();
        txt.Id = 'tx1'; txt.LabelText = 'hi';
        doc.Nodes.Add(txt);

        const callout = new Callout();
        callout.Id = 'cl1'; callout.LabelText = 'co';
        // Wire a leader so leaderTargetId is serialized.
        callout.LeaderTargetNode = txt;
        doc.Nodes.Add(callout);

        doc.Save();

        const raw = JSON.parse(storage.GetItem('mural-diagram-state-v1')!) as {
            nodes: Array<{ type?: string; data?: { leaderTargetId?: unknown; text?: unknown } }>;
        };
        assert.equal(raw.nodes.length, 2, 'two node records');
        assert.equal(raw.nodes[0]!.type, 'text', 'TextNodeVM → type=text');
        assert.equal(raw.nodes[1]!.type, 'callout', 'Callout → type=callout');
        // Payload shape must be identical to M3: {text} / {text, leaderTargetId}
        assert.ok('text' in (raw.nodes[0]!.data ?? {}), 'text serializer data has text key');
        assert.ok('text' in (raw.nodes[1]!.data ?? {}), 'callout serializer data has text key');
        assert.equal((raw.nodes[1]!.data ?? {}).leaderTargetId, 'tx1', 'callout data has leaderTargetId = tx1');
    });
});

// ── 2. Legacy load ───────────────────────────────────────────────────────────

describe('C4 text/callout serializer — legacy load', () => {
    test('legacy {kind:"text"} node (no type field) loads as TextNodeVM', () => {
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

        assert.equal(doc.Nodes.Count, 1, 'one node loaded');
        const node = doc.Nodes.Get(0)!;
        assert.ok(node instanceof TextNodeVM, 'legacy text reloads as TextNodeVM');
        assert.equal((node as TextNodeVM).LabelText, 'legacy note', 'label restored from legacy');
    });

    test('legacy {kind:"callout"} node loads as Callout with leader resolved', () => {
        const storage = new MemoryStorage();
        const legacy = JSON.stringify({
            nodes: [
                {
                    id: 'n1', kind: 'text', left: 300, top: 200, w: 80, h: 60, d: '',
                    text: { content: 'target' },
                },
                {
                    id: 'c1', kind: 'callout', left: 0, top: 0, w: 120, h: 44, d: '',
                    text: { content: 'callout' },
                    leaderTargetId: 'n1',
                },
            ],
            connectors: [],
            nextId: 3,
        });
        storage.SetItem('mural-diagram-state-v1', legacy);

        const doc = newDoc(storage);
        doc.Storage = storage;
        doc.Load();

        assert.equal(doc.Nodes.Count, 2, 'two nodes loaded');
        const rt = doc.Nodes.Get(0)!;
        const rc = doc.Nodes.Get(1)!;

        assert.ok(rt instanceof TextNodeVM, 'legacy target loads as TextNodeVM');
        assert.ok(rc instanceof Callout, 'legacy callout loads as Callout');
        assert.equal((rc as Callout).LeaderTargetNode, rt, 'leader re-wired from legacy payload');
    });
});
