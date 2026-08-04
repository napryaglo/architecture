import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ResourceDictionary } from '../index.js';

// Tests for the notification primitives (design:
// docs/superpowers/specs/2026-08-04-resource-dictionary-notification-primitives-design.md):
//   Batch, ReplaceMergedDictionary, the general/style channels +
//   StyleParticipating flag, and SubscribeStyleKey. Each asserts on
//   fan-out COUNTS via Subscribe/SubscribeStyle spies — the whole point is
//   how many times consumers are woken, not just final resolutions.

// Count general- and style-channel fan-outs on a dictionary.
function spy(d: ResourceDictionary): { g: number; s: number; off: () => void }
{
    const c = { g: 0, s: 0, off: () => {} };
    const offG = d.Subscribe(() => { c.g++; });
    const offS = d.SubscribeStyle(() => { c.s++; });
    c.off = () => { offG(); offS(); };
    return c;
}

describe('ResourceDictionary.Batch', () =>
{
    test('N sets in a batch fire exactly one general + one style fan-out', () =>
    {
        const d = new ResourceDictionary();
        const c = spy(d);
        d.Batch(() => { for (let i = 0; i < 743; i++) d.Set(`k${i}`, i); });
        assert.deepEqual([c.g, c.s], [1, 1]);
        assert.equal(d.Resolve('k742'), 742, 'all sets applied');
    });

    test('a batch with no mutation fires nothing', () =>
    {
        const d = new ResourceDictionary();
        const c = spy(d);
        d.Batch(() => { /* read-only */ void d.Resolve('x'); });
        assert.deepEqual([c.g, c.s], [0, 0]);
    });

    test('nested batches collapse to one fan-out at the outermost exit', () =>
    {
        const d = new ResourceDictionary();
        const c = spy(d);
        d.Batch(() =>
        {
            d.Set('a', 1);
            d.Batch(() => { d.Set('b', 2); d.Set('c', 3); });
            assert.deepEqual([c.g, c.s], [0, 0], 'inner exit does not fire');
        });
        assert.deepEqual([c.g, c.s], [1, 1]);
    });

    test('a throwing fn still fires the trailing notify once and re-throws', () =>
    {
        const d = new ResourceDictionary();
        const c = spy(d);
        assert.throws(() => d.Batch(() => { d.Set('a', 1); throw new Error('boom'); }), /boom/);
        assert.deepEqual([c.g, c.s], [1, 1], 'notified once despite the throw');
    });
});

describe('ResourceDictionary.ReplaceMergedDictionary', () =>
{
    test('swaps old for next in a single parent notification', () =>
    {
        const host = new ResourceDictionary();
        const oldD = new ResourceDictionary(); oldD.Set('k', 'old');
        host.AddMergedDictionary(oldD);
        const c = spy(host);
        const next = new ResourceDictionary(); next.Set('k', 'next');
        host.ReplaceMergedDictionary(oldD, next);
        assert.deepEqual([c.g, c.s], [1, 1], 'remove + add collapse to one');
        assert.equal(host.Resolve('k'), 'next', 'resolves next, not old');
    });

    test('old = undefined adds cleanly (first population)', () =>
    {
        const host = new ResourceDictionary();
        const c = spy(host);
        const next = new ResourceDictionary(); next.Set('k', 1);
        host.ReplaceMergedDictionary(undefined, next);
        assert.deepEqual([c.g, c.s], [1, 1]);
        assert.equal(host.Resolve('k'), 1);
    });

    test('building next detached fires no host notification until the swap', () =>
    {
        const host = new ResourceDictionary();
        const c = spy(host);
        const next = new ResourceDictionary();
        for (let i = 0; i < 100; i++) next.Set(`k${i}`, i);   // detached — nobody listening
        assert.deepEqual([c.g, c.s], [0, 0], 'no host fan-out while detached');
        host.ReplaceMergedDictionary(undefined, next);
        assert.deepEqual([c.g, c.s], [1, 1], 'one fan-out at the swap');
    });
});

describe('ResourceDictionary channels + StyleParticipating', () =>
{
    test('a normal Set fires both general and style channels', () =>
    {
        const d = new ResourceDictionary();
        const c = spy(d);
        d.Set('a', 1);
        assert.deepEqual([c.g, c.s], [1, 1]);
    });

    test('a StyleParticipating=false dict fires general but not style', () =>
    {
        const d = new ResourceDictionary();
        d.StyleParticipating = false;
        const c = spy(d);
        d.Set('a', 1);
        assert.deepEqual([c.g, c.s], [1, 0], 'general fires, style suppressed');
    });

    test('a non-participating merged child fires the parent general but not style', () =>
    {
        const parent = new ResourceDictionary();
        const child = new ResourceDictionary();
        child.StyleParticipating = false;
        parent.AddMergedDictionary(child);      // one add fan-out (both channels)
        const c = spy(parent);
        child.Set('k', 1);
        assert.deepEqual([c.g, c.s], [1, 0], 'child churn wakes parent general only');
        assert.equal(parent.Resolve('k'), 1, 'still resolvable through the merge');
    });

    test('toggling StyleParticipating after merge takes effect live', () =>
    {
        const parent = new ResourceDictionary();
        const child = new ResourceDictionary();
        parent.AddMergedDictionary(child);
        const c = spy(parent);
        child.Set('a', 1);
        assert.deepEqual([c.g, c.s], [1, 1], 'participating: both');
        child.StyleParticipating = false;
        child.Set('b', 2);
        assert.deepEqual([c.g, c.s], [2, 1], 'now general only, no re-subscribe needed');
    });
});

describe('ResourceDictionary.SubscribeStyleKey', () =>
{
    test('fires only when the resolved value for the key changes', () =>
    {
        const d = new ResourceDictionary();
        d.Set('k', 1);
        let hits = 0;
        d.SubscribeStyleKey('k', () => { hits++; });
        d.Set('k', 1);                 // same value → no fire
        assert.equal(hits, 0);
        d.Set('k', 2);                 // changed → fire
        assert.equal(hits, 1);
    });

    test('an unrelated string-key Set does not fire it', () =>
    {
        const d = new ResourceDictionary();
        const styleKey = function Widget() {};   // Function key (implicit-style style)
        d.Set(styleKey, 'the-style');
        let hits = 0;
        d.SubscribeStyleKey(styleKey, () => { hits++; });
        for (let i = 0; i < 50; i++) d.Set(`s${i}`, i);   // string churn
        assert.equal(hits, 0, 'string-key churn never touches the Function-key subscription');
    });

    test('a merged Set that newly exposes the key flips it', () =>
    {
        const parent = new ResourceDictionary();
        const child = new ResourceDictionary();
        parent.AddMergedDictionary(child);
        let hits = 0;
        parent.SubscribeStyleKey('k', () => { hits++; });   // resolves undefined initially
        child.Set('k', 'now-here');
        assert.equal(hits, 1, 'value flipped undefined → defined');
    });

    test('does not fire for changes on a non-participating source', () =>
    {
        const parent = new ResourceDictionary();
        const child = new ResourceDictionary();
        child.StyleParticipating = false;
        parent.AddMergedDictionary(child);
        let hits = 0;
        parent.SubscribeStyleKey('k', () => { hits++; });
        child.Set('k', 'x');           // real value change, but child is non-participating
        assert.equal(hits, 0, 'style channel never fired, so the key listener never runs');
        assert.equal(parent.Resolve('k'), 'x', 'general resolution still reflects it');
    });
});
