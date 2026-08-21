import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MuralBase, MetaData } from '../index.js';

// A descriptor's ComposedKey is the per-instance storage key used by
// get/set/clear. It must equal `${RootOwner.name}.${Name}` (the string the
// former MuralBase.compose_key produced) and be stable across calls (memoised).
class Foo extends MuralBase
{
    public static readonly BarKey = MuralBase.RegisterProperty<number>(Foo, 'Bar', 0, MetaData.None);
    public get Bar(): number { return this.get_property_value(Foo.BarKey); }
    public set Bar(v: number) { this.set_property_value(Foo.BarKey, v); }
}

test('ComposedKey is `${RootOwner.name}.${Name}` and matches compose_key', () => {
    const d = Foo.BarKey.descriptor;
    assert.equal(d.ComposedKey, 'Foo.Bar');
    assert.equal(d.ComposedKey, MuralBase.compose_key(d.RootOwner, d.Name));
    // Stable across calls (the memoised path returns the same string).
    assert.equal(d.ComposedKey, d.ComposedKey);
});

test('get/set/clear still work after routing through ComposedKey', () => {
    const f = new Foo();
    assert.equal(f.Bar, 0);
    f.Bar = 7;
    assert.equal(f.Bar, 7);
    f.ClearValue(Foo.BarKey);
    assert.equal(f.Bar, 0);
});
