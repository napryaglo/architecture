import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initTestApp } from '../../../basic/tests/test-app.js';
import { DiagramDocument } from '../diagram-document.js';

// _deserialize rebuilds nodes as fresh instances, so restored state is read back
// by id from the live collection, never through a pre-undo reference.
function nodeById(doc: DiagramDocument, id: string): { Left: number; Top: number } | undefined {
    return doc.Nodes.ToArray().find((n) => (n as { Id?: string }).Id === id) as
        { Left: number; Top: number } | undefined;
}

describe('DiagramDocument history — diagram layer round-trip', () => {
    beforeEach(() => { initTestApp(); });

    test('a bracketed move is one undo step that restores geometry', () => {
        const doc = new DiagramDocument();
        doc.History.Begin('Create');
        const created = doc.CreateNode('rectangle', 10, 10)!;
        const id = created.Id;
        doc.History.Commit();

        doc.History.Begin('Move');
        created.Left = 200; created.Top = 120;
        doc.History.Commit();
        assert.equal(doc.History.CanUndo, true);

        doc.Undo();
        assert.equal(nodeById(doc, id)?.Left, 10, 'undo restored Left');
        assert.equal(nodeById(doc, id)?.Top, 10, 'undo restored Top');

        doc.Redo();
        assert.equal(nodeById(doc, id)?.Left, 200, 'redo restored Left');
    });

    test('undo restores a deleted node', () => {
        const doc = new DiagramDocument();
        doc.History.Begin('Create');
        const created = doc.CreateNode('rectangle', 5, 5)!;
        const id = created.Id;
        doc.History.Commit();
        const before = doc.Nodes.Count;

        doc.History.Begin('Delete');
        doc.DeleteNodes([created]);
        doc.History.Commit();
        assert.equal(doc.Nodes.Count, before - 1);

        doc.Undo();
        assert.equal(doc.Nodes.Count, before, 'node re-added');
        assert.ok(nodeById(doc, id) !== undefined, 'same id restored');
    });
});
