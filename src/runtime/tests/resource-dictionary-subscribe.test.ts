import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ResourceDictionary } from '../index.js';

// Characterization tests for the coarse Subscribe/unsubscribe contract.
// These lock the externally-observable behavior so the listeners-array →
// Set refactor (O(n) → O(1) unsubscribe) cannot change semantics.
describe('ResourceDictionary.Subscribe contract', () =>
{
    test('fires on mutation; unsubscribe stops further notifications', () =>
    {
        const d = new ResourceDictionary();
        let hits = 0;
        const off = d.Subscribe(() => { hits++; });
        d.Set('a', 1);
        assert.equal(hits, 1);
        off();
        d.Set('b', 2);
        assert.equal(hits, 1, 'no fire after unsubscribe');
    });

    test('unsubscribing one listener leaves the others intact', () =>
    {
        const d = new ResourceDictionary();
        let a = 0, b = 0;
        const offA = d.Subscribe(() => { a++; });
        d.Subscribe(() => { b++; });
        d.Set('k', 1);
        assert.deepEqual([a, b], [1, 1]);
        offA();
        d.Set('k', 2);
        assert.deepEqual([a, b], [1, 2], 'only A detached');
    });

    test('unsubscribe is idempotent', () =>
    {
        const d = new ResourceDictionary();
        let a = 0, b = 0;
        const offA = d.Subscribe(() => { a++; });
        d.Subscribe(() => { b++; });
        offA();
        offA();                       // second call must be a harmless no-op
        d.Set('k', 1);
        assert.deepEqual([a, b], [0, 1]);
    });

    test('a listener may unsubscribe itself during notify without dropping others', () =>
    {
        const d = new ResourceDictionary();
        const order: string[] = [];
        let offSelf: () => void = () => {};
        offSelf = d.Subscribe(() => { order.push('self'); offSelf(); });
        d.Subscribe(() => { order.push('other'); });
        d.Set('k', 1);                // both fire; self detaches
        assert.deepEqual(order, ['self', 'other']);
        d.Set('k', 2);                // only 'other' remains
        assert.deepEqual(order, ['self', 'other', 'other']);
    });
});
