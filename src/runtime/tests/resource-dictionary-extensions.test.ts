import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { ResourceDictionary } from '../resource-dictionary.js';

// § 12.3 — Per-key subscription. Memoization-wrapped Subscribe that
// only fires when the RESOLVED value for the registered key changes.

describe('§ 12.3 — ResourceDictionary.SubscribeKey', () => {

    test('fires when a Set hits the registered key with a new value', () => {
        const d = new ResourceDictionary();
        let fires = 0;
        d.SubscribeKey('AccentBrush', () => { fires++; });

        d.Set('AccentBrush', '#bada55');
        assert.equal(fires, 1);
    });

    test('does NOT fire when an unrelated key changes', () => {
        const d = new ResourceDictionary();
        d.Set('AccentBrush', '#abc');
        let fires = 0;
        d.SubscribeKey('AccentBrush', () => { fires++; });

        d.Set('SurfaceBrush', '#def');
        d.Set('CornerRadius', 8);
        d.Set('Spacing',      16);

        assert.equal(fires, 0,
            'unrelated keys do not trigger the per-key listener');
    });

    test('does NOT fire when the registered key is Set to the same value', () => {
        const d = new ResourceDictionary();
        const brush = { name: 'fake-brush' };
        d.Set('AccentBrush', brush);
        let fires = 0;
        d.SubscribeKey('AccentBrush', () => { fires++; });

        d.Set('AccentBrush', brush);

        assert.equal(fires, 0,
            'identity-equal Set is a no-op for the per-key listener');
    });

    test('fires when a merged dictionary changes the resolved value', () => {
        const outer = new ResourceDictionary();
        const inner = new ResourceDictionary();
        outer.AddMergedDictionary(inner);

        let fires = 0;
        outer.SubscribeKey('Token', () => { fires++; });

        // Setting in the merged dict makes the outer resolution flip
        // from undefined to a value.
        inner.Set('Token', 'hello');
        assert.equal(fires, 1);

        // Same value via the merged dict — no fire.
        inner.Set('Token', 'hello');
        assert.equal(fires, 1);

        // Shadow the merged value with a local Set — fire because the
        // resolved value pointer changes.
        outer.Set('Token', 'shadowed');
        assert.equal(fires, 2);
    });

    test('unsubscribe drops the per-key listener', () => {
        const d = new ResourceDictionary();
        let fires = 0;
        const unsubscribe = d.SubscribeKey('K', () => { fires++; });

        d.Set('K', 1);
        assert.equal(fires, 1);

        unsubscribe();
        d.Set('K', 2);
        d.Set('K', 3);
        assert.equal(fires, 1);
    });
});

// § 12.4 — Seal locks the dictionary; mutations throw thereafter.
describe('§ 12.4 — ResourceDictionary.Seal', () => {

    test('IsSealed is false on construction, true after Seal()', () => {
        const d = new ResourceDictionary();
        assert.equal(d.IsSealed, false);
        d.Seal();
        assert.equal(d.IsSealed, true);
    });

    test('Set / Delete / Clear / AddMergedDictionary / RemoveMergedDictionary all throw after Seal()', () => {
        const d = new ResourceDictionary();
        d.Set('preset', 1);
        const merged = new ResourceDictionary();
        d.AddMergedDictionary(merged);
        d.Seal();

        assert.throws(() => d.Set('newKey', 2));
        assert.throws(() => d.Delete('preset'));
        assert.throws(() => d.Clear());
        assert.throws(() => d.AddMergedDictionary(new ResourceDictionary()));
        assert.throws(() => d.RemoveMergedDictionary(merged));
    });

    test('Reads still work on a sealed dictionary', () => {
        const d = new ResourceDictionary();
        d.Set('A', 1);
        d.Set('B', 2);
        d.Seal();

        assert.equal(d.Get('A'),         1);
        assert.equal(d.Has('A'),         true);
        assert.equal(d.Resolve('B'),     2);
        assert.equal(d.CanResolve('B'),  true);
        assert.equal(d.Size,             2);
        const entries = [...d.Entries()];
        assert.equal(entries.length,     2);
        assert.equal(d.MergedDictionaries.length, 0);
    });

    test('Subscribe / SubscribeKey still wire on a sealed dictionary', () => {
        // Listeners can be added/removed even after seal — the dict
        // doesn't mutate, but consumers who hold a reference may want
        // to react to merged-dictionary changes (if any). Idempotent
        // for now since further mutations throw, but the API stays.
        const d = new ResourceDictionary();
        d.Set('K', 1);
        d.Seal();

        let fires = 0;
        const unsub = d.Subscribe(() => { fires++; });
        // No way to trigger a fire on a sealed dict — this just asserts
        // the subscription path doesn't throw.
        unsub();

        d.SubscribeKey('K', () => { /* no-op */ })();
        assert.equal(fires, 0);
    });

    test('Seal is idempotent', () => {
        const d = new ResourceDictionary();
        d.Seal();
        d.Seal();
        assert.equal(d.IsSealed, true);
    });
});
