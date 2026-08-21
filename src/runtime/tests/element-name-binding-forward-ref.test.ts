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

import { MuralBase, MetaData } from '../index.js';
import { ElementNameBinding } from '../binding/element-name-binding.js';
import type { Visual } from '../../visual-engine/visual.js';

class Src extends MuralBase
{
    public static readonly YKey = MuralBase.RegisterProperty<unknown>(
        Src, 'Y', undefined, MetaData.None);
    public get Y(): unknown { return this.get_property_value(Src.YKey); }
    public set Y(v: unknown) { this.set_property_value(Src.YKey, v); }
}

class Tgt extends MuralBase
{
    // BindsTwoWayByDefault so the installed ElementNameBinding resolves to
    // TwoWay (the cap-DP shape).
    public static readonly XKey = MuralBase.RegisterProperty<unknown>(
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

    // The forward-ref flush only fills in when the SOURCE is empty. When the
    // source already has a value, it is authoritative on initial resolution
    // (WPF source-wins-on-load): a value the target buffered during the
    // window — typically a control's transient DEFAULT, e.g. a list's
    // `undefined` selection or a rail's `-1` sentinel — is DISCARDED, pulled
    // over by the source. This is what keeps a TwoWay `$service` binding from
    // clobbering a freshly-constructed service's initialized value.
    test('a live source wins over a target default buffered during the window', async () =>
    {
        const src = new Src();
        src.Y = 'source-value';      // source is authoritative
        const tgt = new Tgt();
        let resolved = false;
        tgt.set_property_value(Tgt.XKey,
            ElementNameBinding(() => (resolved ? src : undefined) as unknown as Visual | undefined, 'Y'));

        // The target settles at its default during the forward-ref window.
        tgt.X = 'target-default';

        resolved = true;
        await tick();
        await tick();

        assert.equal(src.Y, 'source-value', 'source not clobbered by the buffered target default');
        assert.equal(tgt.X, 'source-value', 'target pulled the authoritative source value');
    });
});
