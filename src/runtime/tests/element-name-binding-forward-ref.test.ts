// ElementNameBinding forward-reference writeback survival.
//
// A markup binding `Foo=$nodes.Bar` where `nodes` is declared LATER in
// the same body compiles to ElementNameBinding(() => _nodes, "Bar") — a
// thunk that resolves to `undefined` until the element is constructed on
// the next microtask. A TwoWay writeback that lands in that window must
// NOT dispose the binding (effective-value.ts disposes a binding whose
// set_value returns false). Instead the value is buffered on the binding
// and flushed once the source resolves. See element-name-binding.ts.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { Model, MetaData } from '../index.js';
import { ElementNameBinding } from '../binding/element-name-binding.js';
import type { Visual } from '../../visual-engine/visual.js';

class Src extends Model
{
    public static readonly YKey = Model.RegisterProperty<unknown>(
        Src, 'Y', undefined, MetaData.None);
    public get Y(): unknown { return this.get_property_value(Src.YKey); }
    public set Y(v: unknown) { this.set_property_value(Src.YKey, v); }
}

class Tgt extends Model
{
    // BindsTwoWayByDefault so the installed ElementNameBinding resolves to
    // TwoWay (the cap-DP shape).
    public static readonly XKey = Model.RegisterProperty<unknown>(
        Tgt, 'X', undefined, MetaData.None | MetaData.BindsTwoWayByDefault);
    public get X(): unknown { return this.get_property_value(Tgt.XKey); }
    public set X(v: unknown) { this.set_property_value(Tgt.XKey, v); }
}

const tick = (): Promise<void> => Promise.resolve();

describe('ElementNameBinding — TwoWay writeback during the forward-ref window', () =>
{
    test('a write while the source is unresolved is buffered, then flushed on resolve', async () =>
    {
        const src = new Src();
        const tgt = new Tgt();
        let resolved = false;
        tgt.set_property_value(Tgt.XKey,
            ElementNameBinding(() => (resolved ? src : undefined) as unknown as Visual | undefined, 'Y'));

        // Source not yet constructed — the write has nowhere to land yet.
        tgt.X = 'buffered';
        assert.equal(src.Y, undefined, 'not flushed while source is unresolved');

        // Resolve the forward ref; the binding's deferred activate() runs.
        resolved = true;
        await tick();
        await tick();

        assert.equal(src.Y, 'buffered', 'buffered write flushed to the source on resolve');
    });

    test('the binding SURVIVES a forward-ref-window write — later writes still reach the source', async () =>
    {
        const src = new Src();
        const tgt = new Tgt();
        let resolved = false;
        tgt.set_property_value(Tgt.XKey,
            ElementNameBinding(() => (resolved ? src : undefined) as unknown as Visual | undefined, 'Y'));

        // The write that used to DISPOSE the binding (set_value returned
        // false → effective-value replaced it with a local value).
        tgt.X = 'early';

        resolved = true;
        await tick();
        await tick();

        // If the binding had been disposed, this write would stay local and
        // never reach src.Y.
        tgt.X = 'late';
        assert.equal(src.Y, 'late',
            'binding still live — writeback reaches the source after the forward-ref window');
    });

    test('once resolved, a fresh write supersedes the buffered value', async () =>
    {
        const src = new Src();
        const tgt = new Tgt();
        let resolved = false;
        tgt.set_property_value(Tgt.XKey,
            ElementNameBinding(() => (resolved ? src : undefined) as unknown as Visual | undefined, 'Y'));

        tgt.X = 'buffered';
        // Overwrite before the source resolves.
        tgt.X = 'overwritten';

        resolved = true;
        await tick();
        await tick();

        assert.equal(src.Y, 'overwritten', 'latest forward-ref-window write wins on flush');
    });
});
