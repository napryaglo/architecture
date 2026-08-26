import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DiagramHistory } from '../diagram-history.js';
import { HistoryLayerId, type IHistoryLayer } from '../history-layer.js';

// A fake layer over a single mutable string cell.
function cellLayer(id: HistoryLayerId, get: () => string, set: (v: string) => void): IHistoryLayer {
    return { Id: id, Capture: () => get(), Equals: (a, b) => a === b, Restore: (s) => set(s as string) };
}

describe('DiagramHistory', () => {
    test('a transaction that changes a layer produces one undoable entry', () => {
        let cell = 'a';
        const h = new DiagramHistory();
        h.RegisterLayer(cellLayer(HistoryLayerId.Diagram, () => cell, (v) => { cell = v; }));

        h.Begin('edit'); cell = 'b'; h.Commit();
        assert.equal(h.CanUndo, true);
        assert.equal(h.CanRedo, false);

        h.Undo();
        assert.equal(cell, 'a', 'undo restored the before-snapshot');
        assert.equal(h.CanRedo, true);

        h.Redo();
        assert.equal(cell, 'b', 'redo restored the after-snapshot');
    });

    test('nested Begin/Commit joins into one entry', () => {
        let cell = 'a';
        const h = new DiagramHistory();
        h.RegisterLayer(cellLayer(HistoryLayerId.Diagram, () => cell, (v) => { cell = v; }));
        h.Begin('outer'); cell = 'b'; h.Begin('inner'); cell = 'c'; h.Commit(); h.Commit();
        h.Undo();
        assert.equal(cell, 'a', 'the whole nested transaction undoes as one');
        assert.equal(h.CanUndo, false);
    });

    test('a no-op transaction pushes nothing', () => {
        let cell = 'a';
        const h = new DiagramHistory();
        h.RegisterLayer(cellLayer(HistoryLayerId.Diagram, () => cell, (v) => { cell = v; }));
        h.Begin('noop'); h.Commit();
        assert.equal(h.CanUndo, false);
    });

    test('a new edit after undo clears redo', () => {
        let cell = 'a';
        const h = new DiagramHistory();
        h.RegisterLayer(cellLayer(HistoryLayerId.Diagram, () => cell, (v) => { cell = v; }));
        h.Begin('1'); cell = 'b'; h.Commit();
        h.Undo();
        assert.equal(h.CanRedo, true);
        h.Begin('2'); cell = 'c'; h.Commit();
        assert.equal(h.CanRedo, false, 'redo cleared by the new edit');
    });

    test('cap evicts the oldest entry', () => {
        let cell = 'x0';
        const h = new DiagramHistory({ cap: 2 });
        h.RegisterLayer(cellLayer(HistoryLayerId.Diagram, () => cell, (v) => { cell = v; }));
        for (const v of ['x1', 'x2', 'x3']) { h.Begin('e'); cell = v; h.Commit(); }
        // Only the last 2 are retained → can undo twice, landing on x1 (not x0).
        h.Undo(); h.Undo();
        assert.equal(cell, 'x1', 'oldest (x0) transition was evicted');
        assert.equal(h.CanUndo, false);
    });

    test('Reconcile runs once per changed layer after restore', () => {
        let cell = 'a'; let reconciles = 0;
        const h = new DiagramHistory();
        h.RegisterLayer({ Id: HistoryLayerId.Model, Capture: () => cell, Equals: (a, b) => a === b,
            Restore: (s) => { cell = s as string; }, Reconcile: () => { reconciles++; } });
        h.Begin('m'); cell = 'b'; h.Commit();
        h.Undo();
        assert.equal(cell, 'a');
        assert.equal(reconciles, 1, 'Reconcile fired exactly once on undo');
    });

    test('a layer registered mid-transaction is not spuriously recorded', () => {
        let a = 'a0';
        let b = 'b0';
        const h = new DiagramHistory();
        h.RegisterLayer(cellLayer(HistoryLayerId.Diagram, () => a, (v) => { a = v; }));

        h.Begin('edit');
        a = 'a1';
        // A second layer registers WHILE the transaction is open (its "before" was
        // never captured at Begin) and its value differs from any baseline.
        h.RegisterLayer(cellLayer(HistoryLayerId.Model, () => b, (v) => { b = v; }));
        b = 'b1';
        h.Commit();

        h.Undo();
        assert.equal(a, 'a0', 'the layer captured at Begin undoes');
        assert.equal(b, 'b1', 'the mid-transaction layer is left untouched (not wiped)');
    });

    test('NotifyEdited auto-coalesces unbracketed edits within a microtask', () => {
        let cell = 'a';
        const pending: Array<() => void> = [];
        const h = new DiagramHistory({ scheduleMicrotask: (fn) => pending.push(fn) });
        h.RegisterLayer(cellLayer(HistoryLayerId.Diagram, () => cell, (v) => { cell = v; }));
        // Two edits in the same turn, each notifying — one entry after the microtask.
        cell = 'b'; h.NotifyEdited();
        cell = 'c'; h.NotifyEdited();
        pending.forEach((fn) => fn());
        assert.equal(h.CanUndo, true);
        h.Undo();
        assert.equal(cell, 'a', 'both edits collapsed into one undo step');
    });
});
