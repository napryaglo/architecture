// SP4: the deserialize fallback id generator ('n' + counter) must not collide
// with an explicit inbound id. A fresh doc's _nextId starts at 1, so an empty-id
// node would regenerate 'n1' — clashing with an explicit 'n1' in the same
// payload and overwriting it in the byId map.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { Application } from '../../../runtime/index.js';
import { DiagramDocument, type DiagramStorage } from '../diagram-document.js';

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

describe('DiagramDocument deserialize — id-collision guard', () => {
    test('an empty-id node does not collide with an explicit "n1"', () => {
        const storage = new MemoryStorage();
        // Legacy flat records: one explicit id 'n1', one empty id. With _nextId
        // starting at 1, the empty-id fallback would regenerate 'n1'.
        storage.SetItem('mural-diagram-state-v1', JSON.stringify({
            nodes: [
                { id: 'n1', kind: 'rectangle', left: 0,  top: 0, w: 60, h: 40, d: '' },
                { id: '',   kind: 'rectangle', left: 80, top: 0, w: 60, h: 40, d: '' },
            ],
            connectors: [],
            nextId: 1,
        }));

        const doc = newDoc(storage);
        doc.Storage = storage;
        doc.Load();

        const ids = doc.Nodes.ToArray().map((n) => (n as { Id?: string }).Id);
        assert.equal(ids.length, 2, 'both nodes present');
        assert.equal(new Set(ids).size, 2, `ids must be unique, got ${JSON.stringify(ids)}`);
        assert.ok(ids.includes('n1'), 'explicit id preserved');
    });
});
